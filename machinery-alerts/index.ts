import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { logger } from '../src/config/logger';
import { logErrorResponse } from '../src/utils/httpLogger';
import { badRequest, methodNotAllowed, requireAppKey, optionsOk, addCorsToResponse } from '../src/utils/httpResponses';
import { requireAuth, requireAnyPermission } from '../src/middleware/authMiddleware';
import * as machineryAlertController from '../src/controllers/machineryAlertController';
import * as machineryAlertService from '../src/services/machineryAlertService';

// Tipo para los handlers de rutas
type Handler = (context: Context, req: HttpRequest, action?: string) => Promise<void>;

// Wrappers para handlers
const getAlertHandler: Handler = async (ctx, req, action) => {
  if (action === 'user') {
    await machineryAlertController.getUserAlerts(ctx, req);
  } else if (action === 'detect') {
    // Endpoint para ejecutar manualmente la detección de alertas (solo admin)
    const daysBeforeDue = req.query?.days_before_due 
      ? Number.parseInt(req.query.days_before_due as string, 10) 
      : 1;
    await machineryAlertService.detectMaintenanceAlerts(daysBeforeDue);
    ctx.res = {
      status: 200,
      body: {
        success: true,
        message: 'Detección de alertas ejecutada exitosamente',
        data: {
          daysBeforeDue,
        },
        timestamp: new Date().toISOString(),
      },
    };
  } else if (action) {
    await machineryAlertController.getMachineryAlert(ctx, req, action);
  } else {
    await machineryAlertController.listMachineryAlerts(ctx, req);
  }
};

const markAsReadHandler: Handler = async (ctx, req, action) => {
  if (!action) {
    badRequest(ctx, 'ID de alerta requerido');
    return;
  }
  await machineryAlertController.markAlertAsRead(ctx, req, action);
};

// Permisos requeridos por método HTTP
const methodPermissions: Record<string, string[]> = {
  GET: ['inventory_manage', 'production_read'],
  POST: ['inventory_manage'],
  PUT: ['inventory_manage'],
};

// Mapa de rutas por método HTTP
const routes: Record<string, Record<string, Handler>> = {
  GET: {
    user: (ctx, req) => machineryAlertController.getUserAlerts(ctx, req),
    detect: async (ctx, req) => {
      // Verificar que sea admin
      const authResult = requireAuth(req);
      if (!authResult.success) {
        ctx.res = {
          status: 401,
          body: {
            success: false,
            message: 'Usuario no autenticado',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
      const daysBeforeDue = req.query?.days_before_due 
        ? Number.parseInt(req.query.days_before_due as string, 10) 
        : 1;
      await machineryAlertService.detectMaintenanceAlerts(daysBeforeDue);
      ctx.res = {
        status: 200,
        body: {
          success: true,
          message: 'Detección de alertas ejecutada exitosamente',
          data: {
            daysBeforeDue,
          },
          timestamp: new Date().toISOString(),
        },
      };
    },
    default: getAlertHandler,
  },

  POST: {
    assign: async (ctx, req) => {
      // POST /machinery-alerts/assign/{id}
      const alertId = req.params?.id || req.params?.action;
      if (!alertId) {
        badRequest(ctx, 'ID de alerta requerido');
        return;
      }
      await machineryAlertController.assignAlertToUsers(ctx, req, alertId);
    },
    device: (ctx, req) => machineryAlertController.registerUserDevice(ctx, req),
    send: async (ctx, req) => {
      const limitRaw = (req.query?.limit ?? req.body?.limit) as string | number | undefined;
      const limit = typeof limitRaw === 'string' ? Number.parseInt(limitRaw, 10) : limitRaw;
      const result = await machineryAlertService.sendPendingMaintenanceAlerts(
        Number.isFinite(limit) ? (limit as number) : 50
      );

      ctx.res = {
        status: 200,
        body: {
          success: true,
          data: result,
          message: 'Proceso de envío de alertas ejecutado',
          timestamp: new Date().toISOString(),
        },
      };
    },
    default: (ctx, req) => machineryAlertController.createMachineryAlert(ctx, req),
  },

  PUT: {
    read: markAsReadHandler,
    default: markAsReadHandler,
  },
};

const machineryAlertsHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    if (!requireAppKey(context, req)) return;
    const { action } = req.params;
    const method = req.method || 'GET';

    logger.info('Machinery alerts function triggered', {
      action,
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

    // Buscar handler: primero por action, luego default
    const handler = methodRoutes[action || ''] || methodRoutes.default;

    if (!handler) {
      methodNotAllowed(context);
      return;
    }

    // Ejecutar el handler
    await handler(context, req, action);

  } catch (error) {
    logger.error('Error en función de alertas de maquinaria:', error);
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
    addCorsToResponse(context, req);
    logErrorResponse(context, req, 'machinery-alerts');
  }
};

export default machineryAlertsHandler;
