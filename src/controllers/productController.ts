import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import { logger } from '../config/logger';
import { createStockLowAlert } from '../utils/alertHelper';
import Joi from 'joi';

const db = Database.getInstance();

// Función para generar alertas de stock bajo
async function generateStockAlert(product: any): Promise<void> {
  try {
    const productId = product.id || product.id_product;
    if (!productId) {
      logger.warn('No se puede generar alerta: producto sin ID', product);
      return;
    }

    await createStockLowAlert(
      productId,
      product.name,
      product.sku,
      product.quantity || 0,
      product.min_stock || 0,
      {
        checkDuplicates: true,
      }
    );
  } catch (error) {
    logger.error('Error al generar alerta de stock bajo:', error);
  }
}

export async function listProducts(context: Context, req: HttpRequest): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const id_category = req.query.id_category as string;
    const id_origin = req.query.id_origin as string;
    const product_type = req.query.type as string || 'PF'; // Por defecto solo productos finales
    const idCategoryNum = id_category ? parseInt(id_category, 10) : null;
    const idOriginNum = id_origin ? parseInt(id_origin, 10) : null;

    let query = db.getConnection()
      .select(
        'p.*',
        'c.name as category_name',
        'o.name as origin_name',
        'm.name as measure_name',
        'm.description as measure_description'
      )
      .from('nubestock.tb_ope_product as p')
      .leftJoin('nubestock.tb_mae_category as c', 'p.id_category', 'c.id')
      .leftJoin('nubestock.tb_mae_origin as o', 'p.id_origin', 'o.id')
      .leftJoin('nubestock.tb_mae_measure as m', 'p.id_measure', 'm.id')
      .where('p.is_active', true)
      .where('p.type', product_type)
      .orderBy('p.creation_date', 'desc');

    // Aplicar filtros
    if (search) {
      query = query.where(function() {
        this.where('p.name', 'ilike', `%${search}%`)
          .orWhere('p.sku', 'ilike', `%${search}%`);
      });
    }

    if (idCategoryNum && !isNaN(idCategoryNum)) {
      query = query.where('p.id_category', idCategoryNum);
    }

    if (idOriginNum && !isNaN(idOriginNum)) {
      query = query.where('p.id_origin', idOriginNum);
    }

    // Contar total usando query builder para evitar problemas de parámetros
    const countQuery = db.getConnection()
      .count('* as count')
      .from('nubestock.tb_ope_product as p')
      .where('p.is_active', true)
      .where('p.type', product_type);

    // Aplicar filtros de búsqueda
    if (search) {
      countQuery.where(function() {
        this.where('p.name', 'ilike', `%${search}%`)
          .orWhere('p.sku', 'ilike', `%${search}%`);
      });
    }

    if (idCategoryNum && !isNaN(idCategoryNum)) {
      countQuery.where('p.id_category', idCategoryNum);
    }

    if (idOriginNum && !isNaN(idOriginNum)) {
      countQuery.where('p.id_origin', idOriginNum);
    }

    const countResult = await countQuery;
    const total = parseInt((countResult[0] as any).count as string);

    // Aplicar paginación
    const offset = (page - 1) * limit;
    const products = await query.offset(offset).limit(limit);

    context.res = {
      status: 200,
      body: {
        success: true,
        data: products,
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

export async function getProduct(context: Context, req: HttpRequest, productId: string): Promise<void> {
  try {
    const productIdNum = parseInt(productId, 10);
    if (isNaN(productIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de producto inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const product = await db.getConnection()
      .select(
        'p.*',
        'c.name as category_name',
        'o.name as origin_name',
        'm.name as measure_name',
        'm.description as measure_description'
      )
      .from('nubestock.tb_ope_product as p')
      .leftJoin('nubestock.tb_mae_category as c', 'p.id_category', 'c.id')
      .leftJoin('nubestock.tb_mae_origin as o', 'p.id_origin', 'o.id')
      .leftJoin('nubestock.tb_mae_measure as m', 'p.id_measure', 'm.id')
      .where('p.id', productIdNum)
      .where('p.is_active', true)
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

    // Obtener receta del producto si es un producto final
    if (product.type === 'PF') {
      const recipe = await db.getConnection()
        .select(
          'r.id as receipe_id',
          'r.name as receipe_name',
          'r.description as receipe_description',
          'pr.id as product_receipe_id',
          'pr.id_product as material_id',
          'mp.name as material_name',
          'mp.sku as material_sku',
          'pr.quantity as material_quantity',
          'm.name as measure_name',
          'm.description as measure_description'
        )
        .from('nubestock.tb_mae_receipe as r')
        .join('nubestock.tb_mae_product_receipe as pr', 'r.id', 'pr.id_receipe')
        .join('nubestock.tb_ope_product as mp', 'pr.id_product', 'mp.id')
        .leftJoin('nubestock.tb_mae_measure as m', 'mp.id_measure', 'm.id')
        .where('r.id_product', productIdNum)
        .where('r.is_active', true)
        .first();

      if (recipe) {
        const materials = await db.getConnection()
          .select(
            'pr.id as product_receipe_id',
            'pr.id_product as material_id',
            'mp.name as material_name',
            'mp.sku as material_sku',
            'pr.quantity as material_quantity',
            'm.name as measure_name',
            'm.description as measure_description'
          )
          .from('nubestock.tb_mae_product_receipe as pr')
          .join('nubestock.tb_ope_product as mp', 'pr.id_product', 'mp.id')
          .leftJoin('nubestock.tb_mae_measure as m', 'mp.id_measure', 'm.id')
          .where('pr.id_receipe', recipe.receipe_id)
          .where('pr.is_active', true)
          .where('mp.is_active', true);

        (product as any).recipe = {
          id: recipe.receipe_id,
          name: recipe.receipe_name,
          description: recipe.receipe_description,
          materials: materials,
        };
      }
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: product,
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

export async function createProduct(context: Context, req: HttpRequest): Promise<void> {
  try {
    // Validación inicial para obtener el tipo
    const initialSchema = Joi.object({
      type: Joi.string().valid('MP', 'PF').default('PF'),
    }).unknown(true);
    
    const initialValidation = initialSchema.validate(req.body);
    const productType = initialValidation.value?.type || 'PF';

    // Validación condicional: si es MP, permite decimales; si es PF, solo enteros
    const productSchema = Joi.object({
      name: Joi.string().min(2).max(200).required(),
      sku: Joi.string().min(2).max(100).required(),
      id_category: Joi.number().integer().optional(),
      id_origin: Joi.number().integer().required(),
      id_measure: Joi.number().integer().required(),
      type: Joi.string().valid('MP', 'PF').default('PF'),
      min_stock: productType === 'MP' 
        ? Joi.number().min(0).default(0) // MP: permite decimales
        : Joi.number().integer().min(0).default(0), // PF: solo enteros
      quantity: productType === 'MP'
        ? Joi.number().min(0).default(0) // MP: permite decimales
        : Joi.number().integer().min(0).default(0), // PF: solo enteros
      price: Joi.number().min(0).required().messages({
        'number.base': 'El precio debe ser un número válido',
        'number.min': 'El precio debe ser mayor o igual a 0',
        'any.required': 'El precio es obligatorio'
      }),
    });

    const { error, value } = productSchema.validate(req.body);
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

    // Verificar si el SKU ya existe
    const existingProduct = await db.getConnection()
      .select('id')
      .from('nubestock.tb_ope_product')
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

    const newProduct = await db.create('nubestock.tb_ope_product', {
      name: value.name,
      id_category: value.id_category || null,
      id_origin: value.id_origin,
      id_measure: value.id_measure,
      sku: value.sku,
      type: value.type || 'PF',
      min_stock: value.min_stock || 0,
      quantity: value.quantity || 0,
      is_active: true,
    });

    // Verificar si el stock está bajo después de la creación
    const processedProduct = newProduct as any;
    if (processedProduct.quantity <= processedProduct.min_stock) {
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

export async function updateProduct(context: Context, req: HttpRequest, productId: string): Promise<void> {
  try {
    const productIdNum = parseInt(productId, 10);
    if (isNaN(productIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de producto inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Primero obtener el producto existente para conocer su tipo actual
    const existingProduct = await db.findById('nubestock.tb_ope_product', productIdNum);
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

    const currentType = (existingProduct as any)?.type || 'PF';
    const newType = req.body?.type || currentType; // Tipo nuevo (si se actualiza) o el actual

    // Validación condicional: usar el tipo actual para validar los valores existentes
    // Si se está cambiando el tipo, los valores deben cumplir las restricciones del nuevo tipo
    const updateSchema = Joi.object({
      name: Joi.string().min(2).max(200).optional(),
      sku: Joi.string().min(2).max(100).optional(),
      id_category: Joi.number().integer().optional(),
      id_origin: Joi.number().integer().optional(),
      id_measure: Joi.number().integer().optional(),
      type: Joi.string().valid('MP', 'PF').optional(),
      // Validar según el tipo que se usará (nuevo tipo si se cambia, actual si no)
      min_stock: newType === 'MP'
        ? Joi.number().min(0).optional() // MP: permite decimales
        : Joi.number().integer().min(0).optional(), // PF: solo enteros
      quantity: newType === 'MP'
        ? Joi.number().min(0).optional() // MP: permite decimales
        : Joi.number().integer().min(0).optional(), // PF: solo enteros
      price: Joi.number().min(0).required().messages({
        'number.base': 'El precio debe ser un número válido',
        'number.min': 'El precio debe ser mayor o igual a 0',
        'any.required': 'El precio es obligatorio en todas las actualizaciones'
      }),
      is_active: Joi.boolean().optional(),
    });

    const { error, value } = updateSchema.validate(req.body);
    
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

    // Si se está actualizando el SKU, verificar que no exista otro producto con ese SKU
    if (value.sku && value.sku !== (existingProduct as any).sku) {
      const duplicateProduct = await db.getConnection()
        .select('id')
        .from('nubestock.tb_ope_product')
        .where('sku', value.sku)
        .where('id', '!=', productIdNum)
        .first();

      if (duplicateProduct) {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'El SKU ya está registrado en otro producto',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
    }

    const updateData: any = {
      modification_date: new Date(),
    };

    if (value.name !== undefined) updateData.name = value.name;
    if (value.sku !== undefined) updateData.sku = value.sku;
    if (value.id_category !== undefined) updateData.id_category = value.id_category;
    if (value.id_origin !== undefined) updateData.id_origin = value.id_origin;
    if (value.id_measure !== undefined) updateData.id_measure = value.id_measure;
    if (value.quantity !== undefined) updateData.quantity = value.quantity;
    if (value.min_stock !== undefined) updateData.min_stock = value.min_stock;
    if (value.price !== undefined) updateData.price = value.price;
    if (value.is_active !== undefined) updateData.is_active = value.is_active;

    const updatedProduct = await db.update('nubestock.tb_ope_product', productIdNum, updateData);

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
    if (finalProduct.quantity <= finalProduct.min_stock) {
      await generateStockAlert(finalProduct);
    } else {
      // Si el stock ya no está bajo, resolver alertas activas
      // Buscar alertas que mencionen este producto en el mensaje (ya que no tenemos entity_id)
      await db.getConnection()
        .from('nubestock.tb_mae_alert')
        .where('entity_type', 'product')
        .where('alert_type', 'stock_low')
        .where('is_active', true)
        .whereRaw(`alert_message LIKE ?`, [`%ID: ${productIdNum}%`])
        .update({
          is_active: false,
          resolved_by: 1,
          resolved_at: new Date(),
        });
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedProduct,
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

export async function deleteProduct(context: Context, req: HttpRequest, productId: string): Promise<void> {
  try {
    const productIdNum = parseInt(productId, 10);
    if (isNaN(productIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de producto inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar que el producto existe
    const existingProduct = await db.findById('nubestock.tb_ope_product', productIdNum);
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

    // Eliminar el producto (soft delete - marcar como inactivo)
    const deletedProduct = await db.update('nubestock.tb_ope_product', productIdNum, {
      is_active: false,
      modification_date: new Date(),
    });

    context.res = {
      status: 200,
      body: {
        success: true,
        data: deletedProduct,
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

/**
 * Verificar y generar alertas de stock bajo para todos los productos
 */
export async function checkStockAlerts(context: Context, req: HttpRequest): Promise<void> {
  try {
    // Obtener todos los productos con stock bajo
    const lowStockProducts = await db.getConnection()
      .select(
        'p.*',
        'c.name as category_name',
        'o.name as origin_name'
      )
      .from('nubestock.tb_ope_product as p')
      .leftJoin('nubestock.tb_mae_category as c', 'p.id_category', 'c.id')
      .leftJoin('nubestock.tb_mae_origin as o', 'p.id_origin', 'o.id')
      .where('p.is_active', true)
      .whereRaw('p.quantity <= p.min_stock');

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
            id: p.id,
            name: p.name,
            sku: p.sku,
            currentStock: p.quantity,
            minimumStock: p.min_stock,
            category: p.category_name,
            origin: p.origin_name
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

/**
 * Realizar una operación de stock (ingreso o salida) para un producto
 */
export async function stockOperation(context: Context, req: HttpRequest): Promise<void> {
  try {
    const stockOperationSchema = Joi.object({
      id_product: Joi.number().integer().required(),
      operation_type: Joi.string().valid('in', 'out').required(),
      quantity: Joi.number().positive().required(),
      reason: Joi.string().max(200).optional(),
      id_user: Joi.number().integer().optional(),
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
      .from('nubestock.tb_ope_product')
      .where('id', value.id_product)
      .where('is_active', true)
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
    let newStock = product.quantity;
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
    const updatedProduct = await db.update('nubestock.tb_ope_product', value.id_product, {
      quantity: newStock,
      modification_date: new Date(),
    });

    // Registrar la transacción (ahora usando tb_ope_transaction con type='IN' o 'OUT')
    const transactionData = {
      id_product: value.id_product,
      id_user: value.id_user || 1, // Default si no se proporciona
      type: value.operation_type === 'in' ? 'IN' : 'OUT',
      direction: value.operation_type === 'in' ? '+' : '-',
      quantity: value.quantity,
      notes: value.reason || `Operación de ${value.operation_type === 'in' ? 'ingreso' : 'salida'} de stock`,
      is_active: true,
      creation_date: new Date(),
    };

    await db.create('nubestock.tb_ope_transaction', transactionData);

    // Verificar si el stock está bajo después de la operación
    if (newStock <= product.min_stock) {
      await generateStockAlert({
        ...product,
        quantity: newStock,
      });
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        message: `Operación de stock ${value.operation_type === 'in' ? 'ingreso' : 'salida'} realizada exitosamente`,
        data: {
          product: {
            id: product.id,
            name: product.name,
            sku: product.sku,
            previousStock: product.quantity,
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

export { generateStockAlert };
