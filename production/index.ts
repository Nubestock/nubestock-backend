import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { logger } from '../src/config/logger';
import { logErrorResponse } from '../src/utils/httpLogger';
import { requireAuth, requireAnyPermission } from '../src/middleware/authMiddleware';
import * as productionController from '../src/controllers/productionController';

// Tipo para los handlers de rutas (con subaction para rutas anidadas)
type Handler = (context: Context, req: HttpRequest, action?: string, subaction?: string) => Promise<void>;

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

// Wrappers para handlers que manejan userId del token
const registerProductionHandler: Handler = async (ctx, req, action) => {
  const authResult = requireAuth(req);
  if (authResult.success && authResult.user) {
    await productionController.registerProduction(ctx, req, authResult.user.userId);
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

// Handler para registro de materiales por operador (Etapa 1)
const registerMaterialsHandler: Handler = async (ctx, req, action) => {
  const authResult = requireAuth(req);
  if (authResult.success && authResult.user) {
    await productionController.registerProductionMaterials(ctx, req, authResult.user.userId);
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

// Handler para completar producción por administrador (Etapa 2)
// Ruta: PUT /production/{id}/complete
const completeProductionHandler: Handler = async (ctx, req, action, subaction) => {
  // En PUT /production/{id}/complete: action = id, subaction = "complete"
  const productionId = action;
  
  if (!productionId) {
    badRequest(ctx, 'ID de producción requerido');
    return;
  }
  
  const authResult = requireAuth(req);
  if (authResult.success && authResult.user) {
    await productionController.completeProduction(ctx, req, productionId, authResult.user.userId);
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

const createTransactionHandler: Handler = async (ctx, req, action) => {
  const authResult = requireAuth(req);
  if (authResult.success && authResult.user) {
    await productionController.createTransaction(ctx, req, authResult.user.userId);
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

const updateProductionHandler: Handler = async (ctx, req, action) => {
  if (!action) {
    badRequest(ctx, 'ID de producción requerido');
    return;
  }
  const authResult = requireAuth(req);
  if (authResult.success && authResult.user) {
    await productionController.updateProduction(ctx, req, action, authResult.user.userId);
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

// Permisos requeridos por método HTTP
const methodPermissions: Record<string, string[]> = {
  GET: ['production_read'],
  POST: ['production_write'],
  PUT: ['production_write'],
};

// Mapa de rutas por método HTTP
const routes: Record<string, Record<string, Handler>> = {
  GET: {
    daily: (ctx, req) => productionController.getDailyProduction(ctx, req),
    stats: (ctx, req) => productionController.getProductionStats(ctx, req),
    transactions: (ctx, req) => productionController.getTransactions(ctx, req),
    default: (ctx, req) => productionController.getDailyProduction(ctx, req),
  },

  POST: {
    register: registerProductionHandler, // Legacy: Registro directo (mantener para compatibilidad)
    transaction: createTransactionHandler,
    default: registerProductionHandler,
  },

  PUT: {
    complete: completeProductionHandler, // Etapa 2: Administrador completa con cantidad final
    default: updateProductionHandler, // Actualizar producción existente
  },
};

const productionHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    const { action, subaction } = req.params;
    const method = req.method || 'GET';

    logger.info('Production function triggered', {
      action,
      subaction,
      method,
      url: req.url,
      params: req.params,
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

    // Lógica de routing mejorada:
    // Verificar URL directamente para rutas con guiones
    const urlPath = req.url?.split('?')[0] || '';
    const isRegisterMaterials = urlPath.includes('/register-materials') && method === 'POST';
    const isCompleteProduction = subaction === 'complete' && method === 'PUT';
    
    let handler: Handler | undefined;
    
    // Prioridad 1: Rutas especiales con guiones o patrones específicos
    if (isRegisterMaterials) {
      // POST /production/register-materials
      handler = registerMaterialsHandler;
    } else if (isCompleteProduction) {
      // PUT /production/{id}/complete
      handler = completeProductionHandler;
    } else if (subaction) {
      // Buscar por subaction si existe
      handler = methodRoutes[subaction];
    } else if (action) {
      // Rutas con action solamente (ej: POST /production/register)
      handler = methodRoutes[action];
    }
    
    // Si no se encontró handler, usar default
    if (!handler) {
      handler = methodRoutes.default;
    }

    if (!handler) {
      methodNotAllowed(context);
      return;
    }

    // Ejecutar el handler
    // Para complete: action es el ID de producción, subaction es "complete"
    // Para register-materials: action es "register-materials", subaction es undefined
    await handler(context, req, action, subaction);

  } catch (error) {
    logger.error('Error en función de producción:', error);
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
    logErrorResponse(context, req, 'production');
  }
};

export default productionHandler;
