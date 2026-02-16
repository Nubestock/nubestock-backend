import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { logger } from '../src/config/logger';
import { logErrorResponse } from '../src/utils/httpLogger';
import { badRequest, methodNotAllowed, requireAppKey, optionsOk, addCorsToResponse } from '../src/utils/httpResponses';
import { requireAuth, requireAnyPermission } from '../src/middleware/authMiddleware';
import * as userController from '../src/controllers/userController';

// Tipo para los handlers de rutas
type Handler = (context: Context, req: HttpRequest, action?: string) => Promise<void>;

// Wrappers para handlers que manejan ID
const getUserHandler: Handler = async (ctx, req, action) => {
  if (action) {
    await userController.getUser(ctx, req, action);
  } else {
    await userController.listUsers(ctx, req);
  }
};

const updateUserHandler: Handler = async (ctx, req, action) => {
  if (!action) {
    badRequest(ctx, 'ID de usuario requerido');
    return;
  }
  await userController.updateUser(ctx, req, action);
};

const deleteUserHandler: Handler = async (ctx, req, action) => {
  if (!action) {
    badRequest(ctx, 'ID de usuario requerido');
    return;
  }
  await userController.deleteUser(ctx, req, action);
};

// Permisos requeridos por método HTTP
const methodPermissions: Record<string, string[]> = {
  GET: ['users_read', 'users_manage'],
  POST: ['users_write', 'users_manage'],
  PUT: ['users_write', 'users_manage'],
  DELETE: ['users_manage'],
};

// Mapa de rutas por método HTTP
const routes: Record<string, Record<string, Handler>> = {
  GET: {
    list: (ctx, req) => userController.listUsers(ctx, req),
    default: getUserHandler,
  },

  POST: {
    default: (ctx, req) => userController.createUser(ctx, req),
  },

  PUT: {
    default: updateUserHandler,
  },

  DELETE: {
    default: deleteUserHandler,
  },
};

const usersHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    if (req.method === 'OPTIONS') {
      optionsOk(context, req);
      return;
    }
    if (!requireAppKey(context, req)) return;
    const { action } = req.params;
    const method = req.method || 'GET';

    logger.info('Users function triggered', {
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
    logger.error('Error en función de usuarios:', error);
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
    logErrorResponse(context, req, 'users');
  }
};

export default usersHandler;
