import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import Joi from 'joi';
import { logger } from '../src/config/logger';
import { logErrorResponse } from '../src/utils/httpLogger';
import { badRequest, methodNotAllowed, requireAppKey, optionsOk, addCorsToResponse } from '../src/utils/httpResponses';
import { config } from '../src/config/environment';
import { registerInstallation, sendAlertNotification } from '../src/services/notificationHubService';

type Handler = (context: Context, req: HttpRequest, action?: string) => Promise<void>;

function isInternalAuthorized(req: HttpRequest): boolean {
  const internalKey = config.notifications.notificationHubInternalKey;
  if (!internalKey) {
    return true;
  }

  const headerKey = req.headers?.['x-internal-key'] as string | undefined;
  return headerKey === internalKey;
}

const registerHandler: Handler = async (ctx, req) => {
  const schema = Joi.object({
    userId: Joi.number().integer().required(),
    deviceToken: Joi.string().required(),
    platform: Joi.string().valid('ios', 'android', 'web').required(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    badRequest(ctx, 'Datos de entrada inválidos', error.details);
    return;
  }

  await registerInstallation({
    userId: value.userId,
    deviceToken: value.deviceToken,
    platform: value.platform,
  });

  ctx.res = {
    status: 200,
    body: {
      success: true,
      message: 'Instalación registrada en Notification Hub',
      timestamp: new Date().toISOString(),
    },
  };
};

const sendHandler: Handler = async (ctx, req) => {
  const schema = Joi.object({
    userIds: Joi.array().items(Joi.number().integer()).min(1).required(),
    title: Joi.string().required(),
    body: Joi.string().required(),
    data: Joi.object().optional(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    badRequest(ctx, 'Datos de entrada inválidos', error.details);
    return;
  }

  const result = await sendAlertNotification({
    userIds: value.userIds,
    title: value.title,
    body: value.body,
    data: value.data,
  });

  ctx.res = {
    status: result.success ? 200 : 500,
    body: {
      success: result.success,
      data: result,
      message: result.success ? 'Notificación enviada' : 'Error al enviar notificación',
      timestamp: new Date().toISOString(),
    },
  };
};

const routes: Record<string, Record<string, Handler>> = {
  POST: {
    register: registerHandler,
    send: sendHandler,
  },
};

const notificationsHubHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    if (!requireAppKey(context, req)) return;
    const { action } = req.params;
    const method = req.method || 'POST';

    logger.info('Notifications hub function triggered', {
      action,
      method,
      url: req.url,
    });

    if (!isInternalAuthorized(req)) {
      context.res = {
        status: 403,
        body: {
          success: false,
          message: 'Acceso interno no autorizado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const methodRoutes = routes[method];
    if (!methodRoutes) {
      methodNotAllowed(context);
      return;
    }

    const handler = methodRoutes[action || ''];
    if (!handler) {
      methodNotAllowed(context);
      return;
    }

    await handler(context, req, action);
  } catch (error) {
    logger.error('Error en notifications-hub:', error);
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
    logErrorResponse(context, req, 'notifications-hub');
  }
};

export default notificationsHubHandler;
