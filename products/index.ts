import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { Database } from '../src/config/database';
import { logger } from '../src/config/logger';
import { FinalProduct, Material, Category, Origin, ProductRecipe } from '../src/types';

// Función para generar alertas de stock bajo
async function generateStockAlert(product: any): Promise<void> {
  try {
    // Verificar si ya existe una alerta activa para este producto
    const existingAlert = await db.getConnection()
      .select('idalert')
      .from('nubestock.tb_mae_alert')
      .where('entity_type', 'product')
      .where('entity_id', product.idfinal_product)
      .where('alert_type', 'stock_low')
      .where('isactive', true)
      .first();

    if (existingAlert) {
      logger.info(`Ya existe una alerta activa para el producto ${product.product_name}`);
      return;
    }

    // Crear nueva alerta de stock bajo
    const alertData = {
      alert_type: 'stock_low',
      alert_title: `Stock bajo: ${product.product_name}`,
      alert_message: `El producto "${product.product_name}" (SKU: ${product.sku}) tiene stock bajo. Stock actual: ${product.current_stock}, Mínimo requerido: ${product.minimum_stock}`,
      entity_type: 'product',
      entity_id: product.idfinal_product,
      priority: 'high',
      isactive: true,
      creationdate: new Date(),
    };

    await db.create('nubestock.tb_mae_alert', alertData);
    
    logger.info(`Alerta de stock bajo generada para el producto: ${product.product_name}`);
  } catch (error) {
    logger.error('Error al generar alerta de stock bajo:', error);
  }
}
import { requireAuth } from '../src/middleware/authMiddleware';
import Joi from 'joi';

const db = Database.getInstance();

const productsHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    const { action, subaction } = req.params;
    const method = req.method;
    
    logger.info('Products function triggered', {
      action,
      method,
      url: req.url,
    });

    // Verificar autenticación usando el middleware
    const authResult = requireAuth(req);
    if (!authResult.success) {
      context.res = {
        status: 401,
        body: {
          success: false,
          message: authResult.error || 'Usuario no autenticado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const { userId } = authResult.user!;

    switch (method) {
      case 'GET':
        if (action === 'categories') {
          await handleGetCategories(context, req);
        } else if (action === 'origins') {
          await handleGetOrigins(context, req);
        } else if (action === 'materials') {
          await handleGetMaterials(context, req);
        } else if (action === 'recipes') {
          await handleGetRecipes(context, req);
        } else if (action) {
          await handleGetProduct(context, req, action);
        } else {
          await handleListProducts(context, req);
        }
        break;
      case 'POST':
        // Ruta especial para bulk de materiales: /products/materials/bulk
        if (action === 'materials' && subaction === 'bulk') {
          await handleBulkCreateMaterials(context, req);
        } else if (action === 'category') {
          await handleCreateCategory(context, req);
        } else if (action === 'material') {
          await handleCreateMaterial(context, req);
        } else if (action === 'recipe') {
          await handleCreateRecipe(context, req);
        } else if (action === 'check-stock') {
          await handleCheckStockAlerts(context, req);
        } else if (action === 'stock-operation') {
          await handleStockOperation(context, req);
        } else if (action === 'bulk') {
          await handleBulkCreateProducts(context, req);
        } else {
          await handleCreateProduct(context, req);
        }
        break;
      case 'PUT':
        if (action === 'material') {
          await handleUpdateMaterial(context, req);
        } else if (action === 'recipe') {
          await handleUpdateRecipe(context, req);
        } else if (action) {
          await handleUpdateProduct(context, req, action);
        } else {
          context.res = {
            status: 400,
            body: {
              success: false,
              message: 'ID de producto requerido',
              timestamp: new Date().toISOString(),
            },
          };
        }
        break;
      case 'DELETE':
        if (action === 'material') {
          await handleDeleteMaterial(context, req);
        } else if (action === 'recipe') {
          await handleDeleteRecipe(context, req);
        } else if (action) {
          await handleDeleteProduct(context, req, action);
        } else {
          context.res = {
            status: 400,
            body: {
              success: false,
              message: 'ID de producto requerido',
              timestamp: new Date().toISOString(),
            },
          };
        }
        break;
      default:
        context.res = {
          status: 405,
          body: {
            success: false,
            message: 'Método no permitido',
            timestamp: new Date().toISOString(),
          },
        };
    }
  } catch (error) {
    logger.error('Error en función de productos:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error interno del servidor',
        timestamp: new Date().toISOString(),
      },
    };
  }
};

async function handleListProducts(context: Context, req: HttpRequest): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const idcategory = req.query.idcategory as string;
    const idorigin = req.query.idorigin as string;

    let query = db.getConnection()
      .select(
        'fp.*',
        'c.namecategory',
        'o.nameorigin',
        'o.idprovince',
        'o.idcity',
        'p.province_name',
        'ci.city_name',
        'cnt.country_name',
        'cnt.country_code',
        db.getConnection().raw(`
          CONCAT(cnt.country_name, ' (', cnt.country_code, '), ', p.province_name, ', ', ci.city_name) as full_location
        `)
      )
      .from('nubestock.tb_mae_final_product as fp')
      .leftJoin('nubestock.tb_mae_category as c', 'fp.idcategory', 'c.idcategory')
      .leftJoin('nubestock.tb_mae_origin as o', 'fp.idorigin', 'o.idorigin')
      .leftJoin('nubestock.tb_mae_province as p', 'p.idprovince', 'o.idprovince')
      .leftJoin('nubestock.tb_mae_city as ci', 'ci.idcity', 'o.idcity')
      .leftJoin('nubestock.tb_mae_country as cnt', 'cnt.idcountry', 'p.idcountry')
      .where('fp.isactive', true)
      .orderBy('fp.creationdate', 'desc');

    // Aplicar filtros
    if (search) {
      query = query.where(function() {
        this.where('fp.product_name', 'ilike', `%${search}%`)
          .orWhere('fp.sku', 'ilike', `%${search}%`)
          .orWhere('fp.description', 'ilike', `%${search}%`);
      });
    }

    if (idcategory) {
      query = query.where('fp.idcategory', idcategory);
    }

    if (idorigin) {
      query = query.where('fp.idorigin', idorigin);
    }

    // Contar total usando query builder para evitar problemas de parámetros
    const countQuery = db.getConnection()
      .count('* as count')
      .from('nubestock.tb_mae_final_product as fp')
      .where('fp.isactive', true);

    // Aplicar filtros de búsqueda
    if (search) {
      countQuery.where(function() {
        this.where('fp.product_name', 'ilike', `%${search}%`)
          .orWhere('fp.sku', 'ilike', `%${search}%`)
          .orWhere('fp.description', 'ilike', `%${search}%`);
      });
    }

    if (idcategory) {
      countQuery.where('fp.idcategory', idcategory);
    }

    if (idorigin) {
      countQuery.where('fp.idorigin', idorigin);
    }

    const countResult = await countQuery;
    const total = parseInt((countResult[0] as any).count as string);

    // Aplicar paginación
    const offset = (page - 1) * limit;
    const products = await query.offset(offset).limit(limit);

    // Convertir valores decimales a números
    const processedProducts = products.map(product => ({
      ...product,
      unit_price: parseFloat(product.unit_price),
      current_stock: parseFloat(product.current_stock),
      minimum_stock: parseFloat(product.minimum_stock),
    }));

    context.res = {
      status: 200,
      body: {
        success: true,
        data: processedProducts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al listar productos:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al listar productos',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleGetProduct(context: Context, req: HttpRequest, productId: string): Promise<void> {
  try {
    const product = await db.getConnection()
      .select(
        'fp.*',
        'c.namecategory',
        'o.nameorigin',
        'o.idprovince',
        'o.idcity',
        'p.province_name',
        'ci.city_name',
        'cnt.country_name',
        'cnt.country_code',
        db.getConnection().raw(`
          CONCAT(cnt.country_name, ' (', cnt.country_code, '), ', p.province_name, ', ', ci.city_name) as full_location
        `)
      )
      .from('nubestock.tb_mae_final_product as fp')
      .leftJoin('nubestock.tb_mae_category as c', 'fp.idcategory', 'c.idcategory')
      .leftJoin('nubestock.tb_mae_origin as o', 'fp.idorigin', 'o.idorigin')
      .leftJoin('nubestock.tb_mae_province as p', 'p.idprovince', 'o.idprovince')
      .leftJoin('nubestock.tb_mae_city as ci', 'ci.idcity', 'o.idcity')
      .leftJoin('nubestock.tb_mae_country as cnt', 'cnt.idcountry', 'p.idcountry')
      .where('fp.idfinal_product', productId)
      .where('fp.isactive', true)
      .first();

    if (!product) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Producto no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Obtener receta del producto
    const recipe = await db.getConnection()
      .select(
        'm.material_name',
        'm.material_code',
        'm.material_type',
        'm.unit_of_measure',
        'm.cost_per_unit'
      )
      .from('nubestock.tb_mae_product_recipe as pr')
      .join('tb_mae_material as m', 'pr.idmaterial', 'm.idmaterial')
      .where('pr.idfinal_product', productId)
      .where('pr.isactive', true)
      .where('m.isactive', true);

    // Convertir valores decimales a números
    const processedProduct = {
      ...product,
      unit_price: parseFloat(product.unit_price),
      current_stock: parseFloat(product.current_stock),
      minimum_stock: parseFloat(product.minimum_stock),
      recipe,
    };

    context.res = {
      status: 200,
      body: {
        success: true,
        data: processedProduct,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener producto:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener producto',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleCreateProduct(context: Context, req: HttpRequest): Promise<void> {
  try {
    const productSchema = Joi.object({
      product_name: Joi.string().min(2).max(200).required(),
      idcategory: Joi.string().uuid().optional(),
      idorigin: Joi.string().uuid().required(),
      description: Joi.string().max(500).optional(),
      sku: Joi.string().min(2).max(100).required(),
      unit_price: Joi.number().positive().required(),
      current_stock: Joi.number().min(0).default(0),
      minimum_stock: Joi.number().min(0).default(0),
    });

    const { error, value } = productSchema.validate(req.body);
    
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

    // Verificar si el SKU ya existe
    const existingProduct = await db.getConnection()
      .select('idfinal_product')
      .from('nubestock.tb_mae_final_product')
      .where('sku', value.sku)
      .first();

    if (existingProduct) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'El SKU ya está registrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const newProduct = await db.create('nubestock.tb_mae_final_product', {
      ...value,
      isactive: true,
    });

    // Convertir valores decimales a números en la respuesta
    const processedProduct = {
      ...(newProduct as any),
      unit_price: parseFloat((newProduct as any).unit_price),
      current_stock: parseFloat((newProduct as any).current_stock),
      minimum_stock: parseFloat((newProduct as any).minimum_stock),
    };

    // Verificar si el stock está bajo después de la creación
    if (processedProduct.current_stock <= processedProduct.minimum_stock) {
      await generateStockAlert(processedProduct);
    }

    context.res = {
      status: 201,
      body: {
        success: true,
        data: processedProduct,
        message: 'Producto creado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al crear producto:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear producto',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleBulkCreateProducts(context: Context, req: HttpRequest): Promise<void> {
  try {
    const bulkProductSchema = Joi.array().items(
      Joi.object({
        product_name: Joi.string().min(2).max(200).required(),
        idcategory: Joi.string().uuid().optional().allow(null, ''),
        idorigin: Joi.string().uuid().required(),
        description: Joi.string().max(500).optional().allow(''),
        sku: Joi.string().min(2).max(100).required(),
        unit_price: Joi.number().positive().required(),
        current_stock: Joi.number().min(0).default(0).messages({
          'number.min': 'La cantidad debe ser mayor o igual a 0 (se permite 0, no se permiten valores negativos)',
          'number.base': 'La cantidad debe ser un número válido'
        }),
        minimum_stock: Joi.number().min(0).default(0).messages({
          'number.min': 'El valor umbral debe ser mayor o igual a 0 (se permite 0, no se permiten valores negativos)',
          'number.base': 'El valor umbral debe ser un número válido'
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
      product_name: string;
      idcategory?: string | null;
      idorigin: string;
      description?: string;
      sku: string;
      unit_price: number;
      current_stock?: number;
      minimum_stock?: number;
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
              product_name: r.product.product_name,
              error: r.error,
            })),
          },
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // OPTIMIZACIÓN: Obtener todos los SKUs existentes en una sola consulta
    const skusToCheck = validProducts.map(p => p.sku);
    const existingProductsMap = new Map<string, string>(); // SKU -> idfinal_product
    
    try {
      const existingProducts = await db.getConnection()
        .select('idfinal_product', 'sku')
        .from('nubestock.tb_mae_final_product')
        .whereIn('sku', skusToCheck);
      
      existingProducts.forEach((p: any) => {
        existingProductsMap.set(p.sku, p.idfinal_product);
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
              product_name: r.product.product_name,
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
        const productsToUpdate: Array<{ id: string; data: any; index: number; product: any }> = [];
        const lowStockProducts: any[] = [];

      // Preparar datos para insert/update
      validProducts.forEach((product, originalIndex) => {
        const actualIndex = products.findIndex((p, idx) => 
          p.sku === product.sku && !duplicateSkus.includes(idx)
        );
        
        const productData: any = {
          product_name: product.product_name,
          idorigin: product.idorigin,
          description: product.description || '',
          sku: product.sku,
          unit_price: product.unit_price,
          current_stock: product.current_stock || 0,
          minimum_stock: product.minimum_stock || 0,
        };

        if (product.idcategory && product.idcategory.trim() !== '') {
          productData.idcategory = product.idcategory;
        }

        const existingId = existingProductsMap.get(product.sku);
        
        if (existingId) {
          // Producto existe, preparar para update
          productData.modificationdate = now;
          productsToUpdate.push({
            id: existingId,
            data: productData,
            index: actualIndex,
            product: product, // Guardar el producto original para errores
          });
          
          // Verificar stock bajo
          if (productData.current_stock <= productData.minimum_stock) {
            lowStockProducts.push({
              idfinal_product: existingId,
              ...productData,
            });
          }
        } else {
          // Producto nuevo, preparar para insert
          // El UUID se generará en la base de datos
          productData.isactive = true;
          productData.creationdate = now;
          productsToInsert.push(productData);
          
          // Verificar stock bajo (el idfinal_product se asignará después del insert)
          if (productData.current_stock <= productData.minimum_stock) {
            lowStockProducts.push({
              sku: productData.sku,
              ...productData,
            });
          }
        }
      });

      // OPTIMIZACIÓN: Insertar todos los productos nuevos en batch
      if (productsToInsert.length > 0) {
        try {
          const insertValues = productsToInsert.map(p => ({
            product_name: p.product_name,
            idcategory: p.idcategory || null,
            idorigin: p.idorigin,
            description: p.description,
            sku: p.sku,
            unit_price: p.unit_price,
            current_stock: p.current_stock,
            minimum_stock: p.minimum_stock,
            isactive: true,
            creationdate: now,
          }));

          const insertedProducts = await trx('nubestock.tb_mae_final_product')
            .insert(insertValues)
            .returning('*');
          
          // Agregar a resultados
          insertedProducts.forEach((inserted: any, idx: number) => {
            const originalProduct = productsToInsert[idx];
            const originalIndex = validProducts.findIndex(vp => vp.sku === originalProduct.sku);
            results.successful.push({
              index: originalIndex,
              product: {
                ...inserted,
                unit_price: parseFloat(inserted.unit_price),
                current_stock: parseFloat(inserted.current_stock),
                minimum_stock: parseFloat(inserted.minimum_stock),
              },
            });
            
            // Actualizar el ID en lowStockProducts si es necesario
            const lowStockIndex = lowStockProducts.findIndex(
              p => p.sku === originalProduct.sku && !p.idfinal_product
            );
            if (lowStockIndex >= 0) {
              lowStockProducts[lowStockIndex].idfinal_product = inserted.idfinal_product;
            }
          });
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
              const [updated] = await trx('nubestock.tb_mae_final_product')
                .where('idfinal_product', id)
                .update(data)
                .returning('*');
              
              if (updated) {
                results.updated.push({
                  index,
                  product: {
                    ...updated,
                    unit_price: parseFloat(updated.unit_price),
                    current_stock: parseFloat(updated.current_stock),
                    minimum_stock: parseFloat(updated.minimum_stock),
                  },
                });
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

      // OPTIMIZACIÓN: Procesar alertas de stock bajo en batch al final
      if (lowStockProducts.length > 0) {
        // Filtrar solo productos que tienen idfinal_product
        const productsWithId = lowStockProducts.filter(p => p.idfinal_product);
        
        if (productsWithId.length > 0) {
          // Obtener IDs de productos que ya tienen alertas activas
          const productIds = productsWithId.map(p => p.idfinal_product);
          const existingAlerts = await trx('nubestock.tb_mae_alert')
            .select('entity_id')
            .where('entity_type', 'product')
            .whereIn('entity_id', productIds)
            .where('alert_type', 'stock_low')
            .where('isactive', true);

          const existingAlertProductIds = new Set(
            existingAlerts.map((a: any) => a.entity_id)
          );

          // Crear alertas solo para productos que no tienen alerta activa
          const alertsToCreate = productsWithId
            .filter(p => !existingAlertProductIds.has(p.idfinal_product))
            .map(product => ({
              alert_type: 'stock_low',
              alert_title: `Stock bajo: ${product.product_name}`,
              alert_message: `El producto "${product.product_name}" (SKU: ${product.sku}) tiene stock bajo. Stock actual: ${product.current_stock}, Mínimo requerido: ${product.minimum_stock}`,
              entity_type: 'product',
              entity_id: product.idfinal_product,
              priority: 'high',
              isactive: true,
              creationdate: now,
            }));

          if (alertsToCreate.length > 0) {
            try {
              await trx('nubestock.tb_mae_alert').insert(alertsToCreate);
            } catch (alertInsertError) {
              logger.error('INSERT Error: Error al insertar alertas de stock bajo:', alertInsertError);
              // No marcar como fallido, solo loguear - las alertas son secundarias
            }
          }
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
          product_name: r.product.product_name,
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

async function handleUpdateProduct(context: Context, req: HttpRequest, productId: string): Promise<void> {
  try {
    const updateSchema = Joi.object({
      product_name: Joi.string().min(2).max(200).optional(),
      idcategory: Joi.string().uuid().optional(),
      idorigin: Joi.string().uuid().optional(),
      description: Joi.string().max(500).optional(),
      sku: Joi.string().min(2).max(100).optional(),
      unit_price: Joi.number().positive().optional(),
      current_stock: Joi.number().min(0).optional(),
      minimum_stock: Joi.number().min(0).optional(),
    });

    const { error, value } = updateSchema.validate(req.body);
    
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

    // Verificar si el producto existe
    const existingProduct = await db.findById<FinalProduct>('tb_mae_final_product', productId);
    if (!existingProduct) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Producto no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si el SKU ya existe (si se está cambiando)
    if (value.sku && value.sku !== existingProduct.sku) {
      const skuExists = await db.getConnection()
        .select('idfinal_product')
        .from('nubestock.tb_mae_final_product')
        .where('sku', value.sku)
        .where('idfinal_product', '!=', productId)
        .first();

      if (skuExists) {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'El SKU ya está registrado',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
    }

    const updatedProduct = await db.update('tb_mae_final_product', productId, {
      ...value,
      modificationdate: new Date(),
    });

    if (!updatedProduct) {
      context.res = {
        status: 500,
        body: {
          success: false,
          message: 'Error al actualizar producto',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si el stock está bajo después de la actualización
    const finalProduct = updatedProduct as any;
    if (finalProduct.current_stock <= finalProduct.minimum_stock) {
      await generateStockAlert(finalProduct);
    }

    // Convertir valores decimales a números en la respuesta
    const processedProduct = {
      ...(updatedProduct as any),
      unit_price: parseFloat((updatedProduct as any).unit_price),
      current_stock: parseFloat((updatedProduct as any).current_stock),
      minimum_stock: parseFloat((updatedProduct as any).minimum_stock),
    };

    context.res = {
      status: 200,
      body: {
        success: true,
        data: processedProduct,
        message: 'Producto actualizado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al actualizar producto:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al actualizar producto',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleDeleteProduct(context: Context, req: HttpRequest, productId: string): Promise<void> {
  try {
    // Verificar si el producto existe
    const existingProduct = await db.findById<FinalProduct>('tb_mae_final_product', productId);
    if (!existingProduct) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Producto no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Soft delete
    const success = await db.softDelete('tb_mae_final_product', productId);

    if (!success) {
      context.res = {
        status: 500,
        body: {
          success: false,
          message: 'Error al eliminar producto',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        message: 'Producto eliminado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al eliminar producto:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al eliminar producto',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleGetCategories(context: Context, req: HttpRequest): Promise<void> {
  try {
    const categories = await db.getConnection()
      .select('*')
      .from('nubestock.tb_mae_category')
      .where('isactive', true)
      .orderBy('namecategory');

    context.res = {
      status: 200,
      body: {
        success: true,
        data: categories,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener categorías:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener categorías',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleGetOrigins(context: Context, req: HttpRequest): Promise<void> {
  try {
    // Get origins with location information using JOINs
    const origins = await db.getConnection()
      .select(
        'o.idorigin',
        'o.nameorigin',
        'o.idfacility',
        'o.idprovince',
        'o.idcity',
        'o.isactive',
        'o.creationdate',
        'o.modificationdate',
        'p.province_name',
        'ci.city_name',
        'c.country_name',
        'c.country_code',
        db.getConnection().raw(`
          CONCAT(c.country_name, ' (', c.country_code, '), ', p.province_name, ', ', ci.city_name) as full_location
        `)
      )
      .from('nubestock.tb_mae_origin as o')
      .leftJoin('nubestock.tb_mae_province as p', 'p.idprovince', 'o.idprovince')
      .leftJoin('nubestock.tb_mae_city as ci', 'ci.idcity', 'o.idcity')
      .leftJoin('nubestock.tb_mae_country as c', 'c.idcountry', 'p.idcountry')
      .where('o.isactive', true)
      .orderBy('o.nameorigin');

    context.res = {
      status: 200,
      body: {
        success: true,
        data: origins,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener orígenes:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener orígenes',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleGetMaterials(context: Context, req: HttpRequest): Promise<void> {
  try {
    const materialType = req.query.type as string;
    const idorigin = req.query.idorigin as string;

    let query = db.getConnection()
      .select('*')
      .from('nubestock.tb_mae_material')
      .where('isactive', true)
      .orderBy('material_name');

    if (materialType) {
      query = query.where('material_type', materialType);
    }

    if (idorigin) {
      query = query.where('idorigin', idorigin);
    }

    const materials = await query;

    context.res = {
      status: 200,
      body: {
        success: true,
        data: materials,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener materiales:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener materiales',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleGetRecipes(context: Context, req: HttpRequest): Promise<void> {
  try {
    const productId = req.query.productId as string;

    if (!productId) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de producto requerido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const recipes = await db.getConnection()
      .select(
        'pr.idrecipe',
        'pr.quantity',
        'm.idmaterial',
        'm.material_name',
        'm.material_code',
        'm.material_type',
        'm.unit_of_measure',
        'm.cost_per_unit'
      )
      .from('nubestock.tb_mae_product_recipe as pr')
      .join('tb_mae_material as m', 'pr.idmaterial', 'm.idmaterial')
      .where('pr.idfinal_product', productId)
      .where('pr.isactive', true)
      .where('m.isactive', true);

    context.res = {
      status: 200,
      body: {
        success: true,
        data: recipes,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener recetas:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener recetas',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleCreateRecipe(context: Context, req: HttpRequest): Promise<void> {
  try {
    const recipeSchema = Joi.object({
      idfinal_product: Joi.string().uuid().required(),
      idmaterial: Joi.string().uuid().required(),
      quantity: Joi.number().positive().required(),
    });

    const { error, value } = recipeSchema.validate(req.body);
    
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

    // Verificar si la receta ya existe
    const existingRecipe = await db.getConnection()
      .select('idrecipe')
      .from('nubestock.tb_mae_product_recipe')
      .where('idfinal_product', value.idfinal_product)
      .where('idmaterial', value.idmaterial)
      .where('isactive', true)
      .first();

    if (existingRecipe) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'La receta ya existe',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const newRecipe = await db.create('tb_mae_product_recipe', {
      ...value,
      quantity: value.quantity || 1.0,
      isactive: true,
    });

    context.res = {
      status: 201,
      body: {
        success: true,
        data: newRecipe,
        message: 'Receta creada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al crear receta:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear receta',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleCreateCategory(context: Context, req: HttpRequest): Promise<void> {
  try {
    const categorySchema = Joi.object({
      namecategory: Joi.string().required(),
      idpcategory: Joi.string().uuid().allow(null, '').optional(), // Categoría padre (opcional, puede ser null)
    });

    const { error, value } = categorySchema.validate(req.body);
    if (error) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => ({
            field: detail.path[0],
            message: detail.message,
          })),
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si la categoría ya existe
    const existingCategory = await db.getConnection()
      .select('idcategory')
      .from('nubestock.tb_mae_category')
      .where('namecategory', value.namecategory)
      .first();

    if (existingCategory) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'La categoría ya existe',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Para la primera categoría, usar función de PostgreSQL
    if (!value.idpcategory) {
      // Crear categoría raíz usando función de PostgreSQL
      // Esta función maneja la inserción con NULL y actualización sin modificar constraints
      try {
        const result = await db.getConnection().raw(`
          SELECT * FROM nubestock.create_root_category(?);
        `, [value.namecategory]);
        
        if (!result.rows || result.rows.length === 0) {
          throw new Error('No se pudo crear la categoría raíz');
        }
        
        const finalCategory = result.rows[0];
        
        context.res = {
          status: 201,
          body: {
            success: true,
            data: finalCategory,
            message: 'Categoría creada exitosamente',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      } catch (error) {
        logger.error('Error al crear categoría raíz:', error);
        
        // Si la función no existe, dar instrucciones claras
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('function') && (errorMessage.includes('does not exist') || errorMessage.includes('no existe'))) {
          logger.error('Función create_root_category no existe. Ejecuta el script SQL primero.');
          context.res = {
            status: 500,
            body: {
              success: false,
              message: 'Función de base de datos no encontrada. Por favor, ejecuta el script SQL: nubestock-backend/src/utils/create_root_category_function.sql',
              timestamp: new Date().toISOString(),
            },
          };
          return;
        }
        
        // Si es otro error, propagarlo para que se maneje en el catch general
        throw error;
      }
    }

    // Para categorías hijas, usar el método normal
    const categoryData = {
      namecategory: value.namecategory,
      idpcategory: value.idpcategory,
      isactive: true,
    };

    const newCategory = await db.create('nubestock.tb_mae_category', categoryData);

    context.res = {
      status: 201,
      body: {
        success: true,
        data: newCategory,
        message: 'Categoría creada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al crear categoría:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear categoría',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleCreateMaterial(context: Context, req: HttpRequest): Promise<void> {
  try {
    const materialSchema = Joi.object({
      material_name: Joi.string().required(),
      material_code: Joi.string().required(),
      material_type: Joi.string().valid('raw', 'packaging').required(),
      unit_of_measure: Joi.string().required(),
      cost_per_unit: Joi.number().positive().required(),
      minimum_stock: Joi.number().min(0).optional(),
      idorigin: Joi.string().uuid().required(),
      supplier: Joi.string().optional(),
    });

    const { error, value } = materialSchema.validate(req.body);
    if (error) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => ({
            field: detail.path[0],
            message: detail.message,
          })),
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si el material ya existe
    const existingMaterial = await db.getConnection()
      .select('idmaterial')
      .from('nubestock.tb_mae_material')
      .where('material_code', value.material_code)
      .first();

    if (existingMaterial) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'El material ya existe',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const newMaterial = await db.create('nubestock.tb_mae_material', {
      ...value,
      minimum_stock: value.minimum_stock || 0,
      isactive: true,
    });

    context.res = {
      status: 201,
      body: {
        success: true,
        data: newMaterial,
        message: 'Material creado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al crear material:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear material',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleBulkCreateMaterials(context: Context, req: HttpRequest): Promise<void> {
  try {
    // Log inicial para debugging
    logger.info('Bulk materials request received');
    logger.info('Request body type:', typeof req.body);
    logger.info('Request body is array:', Array.isArray(req.body));
    logger.info('Request body keys:', req.body && typeof req.body === 'object' ? Object.keys(req.body) : 'N/A');
    
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
          // Si es un objeto pero no tiene array, podría ser que el body esté mal formado
          logger.error('Body is not an array:', { 
            bodyType: typeof bodyData, 
            bodyKeys: Object.keys(bodyData || {}),
            bodySample: JSON.stringify(bodyData).substring(0, 200)
          });
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
        logger.error('Body is not an array or object:', typeof bodyData);
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
    
    // Verificar que bodyData sea realmente un array antes de validar
    if (!Array.isArray(bodyData)) {
      logger.error('bodyData is not an array after processing:', typeof bodyData);
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

    const bulkMaterialSchema = Joi.array().items(
      Joi.object({
        material_name: Joi.string().min(2).max(200).required(),
        material_code: Joi.string().min(2).max(50).required(),
        material_type: Joi.string().valid('raw', 'packaging').required(),
        idorigin: Joi.string().uuid().required(),
        unit_of_measure: Joi.string().required(),
        cost_per_unit: Joi.number().positive().required(),
        minimum_stock: Joi.number().min(0).default(0).messages({
          'number.min': 'El stock mínimo debe ser mayor o igual a 0',
          'number.base': 'El stock mínimo debe ser un número válido'
        }),
        supplier: Joi.string().optional().allow('', null),
      })
    ).min(1).max(1000); // Máximo 1000 materiales por carga

    logger.info('Validating materials array, count:', bodyData.length);
    logger.info('First material sample:', bodyData.length > 0 ? JSON.stringify(bodyData[0]) : 'No items');
    
    // Verificar que bodyData sea realmente un array antes de validar
    if (!Array.isArray(bodyData)) {
      logger.error('bodyData is not an array after processing:', typeof bodyData, bodyData);
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
    
    const { error, value } = bulkMaterialSchema.validate(bodyData, {
      abortEarly: false, // Recopilar todos los errores
      stripUnknown: false, // No eliminar campos desconocidos
    });
    
    if (error) {
      logger.error('Validation error:', JSON.stringify(error, null, 2));
      logger.error('Error details:', error.details);
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
      material_name: string;
      material_code: string;
      material_type: 'raw' | 'packaging';
      idorigin: string;
      unit_of_measure: string;
      cost_per_unit: number;
      minimum_stock?: number;
      supplier?: string | null;
    }>;

    const results = {
      successful: [] as any[],
      updated: [] as any[],
      failed: [] as Array<{ index: number; material: any; error: string }>,
      total: materials.length,
    };

    // Verificar códigos duplicados en el lote
    const codeSet = new Set<string>();
    const duplicateCodes: number[] = [];
    const codeToIndex = new Map<string, number>();
    
    materials.forEach((material, index) => {
      if (codeSet.has(material.material_code)) {
        duplicateCodes.push(index);
      } else {
        codeSet.add(material.material_code);
        codeToIndex.set(material.material_code, index);
      }
    });

    if (duplicateCodes.length > 0) {
      duplicateCodes.forEach(index => {
        results.failed.push({
          index,
          material: materials[index],
          error: 'Código de material duplicado en el mismo lote',
        });
      });
    }

    // Filtrar materiales válidos (sin duplicados en el lote)
    const validMaterials = materials.filter((_, index) => !duplicateCodes.includes(index));
    if (validMaterials.length === 0) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Todos los materiales tienen códigos duplicados en el lote',
          data: {
            total: results.total,
            created: 0,
            updated: 0,
            failed: results.failed.length,
            materials: [],
            errors: results.failed.map(r => ({
              index: r.index + 1,
              material_code: r.material.material_code,
              material_name: r.material.material_name,
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
      // Obtener todos los materiales existentes por código en una sola consulta
      const existingMaterialCodes = validMaterials.map(m => m.material_code);
      const existingMaterials = await trx('nubestock.tb_mae_material')
        .select('idmaterial', 'material_code')
        .whereIn('material_code', existingMaterialCodes);

      const existingMaterialMap = new Map(
        existingMaterials.map((m: any) => [m.material_code, m.idmaterial])
      );

      // Separar en crear y actualizar
      const materialsToCreate: Array<{ index: number; material: any }> = [];
      const materialsToUpdate: Array<{ index: number; material: any; id: string }> = [];

      validMaterials.forEach((material, index) => {
        const originalIndex = materials.findIndex(m => 
          m.material_code === material.material_code && 
          !duplicateCodes.includes(materials.indexOf(m))
        );
        const materialId = existingMaterialMap.get(material.material_code);
        
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
            ...material,
            minimum_stock: material.minimum_stock || 0,
            supplier: material.supplier || null,
            isactive: true,
            creationdate: now,
            modificationdate: now,
          }));

          const insertedMaterials = await trx('nubestock.tb_mae_material')
            .insert(materialsToInsert)
            .returning('*');

          insertedMaterials.forEach((inserted: any, idx: number) => {
            results.successful.push({
              index: materialsToCreate[idx].index,
              material: {
                ...inserted,
                cost_per_unit: parseFloat(inserted.cost_per_unit),
                minimum_stock: parseFloat(inserted.minimum_stock || 0),
              },
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
              const updated = await trx('nubestock.tb_mae_material')
                .where('idmaterial', id)
                .update({
                  material_name: material.material_name,
                  material_type: material.material_type,
                  idorigin: material.idorigin,
                  unit_of_measure: material.unit_of_measure,
                  cost_per_unit: material.cost_per_unit,
                  minimum_stock: material.minimum_stock || 0,
                  supplier: material.supplier || null,
                  modificationdate: now,
                })
                .returning('*');
              
              if (updated && updated.length > 0) {
                results.updated.push({
                  index,
                  material: {
                    ...updated[0],
                    cost_per_unit: parseFloat(updated[0].cost_per_unit),
                    minimum_stock: parseFloat(updated[0].minimum_stock || 0),
                  },
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
            material_code: r.material.material_code,
            material_name: r.material.material_name,
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

async function handleUpdateMaterial(context: Context, req: HttpRequest): Promise<void> {
  try {
    const materialId = req.query.id as string;
    
    if (!materialId) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de material requerido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const materialSchema = Joi.object({
      material_name: Joi.string().min(2).max(200).optional(),
      material_code: Joi.string().min(2).max(50).optional(),
      material_type: Joi.string().valid('raw', 'packaging').optional(),
      idorigin: Joi.string().uuid().optional(),
      unit_of_measure: Joi.string().optional(),
      cost_per_unit: Joi.number().positive().optional(),
      supplier: Joi.string().allow(null, '').optional(),
      minimum_stock: Joi.number().min(0).optional(),
      isactive: Joi.boolean().optional(),
    });

    const { error, value } = materialSchema.validate(req.body);
    
    if (error) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => ({
            field: detail.path[0],
            message: detail.message,
          })),
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si el material existe
    const existingMaterial = await db.getConnection()
      .select('idmaterial')
      .from('nubestock.tb_mae_material')
      .where('idmaterial', materialId)
      .first();

    if (!existingMaterial) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Material no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Si se actualiza el código, verificar que no exista otro material con el mismo código
    if (value.material_code) {
      const duplicateMaterial = await db.getConnection()
        .select('idmaterial')
        .from('nubestock.tb_mae_material')
        .where('material_code', value.material_code)
        .whereNot('idmaterial', materialId)
        .first();

      if (duplicateMaterial) {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'El código de material ya existe',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
    }

    const updatedMaterial = await db.update('tb_mae_material', materialId, {
      ...value,
      modificationdate: new Date(),
    });

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedMaterial,
        message: 'Material actualizado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al actualizar material:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al actualizar material',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleDeleteMaterial(context: Context, req: HttpRequest): Promise<void> {
  try {
    const materialId = req.query.id as string;
    
    if (!materialId) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de material requerido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si el material existe
    const existingMaterial = await db.getConnection()
      .select('idmaterial')
      .from('nubestock.tb_mae_material')
      .where('idmaterial', materialId)
      .first();

    if (!existingMaterial) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Material no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Soft delete: desactivar en lugar de eliminar
    await db.update('tb_mae_material', materialId, {
      isactive: false,
      modificationdate: new Date(),
    });

    context.res = {
      status: 200,
      body: {
        success: true,
        message: 'Material desactivado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al eliminar material:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al eliminar material',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleUpdateRecipe(context: Context, req: HttpRequest): Promise<void> {
  try {
    const recipeId = req.query.id as string;
    
    if (!recipeId) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de receta requerido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const recipeSchema = Joi.object({
      quantity: Joi.number().positive().optional(),
      isactive: Joi.boolean().optional(),
    });

    const { error, value } = recipeSchema.validate(req.body);
    
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

    // Verificar si la receta existe
    const existingRecipe = await db.getConnection()
      .select('idrecipe')
      .from('nubestock.tb_mae_product_recipe')
      .where('idrecipe', recipeId)
      .first();

    if (!existingRecipe) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Receta no encontrada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const updatedRecipe = await db.update('tb_mae_product_recipe', recipeId, {
      ...value,
      modificationdate: new Date(),
    });

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedRecipe,
        message: 'Receta actualizada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al actualizar receta:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al actualizar receta',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleDeleteRecipe(context: Context, req: HttpRequest): Promise<void> {
  try {
    const recipeId = req.query.id as string;
    
    if (!recipeId) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de receta requerido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si la receta existe
    const existingRecipe = await db.getConnection()
      .select('idrecipe')
      .from('nubestock.tb_mae_product_recipe')
      .where('idrecipe', recipeId)
      .first();

    if (!existingRecipe) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Receta no encontrada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Soft delete: desactivar en lugar de eliminar
    await db.update('tb_mae_product_recipe', recipeId, {
      isactive: false,
      modificationdate: new Date(),
    });

    context.res = {
      status: 200,
      body: {
        success: true,
        message: 'Receta eliminada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al eliminar receta:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al eliminar receta',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleCheckStockAlerts(context: Context, req: HttpRequest): Promise<void> {
  try {
    // Obtener todos los productos con stock bajo
    const lowStockProducts = await db.getConnection()
      .select(
        'fp.*',
        'c.namecategory',
        'o.nameorigin'
      )
      .from('nubestock.tb_mae_final_product as fp')
      .leftJoin('nubestock.tb_mae_category as c', 'fp.idcategory', 'c.idcategory')
      .leftJoin('nubestock.tb_mae_origin as o', 'fp.idorigin', 'o.idorigin')
      .leftJoin('nubestock.tb_mae_province as p', 'p.idprovince', 'o.idprovince')
      .leftJoin('nubestock.tb_mae_city as ci', 'ci.idcity', 'o.idcity')
      .leftJoin('nubestock.tb_mae_country as cnt', 'cnt.idcountry', 'p.idcountry')
      .where('fp.isactive', true)
      .whereRaw('fp.current_stock <= fp.minimum_stock');

    let alertsGenerated = 0;

    // Generar alertas para cada producto con stock bajo
    for (const product of lowStockProducts) {
      await generateStockAlert(product);
      alertsGenerated++;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        message: `Verificación de stock completada. ${alertsGenerated} alertas generadas.`,
        data: {
          lowStockProducts: lowStockProducts.length,
          alertsGenerated,
          products: lowStockProducts.map(p => ({
            id: p.idfinal_product,
            name: p.product_name,
            sku: p.sku,
            currentStock: parseFloat(p.current_stock),
            minimumStock: parseFloat(p.minimum_stock),
            category: p.namecategory,
            origin: p.nameorigin
          }))
        },
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al verificar alertas de stock:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al verificar alertas de stock',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleStockOperation(context: Context, req: HttpRequest): Promise<void> {
  try {
    const stockOperationSchema = Joi.object({
      idfinal_product: Joi.string().uuid().required(),
      operation_type: Joi.string().valid('in', 'out').required(),
      quantity: Joi.number().positive().required(),
      reason: Joi.string().max(200).optional(),
      user_id: Joi.string().uuid().optional(),
    });

    const { error, value } = stockOperationSchema.validate(req.body);
    
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

    // Obtener el producto actual
    const product = await db.getConnection()
      .select('*')
      .from('nubestock.tb_mae_final_product')
      .where('idfinal_product', value.idfinal_product)
      .where('isactive', true)
      .first();

    if (!product) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Producto no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Calcular nuevo stock
    let newStock = parseFloat(product.current_stock);
    if (value.operation_type === 'in') {
      newStock += value.quantity;
    } else {
      newStock -= value.quantity;
      if (newStock < 0) {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'No hay suficiente stock para realizar esta operación',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
    }

    // Actualizar el stock del producto
    const updatedProduct = await db.update('nubestock.tb_mae_final_product', value.idfinal_product, {
      current_stock: newStock,
      modificationdate: new Date(),
    });

    // Registrar la transacción
    const transactionData = {
      idfinal_product: value.idfinal_product,
      transaction_type: value.operation_type === 'in' ? 'stock_in' : 'stock_out',
      quantity: value.quantity,
      unit_price: parseFloat(product.unit_price),
      total_amount: value.quantity * parseFloat(product.unit_price),
      reason: value.reason || `Operación de ${value.operation_type === 'in' ? 'ingreso' : 'salida'} de stock`,
      iduser: value.user_id,
      creationdate: new Date(),
    };

    await db.create('nubestock.tb_ope_transaction', transactionData);

    // Verificar si el stock está bajo después de la operación
    if (newStock <= parseFloat(product.minimum_stock)) {
      await generateStockAlert({
        ...product,
        current_stock: newStock,
      });
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        message: `Operación de stock ${value.operation_type === 'in' ? 'ingreso' : 'salida'} realizada exitosamente`,
        data: {
          product: {
            id: product.idfinal_product,
            name: product.product_name,
            sku: product.sku,
            previousStock: parseFloat(product.current_stock),
            newStock: newStock,
            operation: value.operation_type,
            quantity: value.quantity,
          }
        },
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al realizar operación de stock:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al realizar operación de stock',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export default productsHandler;
