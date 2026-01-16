import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { logger } from '../src/config/logger';
import { logErrorResponse } from '../src/utils/httpLogger';
import { requireAuth, requireAnyPermission } from '../src/middleware/authMiddleware';
import * as maintenanceController from '../src/controllers/maintenanceController';

// Tipo para los handlers de rutas
type Handler = (context: Context, req: HttpRequest, action?: string) => Promise<void>;

// Helpers para respuestas comunes
function badRequest(context: Context, message: string): void {
  context.res = {
    status: 400,
    body: {
      success: false,
      message,
      timestamp: new Date().toISOString(),
    },
  };
}

function methodNotAllowed(context: Context): void {
  context.res = {
    status: 405,
    body: {
      success: false,
      message: 'Método no permitido',
      timestamp: new Date().toISOString(),
    },
  };
}

// Wrappers para handlers
const getMaintenanceHandler: Handler = async (ctx, req, action) => {
  if (action === 'history') {
    await maintenanceController.listMaintenanceHistory(ctx, req);
  } else if (action && action.startsWith('history/')) {
    const historyId = action.replace('history/', '');
    await maintenanceController.getMaintenanceHistory(ctx, req, historyId);
  } else if (action) {
    await maintenanceController.getMaintenance(ctx, req, action);
  } else {
    await maintenanceController.listMaintenances(ctx, req);
  }
};

const updateMaintenanceHandler: Handler = async (ctx, req, action) => {
  if (!action) {
    badRequest(ctx, 'ID de mantenimiento requerido');
    return;
  }
  
  if (action.startsWith('history/')) {
    const historyId = action.replace('history/', '');
    await maintenanceController.updateMaintenanceHistory(ctx, req, historyId);
  } else {
    await maintenanceController.updateMaintenance(ctx, req, action);
  }
};

const deleteMaintenanceHandler: Handler = async (ctx, req, action) => {
  if (!action) {
    badRequest(ctx, 'ID de mantenimiento requerido');
    return;
  }
  
  if (action.startsWith('history/')) {
    const historyId = action.replace('history/', '');
    await maintenanceController.deleteMaintenanceHistory(ctx, req, historyId);
  } else {
    await maintenanceController.deleteMaintenance(ctx, req, action);
  }
};

// Permisos requeridos por método HTTP
const methodPermissions: Record<string, string[]> = {
  GET: ['inventory_manage', 'production_read'],
  POST: ['inventory_manage'],
  PUT: ['inventory_manage'],
  DELETE: ['inventory_manage'],
};

// Mapa de rutas por método HTTP
const routes: Record<string, Record<string, Handler>> = {
  GET: {
    history: (ctx, req) => maintenanceController.listMaintenanceHistory(ctx, req),
    default: getMaintenanceHandler,
  },

  POST: {
    history: (ctx, req) => maintenanceController.createMaintenanceHistory(ctx, req),
    default: (ctx, req) => maintenanceController.createMaintenance(ctx, req),
  },

  PUT: {
    default: updateMaintenanceHandler,
  },

  DELETE: {
    default: deleteMaintenanceHandler,
  },
};

const maintenanceHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    const { action } = req.params;
    const method = req.method || 'GET';

    logger.info('Maintenance function triggered', {
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
    logger.error('Error en función de mantenimientos:', error);
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
    logErrorResponse(context, req, 'maintenance');
  }
};

export default maintenanceHandler;
