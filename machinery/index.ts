import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { logger } from '../src/config/logger';
import { logErrorResponse } from '../src/utils/httpLogger';
import { requireAuth, requireAnyPermission } from '../src/middleware/authMiddleware';
import * as machineryController from '../src/controllers/machineryController';

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

// Wrappers para handlers que requieren validación de ID
const getMachineryHandler: Handler = async (ctx, req, action) => {
  if (action) {
    await machineryController.getMachinery(ctx, req, action);
  } else {
    await machineryController.listMachinery(ctx, req);
  }
};

const updateMachineryHandler: Handler = async (ctx, req, action) => {
  if (!action) {
    badRequest(ctx, 'ID de maquinaria requerido');
    return;
  }
  await machineryController.updateMachinery(ctx, req, action);
};

const deleteMachineryHandler: Handler = async (ctx, req, action) => {
  if (!action) {
    badRequest(ctx, 'ID de maquinaria requerido');
    return;
  }
  await machineryController.deleteMachinery(ctx, req, action);
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
    default: getMachineryHandler,
  },

  POST: {
    default: (ctx, req) => machineryController.createMachinery(ctx, req),
  },

  PUT: {
    default: updateMachineryHandler,
  },

  DELETE: {
    default: deleteMachineryHandler,
  },
};

const machineryHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    const { action } = req.params;
    const method = req.method || 'GET';

    logger.info('Machinery function triggered', {
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
    logger.error('Error en función de maquinaria:', error);
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
    logErrorResponse(context, req, 'machinery');
  }
};

export default machineryHandler;
