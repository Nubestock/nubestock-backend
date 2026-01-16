import { Context, HttpRequest } from '../types/azure-functions';
import { logger } from '../config/logger';

export const logErrorResponse = (
  context: Context,
  req: HttpRequest,
  source: string
): void => {
  const status = context.res?.status;
  if (!status || status < 400) {
    return;
  }

  const ctxAny = context as any;
  if (ctxAny.__errorLogged) {
    return;
  }

  const body: any = context.res?.body;
  logger.error(`${source} responded with error`, {
    status,
    method: req.method,
    url: req.url,
    message: body?.message || body?.error || 'Request failed',
    errors: body?.errors,
  });
};
