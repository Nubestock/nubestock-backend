import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { Database } from '../src/config/database';
import { logger } from '../src/config/logger';
import { logErrorResponse } from '../src/utils/httpLogger';
import { requireAppKey } from '../src/utils/httpResponses';
import { requireAuth, requireAnyPermission } from '../src/middleware/authMiddleware';
import { DetailedStatsResponse } from '../src/interfaces';

const db = Database.getInstance();

const statsHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    if (!requireAppKey(context, req)) return;
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
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    startOfYear.setHours(0, 0, 0, 0);
    const startOfMonthStr = startOfMonth.toISOString().split('T')[0]; // YYYY-MM-DD para sale_date
    const startOfYearStr = startOfYear.toISOString().split('T')[0]; // YYYY-MM-DD para sale_date
    const startOfMonthISO = startOfMonth.toISOString(); // ISO completo para creation_date
    const startOfYearISO = startOfYear.toISOString(); // ISO completo para creation_date

    // Pre-calcular fecha del siguiente mes para optimización
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthStartStr = nextMonthStart.toISOString().split('T')[0];
    const nextMonthStartISO = nextMonthStart.toISOString();

    // Pre-calcular fecha de hace 7 días para producción diaria
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();

    // Ejecutar todas las queries en paralelo para máximo rendimiento
    // Optimizado: Combinamos queries relacionadas usando CASE WHEN para reducir el número de queries
    const [
      // Productos: Combinamos total, activos, lowStock e inventoryValue en una query
      productsCombined,
      // Categorías: Combinamos total y activos en una query
      categoriesCombined,
      // Ventas: Combinamos total, activos, canceladas y valores en una query
      salesCombined,
      // Ventas por status (grupo separado)
      salesByStatus,
      // Ventas del mes y año: Combinamos count y value en una query por período
      salesThisMonthCombined,
      salesThisYearCombined,
      // Ventas por semana del mes actual
      salesByWeek,
      // Clientes: Combinamos total, activos, con crédito y límite en una query
      clientsCombined,
      // Producción: Combinamos total, mes y año en una query
      productionCombined,
      // Alertas: Combinamos total, activos, prioridad y tipo
      alertsCombined,
      alertsByPriority,
      alertsByType,
      // Usuarios: Combinamos total y activos en una query
      usersCombined,
      // Transacciones: Combinamos total y mes en una query
      transactionsCombined,
      // Últimas 5 transacciones con información de producto y usuario
      recentTransactions,
      // Producción diaria (últimos 7 días)
      productionDaily,
    ] = await Promise.all([
      // Productos: Una query que calcula todo
      connection('nubestock.tb_ope_product')
        .where('type', 'PF')
        .select(
          connection.raw('COUNT(*)::int as total'),
          connection.raw('COUNT(*) FILTER (WHERE is_active = true)::int as active'),
          connection.raw('COUNT(*) FILTER (WHERE is_active = true AND quantity < min_stock)::int as low_stock'),
          connection.raw('COALESCE(SUM(quantity) FILTER (WHERE is_active = true), 0) as inventory_value')
        )
        .first(),
      // Categorías: Combinado
      connection('nubestock.tb_mae_category')
        .select(
          connection.raw('COUNT(*)::int as total'),
          connection.raw('COUNT(*) FILTER (WHERE is_active = true)::int as active')
        )
        .first(),
      // Ventas: Combinado - total, activos, canceladas y valores
      connection('nubestock.tb_ope_sales')
        .select(
          connection.raw('COUNT(*)::int as total'),
          connection.raw('COUNT(*) FILTER (WHERE is_active = true)::int as active'),
          connection.raw('COUNT(*) FILTER (WHERE is_active = true AND status = \'cancelled\')::int as cancelled'),
          connection.raw('COALESCE(SUM(total_amount) FILTER (WHERE is_active = true), 0) as total_value'),
          connection.raw('COALESCE(SUM(total_amount) FILTER (WHERE is_active = true AND status = \'paid\'), 0) as paid_value'),
          connection.raw('COALESCE(SUM(total_amount) FILTER (WHERE is_active = true AND status = \'pending\'), 0) as pending_value'),
          connection.raw('COALESCE(SUM(total_amount) FILTER (WHERE is_active = true AND status = \'overdue\'), 0) as overdue_value')
        )
        .first(),
      // Ventas por status (necesario para el mapa)
      connection('nubestock.tb_ope_sales')
        .where('is_active', true)
        .select('status')
        .count('* as count')
        .groupBy('status'),
      // Ventas del mes: Combinado count + value
      connection('nubestock.tb_ope_sales')
        .where('is_active', true)
        .where(function() {
          this.where('sale_date', '>=', startOfMonthStr)
            .orWhere(function() {
              this.whereNull('sale_date')
                .where('creation_date', '>=', startOfMonthISO);
            });
        })
        .where(function() {
          this.where('sale_date', '<', nextMonthStartStr)
            .orWhere(function() {
              this.whereNull('sale_date')
                .where('creation_date', '<', nextMonthStartISO);
            });
        })
        .select(
          connection.raw('COUNT(*)::int as count'),
          connection.raw('COALESCE(SUM(total_amount), 0) as value')
        )
        .first(),
      // Ventas del año: Combinado count + value
      connection('nubestock.tb_ope_sales')
        .where('is_active', true)
        .where(function() {
          this.where('sale_date', '>=', startOfYearStr)
            .orWhere(function() {
              this.whereNull('sale_date')
                .where('creation_date', '>=', startOfYearISO);
            });
        })
        .select(
          connection.raw('COUNT(*)::int as count'),
          connection.raw('COALESCE(SUM(total_amount), 0) as value')
        )
        .first(),
      // Ventas por semana del mes actual
      connection('nubestock.tb_ope_sales')
        .where('is_active', true)
        .where(function() {
          this.where('sale_date', '>=', startOfMonthStr)
            .orWhere(function() {
              this.whereNull('sale_date')
                .where('creation_date', '>=', startOfMonthISO);
            });
        })
        .where(function() {
          this.where('sale_date', '<', nextMonthStartStr)
            .orWhere(function() {
              this.whereNull('sale_date')
                .where('creation_date', '<', nextMonthStartISO);
            });
        })
        .select(
          connection.raw(`
            CASE 
              WHEN COALESCE(sale_date, creation_date::date)::date IS NOT NULL THEN
                CEIL(EXTRACT(DAY FROM COALESCE(sale_date, creation_date::date))::numeric / 7.0)::int
              ELSE 1
            END as week_number
          `),
          connection.raw('COUNT(*)::int as count'),
          connection.raw('COALESCE(SUM(total_amount), 0) as total')
        )
        .groupByRaw(`
          CASE 
            WHEN COALESCE(sale_date, creation_date::date)::date IS NOT NULL THEN
              CEIL(EXTRACT(DAY FROM COALESCE(sale_date, creation_date::date))::numeric / 7.0)::int
            ELSE 1
          END
        `)
        .orderByRaw(`
          CASE 
            WHEN COALESCE(sale_date, creation_date::date)::date IS NOT NULL THEN
              CEIL(EXTRACT(DAY FROM COALESCE(sale_date, creation_date::date))::numeric / 7.0)::int
            ELSE 1
          END ASC
        `),
      // Clientes: Combinado
      connection('nubestock.tb_mae_client')
        .select(
          connection.raw('COUNT(*)::int as total'),
          connection.raw('COUNT(*) FILTER (WHERE is_active = true)::int as active'),
          connection.raw('COUNT(*) FILTER (WHERE is_active = true AND requires_credit = true)::int as with_credit'),
          connection.raw('COALESCE(SUM(credit_limit) FILTER (WHERE is_active = true AND requires_credit = true), 0) as credit_limit')
        )
        .first(),
      // Producción: Combinado total, mes y año
      connection('nubestock.tb_ope_transaction')
        .where('type', 'PROD')
        .select(
          connection.raw('COUNT(*)::int as total'),
          connection.raw(`COUNT(*) FILTER (WHERE creation_date >= '${startOfMonthISO}'::timestamp)::int as this_month`),
          connection.raw(`COUNT(*) FILTER (WHERE creation_date >= '${startOfYearISO}'::timestamp)::int as this_year`)
        )
        .first(),
      // Producción diaria (últimos 7 días)
      // Producción: transacciones de producto final (direction='+')
      // Desperdicio: transacciones de materiales (direction='-')
      connection.raw(`
        WITH production_by_date AS (
          SELECT 
            DATE(creation_date)::text as date,
            COALESCE(SUM(quantity), 0)::numeric as production
          FROM nubestock.tb_ope_transaction
          WHERE type = 'PROD' 
            AND direction = '+'
            AND creation_date >= '${sevenDaysAgoISO}'::timestamp
          GROUP BY DATE(creation_date)
        ),
        waste_by_date AS (
          SELECT 
            DATE(creation_date)::text as date,
            COALESCE(SUM(COALESCE(waste_quantity, 0)), 0)::numeric as waste
          FROM nubestock.tb_ope_transaction
          WHERE type = 'PROD' 
            AND direction = '-'
            AND creation_date >= '${sevenDaysAgoISO}'::timestamp
          GROUP BY DATE(creation_date)
        )
        SELECT 
          COALESCE(p.date, w.date) as date,
          COALESCE(p.production, 0)::numeric as production,
          COALESCE(w.waste, 0)::numeric as waste
        FROM production_by_date p
        FULL OUTER JOIN waste_by_date w ON p.date = w.date
        ORDER BY COALESCE(p.date, w.date) DESC
        LIMIT 7
      `),
      // Alertas: Combinado total y activos
      connection('nubestock.tb_mae_alert')
        .select(
          connection.raw('COUNT(*)::int as total'),
          connection.raw('COUNT(*) FILTER (WHERE is_active = true)::int as active')
        )
        .first(),
      // Alertas por prioridad (grupo separado)
      connection('nubestock.tb_mae_alert')
        .where('is_active', true)
        .select('priority')
        .count('* as count')
        .groupBy('priority'),
      // Alertas por tipo (grupo separado)
      connection('nubestock.tb_mae_alert')
        .where('is_active', true)
        .select('alert_type')
        .count('* as count')
        .groupBy('alert_type'),
      // Usuarios: Combinado
      connection('nubestock.tb_mae_user')
        .select(
          connection.raw('COUNT(*)::int as total'),
          connection.raw('COUNT(*) FILTER (WHERE is_active = true)::int as active')
        )
        .first(),
      // Transacciones: Combinado total y mes
      connection('nubestock.tb_ope_transaction')
        .select(
          connection.raw('COUNT(*)::int as total'),
          connection.raw(`COUNT(*) FILTER (WHERE creation_date >= '${startOfMonthISO}'::timestamp)::int as this_month`)
        )
        .first(),
      // Últimas 5 transacciones con información de producto y usuario
      connection('nubestock.tb_ope_transaction as t')
        .select(
          't.id',
          't.quantity',
          't.type',
          't.direction',
          't.creation_date',
          't.has_waste',
          't.waste_quantity',
          'p.name as product_name',
          'p.sku as product_sku',
          'u.name as user_name'
        )
        .leftJoin('nubestock.tb_ope_product as p', 't.id_product', 'p.id')
        .leftJoin('nubestock.tb_mae_user as u', 't.id_user', 'u.id')
        .orderBy('t.creation_date', 'desc')
        .limit(5),
    ]);

    // Procesar resultados de manera optimizada
    const p = productsCombined as any;
    const c = categoriesCombined as any;
    const s = salesCombined as any;
    const sMonth = salesThisMonthCombined as any;
    const sYear = salesThisYearCombined as any;
    const cl = clientsCombined as any;
    const prod = productionCombined as any;
    const a = alertsCombined as any;
    const u = usersCombined as any;
    const t = transactionsCombined as any;

    // Procesar maps de manera eficiente
    const salesByStatusMap: Record<string, number> = { pending: 0, paid: 0, overdue: 0, cancelled: 0 };
    (salesByStatus as any[]).forEach((row: any) => {
      const status = row.status || 'pending';
      salesByStatusMap[status] = parseInt(String(row.count || 0), 10);
    });

    const alertsByPriorityMap: Record<string, number> = { low: 0, medium: 0, high: 0 };
    const alertsByPriorityArray = Array.isArray(alertsByPriority) ? alertsByPriority : [];
    alertsByPriorityArray.forEach((row: any) => {
      const priority = (row.priority || 'medium').toLowerCase();
      if (priority in alertsByPriorityMap) {
        alertsByPriorityMap[priority] = parseInt(String(row.count || 0), 10);
      }
    });

    const alertsByTypeMap: Record<string, number> = {};
    const alertsByTypeArray = Array.isArray(alertsByType) ? alertsByType : [];
    alertsByTypeArray.forEach((row: any) => {
      alertsByTypeMap[row.alert_type || 'unknown'] = parseInt(String(row.count || 0), 10);
    });

    // Construir respuesta de manera optimizada - evitar cálculos redundantes
    const productsTotal = parseInt(String(p?.total || 0), 10);
    const productsActive = parseInt(String(p?.active || 0), 10);
    const categoriesTotal = parseInt(String(c?.total || 0), 10);
    const categoriesActive = parseInt(String(c?.active || 0), 10);
    const clientsTotal = parseInt(String(cl?.total || 0), 10);
    const clientsActive = parseInt(String(cl?.active || 0), 10);
    const usersTotal = parseInt(String(u?.total || 0), 10);
    const usersActive = parseInt(String(u?.active || 0), 10);

    // Mapeo optimizado para semanas
    const weekLabels: Record<number, string> = {
      1: 'Semana 1 (1-7)',
      2: 'Semana 2 (8-14)',
      3: 'Semana 3 (15-21)',
      4: 'Semana 4 (22-28)',
    };

    const stats: DetailedStatsResponse = {
      products: {
        total: productsTotal,
        active: productsActive,
        inactive: productsTotal - productsActive,
        lowStock: parseInt(String(p?.low_stock || 0), 10),
        totalInventoryValue: parseFloat(String(p?.inventory_value || 0)),
      },
      categories: {
        total: categoriesTotal,
        active: categoriesActive,
        inactive: categoriesTotal - categoriesActive,
      },
      sales: {
        total: parseInt(String(s?.total || 0), 10),
        active: parseInt(String(s?.active || 0), 10),
        cancelled: parseInt(String(s?.cancelled || 0), 10),
        byStatus: {
          pending: salesByStatusMap.pending || 0,
          paid: salesByStatusMap.paid || 0,
          overdue: salesByStatusMap.overdue || 0,
          cancelled: salesByStatusMap.cancelled || 0,
        },
        totalValue: parseFloat(String(s?.total_value || 0)),
        paidValue: parseFloat(String(s?.paid_value || 0)),
        pendingValue: parseFloat(String(s?.pending_value || 0)),
        overdueValue: parseFloat(String(s?.overdue_value || 0)),
        thisMonth: {
          count: parseInt(String(sMonth?.count || 0), 10),
          value: parseFloat(String(sMonth?.value || 0)),
        },
        thisYear: {
          count: parseInt(String(sYear?.count || 0), 10),
          value: parseFloat(String(sYear?.value || 0)),
        },
        byWeek: (Array.isArray(salesByWeek) ? salesByWeek : []).map((week: any) => {
          const weekNum = parseInt(String(week.week_number || 0), 10);
          return {
            week: weekNum,
            week_label: weekLabels[weekNum] || (weekNum >= 5 ? 'Semana 5 (29+)' : 'Semana desconocida'),
            count: parseInt(String(week.count || 0), 10),
            value: parseFloat(String(week.total || 0)),
          };
        }),
      },
      clients: {
        total: clientsTotal,
        active: clientsActive,
        inactive: clientsTotal - clientsActive,
        withCredit: parseInt(String(cl?.with_credit || 0), 10),
        totalCreditLimit: parseFloat(String(cl?.credit_limit || 0)),
      },
      production: {
        total: parseInt(String(prod?.total || 0), 10),
        thisMonth: parseInt(String(prod?.this_month || 0), 10),
        thisYear: parseInt(String(prod?.this_year || 0), 10),
        daily: (() => {
          // Procesar resultado de raw query - puede venir como { rows: [...] } o directamente como array
          let dailyArray: any[] = [];
          const prodDaily = productionDaily as any;
          if (prodDaily) {
            if (Array.isArray(prodDaily)) {
              dailyArray = prodDaily;
            } else if (prodDaily.rows && Array.isArray(prodDaily.rows)) {
              dailyArray = prodDaily.rows;
            } else if (prodDaily[0] && Array.isArray(prodDaily[0])) {
              dailyArray = prodDaily[0];
            }
          }
          
          return dailyArray.map((day: any) => {
            // Manejar la fecha correctamente - PostgreSQL devuelve DATE como string YYYY-MM-DD
            let dateStr = day.date;
            
            // Si date es un objeto Date, convertirlo a string
            if (dateStr instanceof Date) {
              dateStr = dateStr.toISOString().split('T')[0];
            } else if (typeof dateStr === 'string') {
              // Si viene como ISO string con tiempo, extraer solo la fecha
              if (dateStr.includes('T')) {
                dateStr = dateStr.split('T')[0];
              }
              // Asegurar formato YYYY-MM-DD
              if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                // Si el formato no es correcto, intentar parsearlo
                const parsed = new Date(dateStr);
                if (!isNaN(parsed.getTime())) {
                  dateStr = parsed.toISOString().split('T')[0];
                } else {
                  // Fallback a fecha actual si no se puede parsear
                  dateStr = new Date().toISOString().split('T')[0];
                }
              }
            } else if (!dateStr) {
              // Si no hay fecha, usar fecha actual como fallback
              dateStr = new Date().toISOString().split('T')[0];
            }
            
            // Parsear la fecha para obtener día de la semana y número
            const date = new Date(dateStr + 'T00:00:00.000Z');
            if (isNaN(date.getTime())) {
              // Si la fecha es inválida, usar fecha actual
              const now = new Date();
              dateStr = now.toISOString().split('T')[0];
              date.setTime(now.getTime());
            }
            
            const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            const dayName = dayNames[date.getUTCDay()];
            const dayNumber = date.getUTCDate().toString().padStart(2, '0');
            
            return {
              date: dateStr,
              day_label: `${dayName} ${dayNumber}`,
              production: parseFloat(String(day.production || 0)),
              waste: parseFloat(String(day.waste || 0)),
            };
          });
        })(),
      },
      alerts: {
        total: parseInt(String(a?.total || 0), 10),
        active: parseInt(String(a?.active || 0), 10),
        byPriority: {
          low: alertsByPriorityMap.low || 0,
          medium: alertsByPriorityMap.medium || 0,
          high: alertsByPriorityMap.high || 0,
        },
        byType: alertsByTypeMap,
      },
      users: {
        total: usersTotal,
        active: usersActive,
        inactive: usersTotal - usersActive,
      },
      transactions: {
        total: parseInt(String(t?.total || 0), 10),
        thisMonth: parseInt(String(t?.this_month || 0), 10),
        recent: (Array.isArray(recentTransactions) ? recentTransactions : []).map((tx: any) => ({
          id: parseInt(String(tx.id || 0), 10),
          product_name: tx.product_name || 'Producto desconocido',
          product_sku: tx.product_sku || 'N/A',
          user_name: tx.user_name || 'Usuario desconocido',
          quantity: parseFloat(String(tx.quantity || 0)),
          type: tx.type || 'IN',
          direction: tx.direction || '+',
          creation_date: tx.creation_date ? new Date(tx.creation_date).toISOString() : new Date().toISOString(),
          has_waste: tx.has_waste || false,
          waste_quantity: tx.waste_quantity ? parseFloat(String(tx.waste_quantity)) : undefined,
        })),
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
    (context as any).__errorLogged = true;
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener estadísticas',
        error: error.message,
        timestamp: new Date().toISOString(),
      },
    };
  } finally {
    logErrorResponse(context, req, 'stats');
  }
};

export default statsHandler;

