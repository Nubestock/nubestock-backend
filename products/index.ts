import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { logger } from '../src/config/logger';
import { logErrorResponse } from '../src/utils/httpLogger';
import { requireAuth, requireAnyPermission } from '../src/middleware/authMiddleware';
import * as productController from '../src/controllers/productController';
import * as categoryController from '../src/controllers/categoryController';
import * as measureController from '../src/controllers/measureController';
import * as materialController from '../src/controllers/materialController';
import * as recipeController from '../src/controllers/recipeController';
import * as bulkController from '../src/controllers/bulkController';
import * as originController from '../src/controllers/originController';

// Tipo para los handlers de rutas
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

// Mapa de rutas por método HTTP
const routes: Record<string, Record<string, Handler>> = {
  GET: {
    categories: (ctx, req) => categoryController.listCategories(ctx, req),
    origins: (ctx, req) => originController.listOrigins(ctx, req),
    measures: (ctx, req) => measureController.listMeasures(ctx, req),
    materials: (ctx, req) => materialController.listMaterials(ctx, req),
    recipes: (ctx, req) => recipeController.listRecipes(ctx, req),
    default: async (ctx, req, action) => {
      if (action) {
        await productController.getProduct(ctx, req, action);
      } else {
        await productController.listProducts(ctx, req);
      }
    },
  },

  POST: {
    'materials:bulk': (ctx, req) => bulkController.bulkCreateMaterials(ctx, req),
    categories: (ctx, req) => categoryController.createCategory(ctx, req),
    origins: (ctx, req) => originController.createOrigin(ctx, req),
    measures: (ctx, req) => measureController.createMeasure(ctx, req),
    material: (ctx, req) => materialController.createMaterial(ctx, req),
    recipe: (ctx, req) => recipeController.createRecipe(ctx, req),
    'check-stock': (ctx, req) => productController.checkStockAlerts(ctx, req),
    'stock-operation': (ctx, req) => productController.stockOperation(ctx, req),
    bulk: (ctx, req) => bulkController.bulkCreateProducts(ctx, req),
    default: (ctx, req) => productController.createProduct(ctx, req),
  },

  PUT: {
    categories: (ctx, req) => categoryController.updateCategory(ctx, req),
    origins: (ctx, req) => originController.updateOrigin(ctx, req),
    measures: (ctx, req) => measureController.updateMeasure(ctx, req),
    material: (ctx, req) => materialController.updateMaterial(ctx, req),
    'recipe:update-product': (ctx, req) => recipeController.updateProductRecipe(ctx, req),
    recipe: (ctx, req) => recipeController.updateRecipe(ctx, req),
    default: async (ctx, req, action) => {
      if (action) {
        await productController.updateProduct(ctx, req, action);
        } else {
        badRequest(ctx, 'ID de producto requerido');
      }
    },
  },

  DELETE: {
    categories: (ctx, req) => categoryController.deleteCategory(ctx, req),
    origins: (ctx, req) => originController.deleteOrigin(ctx, req),
    measures: (ctx, req) => measureController.deleteMeasure(ctx, req),
    material: (ctx, req) => materialController.deleteMaterial(ctx, req),
    recipe: (ctx, req) => recipeController.deleteRecipe(ctx, req),
    default: async (ctx, req, action) => {
      if (action) {
        await productController.deleteProduct(ctx, req, action);
    } else {
        badRequest(ctx, 'ID de producto requerido');
      }
    },
  },
};

// Permisos requeridos por método
const methodPermissions: Record<string, string[]> = {
  GET: ['products_read', 'inventory_manage', 'production_read'],
  POST: ['products_write', 'inventory_manage'],
  PUT: ['products_write', 'inventory_manage'],
  DELETE: ['products_write', 'inventory_manage'],
};

const productsHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    const { action, subaction } = req.params;
    const method = req.method || 'GET';

    logger.info('Products function triggered', {
      action,
      subaction,
      method,
      url: req.url,
    });

    // Verificar autenticación y permisos según el método
    const requiredPermissions = methodPermissions[method];
    const authResult = requiredPermissions
      ? requireAnyPermission(req, requiredPermissions)
      : requireAuth(req);

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

    // Resolver la ruta dinámicamente
    const routeKey = subaction ? `${action}:${subaction}` : action || 'default';
    const methodRoutes = routes[method];
    
    if (!methodRoutes) {
      methodNotAllowed(context);
      return;
    }

    // Log para debugging del routing
    logger.info('Routing debug', {
      action,
      subaction,
      routeKey,
      method,
      availableRoutes: Object.keys(methodRoutes),
      url: req.url,
      params: req.params,
    });

    // Buscar handler: primero por ruta completa (action:subaction), luego por action, luego default
    // Verificar explícitamente si existe la ruta antes de usar default
    let handler: Handler | undefined;
    
    if (routeKey && methodRoutes[routeKey]) {
      handler = methodRoutes[routeKey];
    } else if (action && methodRoutes[action]) {
      handler = methodRoutes[action];
        } else {
      handler = methodRoutes.default;
    }
    
    if (!handler) {
      methodNotAllowed(context);
      return;
    }

    // Log para debugging del routing
    logger.info('Routing resolved', {
      action,
      subaction,
      routeKey,
      handlerFound: !!handler,
      handlerRoute: methodRoutes[routeKey] ? routeKey : (methodRoutes[action || ''] ? action : 'default'),
      url: req.url,
    });

    // Ejecutar el handler
    await handler(context, req, action, subaction);
  } catch (error) {
    logger.error('Error en función de productos:', error);
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
    logErrorResponse(context, req, 'products');
  }
};

export default productsHandler;
