import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import { logger } from '../config/logger';
import { requireAuth } from '../middleware/authMiddleware';
import { createStockTransactionAndAlert } from '../utils/stockTransaction';
import { clientSchema } from './clientController';
import Joi from 'joi';

const db = Database.getInstance();

/**
 * Crear múltiples productos en una sola operación (bulk create/update)
 * Soporta tanto creación como actualización basada en SKU
 */
export async function bulkCreateProducts(context: Context, req: HttpRequest): Promise<void> {
  try {
    // Validación condicional para cada producto según su tipo
    const bulkProductSchema = Joi.array().items(
      Joi.object({
        name: Joi.string().min(2).max(200).required(),
        id_category: Joi.number().integer().optional().allow(null),
        id_origin: Joi.number().integer().required(),
        id_measure: Joi.number().integer().required(),
        sku: Joi.string().min(2).max(100).required(),
        type: Joi.string().valid('PF', 'MP').default('PF'),
        quantity: Joi.when('type', {
          is: 'MP',
          then: Joi.number().min(0).default(0).messages({
            'number.min': 'La cantidad debe ser mayor o igual a 0',
            'number.base': 'La cantidad debe ser un número válido (se permiten decimales para MP)'
          }),
          otherwise: Joi.number().integer().min(0).default(0).messages({
            'number.min': 'La cantidad debe ser mayor o igual a 0',
            'number.base': 'La cantidad debe ser un número válido',
            'number.integer': 'La cantidad debe ser un número entero para productos tipo PF'
          })
        }),
        min_stock: Joi.when('type', {
          is: 'MP',
          then: Joi.number().min(0).default(0).messages({
            'number.min': 'El valor umbral debe ser mayor o igual a 0',
            'number.base': 'El valor umbral debe ser un número válido (se permiten decimales para MP)'
          }),
          otherwise: Joi.number().integer().min(0).default(0).messages({
            'number.min': 'El valor umbral debe ser mayor o igual a 0',
            'number.base': 'El valor umbral debe ser un número válido',
            'number.integer': 'El valor umbral debe ser un número entero para productos tipo PF'
          })
        }),
        price: Joi.number().min(0).required().messages({
          'number.base': 'El precio debe ser un número válido',
          'number.min': 'El precio debe ser mayor o igual a 0',
          'any.required': 'El precio es obligatorio'
        }),
      })
    ).min(1).max(1000); // Máximo 1000 productos por carga

    const { error, value } = bulkProductSchema.validate(req.body);
    
    if (error) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
          })),
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const products = value as Array<{
      name: string;
      id_category?: number | null;
      id_origin: number;
      id_measure: number;
      sku: string;
      type?: 'PF' | 'MP';
      quantity?: number;
      min_stock?: number;
      price: number;
    }>;

    const results = {
      successful: [] as any[],
      updated: [] as any[],
      failed: [] as Array<{ index: number; product: any; error: string }>,
      total: products.length,
    };

    // Verificar SKUs duplicados en el lote
    const skuSet = new Set<string>();
    const duplicateSkus: number[] = [];
    const skuToIndex = new Map<string, number>();
    
    products.forEach((product, index) => {
      if (skuSet.has(product.sku)) {
        duplicateSkus.push(index);
      } else {
        skuSet.add(product.sku);
        skuToIndex.set(product.sku, index);
      }
    });

    if (duplicateSkus.length > 0) {
      duplicateSkus.forEach(index => {
        results.failed.push({
          index,
          product: products[index],
          error: 'SKU duplicado en el mismo lote',
        });
      });
    }

    // Filtrar productos válidos (sin duplicados en el lote)
    const validProducts = products.filter((_, index) => !duplicateSkus.includes(index));
    if (validProducts.length === 0) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Todos los productos tienen SKUs duplicados en el lote',
          data: {
            total: results.total,
            created: 0,
            updated: 0,
            failed: results.failed.length,
            products: [],
            errors: results.failed.map(r => ({
              index: r.index + 1,
              sku: r.product.sku,
              name: r.product.name,
              error: r.error,
            })),
          },
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Obtener userId del request
    const authResult = requireAuth(req);
    if (!authResult.success || !authResult.user) {
      context.res = {
        status: 401,
        body: {
          success: false,
          message: 'Usuario no autenticado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }
    const userId = typeof authResult.user.userId === 'string' 
      ? Number.parseInt(authResult.user.userId, 10) 
      : authResult.user.userId;

    // OPTIMIZACIÓN: Obtener todos los SKUs existentes con sus datos completos
    const skusToCheck = validProducts.map(p => p.sku);
    const existingProductsMap = new Map<string, number>(); // SKU -> id
    const existingProductsDataMap = new Map<string, any>(); // SKU -> { id, quantity, min_stock, name, sku }
    
    try {
      const existingProducts = await db.getConnection()
        .select('id', 'sku', 'quantity', 'min_stock', 'name')
        .from('nubestock.tb_ope_product')
        .whereIn('sku', skusToCheck);
      
      existingProducts.forEach((p: any) => {
        existingProductsMap.set(p.sku, p.id);
        existingProductsDataMap.set(p.sku, {
          id: p.id,
          quantity: p.quantity,
          min_stock: p.min_stock,
          name: p.name,
          sku: p.sku,
        });
      });
    } catch (selectError) {
      logger.error('SELECT Error: Error al consultar productos existentes:', selectError);
      const errorMessage = selectError instanceof Error ? selectError.message : 'Error desconocido al consultar productos';
      
      // Marcar todos los productos como fallidos con el error de SELECT
      validProducts.forEach((product, idx) => {
        const actualIndex = products.findIndex((p, index) => 
          p.sku === product.sku && !duplicateSkus.includes(index)
        );
        results.failed.push({
          index: actualIndex,
          product,
          error: `SELECT Error: ${errorMessage}`,
        });
      });
      
      context.res = {
        status: 500,
        body: {
          success: false,
          message: 'Error al consultar productos existentes en la base de datos',
          data: {
            total: results.total,
            created: 0,
            updated: 0,
            failed: results.failed.length,
            products: [],
            errors: results.failed.map(r => ({
              index: r.index + 1,
              sku: r.product.sku,
              name: r.product.name,
              error: r.error,
            })),
          },
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // OPTIMIZACIÓN: Usar transacción para agrupar todas las operaciones
    try {
      await db.transaction(async (trx) => {
        const now = new Date();
        const productsToInsert: any[] = [];
        const productsToUpdate: Array<{ id: number; data: any; index: number; product: any }> = [];

      // Preparar datos para insert/update
      validProducts.forEach((product, originalIndex) => {
        const actualIndex = products.findIndex((p, idx) => 
          p.sku === product.sku && !duplicateSkus.includes(idx)
        );
        
        const productData: any = {
          name: product.name,
          id_origin: product.id_origin,
          id_measure: product.id_measure,
          sku: product.sku,
          type: product.type || 'PF',
          quantity: product.quantity || 0,
          min_stock: product.min_stock || 0,
          price: product.price,
        };

        if (product.id_category !== undefined && product.id_category !== null) {
          productData.id_category = product.id_category;
        } else {
          productData.id_category = null;
        }

        const existingId = existingProductsMap.get(product.sku);
        
        if (existingId) {
          // Producto existe, preparar para update
          productData.modification_date = now;
          productsToUpdate.push({
            id: existingId,
            data: productData,
            index: actualIndex,
            product: product, // Guardar el producto original para errores
          });
        } else {
          // Producto nuevo, preparar para insert
          productData.is_active = true;
          productsToInsert.push(productData);
        }
      });

      // OPTIMIZACIÓN: Insertar todos los productos nuevos en batch
      if (productsToInsert.length > 0) {
        try {
          const insertedProducts = await trx('nubestock.tb_ope_product')
            .insert(productsToInsert)
            .returning('*');
          
          // Agregar a resultados y crear transacciones para productos con cantidad inicial
          const insertTransactionPromises = insertedProducts.map(async (inserted: any, idx: number) => {
            const originalProduct = productsToInsert[idx];
            const originalIndex = validProducts.findIndex(vp => vp.sku === originalProduct.sku);
            results.successful.push({
              index: originalIndex,
              product: inserted,
            });

            // Si el producto tiene cantidad inicial > 0, crear transacción tipo IN
            const initialQuantity = inserted.quantity || 0;
            if (initialQuantity > 0) {
              await createStockTransactionAndAlert(
                trx,
                inserted.id,
                0, // Stock anterior es 0 (producto nuevo)
                initialQuantity,
                inserted.min_stock || 0,
                inserted.name,
                inserted.sku,
                userId,
                'IN' // Tipo IN para ingreso inicial
              );
            }
          });

          await Promise.all(insertTransactionPromises);
        } catch (insertError) {
          logger.error('INSERT Error: Error al insertar productos:', insertError);
          const errorMessage = insertError instanceof Error ? insertError.message : 'Error desconocido al insertar productos';
          
          // Marcar todos los productos a insertar como fallidos
          productsToInsert.forEach((product) => {
            const originalIndex = validProducts.findIndex(vp => vp.sku === product.sku);
            results.failed.push({
              index: originalIndex,
              product,
              error: `INSERT Error: ${errorMessage}`,
            });
          });
          
          // Lanzar error para que se maneje en el catch de la transacción
          throw new Error(`INSERT Error: ${errorMessage}`);
        }
      }

      // OPTIMIZACIÓN: Actualizar todos los productos existentes en batch
      if (productsToUpdate.length > 0) {
        try {
          // Usar Promise.all para actualizar en paralelo (limitado por la conexión)
          const updatePromises = productsToUpdate.map(async ({ id, data, index, product }) => {
            try {
              // Obtener datos actuales del producto antes de actualizar
              const currentProductData = existingProductsDataMap.get(product.sku);
              const currentQuantity = currentProductData?.quantity || 0;
              const currentMinStock = currentProductData?.min_stock || 0;
              const newQuantity = data.quantity !== undefined ? data.quantity : currentQuantity;
              const newMinStock = data.min_stock !== undefined ? data.min_stock : currentMinStock;

              const [updated] = await trx('nubestock.tb_ope_product')
                .where('id', id)
                .update(data)
                .returning('*');
              
              if (updated) {
                results.updated.push({
                  index,
                  product: updated,
                });

                // Crear transacción y alerta si cambió el stock
                if (data.quantity !== undefined && data.quantity !== currentQuantity) {
                  // Determinar tipo de transacción: OUT si disminuye, IN si aumenta
                  const transactionType: 'IN' | 'OUT' = newQuantity > currentQuantity ? 'IN' : 'OUT';
                  
                  await createStockTransactionAndAlert(
                    trx,
                    id,
                    currentQuantity,
                    newQuantity,
                    newMinStock,
                    updated.name || product.name,
                    updated.sku || product.sku,
                    userId,
                    transactionType
                  );
                }
              } else {
                // Si no se actualizó, puede ser que el producto no exista
                results.failed.push({
                  index,
                  product: product || data,
                  error: 'UPDATE Error: Producto no encontrado o no se pudo actualizar',
                });
              }
            } catch (updateError) {
              logger.error(`UPDATE Error: Error al actualizar producto ${id}:`, updateError);
              const errorMessage = updateError instanceof Error ? updateError.message : 'Error desconocido al actualizar';
              results.failed.push({
                index,
                product: product || data,
                error: `UPDATE Error: ${errorMessage}`,
              });
            }
          });

          await Promise.all(updatePromises);
        } catch (batchUpdateError) {
          logger.error('UPDATE Error: Error en batch de actualizaciones:', batchUpdateError);
          const errorMessage = batchUpdateError instanceof Error ? batchUpdateError.message : 'Error desconocido en batch de actualizaciones';
          
          // Marcar todos los productos a actualizar como fallidos
          productsToUpdate.forEach(({ index, product, data }) => {
            const alreadyFailed = results.failed.some(f => f.index === index);
            if (!alreadyFailed) {
              results.failed.push({
                index,
                product: product || data,
                error: `UPDATE Error: ${errorMessage}`,
              });
            }
          });
        }
      }
    });
    } catch (transactionError) {
      // Si hay un error en la transacción, marcar todos los productos válidos como fallidos
      logger.error('TRANSACTION Error: Error en transacción de carga masiva:', transactionError);
      const errorMessage = transactionError instanceof Error 
        ? transactionError.message 
        : 'Error desconocido en la transacción';
      
      // Determinar el tipo de error basado en el mensaje
      let errorType = 'TRANSACTION Error';
      if (errorMessage.includes('INSERT') || errorMessage.includes('insert')) {
        errorType = 'INSERT Error';
      } else if (errorMessage.includes('UPDATE') || errorMessage.includes('update')) {
        errorType = 'UPDATE Error';
      } else if (errorMessage.includes('SELECT') || errorMessage.includes('select')) {
        errorType = 'SELECT Error';
      }
      
      validProducts.forEach((product, idx) => {
        const actualIndex = products.findIndex((p, index) => 
          p.sku === product.sku && !duplicateSkus.includes(index)
        );
        
        // Solo agregar si no está ya en results.successful o results.updated
        const alreadyProcessed = results.successful.some(r => r.index === actualIndex) ||
                                 results.updated.some(r => r.index === actualIndex);
        
        if (!alreadyProcessed) {
          results.failed.push({
            index: actualIndex,
            product,
            error: `${errorType}: ${errorMessage}`,
          });
        }
      });
    }

    // Preparar respuesta
    const totalProcessed = results.successful.length + results.updated.length;
    const responseBody: any = {
      success: results.failed.length === 0,
      message: `Procesados ${results.total} producto(s): ${results.successful.length} creado(s), ${results.updated.length} actualizado(s), ${results.failed.length} fallido(s)`,
      data: {
        total: results.total,
        created: results.successful.length,
        updated: results.updated.length,
        failed: results.failed.length,
        products: [
          ...results.successful.map(r => ({ ...r.product, action: 'created' })),
          ...results.updated.map(r => ({ ...r.product, action: 'updated' })),
        ],
        errors: results.failed.map(r => ({
          index: r.index + 1, // +1 para mostrar índice basado en 1
          sku: r.product.sku,
          name: r.product.name,
          error: r.error,
        })),
      },
      timestamp: new Date().toISOString(),
    };

    // Si hay errores pero también éxitos, retornar 207 (Multi-Status)
    // Si todos fallaron, retornar 400
    // Si todos fueron exitosos (creados o actualizados), retornar 201
    if (results.failed.length > 0 && totalProcessed > 0) {
      context.res = {
        status: 207, // Multi-Status
        body: responseBody,
      };
    } else if (results.failed.length === results.total) {
      context.res = {
        status: 400,
        body: responseBody,
      };
    } else {
      context.res = {
        status: 201,
        body: responseBody,
      };
    }
  } catch (error) {
    logger.error('Error en carga masiva de productos:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error interno al procesar carga masiva',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

/**
 * Crear múltiples materiales en una sola operación (bulk create/update)
 * Soporta tanto creación como actualización basada en SKU
 */
export async function bulkCreateMaterials(context: Context, req: HttpRequest): Promise<void> {
  try {
    // Log inicial para debugging
    logger.info('Bulk materials request received');
    
    // Asegurar que el body sea un array
    let bodyData: any = req.body;
    
    // Si el body es string, parsearlo
    if (typeof bodyData === 'string') {
      try {
        bodyData = JSON.parse(bodyData);
        logger.info('Parsed body from string, is array:', Array.isArray(bodyData));
      } catch (parseError) {
        logger.error('Error parsing body:', parseError);
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'Error al parsear el cuerpo de la petición',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
    }

    // Si el body es un objeto pero no un array, intentar extraer el array
    if (!Array.isArray(bodyData)) {
      if (typeof bodyData === 'object' && bodyData !== null) {
        // Intentar encontrar el array en propiedades comunes
        if (Array.isArray((bodyData as any).materials)) {
          bodyData = (bodyData as any).materials;
          logger.info('Extracted array from body.materials');
        } else if (Array.isArray((bodyData as any).data)) {
          bodyData = (bodyData as any).data;
          logger.info('Extracted array from body.data');
        } else {
          context.res = {
            status: 400,
            body: {
              success: false,
              message: 'El cuerpo de la petición debe ser un array de materiales',
              timestamp: new Date().toISOString(),
            },
          };
          return;
        }
      } else {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'El cuerpo de la petición debe ser un array de materiales',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
    }

    // Los materiales siempre son tipo MP, por lo que permiten decimales
    const bulkMaterialSchema = Joi.array().items(
      Joi.object({
        name: Joi.string().min(2).max(200).required(),
        sku: Joi.string().min(2).max(100).required(),
        id_category: Joi.number().integer().optional().allow(null),
        id_origin: Joi.number().integer().required(),
        id_measure: Joi.number().integer().required(),
        min_stock: Joi.number().min(0).default(0).messages({
          'number.min': 'El stock mínimo debe ser mayor o igual a 0',
          'number.base': 'El stock mínimo debe ser un número válido (se permiten decimales para materiales MP)'
        }),
        quantity: Joi.number().min(0).default(0).messages({
          'number.min': 'La cantidad debe ser mayor o igual a 0',
          'number.base': 'La cantidad debe ser un número válido (se permiten decimales para materiales MP)'
        }),
        price: Joi.number().min(0).required().messages({
          'number.base': 'El precio debe ser un número válido',
          'number.min': 'El precio debe ser mayor o igual a 0',
          'any.required': 'El precio es obligatorio'
        }),
      })
    ).min(1).max(1000); // Máximo 1000 materiales por carga

    const { error, value } = bulkMaterialSchema.validate(bodyData, {
      abortEarly: false,
      stripUnknown: false,
    });
    
    if (error) {
      logger.error('Validation error:', JSON.stringify(error, null, 2));
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            type: detail.type,
            context: detail.context,
          })),
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const materials = value as Array<{
      name: string;
      sku: string;
      id_category?: number | null;
      id_origin: number;
      id_measure: number;
      min_stock?: number;
      quantity?: number;
      price: number;
    }>;

    const results = {
      successful: [] as any[],
      updated: [] as any[],
      failed: [] as Array<{ index: number; material: any; error: string }>,
      total: materials.length,
    };

    // Verificar SKUs duplicados en el lote
    const skuSet = new Set<string>();
    const duplicateSkus: number[] = [];
    
    materials.forEach((material, index) => {
      if (skuSet.has(material.sku)) {
        duplicateSkus.push(index);
      } else {
        skuSet.add(material.sku);
      }
    });

    if (duplicateSkus.length > 0) {
      duplicateSkus.forEach(index => {
        results.failed.push({
          index,
          material: materials[index],
          error: 'SKU de material duplicado en el mismo lote',
        });
      });
    }

    // Filtrar materiales válidos (sin duplicados en el lote)
    const validMaterials = materials.filter((_, index) => !duplicateSkus.includes(index));
    if (validMaterials.length === 0) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Todos los materiales tienen SKUs duplicados en el lote',
          data: {
            total: results.total,
            created: 0,
            updated: 0,
            failed: results.failed.length,
            materials: [],
            errors: results.failed.map(r => ({
              index: r.index + 1,
              sku: r.material.sku,
              name: r.material.name,
              error: r.error,
            })),
          },
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const now = new Date();

    // Usar transacción para garantizar consistencia
    await db.getConnection().transaction(async (trx) => {
      // Obtener todos los materiales existentes por SKU en una sola consulta (type='MP')
      const existingMaterialSkus = validMaterials.map(m => m.sku);
      const existingMaterials = await trx('nubestock.tb_ope_product')
        .select('id', 'sku')
        .whereIn('sku', existingMaterialSkus)
        .where('type', 'MP');

      const existingMaterialMap = new Map(
        existingMaterials.map((m: any) => [m.sku, m.id])
      );

      // Separar en crear y actualizar
      const materialsToCreate: Array<{ index: number; material: any }> = [];
      const materialsToUpdate: Array<{ index: number; material: any; id: number }> = [];

      validMaterials.forEach((material, index) => {
        const originalIndex = materials.findIndex(m => 
          m.sku === material.sku && 
          !duplicateSkus.includes(materials.indexOf(m))
        );
        const materialId = existingMaterialMap.get(material.sku);
        
        if (materialId) {
          materialsToUpdate.push({
            index: originalIndex,
            material,
            id: materialId,
          });
        } else {
          materialsToCreate.push({
            index: originalIndex,
            material,
          });
        }
      });

      // Crear nuevos materiales en batch
      if (materialsToCreate.length > 0) {
        try {
          const materialsToInsert = materialsToCreate.map(({ material }) => ({
            name: material.name,
            sku: material.sku,
            id_category: material.id_category || null,
            id_origin: material.id_origin,
            id_measure: material.id_measure,
            type: 'MP', // Tipo material
            min_stock: material.min_stock || 0,
            quantity: material.quantity || 0,
            is_active: true,
            creation_date: now,
          }));

          const insertedMaterials = await trx('nubestock.tb_ope_product')
            .insert(materialsToInsert)
            .returning('*');

          insertedMaterials.forEach((inserted: any, idx: number) => {
            results.successful.push({
              index: materialsToCreate[idx].index,
              material: inserted,
            });
          });
        } catch (createError) {
          logger.error('Error al crear materiales en batch:', createError);
          const errorMessage = createError instanceof Error ? createError.message : 'Error desconocido al crear';
          materialsToCreate.forEach(({ index, material }) => {
            results.failed.push({
              index,
              material,
              error: `CREATE Error: ${errorMessage}`,
            });
          });
        }
      }

      // Actualizar materiales existentes en batch
      if (materialsToUpdate.length > 0) {
        try {
          const updatePromises = materialsToUpdate.map(async ({ index, material, id }) => {
            try {
              const updateData: any = {
                name: material.name,
                id_category: material.id_category || null,
                id_origin: material.id_origin,
                id_measure: material.id_measure,
                min_stock: material.min_stock || 0,
                price: material.price,
                modification_date: now,
              };
              
              if (material.quantity !== undefined) {
                updateData.quantity = material.quantity;
              }
              
              const updated = await trx('nubestock.tb_ope_product')
                .where('id', id)
                .where('type', 'MP')
                .update(updateData)
                .returning('*');
              
              if (updated && updated.length > 0) {
                results.updated.push({
                  index,
                  material: updated[0],
                });
              } else {
                results.failed.push({
                  index,
                  material,
                  error: 'UPDATE Error: Material no encontrado o no se pudo actualizar',
                });
              }
            } catch (updateError) {
              logger.error(`Error al actualizar material ${id}:`, updateError);
              const errorMessage = updateError instanceof Error ? updateError.message : 'Error desconocido al actualizar';
              results.failed.push({
                index,
                material,
                error: `UPDATE Error: ${errorMessage}`,
              });
            }
          });

          await Promise.all(updatePromises);
        } catch (batchUpdateError) {
          logger.error('Error en batch de actualizaciones:', batchUpdateError);
          const errorMessage = batchUpdateError instanceof Error ? batchUpdateError.message : 'Error desconocido en batch de actualizaciones';
          
          materialsToUpdate.forEach(({ index, material }) => {
            const alreadyFailed = results.failed.some(f => f.index === index);
            if (!alreadyFailed) {
              results.failed.push({
                index,
                material,
                error: `UPDATE Error: ${errorMessage}`,
              });
            }
          });
        }
      }
    });

    const created = results.successful.length;
    const updated = results.updated.length;
    const failed = results.failed.length;

    context.res = {
      status: failed === 0 ? 201 : 207, // 207 Multi-Status si hay algunos fallidos
      body: {
        success: failed === 0,
        message: failed === 0
          ? `Se procesaron ${created + updated} material(es) exitosamente`
          : `Se procesaron ${created + updated} material(es), ${failed} fallaron`,
        data: {
          total: results.total,
          created,
          updated,
          failed,
          materials: [...results.successful, ...results.updated].map(r => r.material),
          errors: results.failed.map(r => ({
            index: r.index + 1,
            sku: r.material.sku,
            name: r.material.name,
            error: r.error,
          })),
        },
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error en carga masiva de materiales:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error interno del servidor al procesar la carga masiva',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

/**
 * Crear múltiples clientes en una sola operación (bulk create/update)
 * Soporta tanto creación como actualización basada en identificación o email
 */
export async function bulkCreateClients(context: Context, req: HttpRequest): Promise<void> {
  try {
    // Extend clientSchema for bulk operations (adds is_active field)
    const bulkClientSchema = clientSchema.keys({
      is_active: Joi.boolean().optional(),
    });

    const clients = req.body as any[];
    
    if (!Array.isArray(clients) || clients.length === 0) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Se requiere un array de clientes',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    if (clients.length > 1000) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'El número máximo de clientes por carga es 1000',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Validar y procesar clientes
    const validClients: any[] = [];
    const duplicateIdentifications: number[] = [];
    const identificationSet = new Set<string>();
    const validationErrors: Array<{ index: number; error: string }> = [];

    // Verificar duplicados dentro del batch
    clients.forEach((client, index) => {
      const { error, value } = bulkClientSchema.validate(client);
      if (error) {
        validationErrors.push({
          index,
          error: `Validación: ${error.details.map(d => d.message).join(', ')}`
        });
        return;
      }
      
      if (identificationSet.has(value.identification)) {
        duplicateIdentifications.push(index);
        validationErrors.push({
          index,
          error: 'Identificación duplicada en el batch'
        });
        return;
      }
      
      identificationSet.add(value.identification);
      validClients.push({ ...value, originalIndex: index });
    });

    // Si no hay clientes válidos, retornar errores detallados
    if (validClients.length === 0) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'No hay clientes válidos para procesar',
          data: {
            total: clients.length,
            created: 0,
            updated: 0,
            failed: clients.length,
            errors: validationErrors.map(ve => ({
              index: ve.index + 1,
              identification: clients[ve.index]?.identification || 'N/A',
              name: clients[ve.index]?.name || 'N/A',
              error: ve.error
            }))
          },
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const results = {
      total: clients.length,
      successful: [] as Array<{ index: number; client: any }>,
      updated: [] as Array<{ index: number; client: any }>,
      failed: [] as Array<{ index: number; client: any; error: string }>,
    };

    const now = new Date();

    try {
      await db.transaction(async (trx) => {
        try {
          // SELECT: Obtener todas las identificaciones y emails existentes
          const identifications = validClients.map(c => c.identification);
          const emails = validClients.map(c => c.email).filter(e => e);
          
          const existingClients = await trx('nubestock.tb_mae_client')
            .select('id', 'identification', 'email')
            .where((builder: any) => {
              if (identifications.length > 0) {
                builder.whereIn('identification', identifications);
              }
              if (emails.length > 0) {
                builder.orWhereIn('email', emails);
              }
            });

          const existingIdentificationMap = new Map(
            existingClients.map((c: any) => [c.identification, { id: c.id, email: c.email }])
          );
          const existingEmailMap = new Map(
            existingClients.map((c: any) => [c.email, { id: c.id, identification: c.identification }])
          );

          // Separar clientes nuevos y existentes
          const clientsToInsert: any[] = [];
          const clientsToUpdate: Array<{ id: number; data: any; index: number; client: any }> = [];

          validClients.forEach((client) => {
            // Extraer originalIndex antes de usar el cliente
            const { originalIndex, ...clientData } = client;
            
            // Verificar primero por identificación, luego por email
            const existingByIdentification = existingIdentificationMap.get(clientData.identification);
            const existingByEmail = clientData.email ? existingEmailMap.get(clientData.email) : null;
            
            let existingId: number | undefined;
            
            if (existingByIdentification) {
              // Si existe por identificación, usar ese ID
              existingId = existingByIdentification.id;
            } else if (existingByEmail) {
              // Si no existe por identificación pero sí por email, usar ese ID
              existingId = existingByEmail.id;
            }
            
            if (existingId) {
              const updateData: any = {
                modification_date: now,
              };
              if (clientData.name !== undefined) updateData.name = clientData.name;
              if (clientData.identification !== undefined) updateData.identification = clientData.identification;
              if (clientData.identification_type !== undefined) updateData.identification_type = clientData.identification_type;
              if (clientData.email !== undefined) updateData.email = clientData.email;
              if (clientData.phone !== undefined) updateData.phone = clientData.phone;
              if (clientData.address !== undefined) updateData.address = clientData.address;
              if (clientData.id_province !== undefined) updateData.id_province = clientData.id_province;
              if (clientData.id_city !== undefined) updateData.id_city = clientData.id_city;
              if (clientData.requires_credit !== undefined) updateData.requires_credit = clientData.requires_credit;
              if (clientData.credit_limit !== undefined) updateData.credit_limit = clientData.credit_limit;
              if (clientData.credit_days !== undefined) updateData.credit_days = clientData.credit_days;
              if (clientData.is_active !== undefined) updateData.is_active = clientData.is_active;

              clientsToUpdate.push({
                id: existingId,
                data: updateData,
                index: originalIndex,
                client: clientData
              });
            } else {
              clientsToInsert.push({
                ...clientData,
                is_active: clientData.is_active !== undefined ? clientData.is_active : true,
                creation_date: now,
                originalIndex: originalIndex, // Guardar temporalmente para tracking
              });
            }
          });

          // INSERT: Insertar nuevos clientes en batch
          if (clientsToInsert.length > 0) {
            try {
              // Remover originalIndex antes de insertar (es solo para tracking, no es un campo de la BD)
              const clientsToInsertClean = clientsToInsert.map(({ originalIndex, ...client }) => ({
                name: client.name,
                id_city: client.id_city,
                id_province: client.id_province,
                identification: client.identification,
                identification_type: client.identification_type,
                email: client.email,
                phone: client.phone,
                address: client.address,
                requires_credit: client.requires_credit || false,
                credit_limit: client.credit_limit || null,
                credit_days: client.credit_days || 0,
                is_active: client.is_active !== undefined ? client.is_active : true,
              }));
              
              const insertedClients = await trx('nubestock.tb_mae_client')
                .insert(clientsToInsertClean)
                .returning('*');

              insertedClients.forEach((inserted: any) => {
                const originalClient = clientsToInsert.find(c => c.identification === inserted.identification);
                if (originalClient && originalClient.originalIndex !== undefined) {
                  results.successful.push({
                    index: originalClient.originalIndex,
                    client: inserted
                  });
                }
              });
            } catch (insertError) {
              logger.error('INSERT Error: Error al insertar clientes:', insertError);
              clientsToInsert.forEach((client) => {
                results.failed.push({
                  index: client.originalIndex,
                  client: client,
                  error: `INSERT Error: ${insertError instanceof Error ? insertError.message : 'Error desconocido'}`
                });
              });
            }
          }

          // UPDATE: Actualizar clientes existentes en paralelo
          if (clientsToUpdate.length > 0) {
            try {
              await Promise.all(
                clientsToUpdate.map(async ({ id, data, index, client }) => {
                  try {
                    const [updated] = await trx('nubestock.tb_mae_client')
                      .where('id', id)
                      .update(data)
                      .returning('*');
                    
                    if (updated) {
                      results.updated.push({ index, client: updated });
                    } else {
                      results.failed.push({
                        index,
                        client,
                        error: 'UPDATE Error: Cliente no encontrado o no se pudo actualizar',
                      });
                    }
                  } catch (updateError) {
                    logger.error(`UPDATE Error: Error al actualizar cliente ${id}:`, updateError);
                    results.failed.push({
                      index,
                      client,
                      error: `UPDATE Error: ${updateError instanceof Error ? updateError.message : 'Error desconocido'}`
                    });
                  }
                })
              );
            } catch (updateError) {
              logger.error('UPDATE Error: Error en actualizaciones de clientes:', updateError);
            }
          }
        } catch (selectError) {
          logger.error('SELECT Error: Error al consultar clientes existentes:', selectError);
          validClients.forEach((client) => {
            results.failed.push({
              index: client.originalIndex,
              client: client,
              error: `SELECT Error: ${selectError instanceof Error ? selectError.message : 'Error desconocido'}`
            });
          });
        }
      });
    } catch (transactionError) {
      logger.error('TRANSACTION Error: Error en transacción de carga masiva:', transactionError);
      const errorMessage = transactionError instanceof Error 
        ? transactionError.message 
        : 'Error desconocido en la transacción';
      
      let errorType = 'TRANSACTION Error';
      if (errorMessage.includes('INSERT') || errorMessage.includes('insert')) {
        errorType = 'INSERT Error';
      } else if (errorMessage.includes('UPDATE') || errorMessage.includes('update')) {
        errorType = 'UPDATE Error';
      } else if (errorMessage.includes('SELECT') || errorMessage.includes('select')) {
        errorType = 'SELECT Error';
      }
      
      validClients.forEach((client) => {
        const alreadyProcessed = results.successful.some(r => r.index === client.originalIndex) ||
                                 results.updated.some(r => r.index === client.originalIndex);
        
        if (!alreadyProcessed) {
          results.failed.push({
            index: client.originalIndex,
            client: client,
            error: `${errorType}: ${errorMessage}`,
          });
        }
      });
    }

    // Agregar errores de validación y duplicados
    clients.forEach((client, index) => {
      const { error } = clientSchema.validate(client);
      if (error) {
        results.failed.push({
          index,
          client: client,
          error: `Validación: ${error.details.map(d => d.message).join(', ')}`
        });
      } else if (duplicateIdentifications.includes(index)) {
        results.failed.push({
          index,
          client: client,
          error: 'Identificación duplicada en el batch'
        });
      }
    });

    // Preparar respuesta
    const totalProcessed = results.successful.length + results.updated.length;
    const responseBody: any = {
      success: results.failed.length === 0,
      message: `Procesados ${results.total} cliente(s): ${results.successful.length} creado(s), ${results.updated.length} actualizado(s), ${results.failed.length} fallido(s)`,
      data: {
        total: results.total,
        created: results.successful.length,
        updated: results.updated.length,
        failed: results.failed.length,
        clients: [
          ...results.successful.map(r => ({ ...r.client, action: 'created' })),
          ...results.updated.map(r => ({ ...r.client, action: 'updated' })),
        ],
        errors: results.failed.map(r => ({
          index: r.index + 1,
          identification: r.client.identification || 'N/A',
          name: r.client.name || 'N/A',
          error: r.error,
        })),
      },
      timestamp: new Date().toISOString(),
    };

    if (results.failed.length > 0 && totalProcessed > 0) {
      context.res = {
        status: 207,
        body: responseBody,
      };
    } else if (results.failed.length === results.total) {
      context.res = {
        status: 400,
        body: responseBody,
      };
    } else {
      context.res = {
        status: 201,
        body: responseBody,
      };
    }
  } catch (error) {
    logger.error('Error en carga masiva de clientes:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error interno al procesar carga masiva',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
