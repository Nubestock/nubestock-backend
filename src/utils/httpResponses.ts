import { Context, HttpRequest } from '../types/azure-functions';
import { config } from '../config/environment';

const timestamp = () => new Date().toISOString();

/**
 * Respuesta 400 Bad Request - estandarizada para todas las funciones.
 */
export function badRequest(context: Context, message: string, errors?: unknown): void {
  context.res = {
    status: 400,
    body: {
      success: false,
      message,
      ...(errors !== undefined && { errors }),
      timestamp: timestamp(),
    },
  };
}

/**
 * Respuesta 401 Unauthorized - estandarizada (clave de app inválida o faltante).
 */
export function unauthorized(context: Context): void {
  context.res = {
    status: 401,
    body: {
      success: false,
      message: 'No autorizado.',
      timestamp: timestamp(),
    },
  };
}

/**
 * Comprueba el query param ?code= contra APP_KEY. Si no se pasa o no es correcto, responde 401 y devuelve false.
 * Debe llamarse al inicio de cada función HTTP.
 */
export function requireAppKey(context: Context, req: HttpRequest): boolean {
  const appKey = config.security.appKey;
  if (!appKey || appKey === '') {
    return true;
  }
  const provided = (req.query?.code ?? req.query?.Code) as string | undefined;
  if (!provided || provided !== appKey) {
    unauthorized(context);
    return false;
  }
  return true;
}

/**
 * Respuesta 405 Method Not Allowed - estandarizada para todas las funciones.
 */
export function methodNotAllowed(context: Context): void {
  context.res = {
    status: 405,
    body: {
      success: false,
      message: 'Método no permitido',
      timestamp: timestamp(),
    },
  };
}
