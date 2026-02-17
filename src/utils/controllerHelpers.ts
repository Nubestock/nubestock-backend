import { Context } from '../types/azure-functions';
import { logger } from '../config/logger';
import Joi from 'joi';

/**
 * Valida un esquema Joi y retorna respuesta 400 si hay errores
 * Retorna el valor validado si es válido, null si se estableció respuesta de error
 */
export function validateSchema(context: Context, schema: Joi.ObjectSchema, data: any): any | null {
  const { error, value } = schema.validate(data);
  if (error) {
    context.res = {
      status: 400,
      body: {
        success: false,
        message: 'Datos de entrada inválidos',
        errors: error.details.map(detail => ({
          field: Array.isArray(detail.path) ? detail.path.join('.') : String(detail.path[0] || ''),
          message: detail.message,
        })),
        timestamp: new Date().toISOString(),
      },
    };
    return null;
  }
  return value;
}

/**
 * Crea una respuesta de error estándar
 */
export function createErrorResponse(status: number, message: string): { status: number; body: any } {
  return {
    status,
    body: {
      success: false,
      message,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Maneja errores de forma consistente
 */
export function handleError(context: Context, error: any, operation: string): void {
  logger.error(`Error al ${operation}:`, error);
  context.res = {
    status: 500,
    body: {
      success: false,
      message: `Error al ${operation}`,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Valida y parsea un ID string a número
 * Retorna null si es inválido
 */
export function parseId(id: string): number | null {
  const idNum = Number.parseInt(id, 10);
  return Number.isNaN(idNum) ? null : idNum;
}

/**
 * Valida que un ID exista en query y retorna respuesta 400 si falta
 */
export function validateIdRequired(
  context: Context,
  id: string | undefined,
  entityName: string
): string | null {
  if (!id) {
    context.res = {
      status: 400,
      body: {
        success: false,
        message: `ID de ${entityName} requerido`,
        timestamp: new Date().toISOString(),
      },
    };
    return null;
  }
  return id;
}

/**
 * Valida un ID y retorna respuesta 400 si es inválido
 * Retorna el número parseado si es válido, null si se estableció respuesta de error
 */
export function validateId(
  context: Context,
  id: string,
  entityName: string
): number | null {
  const idNum = parseId(id);
  if (idNum === null) {
    context.res = {
      status: 400,
      body: {
        success: false,
        message: `ID de ${entityName} inválido`,
        timestamp: new Date().toISOString(),
      },
    };
    return null;
  }
  return idNum;
}
