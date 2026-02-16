import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { logger } from '../src/config/logger';
import { logErrorResponse } from '../src/utils/httpLogger';
import { badRequest, methodNotAllowed, requireAppKey } from '../src/utils/httpResponses';
import { requireAuth, requireAnyPermission } from '../src/middleware/authMiddleware';
import { config } from '../src/config/environment';
import * as roleController from '../src/controllers/roleController';
import * as permissionController from '../src/controllers/permissionController';

// Tipo para los handlers de rutas
type Handler = (context: Context, req: HttpRequest, action?: string) => Promise<void>;

// Función helper para verificar bootstrap mode
function isBootstrapMode(req: HttpRequest): boolean {
  const headers = req.headers || {};
  const bootstrapKeyHeader = Object.keys(headers).find(
    key => key.toLowerCase() === 'x-bootstrap-key'
  );
  const providedBootstrapKey = bootstrapKeyHeader ? headers[bootstrapKeyHeader] : null;
  return config.security.bootstrapKey && 
         config.security.bootstrapKey !== '' &&
         providedBootstrapKey === config.security.bootstrapKey;
}


// Wrappers para handlers que requieren validación de ID
const getRoleHandler: Handler = async (ctx, req, action) => {
  if (action) {
    await roleController.getRole(ctx, req, action);
  } else {
    await roleController.listRoles(ctx, req);
  }
};

const updateRoleHandler: Handler = async (ctx, req, action) => {
  if (!action) {
    badRequest(ctx, 'ID de rol requerido');
    return;
  }
  await roleController.updateRole(ctx, req, action);
};

const deleteRoleHandler: Handler = async (ctx, req, action) => {
  if (!action) {
    badRequest(ctx, 'ID de rol requerido');
    return;
  }
  await roleController.deleteRole(ctx, req, action);
};

// Permisos requeridos por método HTTP
const methodPermissions: Record<string, string[]> = {
  GET: ['roles_read', 'users_manage', 'admin'],
  POST: ['roles_write', 'users_manage', 'admin'],
  PUT: ['roles_write', 'users_manage', 'admin'],
  DELETE: ['roles_write', 'users_manage', 'admin'],
};

// Mapa de rutas por método HTTP
const routes: Record<string, Record<string, Handler>> = {
  GET: {
    permissions: (ctx, req) => permissionController.getPermissions(ctx, req),
    all: (ctx, req) => roleController.getAllRolesWithPermissions(ctx, req),
    default: getRoleHandler,
  },

  POST: {
    permissions: (ctx, req) => permissionController.createPermission(ctx, req),
    default: (ctx, req) => roleController.createRole(ctx, req),
  },

  PUT: {
    default: updateRoleHandler,
  },

  DELETE: {
    default: deleteRoleHandler,
  },
};

const rolesHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    if (!requireAppKey(context, req)) return;
    const { action } = req.params;
    const method = req.method || 'GET';

    logger.info('Roles function triggered', {
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

    // Verificar bypass flag para inicialización del sistema
    const bootstrapMode = isBootstrapMode(req);

    // Si NO está en modo bootstrap, verificar permisos según el método
    if (!bootstrapMode) {
      const requiredPermissions = methodPermissions[method];
      if (requiredPermissions) {
        const permissionResult = requireAnyPermission(req, requiredPermissions);
        if (!permissionResult.success) {
          context.res = {
            status: 403,
            body: {
              success: false,
              message: permissionResult.error || 'No tienes permisos para realizar esta acción',
              timestamp: new Date().toISOString(),
            },
          };
          return;
        }
      }
    } else {
      // Log de seguridad cuando se usa el bypass
      logger.warn('Bootstrap mode activado para gestión de roles', {
        userId: authResult.user!.userId,
        userEmail: authResult.user!.userEmail,
        method: method,
        timestamp: new Date().toISOString(),
      });
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
    logger.error('Error en función de roles:', error);
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
    logErrorResponse(context, req, 'roles');
  }
};

export default rolesHandler;
