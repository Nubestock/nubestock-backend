import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { Database } from '../src/config/database';
import { logger } from '../src/config/logger';
import { requireAuth } from '../src/middleware/authMiddleware';

const db = Database.getInstance();

interface StatsResponse {
  products: {
    total: number;
    active: number;
    inactive: number;
    lowStock: number;
    totalInventoryValue: number;
  };
  categories: {
    total: number;
    active: number;
    inactive: number;
  };
  sales: {
    total: number;
    active: number;
    cancelled: number;
    byStatus: {
      pending: number;
      paid: number;
      overdue: number;
      cancelled: number;
    };
    totalValue: number;
    paidValue: number;
    pendingValue: number;
    overdueValue: number;
    thisMonth: {
      count: number;
      value: number;
    };
    thisYear: {
      count: number;
      value: number;
    };
  };
  clients: {
    total: number;
    active: number;
    inactive: number;
    withCredit: number;
    totalCreditLimit: number;
  };
  production: {
    total: number;
    thisMonth: number;
    thisYear: number;
  };
  alerts: {
    total: number;
    active: number;
    byPriority: {
      low: number;
      medium: number;
      high: number;
    };
    byType: Record<string, number>;
  };
  users: {
    total: number;
    active: number;
    inactive: number;
  };
  transactions: {
    total: number;
    thisMonth: number;
  };
}

const statsHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    // Verificar autenticación
    const authResult = requireAuth(req);
    if (!authResult.success) {
      context.res = {
        status: 401,
        body: {
          success: false,
          message: authResult.error || 'No autorizado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    logger.info('Stats function triggered', {
      method: req.method,
      url: req.url,
    });

    const connection = db.getConnection();

    // Obtener fecha actual y rangos
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Estadísticas de productos
    const productsTotal = await connection('nubestock.tb_mae_final_product')
      .count('* as count')
      .first();
    
    const productsActive = await connection('nubestock.tb_mae_final_product')
      .where('isactive', true)
      .count('* as count')
      .first();

    const productsLowStock = await connection('nubestock.tb_mae_final_product')
      .where('isactive', true)
      .whereRaw('current_stock < minimum_stock')
      .count('* as count')
      .first();

    const inventoryValueResult = await connection('nubestock.tb_mae_final_product')
      .where('isactive', true)
      .select(connection.raw('SUM(current_stock * unit_price) as total'))
      .first();
    
    const inventoryValue = inventoryValueResult as any;

    // Estadísticas de categorías
    const categoriesTotal = await connection('nubestock.tb_mae_category')
      .count('* as count')
      .first();

    const categoriesActive = await connection('nubestock.tb_mae_category')
      .where('isactive', true)
      .count('* as count')
      .first();

    // Estadísticas de ventas
    const salesTotal = await connection('nubestock.tb_ope_sales')
      .count('* as count')
      .first();

    const salesActive = await connection('nubestock.tb_ope_sales')
      .where('isactive', true)
      .count('* as count')
      .first();

    const salesCancelled = await connection('nubestock.tb_ope_sales')
      .where('payment_status', 'cancelled')
      .where('isactive', true)
      .count('* as count')
      .first();

    // Ventas por estado
    const salesByStatus = await connection('nubestock.tb_ope_sales')
      .where('isactive', true)
      .select('payment_status')
      .count('* as count')
      .groupBy('payment_status');

    const salesByStatusMap: Record<string, number> = {
      pending: 0,
      paid: 0,
      overdue: 0,
      cancelled: 0,
    };

    salesByStatus.forEach((row: any) => {
      const status = row.payment_status || 'pending';
      salesByStatusMap[status] = parseInt(String(row.count || 0), 10);
    });

    // Valores de ventas
    const salesTotalValue = await connection('nubestock.tb_ope_sales')
      .where('isactive', true)
      .sum('total_amount as total')
      .first();

    const salesPaidValue = await connection('nubestock.tb_ope_sales')
      .where('isactive', true)
      .where('payment_status', 'paid')
      .sum('total_amount as total')
      .first();

    const salesPendingValue = await connection('nubestock.tb_ope_sales')
      .where('isactive', true)
      .where('payment_status', 'pending')
      .sum('total_amount as total')
      .first();

    const salesOverdueValue = await connection('nubestock.tb_ope_sales')
      .where('isactive', true)
      .where('payment_status', 'overdue')
      .sum('total_amount as total')
      .first();

    // Ventas del mes actual
    const salesThisMonth = await connection('nubestock.tb_ope_sales')
      .where('isactive', true)
      .where('sale_date', '>=', startOfMonth.toISOString().split('T')[0])
      .count('* as count')
      .first();

    const salesValueThisMonth = await connection('nubestock.tb_ope_sales')
      .where('isactive', true)
      .where('sale_date', '>=', startOfMonth.toISOString().split('T')[0])
      .sum('total_amount as total')
      .first();

    // Ventas del año actual
    const salesThisYear = await connection('nubestock.tb_ope_sales')
      .where('isactive', true)
      .where('sale_date', '>=', startOfYear.toISOString().split('T')[0])
      .count('* as count')
      .first();

    const salesValueThisYear = await connection('nubestock.tb_ope_sales')
      .where('isactive', true)
      .where('sale_date', '>=', startOfYear.toISOString().split('T')[0])
      .sum('total_amount as total')
      .first();

    // Estadísticas de clientes
    const clientsTotal = await connection('nubestock.tb_mae_client')
      .count('* as count')
      .first();

    const clientsActive = await connection('nubestock.tb_mae_client')
      .where('isactive', true)
      .count('* as count')
      .first();

    const clientsWithCredit = await connection('nubestock.tb_mae_client')
      .where('isactive', true)
      .where('requires_credit', true)
      .count('* as count')
      .first();

    const clientsCreditLimit = await connection('nubestock.tb_mae_client')
      .where('isactive', true)
      .where('requires_credit', true)
      .sum('credit_limit as total')
      .first();

    // Estadísticas de producción
    const productionTotal = await connection('nubestock.tb_ope_daily_production')
      .where('isactive', true)
      .count('* as count')
      .first();

    const productionThisMonth = await connection('nubestock.tb_ope_daily_production')
      .where('isactive', true)
      .where('production_date', '>=', startOfMonth.toISOString().split('T')[0])
      .count('* as count')
      .first();

    const productionThisYear = await connection('nubestock.tb_ope_daily_production')
      .where('isactive', true)
      .where('production_date', '>=', startOfYear.toISOString().split('T')[0])
      .count('* as count')
      .first();

    // Estadísticas de alertas
    const alertsTotal = await connection('nubestock.tb_mae_alert')
      .count('* as count')
      .first();

    const alertsActive = await connection('nubestock.tb_mae_alert')
      .where('isactive', true)
      .where('status', 'active')
      .count('* as count')
      .first();

    const alertsByPriority = await connection('nubestock.tb_mae_alert')
      .where('isactive', true)
      .where('status', 'active')
      .select('priority')
      .count('* as count')
      .groupBy('priority');

    const alertsByPriorityMap: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
    };

    alertsByPriority.forEach((row: any) => {
      const priority = (row.priority || 'medium').toLowerCase();
      if (priority in alertsByPriorityMap) {
        alertsByPriorityMap[priority] = parseInt(String(row.count || 0), 10);
      }
    });

    const alertsByType = await connection('nubestock.tb_mae_alert')
      .where('isactive', true)
      .where('status', 'active')
      .select('alert_type')
      .count('* as count')
      .groupBy('alert_type');

    const alertsByTypeMap: Record<string, number> = {};
    alertsByType.forEach((row: any) => {
      const type = row.alert_type || 'unknown';
      alertsByTypeMap[type] = parseInt(String(row.count || 0), 10);
    });

    // Estadísticas de usuarios
    const usersTotal = await connection('nubestock.tb_mae_user')
      .count('* as count')
      .first();

    const usersActive = await connection('nubestock.tb_mae_user')
      .where('isactive', true)
      .count('* as count')
      .first();

    // Estadísticas de transacciones
    const transactionsTotal = await connection('nubestock.tb_ope_transaction')
      .where('isactive', true)
      .count('* as count')
      .first();

    const transactionsThisMonth = await connection('nubestock.tb_ope_transaction')
      .where('isactive', true)
      .where('transaction_date', '>=', startOfMonth.toISOString())
      .count('* as count')
      .first();

    // Construir respuesta
    const stats: StatsResponse = {
      products: {
        total: parseInt(String(productsTotal?.count || 0), 10),
        active: parseInt(String(productsActive?.count || 0), 10),
        inactive: parseInt(String(productsTotal?.count || 0), 10) - parseInt(String(productsActive?.count || 0), 10),
        lowStock: parseInt(String(productsLowStock?.count || 0), 10),
        totalInventoryValue: parseFloat(String(inventoryValue?.total || 0)),
      },
      categories: {
        total: parseInt(String(categoriesTotal?.count || 0), 10),
        active: parseInt(String(categoriesActive?.count || 0), 10),
        inactive: parseInt(String(categoriesTotal?.count || 0), 10) - parseInt(String(categoriesActive?.count || 0), 10),
      },
      sales: {
        total: parseInt(String(salesTotal?.count || 0), 10),
        active: parseInt(String(salesActive?.count || 0), 10),
        cancelled: parseInt(String(salesCancelled?.count || 0), 10),
        byStatus: {
          pending: salesByStatusMap.pending || 0,
          paid: salesByStatusMap.paid || 0,
          overdue: salesByStatusMap.overdue || 0,
          cancelled: salesByStatusMap.cancelled || 0,
        },
        totalValue: parseFloat(String(salesTotalValue?.total || 0)),
        paidValue: parseFloat(String(salesPaidValue?.total || 0)),
        pendingValue: parseFloat(String(salesPendingValue?.total || 0)),
        overdueValue: parseFloat(String(salesOverdueValue?.total || 0)),
        thisMonth: {
          count: parseInt(String(salesThisMonth?.count || 0), 10),
          value: parseFloat(String(salesValueThisMonth?.total || 0)),
        },
        thisYear: {
          count: parseInt(String(salesThisYear?.count || 0), 10),
          value: parseFloat(String(salesValueThisYear?.total || 0)),
        },
      },
      clients: {
        total: parseInt(String(clientsTotal?.count || 0), 10),
        active: parseInt(String(clientsActive?.count || 0), 10),
        inactive: parseInt(String(clientsTotal?.count || 0), 10) - parseInt(String(clientsActive?.count || 0), 10),
        withCredit: parseInt(String(clientsWithCredit?.count || 0), 10),
        totalCreditLimit: parseFloat(String(clientsCreditLimit?.total || 0)),
      },
      production: {
        total: parseInt(String(productionTotal?.count || 0), 10),
        thisMonth: parseInt(String(productionThisMonth?.count || 0), 10),
        thisYear: parseInt(String(productionThisYear?.count || 0), 10),
      },
      alerts: {
        total: parseInt(String(alertsTotal?.count || 0), 10),
        active: parseInt(String(alertsActive?.count || 0), 10),
        byPriority: {
          low: alertsByPriorityMap.low || 0,
          medium: alertsByPriorityMap.medium || 0,
          high: alertsByPriorityMap.high || 0,
        },
        byType: alertsByTypeMap,
      },
      users: {
        total: parseInt(String(usersTotal?.count || 0), 10),
        active: parseInt(String(usersActive?.count || 0), 10),
        inactive: parseInt(String(usersTotal?.count || 0), 10) - parseInt(String(usersActive?.count || 0), 10),
      },
      transactions: {
        total: parseInt(String(transactionsTotal?.count || 0), 10),
        thisMonth: parseInt(String(transactionsThisMonth?.count || 0), 10),
      },
    };

    context.res = {
      status: 200,
      body: {
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    logger.error('Error getting stats:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener estadísticas',
        error: error.message,
        timestamp: new Date().toISOString(),
      },
    };
  }
};

export default statsHandler;

