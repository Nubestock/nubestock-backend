import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { logger } from '../src/config/logger';
import { logErrorResponse } from '../src/utils/httpLogger';
import { badRequest, methodNotAllowed, requireAppKey } from '../src/utils/httpResponses';
import { requireAuth } from '../src/middleware/authMiddleware';
import * as locationController from '../src/controllers/locationController';

// Tipo para los handlers de rutas
type Handler = (context: Context, req: HttpRequest) => Promise<void>;

// Wrappers para handlers que manejan ID en query params
const getCountryHandler: Handler = async (ctx, req) => {
  const id = req.query.id as string;
  if (id) {
    await locationController.getCountryById(ctx, req, id);
  } else {
    await locationController.listCountries(ctx, req);
  }
};

const getProvinceHandler: Handler = async (ctx, req) => {
  const id = req.query.id as string;
  if (id) {
    await locationController.getProvinceById(ctx, req, id);
  } else {
    await locationController.listProvinces(ctx, req);
  }
};

const getCityHandler: Handler = async (ctx, req) => {
  const id = req.query.id as string;
  if (id) {
    await locationController.getCityById(ctx, req, id);
  } else {
    await locationController.listCities(ctx, req);
  }
};

const updateCountryHandler: Handler = async (ctx, req) => {
  const id = req.query.id as string;
  if (!id) {
    badRequest(ctx, 'ID de país requerido');
    return;
  }
  await locationController.updateCountry(ctx, req, id);
};

const updateProvinceHandler: Handler = async (ctx, req) => {
  const id = req.query.id as string;
  if (!id) {
    badRequest(ctx, 'ID de provincia requerido');
    return;
  }
  await locationController.updateProvince(ctx, req, id);
};

const updateCityHandler: Handler = async (ctx, req) => {
  const id = req.query.id as string;
  if (!id) {
    badRequest(ctx, 'ID de ciudad requerido');
    return;
  }
  await locationController.updateCity(ctx, req, id);
};

const deleteCountryHandler: Handler = async (ctx, req) => {
  const id = req.query.id as string;
  if (!id) {
    badRequest(ctx, 'ID de país requerido');
    return;
  }
  await locationController.deleteCountry(ctx, req, id);
};

const deleteProvinceHandler: Handler = async (ctx, req) => {
  const id = req.query.id as string;
  if (!id) {
    badRequest(ctx, 'ID de provincia requerido');
    return;
  }
  await locationController.deleteProvince(ctx, req, id);
};

const deleteCityHandler: Handler = async (ctx, req) => {
  const id = req.query.id as string;
  if (!id) {
    badRequest(ctx, 'ID de ciudad requerido');
    return;
  }
  await locationController.deleteCity(ctx, req, id);
};

// Mapa de rutas por método HTTP
const routes: Record<string, Record<string, Handler>> = {
  GET: {
    countries: getCountryHandler,
    provinces: getProvinceHandler,
    cities: getCityHandler,
    complete: (ctx, req) => locationController.getCompleteLocations(ctx, req),
    default: (ctx, req) => locationController.getCompleteLocations(ctx, req), // Por defecto, devolver todas las localidades completas
  },

  POST: {
    countries: (ctx, req) => locationController.createCountry(ctx, req),
    provinces: (ctx, req) => locationController.createProvince(ctx, req),
    cities: (ctx, req) => locationController.createCity(ctx, req),
    default: (ctx, req) => {
      badRequest(ctx, 'Acción no válida para POST. Use: countries, provinces, o cities');
      return Promise.resolve();
    },
  },

  PUT: {
    countries: updateCountryHandler,
    provinces: updateProvinceHandler,
    cities: updateCityHandler,
    default: (ctx, req) => {
      badRequest(ctx, 'Acción no válida para PUT. Use: countries, provinces, o cities');
      return Promise.resolve();
    },
  },

  DELETE: {
    countries: deleteCountryHandler,
    provinces: deleteProvinceHandler,
    cities: deleteCityHandler,
    default: (ctx, req) => {
      badRequest(ctx, 'Acción no válida para DELETE. Use: countries, provinces, o cities');
      return Promise.resolve();
    },
  },
};

const locationsHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    if (!requireAppKey(context, req)) return;
    const { action } = req.params;
    const method = req.method || 'GET';

    logger.info('Locations function triggered', {
      action,
      method,
      url: req.url,
    });

    // Verificar autenticación usando el middleware
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
    await handler(context, req);
  } catch (error) {
    logger.error('Error en locations handler:', error);
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
    logErrorResponse(context, req, 'locations');
  }
};


export default locationsHandler;
