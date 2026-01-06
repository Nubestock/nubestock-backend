import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { Database } from '../src/config/database';
import { logger } from '../src/config/logger';
import { Sale, SalesDetail, Client } from '../src/types';
import { requireAuth, requireAnyPermission } from '../src/middleware/authMiddleware';
import { 
  handleDailySalesReport, 
  handleSalesByClientReport, 
  handleTopProductsReport, 
  handleDashboardSummaryReport 
} from './reports';
import Joi from 'joi';

const db = Database.getInstance();

const salesHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    const { action, subaction } = req.params;
    const method = req.method;
    
    logger.info('Sales function triggered', {
      action,
      subaction,
      method,
      url: req.url,
    });

    // Verificar autenticación y permisos según el método y acción
    let authResult: { success: boolean; user?: any; error?: string };
    
    switch (method) {
      case 'GET':
        // GET requiere permiso de lectura de ventas
        authResult = requireAnyPermission(req, ['sales_read']);
        break;
      case 'POST':
        // POST requiere permiso de escritura de ventas
        authResult = requireAnyPermission(req, ['sales_write']);
        break;
      case 'PUT':
        // PUT requiere permiso de escritura de ventas
        authResult = requireAnyPermission(req, ['sales_write']);
        break;
      default:
        authResult = requireAuth(req);
    }

    if (!authResult.success) {
      context.res = {
        status: authResult.error?.includes('permisos') ? 403 : 401,
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
        if (action === 'reports') {
          // Manejar reportes
          if (subaction === 'daily') {
            await handleDailySalesReport(context, req);
          } else if (subaction === 'by-client') {
            await handleSalesByClientReport(context, req);
          } else if (subaction === 'top-products') {
            await handleTopProductsReport(context, req);
          } else if (subaction === 'summary') {
            await handleDashboardSummaryReport(context, req);
          } else {
            context.res = {
              status: 400,
              body: {
                success: false,
                message: 'Tipo de reporte no válido. Tipos disponibles: daily, by-client, top-products, summary',
                timestamp: new Date().toISOString(),
              },
            };
          }
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
          await handleCreateSale(context, req, userId);
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

    // Query base sin selects para construir filtros
    let baseQuery = db.getConnection()
      .from('nubestock.tb_ope_sales as s')
      .leftJoin('nubestock.tb_mae_client as c', 's.idclient', 'c.idclient')
      .leftJoin('nubestock.tb_mae_user as u', 's.iduser', 'u.iduser')
      .where('s.isactive', true);

    // Aplicar filtros
    if (startDate) {
      baseQuery = baseQuery.where('s.sale_date', '>=', startDate);
    }

    if (endDate) {
      baseQuery = baseQuery.where('s.sale_date', '<=', endDate);
    }

    if (idclient) {
      baseQuery = baseQuery.where('s.idclient', idclient);
    }

    if (payment_status) {
      baseQuery = baseQuery.where('s.payment_status', payment_status);
    }

    // Contar total (query separada para count)
    const totalQuery = baseQuery.clone().count('s.idsale as count').first();
    const countResult = await totalQuery;
    const total = parseInt(countResult?.count as string || '0');

    // Query para obtener los datos con paginación
    const sales = await baseQuery
      .select(
        's.*',
        'c.client_name',
        'c.business_name',
        'c.ruc_cedula',
        'u.nameuser'
      )
      .orderBy('s.sale_date', 'desc')
      .offset((page - 1) * limit)
      .limit(limit);

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
      .from('nubestock.tb_ope_sales as s')
      .leftJoin('nubestock.tb_mae_client as c', 's.idclient', 'c.idclient')
      .leftJoin('nubestock.tb_mae_user as u', 's.iduser', 'u.iduser')
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
        'cat.namecategory'
      )
      .from('nubestock.tb_ope_sales_detail as sd')
      .leftJoin('nubestock.tb_mae_final_product as fp', 'sd.idfinal_product', 'fp.idfinal_product')
      .leftJoin('nubestock.tb_mae_category as cat', 'fp.idcategory', 'cat.idcategory')
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

async function handleCreateSale(context: Context, req: HttpRequest, userId: string): Promise<void> {
  try {
    const saleSchema = Joi.object({
      idclient: Joi.string().uuid().required(),
      iduser: Joi.string().uuid().optional(), // Opcional: si no se proporciona, se usa el del token
      sale_date: Joi.date().iso().required(),
      total_amount: Joi.number().positive().required(),
      payment_status: Joi.string().valid('pending', 'paid', 'overdue', 'cancelled').default('pending'),
      payment_method: Joi.string().valid('cash', 'card', 'credit', 'transfer', 'check', 'other').optional(),
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
    const client = await db.findById<Client>('nubestock.tb_mae_client', value.idclient);
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

    // Verificar stock disponible para cada producto
    for (const detail of value.details) {
      const product = await db.findById<any>('nubestock.tb_mae_final_product', detail.idfinal_product);
      if (!product) {
        context.res = {
          status: 404,
          body: {
            success: false,
            message: `Producto con ID ${detail.idfinal_product} no encontrado`,
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
      
      const currentStock = parseFloat(String(product.current_stock || 0));
      if (currentStock < detail.quantity) {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: `Stock insuficiente para el producto ${product.product_name || 'desconocido'}. Stock disponible: ${currentStock}, solicitado: ${detail.quantity}`,
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
    }

    // Usar transacción para crear la venta y sus detalles
    const result = await db.transaction(async (trx) => {
      // Crear la venta
      const [sale] = await trx('nubestock.tb_ope_sales')
        .insert({
          idclient: value.idclient,
          iduser: value.iduser || userId, // Usar el userId del token si no se proporciona
          sale_date: value.sale_date,
          total_amount: value.total_amount,
          payment_status: value.payment_status,
          ...(value.payment_method && { payment_method: value.payment_method }), // Solo incluir si está presente
          payment_due_date: value.payment_due_date,
          dispatch_guide: value.dispatch_guide,
          notes: value.notes,
          isactive: true,
        })
        .returning('*');

      // Crear los detalles de la venta
      const details = await trx('nubestock.tb_ope_sales_detail')
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

      // Actualizar stock de productos y crear transacciones de inventario
      for (const detail of value.details) {
        // Actualizar stock del producto (reducir cantidad)
        await trx('nubestock.tb_mae_final_product')
          .where('idfinal_product', detail.idfinal_product)
          .decrement('current_stock', detail.quantity);

        // Crear transacción de inventario (salida de productos)
        await trx('nubestock.tb_ope_transaction')
          .insert({
            iduser: value.iduser || userId, // Usar el userId del token si no se proporciona
            idfinal_product: detail.idfinal_product,
            transaction_type: 'sale',
            quantity: -detail.quantity, // Negativo porque es salida
            unit_of_measure: 'units',
            transaction_date: new Date(),
            notes: `Venta ${sale.idsale} - ${detail.quantity} unidades`,
            isactive: true,
          });
      }

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

    const updatedSale = await db.update('nubestock.tb_ope_sales', saleId, {
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
      .from('nubestock.tb_mae_client')
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

    const newClient = await db.create('nubestock.tb_mae_client', {
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
    const startTime = Date.now();
    const startDate = req.query.startDate as string || new Date().toISOString().split('T')[0];
    const endDate = req.query.endDate as string || new Date().toISOString().split('T')[0];

    // Crear base query para reutilizar filtros
    const baseQuery = db.getConnection()
      .from('nubestock.tb_ope_sales')
      .where('sale_date', '>=', startDate)
      .where('sale_date', '<=', endDate)
      .where('isactive', true);

    // Ejecutar todas las queries en paralelo para mejorar el rendimiento
    const [generalStats, paymentStats, topClients] = await Promise.all([
      // Estadísticas generales (optimizado: una sola query con todas las métricas)
      baseQuery.clone()
        .select(
          db.getConnection().raw('COALESCE(SUM(total_amount), 0) as total_sales'),
          db.getConnection().raw('COUNT(*)::int as total_sales_count'),
          db.getConnection().raw('COALESCE(AVG(total_amount), 0) as average_sale'),
          db.getConnection().raw('COUNT(DISTINCT idclient)::int as unique_clients')
        )
        .first(),

      // Estadísticas por estado de pago
      baseQuery.clone()
        .select(
          'payment_status',
          db.getConnection().raw('COUNT(*)::int as count'),
          db.getConnection().raw('COALESCE(SUM(total_amount), 0) as total_amount')
        )
        .groupBy('payment_status'),

      // Top clientes (optimizado: usar INNER JOIN en lugar de LEFT JOIN)
      db.getConnection()
        .select(
          'c.client_name',
          'c.business_name',
          db.getConnection().raw('SUM(s.total_amount) as total_purchased'),
          db.getConnection().raw('COUNT(s.idsale)::int as sales_count')
        )
        .from('nubestock.tb_ope_sales as s')
        .innerJoin('nubestock.tb_mae_client as c', 's.idclient', 'c.idclient')
        .where('s.sale_date', '>=', startDate)
        .where('s.sale_date', '<=', endDate)
        .where('s.isactive', true)
        .where('c.isactive', true) // Agregar filtro de clientes activos
        .groupBy('c.idclient', 'c.client_name', 'c.business_name')
        .orderBy('total_purchased', 'desc')
        .limit(10)
    ]);

    const executionTime = Date.now() - startTime;

    context.res = {
      status: 200,
      body: {
        success: true,
        data: {
          general: {
            total_sales: parseFloat(generalStats?.total_sales || 0),
            total_sales_count: parseInt(generalStats?.total_sales_count || 0),
            average_sale: parseFloat(generalStats?.average_sale || 0),
            unique_clients: parseInt(generalStats?.unique_clients || 0),
          },
          byPaymentStatus: paymentStats.map((stat: any) => ({
            payment_status: stat.payment_status,
            count: parseInt(stat.count || 0),
            total_amount: parseFloat(stat.total_amount || 0),
          })),
          topClients: topClients.map((client: any) => ({
            client_name: client.client_name,
            business_name: client.business_name,
            total_purchased: parseFloat(client.total_purchased || 0),
            sales_count: parseInt(client.sales_count || 0),
          })),
          dateRange: {
            start: startDate,
            end: endDate,
          },
          executionTime: `${executionTime}ms`,
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
      .from('nubestock.tb_ope_sales as s')
      .leftJoin('nubestock.tb_mae_client as c', 's.idclient', 'c.idclient')
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
      payment_method: Joi.string().valid('cash', 'card', 'credit', 'transfer', 'check', 'other').optional(),
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
    const existingSale = await db.findById<Sale>('nubestock.tb_ope_sales', saleId);
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

    const updatedSale = await db.update('nubestock.tb_ope_sales', saleId, {
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
