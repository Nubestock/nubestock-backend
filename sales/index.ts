import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { logger } from '../src/config/logger';
import { logErrorResponse } from '../src/utils/httpLogger';
import { badRequest, methodNotAllowed, requireAppKey } from '../src/utils/httpResponses';
import { requireAuth, requireAnyPermission } from '../src/middleware/authMiddleware';
import * as saleController from '../src/controllers/saleController';
import { 
  handleDailySalesReport, 
  handleSalesByClientReport, 
  handleTopProductsReport, 
  handleDashboardSummaryReport 
} from './reports';

// Tipo para los handlers de rutas
type Handler = (context: Context, req: HttpRequest, action?: string, subaction?: string) => Promise<void>;

// Wrappers para handlers que requieren userId del token
const createSaleHandler: Handler = async (ctx, req, action) => {
  const authResult = requireAuth(req);
  if (authResult.success && authResult.user) {
    await saleController.createSale(ctx, req, authResult.user.userId);
  } else {
    ctx.res = {
      status: 401,
      body: {
        success: false,
        message: 'Usuario no autenticado',
        timestamp: new Date().toISOString(),
      },
    };
  }
};

// Wrappers para handlers que requieren validación de ID
const getSaleHandler: Handler = async (ctx, req, action) => {
  if (action) {
    await saleController.getSale(ctx, req, action);
  } else {
    await saleController.listSales(ctx, req);
  }
};

const updateSaleHandler: Handler = async (ctx, req, action) => {
  if (!action) {
    badRequest(ctx, 'ID de venta requerido');
    return;
  }
  await saleController.updateSale(ctx, req, action);
};

// Handler para reportes
const reportsHandler: Handler = async (ctx, req, action, subaction) => {
  switch (subaction) {
    case 'daily':
      await handleDailySalesReport(ctx, req);
      break;
    case 'by-client':
      await handleSalesByClientReport(ctx, req);
      break;
    case 'top-products':
      await handleTopProductsReport(ctx, req);
      break;
    case 'summary':
      await handleDashboardSummaryReport(ctx, req);
      break;
    default:
      badRequest(ctx, 'Tipo de reporte no válido. Tipos disponibles: daily, by-client, top-products, summary');
  }
};

// Permisos requeridos por método HTTP
const methodPermissions: Record<string, string[]> = {
  GET: ['sales_read'],
  POST: ['sales_write'],
  PUT: ['sales_write'],
};

// Mapa de rutas por método HTTP
const routes: Record<string, Record<string, Handler>> = {
  GET: {
    reports: reportsHandler,
    stats: (ctx, req) => saleController.getSalesStats(ctx, req),
    overdue: (ctx, req) => saleController.getOverdueSales(ctx, req),
    default: getSaleHandler,
  },

  POST: {
    default: createSaleHandler,
  },

  PUT: {
    payment: (ctx, req) => saleController.updatePaymentStatus(ctx, req),
    default: updateSaleHandler,
  },
};

const salesHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    if (!requireAppKey(context, req)) return;
    const { action, subaction } = req.params;
    const method = req.method || 'GET';
    
    logger.info('Sales function triggered', {
      action,
      subaction,
      method,
      url: req.url,
    });

    // Verificar autenticación y permisos según el método
    const requiredPermissions = methodPermissions[method];
    if (requiredPermissions) {
      const authResult = requireAnyPermission(req, requiredPermissions);
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
          } else {
      // Para métodos no definidos, verificar autenticación básica
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
    }

    // Resolver la ruta dinámicamente
    const methodRoutes = routes[method];
    if (!methodRoutes) {
      methodNotAllowed(context);
      return;
    }

    // Para reportes, usar la combinación action:subaction
    const routeKey = action === 'reports' && subaction ? `${action}:${subaction}` : action;
    const handler = methodRoutes[routeKey || ''] || methodRoutes.default;

    if (!handler) {
      methodNotAllowed(context);
      return;
    }

    // Ejecutar el handler
    await handler(context, req, action, subaction);

  } catch (error) {
    logger.error('Error en función de ventas:', error);
    (context as any).__errorLogged = true;
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error interno del servidor',
        timestamp: new Date().toISOString(),
      },
    };
  } finally {
    logErrorResponse(context, req, 'sales');
  }
};

export default salesHandler;
