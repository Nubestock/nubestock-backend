import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { logger } from '../src/config/logger';
import { logErrorResponse } from '../src/utils/httpLogger';
import { badRequest, methodNotAllowed, requireAppKey } from '../src/utils/httpResponses';
import { requireAuth } from '../src/middleware/authMiddleware';
import * as alertController from '../src/controllers/alertController';

// Tipo para los handlers de rutas
type Handler = (context: Context, req: HttpRequest, action?: string) => Promise<void>;

// Wrappers para handlers que manejan lógica especial
const getAlertHandler: Handler = async (ctx, req, action) => {
  if (action) {
    await alertController.getAlert(ctx, req, action);
  } else {
    await alertController.listAlerts(ctx, req);
  }
};

const updateAlertHandler: Handler = async (ctx, req, action) => {
  if (!action) {
    badRequest(ctx, 'ID de alerta requerido');
    return;
  }

  // Verificar si el body contiene acciones especiales
  const body = req.body || {};
  
  if (body.acknowledge) {
    await alertController.acknowledgeAlert(ctx, req, action);
  } else if (body.resolve) {
    await alertController.resolveAlert(ctx, req, action);
  } else if (body.dismiss) {
    await alertController.dismissAlert(ctx, req, action);
  } else {
    // Actualizar alerta normalmente
    await alertController.updateAlert(ctx, req, action);
  }
};

const deleteAlertHandler: Handler = async (ctx, req, action) => {
  if (!action) {
    badRequest(ctx, 'ID de alerta requerido');
    return;
  }
  await alertController.deleteAlert(ctx, req, action);
};

// Mapa de rutas por método HTTP
const routes: Record<string, Record<string, Handler>> = {
  GET: {
    default: getAlertHandler,
  },

  POST: {
    default: (ctx, req) => alertController.createAlertHandler(ctx, req),
  },

  PUT: {
    default: updateAlertHandler,
  },

  DELETE: {
    default: deleteAlertHandler,
  },
};

const alertsHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    if (!requireAppKey(context, req)) return;
    const { action } = req.params;
    const method = req.method || 'GET';

    logger.info('Alerts function triggered', {
      action,
      method,
      url: req.url,
    });

    // Verificar autenticación
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
    logger.error('Error en función de alertas:', error);
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
    logErrorResponse(context, req, 'alerts');
  }
};

export default alertsHandler;
