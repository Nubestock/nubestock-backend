import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { Database } from '../src/config/database';
import { logger } from '../src/config/logger';
import { DailyProduction, Transaction } from '../src/types';
import Joi from 'joi';

const db = Database.getInstance();

const productionHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    const { action } = req.params;
    const method = req.method;
    
    logger.info('Production function triggered', {
      action,
      method,
      url: req.url,
    });

    // Verificar autenticación
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
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

    switch (method) {
      case 'GET':
        if (action === 'daily') {
          await handleGetDailyProduction(context, req);
        } else if (action === 'stats') {
          await handleGetProductionStats(context, req);
        } else if (action === 'transactions') {
          await handleGetTransactions(context, req);
        } else {
          await handleGetDailyProduction(context, req);
        }
        break;
      case 'POST':
        if (action === 'register') {
          await handleRegisterProduction(context, req);
        } else if (action === 'transaction') {
          await handleCreateTransaction(context, req);
        } else {
          await handleRegisterProduction(context, req);
        }
        break;
      case 'PUT':
        if (action) {
          await handleUpdateProduction(context, req, action);
        } else {
          context.res = {
            status: 400,
            body: {
              success: false,
              message: 'ID de producción requerido',
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
    logger.error('Error en función de producción:', error);
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

async function handleGetDailyProduction(context: Context, req: HttpRequest): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const iduser = req.query.iduser as string;
    const idfinal_product = req.query.idfinal_product as string;

    let query = db.getConnection()
      .select(
        'dp.*',
        'u.nameuser',
        'fp.product_name',
        'fp.sku',
        'c.namecategory'
      )
      .from('tb_ope_daily_production as dp')
      .leftJoin('tb_mae_user as u', 'dp.iduser', 'u.iduser')
      .leftJoin('tb_mae_final_product as fp', 'dp.idfinal_product', 'fp.idfinal_product')
      .leftJoin('tb_mae_category as c', 'fp.idcategory', 'c.idcategory')
      .where('dp.isactive', true)
      .orderBy('dp.production_date', 'desc')
      .orderBy('dp.creationdate', 'desc');

    // Aplicar filtros
    if (startDate) {
      query = query.where('dp.production_date', '>=', startDate);
    }

    if (endDate) {
      query = query.where('dp.production_date', '<=', endDate);
    }

    if (iduser) {
      query = query.where('dp.iduser', iduser);
    }

    if (idfinal_product) {
      query = query.where('dp.idfinal_product', idfinal_product);
    }

    // Contar total
    const totalQuery = query.clone();
    const [{ count }] = await totalQuery.count('* as count');
    const total = parseInt(count as string);

    // Aplicar paginación
    const offset = (page - 1) * limit;
    const productions = await query.offset(offset).limit(limit);

    context.res = {
      status: 200,
      body: {
        success: true,
        data: productions,
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
    logger.error('Error al obtener producción diaria:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener producción diaria',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleGetProductionStats(context: Context, req: HttpRequest): Promise<void> {
  try {
    const startDate = req.query.startDate as string || new Date().toISOString().split('T')[0];
    const endDate = req.query.endDate as string || new Date().toISOString().split('T')[0];

    // Estadísticas de producción por producto
    const productStats = await db.getConnection()
      .select(
        'fp.product_name',
        'fp.sku',
        'c.namecategory',
        db.getConnection().raw('SUM(dp.quantity_produced) as total_produced'),
        db.getConnection().raw('COUNT(dp.iddaily_production) as production_days'),
        db.getConnection().raw('AVG(dp.quantity_produced) as average_daily')
      )
      .from('tb_ope_daily_production as dp')
      .leftJoin('tb_mae_final_product as fp', 'dp.idfinal_product', 'fp.idfinal_product')
      .leftJoin('tb_mae_category as c', 'fp.idcategory', 'c.idcategory')
      .where('dp.production_date', '>=', startDate)
      .where('dp.production_date', '<=', endDate)
      .where('dp.isactive', true)
      .groupBy('fp.idfinal_product', 'fp.product_name', 'fp.sku', 'c.namecategory')
      .orderBy('total_produced', 'desc');

    // Estadísticas por usuario
    const userStats = await db.getConnection()
      .select(
        'u.nameuser',
        db.getConnection().raw('SUM(dp.quantity_produced) as total_produced'),
        db.getConnection().raw('COUNT(dp.iddaily_production) as production_days')
      )
      .from('tb_ope_daily_production as dp')
      .leftJoin('tb_mae_user as u', 'dp.iduser', 'u.iduser')
      .where('dp.production_date', '>=', startDate)
      .where('dp.production_date', '<=', endDate)
      .where('dp.isactive', true)
      .groupBy('u.iduser', 'u.nameuser')
      .orderBy('total_produced', 'desc');

    // Estadísticas generales
    const generalStats = await db.getConnection()
      .select(
        db.getConnection().raw('SUM(quantity_produced) as total_production'),
        db.getConnection().raw('COUNT(DISTINCT iduser) as active_users'),
        db.getConnection().raw('COUNT(DISTINCT idfinal_product) as products_produced'),
        db.getConnection().raw('COUNT(*) as total_records')
      )
      .from('tb_ope_daily_production')
      .where('production_date', '>=', startDate)
      .where('production_date', '<=', endDate)
      .where('isactive', true)
      .first();

    context.res = {
      status: 200,
      body: {
        success: true,
        data: {
          general: generalStats,
          byProduct: productStats,
          byUser: userStats,
          dateRange: {
            start: startDate,
            end: endDate,
          },
        },
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener estadísticas de producción:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener estadísticas de producción',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleGetTransactions(context: Context, req: HttpRequest): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const transactionType = req.query.type as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    let query = db.getConnection()
      .select(
        't.*',
        'u.nameuser',
        'fp.product_name',
        'fp.sku',
        'm.material_name',
        'm.material_code'
      )
      .from('tb_ope_transaction as t')
      .leftJoin('tb_mae_user as u', 't.iduser', 'u.iduser')
      .leftJoin('tb_mae_final_product as fp', 't.idfinal_product', 'fp.idfinal_product')
      .leftJoin('tb_mae_material as m', 't.idmaterial', 'm.idmaterial')
      .where('t.isactive', true)
      .orderBy('t.transaction_date', 'desc');

    // Aplicar filtros
    if (transactionType) {
      query = query.where('t.transaction_type', transactionType);
    }

    if (startDate) {
      query = query.where('t.transaction_date', '>=', startDate);
    }

    if (endDate) {
      query = query.where('t.transaction_date', '<=', endDate);
    }

    // Contar total
    const totalQuery = query.clone();
    const [{ count }] = await totalQuery.count('* as count');
    const total = parseInt(count as string);

    // Aplicar paginación
    const offset = (page - 1) * limit;
    const transactions = await query.offset(offset).limit(limit);

    context.res = {
      status: 200,
      body: {
        success: true,
        data: transactions,
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
    logger.error('Error al obtener transacciones:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener transacciones',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleRegisterProduction(context: Context, req: HttpRequest): Promise<void> {
  try {
    const productionSchema = Joi.object({
      iduser: Joi.string().uuid().required(),
      idfinal_product: Joi.string().uuid().required(),
      production_date: Joi.date().iso().required(),
      quantity_produced: Joi.number().positive().required(),
      unit_of_measure: Joi.string().min(2).max(20).required(),
      notes: Joi.string().max(500).optional(),
    });

    const { error, value } = productionSchema.validate(req.body);
    
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

    // Verificar que el producto existe
    const product = await db.findById('tb_mae_final_product', value.idfinal_product);
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

    // Crear registro de producción
    const newProduction = await db.create('tb_ope_daily_production', {
      ...value,
      isactive: true,
    });

    // Crear transacción de inventario (salida de producción)
    await db.create('tb_ope_transaction', {
      iduser: value.iduser,
      idfinal_product: value.idfinal_product,
      transaction_type: 'production',
      quantity: value.quantity_produced,
      unit_of_measure: value.unit_of_measure,
      transaction_date: new Date(),
      notes: `Producción registrada: ${value.quantity_produced} ${value.unit_of_measure}`,
      isactive: true,
    });

    context.res = {
      status: 201,
      body: {
        success: true,
        data: newProduction,
        message: 'Producción registrada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al registrar producción:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al registrar producción',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleCreateTransaction(context: Context, req: HttpRequest): Promise<void> {
  try {
    const transactionSchema = Joi.object({
      iduser: Joi.string().uuid().required(),
      idfinal_product: Joi.string().uuid().optional(),
      idmaterial: Joi.string().uuid().optional(),
      transaction_type: Joi.string().valid('purchase', 'production', 'sale', 'waste', 'adjustment').required(),
      quantity: Joi.number().required(),
      unit_of_measure: Joi.string().min(2).max(20).required(),
      unit_cost: Joi.number().positive().optional(),
      total_cost: Joi.number().positive().optional(),
      notes: Joi.string().max(500).optional(),
    });

    const { error, value } = transactionSchema.validate(req.body);
    
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

    // Validar que al menos uno de los IDs esté presente
    if (!value.idfinal_product && !value.idmaterial) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Debe especificar un producto o material',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Calcular costo total si no se proporciona
    if (value.unit_cost && !value.total_cost) {
      value.total_cost = value.unit_cost * value.quantity;
    }

    const newTransaction = await db.create('tb_ope_transaction', {
      ...value,
      transaction_date: new Date(),
      isactive: true,
    });

    context.res = {
      status: 201,
      body: {
        success: true,
        data: newTransaction,
        message: 'Transacción creada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al crear transacción:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear transacción',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleUpdateProduction(context: Context, req: HttpRequest, productionId: string): Promise<void> {
  try {
    const updateSchema = Joi.object({
      quantity_produced: Joi.number().positive().optional(),
      unit_of_measure: Joi.string().min(2).max(20).optional(),
      notes: Joi.string().max(500).optional(),
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

    // Verificar si la producción existe
    const existingProduction = await db.findById<DailyProduction>('tb_ope_daily_production', productionId);
    if (!existingProduction) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Producción no encontrada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const updatedProduction = await db.update('tb_ope_daily_production', productionId, {
      ...value,
      modificationdate: new Date(),
    });

    if (!updatedProduction) {
      context.res = {
        status: 500,
        body: {
          success: false,
          message: 'Error al actualizar producción',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedProduction,
        message: 'Producción actualizada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al actualizar producción:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al actualizar producción',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export default productionHandler;
