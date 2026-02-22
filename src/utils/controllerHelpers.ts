import { Context } from '../types/azure-functions';
import { logger } from '../config/logger';
import Joi from 'joi';

/**
 * Valida un esquema Joi y retorna respuesta 400 si hay errores
 * Retorna el valor validado si es válido, null si se estableció respuesta de error
 */
export function validateSchema(context: Context, schema: Joi.ObjectSchema, data: any): Record<string, any> | null {
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

/**
 * Asigna propiedades de un objeto fuente a un objeto destino solo si están definidas (no undefined)
 * Útil para actualizaciones parciales donde solo se actualizan los campos proporcionados
 * 
 * @param target - Objeto destino donde se asignarán las propiedades
 * @param source - Objeto fuente con propiedades opcionales
 * @returns El objeto destino modificado
 * 
 * @example
 * const updateData: any = { modification_date: new Date() };
 * assignIfDefined(updateData, { name: 'New Name', sku: undefined, price: 100 });
 * // updateData ahora tiene: { modification_date: Date, name: 'New Name', price: 100 }
 * // sku no se asignó porque era undefined
 */
export function assignIfDefined<T extends Record<string, any>>(
  target: T,
  source: Partial<T>
): T {
  for (const key in source) {
    if (source[key] !== undefined) {
      target[key] = source[key] as T[Extract<keyof T, string>];
    }
  }
  return target;
}
