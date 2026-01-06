import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { Database } from '../src/config/database';
import { logger } from '../src/config/logger';
import { requireAuth, requireAnyPermission } from '../src/middleware/authMiddleware';

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
    // Verificar autenticación y permisos (stats requiere permiso de lectura general o admin)
    const authResult = requireAnyPermission(req, ['stats_read', 'admin', 'users_manage']);
    if (!authResult.success) {
      context.res = {
        status: authResult.error?.includes('permisos') ? 403 : 401,
        body: {
          success: false,
          message: authResult.error || 'No autorizado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const startTime = Date.now();
    logger.info('Stats function triggered', {
      method: req.method,
      url: req.url,
    });

    const connection = db.getConnection();

    // Obtener fecha actual y rangos
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const startOfMonthStr = startOfMonth.toISOString().split('T')[0];
    const startOfYearStr = startOfYear.toISOString().split('T')[0];

    // Ejecutar todas las queries en paralelo para máximo rendimiento
    const [
      // Productos
      productsTotal,
      productsActive,
      productsLowStock,
      inventoryValueResult,
      // Categorías
      categoriesTotal,
      categoriesActive,
      // Ventas generales
      salesTotal,
      salesActive,
      salesCancelled,
      salesByStatus,
      // Valores de ventas (combinadas en una query con CASE)
      salesValuesResult,
      // Ventas del mes y año
      salesThisMonth,
      salesValueThisMonth,
      salesThisYear,
      salesValueThisYear,
      // Clientes
      clientsTotal,
      clientsActive,
      clientsWithCredit,
      clientsCreditLimit,
      // Producción
      productionTotal,
      productionThisMonth,
      productionThisYear,
      // Alertas
      alertsTotal,
      alertsActive,
      alertsByPriority,
      alertsByType,
      // Usuarios
      usersTotal,
      usersActive,
      // Transacciones
      transactionsTotal,
      transactionsThisMonth,
    ] = await Promise.all([
      // Productos
      connection('nubestock.tb_mae_final_product').count('* as count').first(),
      connection('nubestock.tb_mae_final_product').where('isactive', true).count('* as count').first(),
      connection('nubestock.tb_mae_final_product')
        .where('isactive', true)
        .whereRaw('current_stock < minimum_stock')
        .count('* as count')
        .first(),
      connection('nubestock.tb_mae_final_product')
        .where('isactive', true)
        .select(connection.raw('COALESCE(SUM(current_stock * unit_price), 0) as total'))
        .first(),
      // Categorías
      connection('nubestock.tb_mae_category').count('* as count').first(),
      connection('nubestock.tb_mae_category').where('isactive', true).count('* as count').first(),
      // Ventas generales
      connection('nubestock.tb_ope_sales').count('* as count').first(),
      connection('nubestock.tb_ope_sales').where('isactive', true).count('* as count').first(),
      connection('nubestock.tb_ope_sales')
        .where('payment_status', 'cancelled')
        .where('isactive', true)
        .count('* as count')
        .first(),
      connection('nubestock.tb_ope_sales')
        .where('isactive', true)
        .select('payment_status')
        .count('* as count')
        .groupBy('payment_status'),
      // Valores de ventas combinados en una sola query
      connection('nubestock.tb_ope_sales')
        .where('isactive', true)
        .select(
          connection.raw('COALESCE(SUM(total_amount), 0) as total_value'),
          connection.raw('COALESCE(SUM(CASE WHEN payment_status = \'paid\' THEN total_amount ELSE 0 END), 0) as paid_value'),
          connection.raw('COALESCE(SUM(CASE WHEN payment_status = \'pending\' THEN total_amount ELSE 0 END), 0) as pending_value'),
          connection.raw('COALESCE(SUM(CASE WHEN payment_status = \'overdue\' THEN total_amount ELSE 0 END), 0) as overdue_value')
        )
        .first(),
      // Ventas del mes
      connection('nubestock.tb_ope_sales')
        .where('isactive', true)
        .where('sale_date', '>=', startOfMonthStr)
        .count('* as count')
        .first(),
      connection('nubestock.tb_ope_sales')
        .where('isactive', true)
        .where('sale_date', '>=', startOfMonthStr)
        .sum('total_amount as total')
        .first(),
      // Ventas del año
      connection('nubestock.tb_ope_sales')
        .where('isactive', true)
        .where('sale_date', '>=', startOfYearStr)
        .count('* as count')
        .first(),
      connection('nubestock.tb_ope_sales')
        .where('isactive', true)
        .where('sale_date', '>=', startOfYearStr)
        .sum('total_amount as total')
        .first(),
      // Clientes
      connection('nubestock.tb_mae_client').count('* as count').first(),
      connection('nubestock.tb_mae_client').where('isactive', true).count('* as count').first(),
      connection('nubestock.tb_mae_client')
        .where('isactive', true)
        .where('requires_credit', true)
        .count('* as count')
        .first(),
      connection('nubestock.tb_mae_client')
        .where('isactive', true)
        .where('requires_credit', true)
        .sum('credit_limit as total')
        .first(),
      // Producción
      connection('nubestock.tb_ope_daily_production')
        .where('isactive', true)
        .count('* as count')
        .first(),
      connection('nubestock.tb_ope_daily_production')
        .where('isactive', true)
        .where('production_date', '>=', startOfMonthStr)
        .count('* as count')
        .first(),
      connection('nubestock.tb_ope_daily_production')
        .where('isactive', true)
        .where('production_date', '>=', startOfYearStr)
        .count('* as count')
        .first(),
      // Alertas
      connection('nubestock.tb_mae_alert').count('* as count').first(),
      connection('nubestock.tb_mae_alert')
        .where('isactive', true)
        .where('status', 'active')
        .count('* as count')
        .first(),
      connection('nubestock.tb_mae_alert')
        .where('isactive', true)
        .where('status', 'active')
        .select('priority')
        .count('* as count')
        .groupBy('priority'),
      connection('nubestock.tb_mae_alert')
        .where('isactive', true)
        .where('status', 'active')
        .select('alert_type')
        .count('* as count')
        .groupBy('alert_type'),
      // Usuarios
      connection('nubestock.tb_mae_user').count('* as count').first(),
      connection('nubestock.tb_mae_user').where('isactive', true).count('* as count').first(),
      // Transacciones
      connection('nubestock.tb_ope_transaction')
        .where('isactive', true)
        .count('* as count')
        .first(),
      connection('nubestock.tb_ope_transaction')
        .where('isactive', true)
        .where('transaction_date', '>=', startOfMonth.toISOString())
        .count('* as count')
        .first(),
    ]);

    // Procesar resultados
    const salesByStatusMap: Record<string, number> = {
      pending: 0,
      paid: 0,
      overdue: 0,
      cancelled: 0,
    };

    (salesByStatus as any[]).forEach((row: any) => {
      const status = row.payment_status || 'pending';
      salesByStatusMap[status] = parseInt(String(row.count || 0), 10);
    });

    const alertsByPriorityMap: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
    };

    (alertsByPriority as any[]).forEach((row: any) => {
      const priority = (row.priority || 'medium').toLowerCase();
      if (priority in alertsByPriorityMap) {
        alertsByPriorityMap[priority] = parseInt(String(row.count || 0), 10);
      }
    });

    const alertsByTypeMap: Record<string, number> = {};
    (alertsByType as any[]).forEach((row: any) => {
      const type = row.alert_type || 'unknown';
      alertsByTypeMap[type] = parseInt(String(row.count || 0), 10);
    });

    const salesValues = salesValuesResult as any;
    const inventoryValue = inventoryValueResult as any;

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
        totalValue: parseFloat(String(salesValues?.total_value || 0)),
        paidValue: parseFloat(String(salesValues?.paid_value || 0)),
        pendingValue: parseFloat(String(salesValues?.pending_value || 0)),
        overdueValue: parseFloat(String(salesValues?.overdue_value || 0)),
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

    const executionTime = Date.now() - startTime;

    context.res = {
      status: 200,
      body: {
        success: true,
        data: stats,
        executionTime: `${executionTime}ms`,
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

