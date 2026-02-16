import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { logger } from '../src/config/logger';
import { logErrorResponse } from '../src/utils/httpLogger';
import { badRequest, methodNotAllowed, requireAppKey, optionsOk, addCorsToResponse } from '../src/utils/httpResponses';
import { requireAuth, requireAnyPermission } from '../src/middleware/authMiddleware';
import * as clientController from '../src/controllers/clientController';
import * as bulkController from '../src/controllers/bulkController';

// Tipo para los handlers de rutas
type Handler = (context: Context, req: HttpRequest, action?: string) => Promise<void>;

// Wrappers para handlers que requieren validación de ID
const getClientHandler: Handler = async (ctx, req, action) => {
  if (action) {
    await clientController.getClient(ctx, req, action);
  } else {
    await clientController.listClients(ctx, req);
  }
};

const updateClientHandler: Handler = async (ctx, req, action) => {
  if (!action) {
    badRequest(ctx, 'ID de cliente requerido');
    return;
  }
  await clientController.updateClient(ctx, req, action);
};

const deleteClientHandler: Handler = async (ctx, req, action) => {
  if (!action) {
    badRequest(ctx, 'ID de cliente requerido');
    return;
  }
  await clientController.deleteClient(ctx, req, action);
};

// Permisos requeridos por método HTTP
const methodPermissions: Record<string, string[]> = {
  GET: ['clients_read', 'sales_read'],
  POST: ['clients_write', 'sales_write'],
  PUT: ['clients_write', 'sales_write'],
  DELETE: ['clients_write', 'sales_write'],
};

// Mapa de rutas por método HTTP
const routes: Record<string, Record<string, Handler>> = {
  GET: {
    default: getClientHandler,
  },

  POST: {
    bulk: (ctx, req) => bulkController.bulkCreateClients(ctx, req),
    default: (ctx, req) => clientController.createClient(ctx, req),
  },

  PUT: {
    default: updateClientHandler,
  },

  DELETE: {
    default: deleteClientHandler,
  },
};

const clientsHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    if (!requireAppKey(context, req)) return;
    const { action } = req.params;
    const method = req.method || 'GET';

    logger.info('Clients function triggered', {
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
    logger.error('Error en función de clientes:', error);
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
    logErrorResponse(context, req, 'clients');
  }
};

export default clientsHandler;
