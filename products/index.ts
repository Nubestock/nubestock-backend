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
      .where('idfinal_product', product.idfinal_product)
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
      title: `Stock bajo: ${product.product_name}`,
      message: `El producto "${product.product_name}" (SKU: ${product.sku}) tiene stock bajo. Stock actual: ${product.current_stock}, Mínimo requerido: ${product.minimum_stock}`,
      idfinal_product: product.idfinal_product,
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
    const { action } = req.params;
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
        if (action === 'category') {
          await handleCreateCategory(context, req);
        } else if (action === 'material') {
          await handleCreateMaterial(context, req);
        } else if (action === 'recipe') {
          await handleCreateRecipe(context, req);
        } else if (action === 'check-stock') {
          await handleCheckStockAlerts(context, req);
        } else if (action === 'stock-operation') {
          await handleStockOperation(context, req);
        } else {
          await handleCreateProduct(context, req);
        }
        break;
      case 'PUT':
        if (action) {
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
        if (action) {
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
        'o.province',
        'o.city'
      )
      .from('nubestock.tb_mae_final_product as fp')
      .leftJoin('nubestock.tb_mae_category as c', 'fp.idcategory', 'c.idcategory')
      .leftJoin('nubestock.tb_mae_origin as o', 'fp.idorigin', 'o.idorigin')
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
        'o.province',
        'o.city'
      )
      .from('nubestock.tb_mae_final_product as fp')
      .leftJoin('tb_mae_category as c', 'fp.idcategory', 'c.idcategory')
      .leftJoin('tb_mae_origin as o', 'fp.idorigin', 'o.idorigin')
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
    const origins = await db.getConnection()
      .select('*')
      .from('nubestock.tb_mae_origin')
      .where('isactive', true)
      .orderBy('nameorigin');

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
      idpcategory: Joi.string().uuid().optional(), // Categoría padre (opcional)
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

    // Para la primera categoría, usar SQL directo para evitar restricción de clave foránea
    if (!value.idpcategory) {
      // Crear categoría raíz usando SQL directo
      const result = await db.getConnection().raw(`
        INSERT INTO nubestock.tb_mae_category (idcategory, namecategory, idpcategory, isactive, creationdate)
        VALUES (gen_random_uuid(), ?, gen_random_uuid(), true, now())
        RETURNING *
      `, [value.namecategory]);
      
      const newCategory = result.rows[0];
      
      // Actualizar idpcategory con el mismo idcategory
      await db.getConnection().raw(`
        UPDATE nubestock.tb_mae_category 
        SET idpcategory = idcategory 
        WHERE idcategory = ?
      `, [newCategory.idcategory]);
      
      newCategory.idpcategory = newCategory.idcategory;
      
      context.res = {
        status: 201,
        body: {
          success: true,
          data: newCategory,
          message: 'Categoría creada exitosamente',
          timestamp: new Date().toISOString(),
        },
      };
      return;
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
