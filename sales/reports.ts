import { Context, HttpRequest } from '../src/types/azure-functions';
import { Database } from '../src/config/database';
import { logger } from '../src/config/logger';

const db = Database.getInstance();

/**
 * Reporte de Ventas Diarias
 * GET /sales/reports/daily?startDate=2025-12-01&endDate=2025-12-31
 */
export async function handleDailySalesReport(context: Context, req: HttpRequest): Promise<void> {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    if (!startDate || !endDate) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'startDate y endDate son requeridos',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Obtener datos diarios
    const dailyData = await db.getConnection()
      .select(
        db.getConnection().raw('CAST(s.sale_date AS DATE) as date'),
        db.getConnection().raw('SUM(s.total_amount) as total_sales'),
        db.getConnection().raw('COUNT(*)::int as number_of_sales'),
        db.getConnection().raw('AVG(s.total_amount) as average_sale'),
        db.getConnection().raw('SUM(CASE WHEN s.payment_status = \'paid\' THEN s.total_amount ELSE 0 END) as total_paid'),
        db.getConnection().raw('SUM(CASE WHEN s.payment_status != \'paid\' THEN s.total_amount ELSE 0 END) as total_pending')
      )
      .from('nubestock.tb_ope_sales as s')
      .where('s.isactive', true)
      .where('s.sale_date', '>=', startDate)
      .where('s.sale_date', '<=', endDate)
      .groupBy(db.getConnection().raw('CAST(s.sale_date AS DATE)'))
      .orderBy('date', 'asc');

    // Calcular resumen
    const summary = dailyData.reduce((acc: any, day: any) => {
      const dayTotalSales = parseFloat(day.total_sales || 0);
      const dayTransactions = parseInt(day.number_of_sales || 0);
      
      acc.total_sales += dayTotalSales;
      acc.total_transactions += dayTransactions;
      
      if (!acc.best_day || dayTotalSales > acc.best_day.total) {
        acc.best_day = { date: day.date, total: dayTotalSales };
      }
      if (!acc.worst_day || dayTotalSales < acc.worst_day.total) {
        acc.worst_day = { date: day.date, total: dayTotalSales };
      }
      return acc;
    }, {
      total_sales: 0,
      total_transactions: 0,
      best_day: null,
      worst_day: null,
    });

    summary.average_per_day = summary.total_transactions > 0 
      ? summary.total_sales / summary.total_transactions 
      : 0;

    context.res = {
      status: 200,
      body: {
        success: true,
        data: dailyData.map((day: any) => ({
          date: day.date,
          total_sales: parseFloat(day.total_sales || 0),
          number_of_sales: parseInt(day.number_of_sales || 0),
          average_sale: parseFloat(day.average_sale || 0),
          total_paid: parseFloat(day.total_paid || 0),
          total_pending: parseFloat(day.total_pending || 0),
        })),
        summary,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al generar reporte de ventas diarias:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al generar reporte de ventas diarias',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

/**
 * Reporte de Ventas por Cliente
 * GET /sales/reports/by-client?startDate=2025-12-01&endDate=2025-12-31&limit=50
 */
export async function handleSalesByClientReport(context: Context, req: HttpRequest): Promise<void> {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!startDate || !endDate) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'startDate y endDate son requeridos',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Obtener datos por cliente
    const clientData = await db.getConnection()
      .select(
        'c.idclient',
        'c.client_name',
        'c.business_name',
        'c.ruc_cedula',
        db.getConnection().raw('SUM(s.total_amount) as total_sales'),
        db.getConnection().raw('COUNT(*)::int as number_of_sales'),
        db.getConnection().raw('AVG(s.total_amount) as average_sale'),
        db.getConnection().raw('SUM(CASE WHEN s.payment_status = \'paid\' THEN s.total_amount ELSE 0 END) as total_paid'),
        db.getConnection().raw('SUM(CASE WHEN s.payment_status != \'paid\' THEN s.total_amount ELSE 0 END) as total_pending'),
        db.getConnection().raw('MIN(s.sale_date) as first_sale_date'),
        db.getConnection().raw('MAX(s.sale_date) as last_sale_date')
      )
      .from('nubestock.tb_ope_sales as s')
      .innerJoin('nubestock.tb_mae_client as c', 's.idclient', 'c.idclient')
      .where('s.isactive', true)
      .where('s.sale_date', '>=', startDate)
      .where('s.sale_date', '<=', endDate)
      .groupBy('c.idclient', 'c.client_name', 'c.business_name', 'c.ruc_cedula')
      .orderBy('total_sales', 'desc')
      .limit(limit);

    // Calcular resumen
    const totalClients = clientData.length;
    const totalSales = clientData.reduce((sum: number, client: any) => sum + parseFloat(client.total_sales || 0), 0);
    const bestClient = clientData.length > 0 ? {
      client_name: clientData[0].client_name,
      total: parseFloat(clientData[0].total_sales || 0),
    } : null;

    context.res = {
      status: 200,
      body: {
        success: true,
        data: clientData.map((client: any) => ({
          idclient: client.idclient,
          client_name: client.client_name,
          business_name: client.business_name,
          ruc_cedula: client.ruc_cedula,
          total_sales: parseFloat(client.total_sales || 0),
          number_of_sales: parseInt(client.number_of_sales || 0),
          average_sale: parseFloat(client.average_sale || 0),
          total_paid: parseFloat(client.total_paid || 0),
          total_pending: parseFloat(client.total_pending || 0),
          first_sale_date: client.first_sale_date,
          last_sale_date: client.last_sale_date,
        })),
        summary: {
          total_clients: totalClients,
          total_sales: totalSales,
          average_per_client: totalClients > 0 ? totalSales / totalClients : 0,
          best_client: bestClient,
        },
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al generar reporte de ventas por cliente:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al generar reporte de ventas por cliente',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

/**
 * Reporte de Top Productos
 * GET /sales/reports/top-products?startDate=2025-12-01&endDate=2025-12-31&limit=20
 */
export async function handleTopProductsReport(context: Context, req: HttpRequest): Promise<void> {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!startDate || !endDate) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'startDate y endDate son requeridos',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Obtener top productos
    const productsData = await db.getConnection()
      .select(
        'fp.idfinal_product',
        'fp.product_name',
        'fp.sku',
        'cat.namecategory as category',
        db.getConnection().raw('SUM(sd.quantity)::int as total_quantity_sold'),
        db.getConnection().raw('SUM(sd.total_price) as total_sales'),
        db.getConnection().raw('COUNT(DISTINCT sd.idsale)::int as number_of_transactions'),
        db.getConnection().raw('AVG(sd.unit_price) as average_price')
      )
      .from('nubestock.tb_ope_sales_detail as sd')
      .innerJoin('nubestock.tb_ope_sales as s', 'sd.idsale', 's.idsale')
      .innerJoin('nubestock.tb_mae_final_product as fp', 'sd.idfinal_product', 'fp.idfinal_product')
      .leftJoin('nubestock.tb_mae_category as cat', 'fp.idcategory', 'cat.idcategory')
      .where('sd.isactive', true)
      .where('s.isactive', true)
      .where('s.sale_date', '>=', startDate)
      .where('s.sale_date', '<=', endDate)
      .groupBy('fp.idfinal_product', 'fp.product_name', 'fp.sku', 'cat.namecategory')
      .orderBy('total_sales', 'desc')
      .limit(limit);

    context.res = {
      status: 200,
      body: {
        success: true,
        data: productsData.map((product: any) => ({
          idfinal_product: product.idfinal_product,
          product_name: product.product_name,
          sku: product.sku,
          category: product.category,
          total_quantity_sold: parseInt(product.total_quantity_sold || 0),
          total_sales: parseFloat(product.total_sales || 0),
          number_of_transactions: parseInt(product.number_of_transactions || 0),
          average_price: parseFloat(product.average_price || 0),
        })),
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al generar reporte de top productos:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al generar reporte de top productos',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

/**
 * Dashboard Summary Report
 * GET /sales/reports/summary?startDate=2025-12-01&endDate=2025-12-31
 */
export async function handleDashboardSummaryReport(context: Context, req: HttpRequest): Promise<void> {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    if (!startDate || !endDate) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'startDate y endDate son requeridos',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Resumen de ventas
    const salesSummary = await db.getConnection()
      .select(
        db.getConnection().raw('SUM(total_amount) as total_sales'),
        db.getConnection().raw('COUNT(*)::int as total_transactions'),
        db.getConnection().raw('AVG(total_amount) as average_ticket')
      )
      .from('nubestock.tb_ope_sales')
      .where('isactive', true)
      .where('sale_date', '>=', startDate)
      .where('sale_date', '<=', endDate)
      .first();

    // Estado de pagos
    const paymentStatus = await db.getConnection()
      .select(
        'payment_status',
        db.getConnection().raw('SUM(total_amount) as total')
      )
      .from('nubestock.tb_ope_sales')
      .where('isactive', true)
      .where('sale_date', '>=', startDate)
      .where('sale_date', '<=', endDate)
      .groupBy('payment_status');

    // Top 5 Clientes
    const topClients = await db.getConnection()
      .select(
        'c.client_name',
        db.getConnection().raw('SUM(s.total_amount) as total')
      )
      .from('nubestock.tb_ope_sales as s')
      .innerJoin('nubestock.tb_mae_client as c', 's.idclient', 'c.idclient')
      .where('s.isactive', true)
      .where('s.sale_date', '>=', startDate)
      .where('s.sale_date', '<=', endDate)
      .groupBy('c.idclient', 'c.client_name')
      .orderBy('total', 'desc')
      .limit(5);

    // Top 5 Productos
    const topProducts = await db.getConnection()
      .select(
        'fp.product_name',
        db.getConnection().raw('SUM(sd.quantity)::int as quantity')
      )
      .from('nubestock.tb_ope_sales_detail as sd')
      .innerJoin('nubestock.tb_ope_sales as s', 'sd.idsale', 's.idsale')
      .innerJoin('nubestock.tb_mae_final_product as fp', 'sd.idfinal_product', 'fp.idfinal_product')
      .where('sd.isactive', true)
      .where('s.isactive', true)
      .where('s.sale_date', '>=', startDate)
      .where('s.sale_date', '<=', endDate)
      .groupBy('fp.idfinal_product', 'fp.product_name')
      .orderBy('quantity', 'desc')
      .limit(5);

    // Ventas por método de pago
    const salesByPaymentMethod = await db.getConnection()
      .select(
        'payment_method',
        db.getConnection().raw('SUM(total_amount) as total')
      )
      .from('nubestock.tb_ope_sales')
      .where('isactive', true)
      .where('sale_date', '>=', startDate)
      .where('sale_date', '<=', endDate)
      .whereNotNull('payment_method')
      .groupBy('payment_method');

    // Calcular porcentaje de crecimiento (comparar con período anterior)
    // Por ahora lo dejamos como 0, se puede implementar después
    const growthPercentage = 0;

    // Construir objeto de estado de pagos
    const paymentStatusObj: any = {
      paid: 0,
      pending: 0,
      overdue: 0,
      cancelled: 0,
    };

    paymentStatus.forEach((status: any) => {
      const key = status.payment_status;
      if (key in paymentStatusObj) {
        paymentStatusObj[key] = parseFloat(status.total || 0);
      }
    });

    // Construir objeto de ventas por método de pago
    const salesByPaymentMethodObj: any = {};
    salesByPaymentMethod.forEach((method: any) => {
      if (method.payment_method) {
        salesByPaymentMethodObj[method.payment_method] = parseFloat(method.total || 0);
      }
    });

    context.res = {
      status: 200,
      body: {
        success: true,
        data: {
          sales_summary: {
            total_sales: parseFloat(salesSummary?.total_sales || 0),
            total_transactions: parseInt(salesSummary?.total_transactions || 0),
            average_ticket: parseFloat(salesSummary?.average_ticket || 0),
            growth_percentage: growthPercentage,
          },
          payment_status: paymentStatusObj,
          top_clients: topClients.map((client: any) => ({
            client_name: client.client_name,
            total: parseFloat(client.total || 0),
          })),
          top_products: topProducts.map((product: any) => ({
            product_name: product.product_name,
            quantity: parseInt(product.quantity || 0),
          })),
          sales_by_payment_method: salesByPaymentMethodObj,
        },
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al generar reporte de resumen del dashboard:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al generar reporte de resumen del dashboard',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

