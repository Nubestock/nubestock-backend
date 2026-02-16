import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { logger } from '../src/config/logger';
import { logErrorResponse } from '../src/utils/httpLogger';
import { requireAppKey } from '../src/utils/httpResponses';
import * as authController from '../src/controllers/authController';

// Tipo para los handlers de rutas
type Handler = (context: Context, req: HttpRequest) => Promise<void>;

// Helpers para respuestas comunes
function notFound(context: Context): void {
  context.res = {
    status: 404,
    body: {
      success: false,
      message: 'Acción no encontrada',
      timestamp: new Date().toISOString(),
    },
  };
}

// Mapa de rutas por acción
const routes: Record<string, Handler> = {
  login: (ctx, req) => authController.login(ctx, req),
  register: (ctx, req) => authController.register(ctx, req),
  refresh: (ctx, req) => authController.refresh(ctx, req),
  logout: (ctx, req) => authController.logout(ctx, req),
  'change-password': (ctx, req) => authController.changePassword(ctx, req),
  'reset-password': (ctx, req) => authController.resetPassword(ctx, req),
  'admin-reset-password': (ctx, req) => authController.adminResetPassword(ctx, req),
};

const authHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    if (!requireAppKey(context, req)) return;
    const { action } = req.params;
    
    logger.info('Auth function triggered', {
      action,
      method: req.method,
      url: req.url,
    });

    // Resolver la ruta dinámicamente
    const handler = routes[action || ''];

    if (!handler) {
      notFound(context);
      return;
    }

    // Ejecutar el handler
    await handler(context, req);

  } catch (error) {
    logger.error('Error en función de autenticación:', error);
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
    logErrorResponse(context, req, 'auth');
  }
};

export default authHandler;
