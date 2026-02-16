import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { logger } from '../src/config/logger';
import { logErrorResponse } from '../src/utils/httpLogger';
import { badRequest, methodNotAllowed, requireAppKey, optionsOk, addCorsToResponse } from '../src/utils/httpResponses';
import { requireAuth } from '../src/middleware/authMiddleware';
import * as userPermissionController from '../src/controllers/userPermissionController';

// Tipo para los handlers de rutas
type Handler = (context: Context, req: HttpRequest, action?: string) => Promise<void>;

// Wrappers para handlers que manejan lógica específica
const getUserPermissionsHandler: Handler = async (ctx, req, action) => {
  // Si hay action (userId), obtener permisos de ese usuario
  // Si no hay action, obtener permisos del usuario autenticado
  if (action) {
    await userPermissionController.getUserPermissions(ctx, req, action);
  } else {
    const authResult = requireAuth(req);
    if (authResult.success && authResult.user) {
      await userPermissionController.getUserPermissions(ctx, req, authResult.user.userId);
    } else {
      badRequest(ctx, 'ID de usuario requerido');
    }
  }
};

const removeRoleHandler: Handler = async (ctx, req, action) => {
  if (!action) {
    badRequest(ctx, 'ID de usuario requerido');
    return;
  }
  await userPermissionController.removeRole(ctx, req, action);
};

// Mapa de rutas por método HTTP
const routes: Record<string, Record<string, Handler>> = {
  GET: {
    check: (ctx, req) => userPermissionController.checkPermission(ctx, req),
    default: getUserPermissionsHandler,
  },

  POST: {
    default: (ctx, req) => userPermissionController.assignRole(ctx, req),
  },

  DELETE: {
    default: removeRoleHandler,
  },
};

const userPermissionsHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    if (!requireAppKey(context, req)) return;
    const { action } = req.params;
    const method = req.method || 'GET';

    logger.info('User permissions function triggered', {
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
    logger.error('Error en función de permisos de usuario:', error);
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
    logErrorResponse(context, req, 'user-permissions');
  }
};

export default userPermissionsHandler;
