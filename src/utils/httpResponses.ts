import { Context, HttpRequest } from '../types/azure-functions';
import { config } from '../config/environment';

const timestamp = () => new Date().toISOString();

/** Cabeceras CORS para respuestas; necesarias cuando el front envía credenciales (Authorization). */
function getCorsHeaders(req: HttpRequest): Record<string, string> {
  const origin = (req.headers?.['origin'] ?? req.headers?.['Origin']) as string | undefined;
  const allowed = config.cors.origin;
  const allowOrigin =
    origin && (allowed.includes('*') || allowed.includes(origin)) ? origin : allowed[0] || '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': config.cors.methods.join(', '),
    'Access-Control-Allow-Headers': config.cors.allowedHeaders.join(', '),
  };
}

function withCors<T extends { headers?: Record<string, string> }>(res: T, req: HttpRequest): T {
  return { ...res, headers: { ...getCorsHeaders(req), ...res.headers } };
}

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
 * Incluye cabeceras CORS para que el navegador no bloquee la respuesta.
 */
export function unauthorized(context: Context, req?: HttpRequest): void {
  const res: any = {
    status: 401,
    body: {
      success: false,
      message: 'No autorizado.',
      timestamp: timestamp(),
    },
  };
  context.res = req ? withCors(res, req) : res;
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
    unauthorized(context, req);
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
