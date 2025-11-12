import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { Database } from '../src/config/database';
import { logger } from '../src/config/logger';
import { Sale, SalesDetail, Client } from '../src/types';
import Joi from 'joi';

const db = Database.getInstance();

const salesHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    const { action } = req.params;
    const method = req.method;
    
    logger.info('Sales function triggered', {
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
        if (action === 'clients') {
          await handleGetClients(context, req);
        } else if (action === 'stats') {
          await handleGetSalesStats(context, req);
        } else if (action === 'overdue') {
          await handleGetOverdueSales(context, req);
        } else if (action) {
          await handleGetSale(context, req, action);
        } else {
          await handleListSales(context, req);
        }
        break;
      case 'POST':
        if (action === 'client') {
          await handleCreateClient(context, req);
        } else {
          await handleCreateSale(context, req);
        }
        break;
      case 'PUT':
        if (action === 'payment') {
          await handleUpdatePaymentStatus(context, req);
        } else if (action) {
          await handleUpdateSale(context, req, action);
        } else {
          context.res = {
            status: 400,
            body: {
              success: false,
              message: 'ID de venta requerido',
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
    logger.error('Error en función de ventas:', error);
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

async function handleListSales(context: Context, req: HttpRequest): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const idclient = req.query.idclient as string;
    const payment_status = req.query.payment_status as string;

    let query = db.getConnection()
      .select(
        's.*',
        'c.client_name',
        'c.business_name',
        'c.ruc_cedula',
        'u.nameuser'
      )
      .from('tb_ope_sales as s')
      .leftJoin('tb_mae_client as c', 's.idclient', 'c.idclient')
      .leftJoin('tb_mae_user as u', 's.iduser', 'u.iduser')
      .where('s.isactive', true)
      .orderBy('s.sale_date', 'desc');

    // Aplicar filtros
    if (startDate) {
      query = query.where('s.sale_date', '>=', startDate);
    }

    if (endDate) {
      query = query.where('s.sale_date', '<=', endDate);
    }

    if (idclient) {
      query = query.where('s.idclient', idclient);
    }

    if (payment_status) {
      query = query.where('s.payment_status', payment_status);
    }

    // Contar total
    const totalQuery = query.clone();
    const [{ count }] = await totalQuery.count('* as count');
    const total = parseInt(count as string);

    // Aplicar paginación
    const offset = (page - 1) * limit;
    const sales = await query.offset(offset).limit(limit);

    context.res = {
      status: 200,
      body: {
        success: true,
        data: sales,
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
    logger.error('Error al listar ventas:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al listar ventas',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleGetSale(context: Context, req: HttpRequest, saleId: string): Promise<void> {
  try {
    const sale = await db.getConnection()
      .select(
        's.*',
        'c.client_name',
        'c.business_name',
        'c.ruc_cedula',
        'c.email',
        'c.phone',
        'u.nameuser'
      )
      .from('tb_ope_sales as s')
      .leftJoin('tb_mae_client as c', 's.idclient', 'c.idclient')
      .leftJoin('tb_mae_user as u', 's.iduser', 'u.iduser')
      .where('s.idsale', saleId)
      .where('s.isactive', true)
      .first();

    if (!sale) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Venta no encontrada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Obtener detalles de la venta
    const details = await db.getConnection()
      .select(
        'sd.*',
        'fp.product_name',
        'fp.sku',
        'c.namecategory'
      )
      .from('tb_ope_sales_detail as sd')
      .leftJoin('tb_mae_final_product as fp', 'sd.idfinal_product', 'fp.idfinal_product')
      .leftJoin('tb_mae_category as c', 'fp.idcategory', 'c.idcategory')
      .where('sd.idsale', saleId)
      .where('sd.isactive', true);

    context.res = {
      status: 200,
      body: {
        success: true,
        data: {
          ...sale,
          details,
        },
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener venta:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener venta',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleCreateSale(context: Context, req: HttpRequest): Promise<void> {
  try {
    const saleSchema = Joi.object({
      idclient: Joi.string().uuid().required(),
      iduser: Joi.string().uuid().optional(),
      sale_date: Joi.date().iso().required(),
      total_amount: Joi.number().positive().required(),
      payment_status: Joi.string().valid('pending', 'paid', 'overdue', 'cancelled').default('pending'),
      payment_due_date: Joi.date().iso().optional(),
      dispatch_guide: Joi.string().max(100).optional(),
      notes: Joi.string().max(500).optional(),
      details: Joi.array().items(
        Joi.object({
          idfinal_product: Joi.string().uuid().required(),
          quantity: Joi.number().positive().required(),
          unit_price: Joi.number().positive().required(),
          total_price: Joi.number().positive().required(),
        })
      ).min(1).required(),
    });

    const { error, value } = saleSchema.validate(req.body);
    
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

    // Verificar que el cliente existe
    const client = await db.findById<Client>('tb_mae_client', value.idclient);
    if (!client) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Cliente no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Usar transacción para crear la venta y sus detalles
    const result = await db.transaction(async (trx) => {
      // Crear la venta
      const [sale] = await trx('tb_ope_sales')
        .insert({
          idclient: value.idclient,
          iduser: value.iduser,
          sale_date: value.sale_date,
          total_amount: value.total_amount,
          payment_status: value.payment_status,
          payment_due_date: value.payment_due_date,
          dispatch_guide: value.dispatch_guide,
          notes: value.notes,
          isactive: true,
        })
        .returning('*');

      // Crear los detalles de la venta
      const details = await trx('tb_ope_sales_detail')
        .insert(
          value.details.map(detail => ({
            idsale: sale.idsale,
            idfinal_product: detail.idfinal_product,
            quantity: detail.quantity,
            unit_price: detail.unit_price,
            total_price: detail.total_price,
            isactive: true,
          }))
        )
        .returning('*');

      // Crear transacciones de inventario (salida de productos)
      await trx('tb_ope_transaction')
        .insert(
          value.details.map(detail => ({
            iduser: value.iduser,
            idfinal_product: detail.idfinal_product,
            transaction_type: 'sale',
            quantity: -detail.quantity, // Negativo porque es salida
            unit_of_measure: 'units',
            transaction_date: new Date(),
            notes: `Venta - ${detail.quantity} unidades`,
            isactive: true,
          }))
        );

      return { sale, details };
    });

    context.res = {
      status: 201,
      body: {
        success: true,
        data: result,
        message: 'Venta creada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al crear venta:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear venta',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleUpdatePaymentStatus(context: Context, req: HttpRequest): Promise<void> {
  try {
    const { saleId, payment_status } = req.body;

    if (!saleId || !payment_status) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de venta y estado de pago requeridos',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const validStatuses = ['pending', 'paid', 'overdue', 'cancelled'];
    if (!validStatuses.includes(payment_status)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Estado de pago inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const updatedSale = await db.update('tb_ope_sales', saleId, {
      payment_status,
      modificationdate: new Date(),
    });

    if (!updatedSale) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Venta no encontrada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedSale,
        message: 'Estado de pago actualizado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al actualizar estado de pago:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al actualizar estado de pago',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleGetClients(context: Context, req: HttpRequest): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const isactive = req.query.isactive as string;

    let query = db.getConnection()
      .select('*')
      .from('tb_mae_client')
      .orderBy('client_name');

    // Aplicar filtros
    if (search) {
      query = query.where(function() {
        this.where('client_name', 'ilike', `%${search}%`)
          .orWhere('business_name', 'ilike', `%${search}%`)
          .orWhere('ruc_cedula', 'ilike', `%${search}%`);
      });
    }

    if (isactive !== undefined) {
      query = query.where('isactive', isactive === 'true');
    }

    // Contar total
    const totalQuery = query.clone();
    const result = await totalQuery.count('* as count');
    const total = parseInt((result[0] as any).count as string);

    // Aplicar paginación
    const offset = (page - 1) * limit;
    const clients = await query.offset(offset).limit(limit);

    context.res = {
      status: 200,
      body: {
        success: true,
        data: clients,
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
    logger.error('Error al obtener clientes:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener clientes',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleCreateClient(context: Context, req: HttpRequest): Promise<void> {
  try {
    const clientSchema = Joi.object({
      client_name: Joi.string().min(2).max(200).required(),
      business_name: Joi.string().min(2).max(200).required(),
      ruc_cedula: Joi.string().min(10).max(20).required(),
      email: Joi.string().email().required(),
      phone: Joi.string().min(10).max(20).optional(),
      address: Joi.string().max(500).optional(),
      province: Joi.string().max(100).optional(),
      city: Joi.string().max(100).optional(),
      requires_credit: Joi.boolean().default(false),
      credit_limit: Joi.number().positive().optional(),
      credit_days: Joi.number().integer().min(1).optional(),
    });

    const { error, value } = clientSchema.validate(req.body);
    
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

    // Verificar si el RUC/Cédula ya existe
    const existingClient = await db.getConnection()
      .select('idclient')
      .from('tb_mae_client')
      .where('ruc_cedula', value.ruc_cedula)
      .first();

    if (existingClient) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'El RUC/Cédula ya está registrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const newClient = await db.create('tb_mae_client', {
      ...value,
      isactive: true,
    });

    context.res = {
      status: 201,
      body: {
        success: true,
        data: newClient,
        message: 'Cliente creado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al crear cliente:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear cliente',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleGetSalesStats(context: Context, req: HttpRequest): Promise<void> {
  try {
    const startDate = req.query.startDate as string || new Date().toISOString().split('T')[0];
    const endDate = req.query.endDate as string || new Date().toISOString().split('T')[0];

    // Estadísticas generales
    const generalStats = await db.getConnection()
      .select(
        db.getConnection().raw('SUM(total_amount) as total_sales'),
        db.getConnection().raw('COUNT(*) as total_sales_count'),
        db.getConnection().raw('AVG(total_amount) as average_sale'),
        db.getConnection().raw('COUNT(DISTINCT idclient) as unique_clients')
      )
      .from('tb_ope_sales')
      .where('sale_date', '>=', startDate)
      .where('sale_date', '<=', endDate)
      .where('isactive', true)
      .first();

    // Estadísticas por estado de pago
    const paymentStats = await db.getConnection()
      .select(
        'payment_status',
        db.getConnection().raw('COUNT(*) as count'),
        db.getConnection().raw('SUM(total_amount) as total_amount')
      )
      .from('tb_ope_sales')
      .where('sale_date', '>=', startDate)
      .where('sale_date', '<=', endDate)
      .where('isactive', true)
      .groupBy('payment_status');

    // Top clientes
    const topClients = await db.getConnection()
      .select(
        'c.client_name',
        'c.business_name',
        db.getConnection().raw('SUM(s.total_amount) as total_purchased'),
        db.getConnection().raw('COUNT(s.idsale) as sales_count')
      )
      .from('tb_ope_sales as s')
      .leftJoin('tb_mae_client as c', 's.idclient', 'c.idclient')
      .where('s.sale_date', '>=', startDate)
      .where('s.sale_date', '<=', endDate)
      .where('s.isactive', true)
      .groupBy('c.idclient', 'c.client_name', 'c.business_name')
      .orderBy('total_purchased', 'desc')
      .limit(10);

    context.res = {
      status: 200,
      body: {
        success: true,
        data: {
          general: generalStats,
          byPaymentStatus: paymentStats,
          topClients,
          dateRange: {
            start: startDate,
            end: endDate,
          },
        },
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener estadísticas de ventas:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener estadísticas de ventas',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleGetOverdueSales(context: Context, req: HttpRequest): Promise<void> {
  try {
    const overdueSales = await db.getConnection()
      .select(
        's.*',
        'c.client_name',
        'c.business_name',
        'c.ruc_cedula',
        'c.email',
        'c.phone'
      )
      .from('tb_ope_sales as s')
      .leftJoin('tb_mae_client as c', 's.idclient', 'c.idclient')
      .where('s.payment_status', 'overdue')
      .where('s.isactive', true)
      .orderBy('s.payment_due_date', 'asc');

    context.res = {
      status: 200,
      body: {
        success: true,
        data: overdueSales,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener ventas vencidas:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener ventas vencidas',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleUpdateSale(context: Context, req: HttpRequest, saleId: string): Promise<void> {
  try {
    const updateSchema = Joi.object({
      sale_date: Joi.date().iso().optional(),
      total_amount: Joi.number().positive().optional(),
      payment_status: Joi.string().valid('pending', 'paid', 'overdue', 'cancelled').optional(),
      payment_due_date: Joi.date().iso().optional(),
      dispatch_guide: Joi.string().max(100).optional(),
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

    // Verificar si la venta existe
    const existingSale = await db.findById<Sale>('tb_ope_sales', saleId);
    if (!existingSale) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Venta no encontrada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const updatedSale = await db.update('tb_ope_sales', saleId, {
      ...value,
      modificationdate: new Date(),
    });

    if (!updatedSale) {
      context.res = {
        status: 500,
        body: {
          success: false,
          message: 'Error al actualizar venta',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedSale,
        message: 'Venta actualizada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al actualizar venta:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al actualizar venta',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export default salesHandler;
