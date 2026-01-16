import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import { logger } from '../config/logger';
import { Sale, SalesDetail, Client } from '../interfaces';
import { createStockLowAlert } from '../utils/alertHelper';
import Joi from 'joi';

const db = Database.getInstance();

export async function listSales(context: Context, req: HttpRequest): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const id_client = req.query.id_client as string;
    const idClientNum = id_client ? parseInt(id_client, 10) : null;
    const status = req.query.status as string;

    // Query base sin selects para construir filtros
    let baseQuery = db.getConnection()
      .from('nubestock.tb_ope_sales as s')
      .leftJoin('nubestock.tb_mae_client as c', 's.id_client', 'c.id')
      .leftJoin('nubestock.tb_mae_user as u', 's.id_user', 'u.id')
      .where('s.is_active', true);

    // Aplicar filtros
    if (startDate) {
      baseQuery = baseQuery.where('s.sale_date', '>=', startDate);
    }

    if (endDate) {
      baseQuery = baseQuery.where('s.sale_date', '<=', endDate);
    }

    if (idClientNum && !isNaN(idClientNum)) {
      baseQuery = baseQuery.where('s.id_client', idClientNum);
    }

    if (status) {
      baseQuery = baseQuery.where('s.status', status);
    }

    // Contar total (query separada para count)
    const totalQuery = baseQuery.clone().count('s.id as count').first();
    const countResult = await totalQuery;
    const total = parseInt(countResult?.count as string || '0');

    // Query para obtener los datos con paginación
    const sales = await baseQuery
      .select(
        's.*',
        'c.name as client_name',
        'c.identification',
        'u.name as user_name'
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

export async function getSale(context: Context, req: HttpRequest, saleId: string): Promise<void> {
  try {
    const saleIdNum = parseInt(saleId, 10);
    if (isNaN(saleIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de venta inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const saleResult = await db.getConnection().raw(
      `
      select jsonb_build_object(
          'sale', jsonb_build_object(
              'sale_id', s.id,
              'status', s.status,
              'total_sale', s.total_amount,
              'dispatch_guide', s.dispatch_guide,
              'creation_date', s.creation_date,
              'due_date', s.due_date
          ),
          'client', jsonb_build_object(
              'name', c.name,
              'identification', c.identification
          ),
          'items', jsonb_agg(
              jsonb_build_object(
                  'sale_detail_id', sd.id,
                  'product_name', p.name,
                  'product_price', p.price,
                  'sku', p.sku,
                  'quantity', t.quantity
              )
          )
      ) as sale_json
      from nubestock.tb_ope_sales s
      join nubestock.tb_ope_sales_detail sd on s.id = sd.id_sales
      join nubestock.tb_mae_client c on c.id = s.id_client
      join nubestock.tb_ope_transaction t on t.id = sd.id_transaction
      join nubestock.tb_ope_product p on p.id = t.id_product
      where sd.id_sales = ?
      group by
          s.id,
          s.status,
          s.total_amount,
          s.dispatch_guide,
          s.creation_date,
          s.due_date,
          c.name,
          c.identification
      `,
      [saleIdNum]
    );

    const saleJson = saleResult?.rows?.[0]?.sale_json ?? null;

    if (!saleJson) {
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
        data: saleJson,
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

export async function createSale(context: Context, req: HttpRequest, userId: string): Promise<void> {
  try {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de usuario inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const saleSchema = Joi.object({
      id_client: Joi.number().integer().required(),
      id_user: Joi.number().integer().optional(),
      sale_date: Joi.date().iso().optional(),
      total_amount: Joi.number().positive().required(),
      status: Joi.string().default('pending'),
      method: Joi.string().valid('cash', 'card', 'credit', 'transfer', 'check', 'other').required(),
      due_date: Joi.date().iso().required(),
      dispatch_guide: Joi.string().max(100).required(),
      notes: Joi.string().max(500).optional(),
      products: Joi.array().items(
        Joi.object({
          id_product: Joi.number().integer().required(),
          quantity: Joi.number().positive().required(),
        })
      ).min(1).optional(),
      // Mantener 'details' como alias para compatibilidad hacia atrás
      details: Joi.array().items(
        Joi.object({
          id_product: Joi.number().integer().required(),
          quantity: Joi.number().positive().required(),
        })
      ).min(1).optional(),
    }).or('products', 'details'); // Al menos uno de los dos debe estar presente

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

    // Normalizar: usar 'products' si está presente, sino 'details' (compatibilidad hacia atrás)
    const products = value.products || value.details || [];
    
    if (products.length === 0) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Se requiere al menos un producto en la venta',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar que el cliente existe
    const client = await db.findById<Client>('nubestock.tb_mae_client', value.id_client);
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
    for (const detail of products) {
      const product = await db.findById<any>('nubestock.tb_ope_product', detail.id_product);
      if (!product || product.type !== 'PF') {
        context.res = {
          status: 404,
          body: {
            success: false,
            message: `Producto final con ID ${detail.id_product} no encontrado`,
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
      
      const currentStock = product.quantity || 0;
      if (currentStock < detail.quantity) {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: `Stock insuficiente para el producto ${product.name || 'desconocido'}. Stock disponible: ${currentStock}, solicitado: ${detail.quantity}`,
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
    }

    // Usar transacción para crear la venta y sus detalles
    const result = await db.transaction(async (trx) => {
      const currentUserId = value.id_user || userIdNum;

      // Crear la venta
      const [sale] = await trx('nubestock.tb_ope_sales')
        .insert({
          id_client: value.id_client,
          id_user: currentUserId,
          sale_date: value.sale_date || null,
          total_amount: value.total_amount,
          status: value.status || 'pending',
          method: value.method,
          due_date: value.due_date,
          dispatch_guide: value.dispatch_guide,
          notes: value.notes || null,
          is_active: true,
        })
        .returning('*');

      // Crear transacciones y detalles de la venta
      const transactions = [];
      const salesDetails = [];

      for (const detail of products) {
        // Crear transacción de venta (type='SAL', direction='-')
        const [transaction] = await trx('nubestock.tb_ope_transaction')
          .insert({
            id_product: detail.id_product,
            id_user: currentUserId,
            quantity: detail.quantity,
            type: 'SAL',
            direction: '-',
          })
          .returning('*');

        transactions.push(transaction);

        // Crear detalle de venta (apunta a la transacción)
        const [salesDetail] = await trx('nubestock.tb_ope_sales_detail')
          .insert({
            id_sales: sale.id,
            id_transaction: transaction.id,
          })
        .returning('*');

        salesDetails.push(salesDetail);

        // Actualizar stock del producto (reducir cantidad)
        await trx('nubestock.tb_ope_product')
          .where('id', detail.id_product)
          .decrement('quantity', detail.quantity);

        // Obtener el producto actualizado para verificar stock mínimo
        const updatedProduct = await trx('nubestock.tb_ope_product')
          .where('id', detail.id_product)
          .first();

        // Verificar si el stock está por debajo del mínimo y generar alerta
        if (updatedProduct && updatedProduct.quantity !== undefined && updatedProduct.min_stock !== undefined) {
          const currentStock = parseFloat(updatedProduct.quantity) || 0;
          const minStock = parseFloat(updatedProduct.min_stock) || 0;
          
          if (currentStock <= minStock) {
            // Generar alerta de stock bajo asociada a la transacción
            await createStockLowAlert(
              updatedProduct.id,
              updatedProduct.name || 'Producto',
              updatedProduct.sku || 'N/A',
              currentStock,
              minStock,
              {
                trx,
                userId: currentUserId,
                id_transaction: transaction.id,
                checkDuplicates: true,
              }
            );
            
            logger.info('Alerta de stock bajo generada después de venta', {
              product_id: updatedProduct.id,
              product_name: updatedProduct.name,
              current_stock: currentStock,
              min_stock: minStock,
              transaction_id: transaction.id,
            });
          }
        }
      }

      return { sale, details: salesDetails, transactions };
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

export async function updatePaymentStatus(context: Context, req: HttpRequest): Promise<void> {
  try {
    const { saleId, status } = req.body;

    if (!saleId || !status) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de venta y estado requeridos',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const saleIdNum = parseInt(saleId, 10);
    if (isNaN(saleIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de venta inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const validStatuses = ['pending', 'paid', 'overdue', 'cancelled'];
    if (!validStatuses.includes(status)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Estado inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const updatedSale = await db.update('nubestock.tb_ope_sales', saleIdNum, {
      status,
      modification_date: new Date(),
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

export async function getSalesStats(context: Context, req: HttpRequest): Promise<void> {
  try {
    const startTime = Date.now();
    const startDate = req.query.startDate as string || new Date().toISOString().split('T')[0];
    const endDate = req.query.endDate as string || new Date().toISOString().split('T')[0];

    // Crear base query para reutilizar filtros
    const baseQuery = db.getConnection()
      .from('nubestock.tb_ope_sales')
      .where('sale_date', '>=', startDate)
      .where('sale_date', '<=', endDate)
      .where('is_active', true);

    // Ejecutar todas las queries en paralelo para mejorar el rendimiento
    const [generalStats, paymentStats, topClients] = await Promise.all([
      // Estadísticas generales (optimizado: una sola query con todas las métricas)
      baseQuery.clone()
        .select(
          db.getConnection().raw('COALESCE(SUM(total_amount), 0) as total_sales'),
          db.getConnection().raw('COUNT(*)::int as total_sales_count'),
          db.getConnection().raw('COALESCE(AVG(total_amount), 0) as average_sale'),
          db.getConnection().raw('COUNT(DISTINCT id_client)::int as unique_clients')
        )
        .first(),

      // Estadísticas por estado de pago
      baseQuery.clone()
        .select(
          'status',
          db.getConnection().raw('COUNT(*)::int as count'),
          db.getConnection().raw('COALESCE(SUM(total_amount), 0) as total_amount')
        )
        .groupBy('status'),

      // Top clientes (optimizado: usar INNER JOIN en lugar de LEFT JOIN)
      db.getConnection()
        .select(
          'c.name',
          db.getConnection().raw('SUM(s.total_amount) as total_purchased'),
          db.getConnection().raw('COUNT(s.id)::int as sales_count')
        )
        .from('nubestock.tb_ope_sales as s')
        .innerJoin('nubestock.tb_mae_client as c', 's.id_client', 'c.id')
        .where('s.sale_date', '>=', startDate)
        .where('s.sale_date', '<=', endDate)
        .where('s.is_active', true)
        .where('c.is_active', true) // Agregar filtro de clientes activos
        .groupBy('c.id', 'c.name')
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
          byStatus: paymentStats.map((stat: any) => ({
            status: stat.status,
            count: parseInt(stat.count || 0),
            total_amount: parseFloat(stat.total_amount || 0),
          })),
          topClients: topClients.map((client: any) => ({
            client_name: client.name,
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

export async function getOverdueSales(context: Context, req: HttpRequest): Promise<void> {
  try {
    const overdueSales = await db.getConnection()
      .select(
        's.*',
        'c.name as client_name',
        'c.identification',
        'c.email',
        'c.phone'
      )
      .from('nubestock.tb_ope_sales as s')
      .leftJoin('nubestock.tb_mae_client as c', 's.id_client', 'c.id')
      .where('s.status', 'overdue')
      .where('s.is_active', true)
      .orderBy('s.due_date', 'asc');

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

export async function updateSale(context: Context, req: HttpRequest, saleId: string): Promise<void> {
  try {
    const updateSchema = Joi.object({
      sale_date: Joi.date().iso().optional(),
      total_amount: Joi.number().positive().optional(),
      status: Joi.string().valid('pending', 'paid', 'overdue', 'cancelled').optional(),
      method: Joi.string().valid('cash', 'card', 'credit', 'transfer', 'check', 'other').optional(),
      due_date: Joi.date().iso().optional(),
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

    const saleIdNum = parseInt(saleId, 10);
    if (isNaN(saleIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de venta inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si la venta existe
    const existingSale = await db.findById<Sale>('nubestock.tb_ope_sales', saleIdNum);
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

    const updatedSale = await db.update('nubestock.tb_ope_sales', saleIdNum, {
      ...value,
      modification_date: new Date(),
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
