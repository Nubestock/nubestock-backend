import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import Joi from 'joi';
import { validateSchema, createErrorResponse, handleError, validateIdRequired, validateId, assignIfDefined } from '../utils/controllerHelpers';

const db = Database.getInstance();

// Helper functions specific to origins

function validateOriginIdRequired(context: Context, originId: string | undefined): string | null {
  return validateIdRequired(context, originId, 'origen');
}

function validateOriginId(context: Context, originId: string): number | null {
  return validateId(context, originId, 'origen');
}

async function findAndValidateOrigin(context: Context, originIdNum: number): Promise<any | null> {
  const origin = await db.findById('nubestock.tb_mae_origin', originIdNum);
  
  if (!origin) {
    context.res = {
      status: 404,
      body: {
        success: false,
        message: 'Origen no encontrado',
        timestamp: new Date().toISOString(),
      },
    };
    return null;
  }
  return origin;
}


/**
 * Obtener todos los orígenes con información de ubicación
 */
export async function listOrigins(context: Context, req: HttpRequest): Promise<void> {
  try {
    const originId = req.query.id as string;
    
    if (originId) {
      // Obtener origen específico por ID
      const originIdNum = Number.parseInt(originId, 10);
      if (Number.isNaN(originIdNum)) {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'ID de origen inválido',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }

      const origin = await db.getConnection()
        .select(
          'o.id',
          'o.name',
          'o.id_facility',
          'o.id_city',
          'o.is_active',
          'o.creation_date',
          'o.modification_date',
          'c.name as city_name',
          'p.name as province_name',
          'cnt.name as country_name',
          'cnt.is_code as country_code',
          db.getConnection().raw(`
            CONCAT(cnt.name, ' (', cnt.is_code, '), ', p.name, ', ', c.name) as full_location
          `)
        )
        .from('nubestock.tb_mae_origin as o')
        .leftJoin('nubestock.tb_mae_city as c', 'c.id', 'o.id_city')
        .leftJoin('nubestock.tb_mae_province as p', 'p.id', 'c.id_province')
        .leftJoin('nubestock.tb_mae_country as cnt', 'cnt.id', 'p.id_country')
        .where('o.id', originIdNum)
        .first();

      if (!origin || !(origin as any).is_active) {
        context.res = {
          status: 404,
          body: {
            success: false,
            message: 'Origen no encontrado',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }

      context.res = {
        status: 200,
        body: {
          success: true,
          data: origin,
          timestamp: new Date().toISOString(),
        },
      };
    } else {
      // Get origins with location information using JOINs
      const origins = await db.getConnection()
        .select(
          'o.id',
          'o.name',
          'o.id_facility',
          'o.id_city',
          'o.is_active',
          'o.creation_date',
          'o.modification_date',
          'c.name as city_name',
          'p.name as province_name',
          'cnt.name as country_name',
          'cnt.is_code as country_code',
          db.getConnection().raw(`
            CONCAT(cnt.name, ' (', cnt.is_code, '), ', p.name, ', ', c.name) as full_location
          `)
        )
        .from('nubestock.tb_mae_origin as o')
        .leftJoin('nubestock.tb_mae_city as c', 'c.id', 'o.id_city')
        .leftJoin('nubestock.tb_mae_province as p', 'p.id', 'c.id_province')
        .leftJoin('nubestock.tb_mae_country as cnt', 'cnt.id', 'p.id_country')
        .where('o.is_active', true)
        .orderBy('o.name');

      context.res = {
        status: 200,
        body: {
          success: true,
          data: origins,
          timestamp: new Date().toISOString(),
        },
      };
    }
  } catch (error) {
    handleError(context, error, 'obtener orígenes');
  }
}

export async function createOrigin(context: Context, req: HttpRequest): Promise<void> {
  try {
    const originSchema = Joi.object({
      name: Joi.string().min(2).max(200).required(),
      id_city: Joi.number().integer().required(),
      id_facility: Joi.string().max(100).allow(null).optional(),
    });

    const value = validateSchema(context, originSchema, req.body);
    if (value === null) return;

    // Verificar que la ciudad existe
    const city = await db.findById('nubestock.tb_mae_city', value.id_city);
    if (!city || !(city as any).is_active) {
      context.res = createErrorResponse(400, 'La ciudad especificada no existe o no está activa');
      return;
    }

    // Verificar si el origen ya existe (mismo nombre y ciudad)
    const existingOrigin = await db.getConnection()
      .select('id')
      .from('nubestock.tb_mae_origin')
      .where('name', value.name)
      .where('id_city', value.id_city)
      .where('is_active', true)
      .first();

    if (existingOrigin) {
      context.res = createErrorResponse(400, 'Ya existe un origen con ese nombre en la ciudad especificada');
      return;
    }

    // Crear el origen
    const originData = {
      name: value.name,
      id_city: value.id_city,
      id_facility: value.id_facility || null,
      is_active: true,
      creation_date: new Date(),
    };

    const newOrigin = await db.create('nubestock.tb_mae_origin', originData);

    context.res = {
      status: 201,
      body: {
        success: true,
        data: newOrigin,
        message: 'Origen creado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    handleError(context, error, 'crear origen');
  }
}

export async function updateOrigin(context: Context, req: HttpRequest): Promise<void> {
  try {
    const originId = req.query.id as string;
    if (!originId) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de origen requerido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const originIdNum = Number.parseInt(originId, 10);
    if (Number.isNaN(originIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de origen inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const originSchema = Joi.object({
      name: Joi.string().min(2).max(200).optional(),
      id_city: Joi.number().integer().optional(),
      id_facility: Joi.string().max(100).allow(null).optional(),
      is_active: Joi.boolean().optional(),
    });

    const { error, value } = originSchema.validate(req.body);
    if (error) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => ({
            field: detail.path[0],
            message: detail.message,
          })),
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar que el origen existe
    const existingOrigin = await db.findById('nubestock.tb_mae_origin', originIdNum);
    if (!existingOrigin) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Origen no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Si se está actualizando la ciudad, verificar que existe
    if (value.id_city !== undefined) {
      const city = await db.findById('nubestock.tb_mae_city', value.id_city);
      if (!city || !(city as any).is_active) {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'La ciudad especificada no existe o no está activa',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
    }

    // Si se está actualizando el nombre o ciudad, verificar que no existe otro origen con esos datos
    const nameToCheck = value.name || (existingOrigin as any).name;
    const cityToCheck = value.id_city !== undefined ? value.id_city : (existingOrigin as any).id_city;
    
    if (value.name || value.id_city !== undefined) {
      const duplicateOrigin = await db.getConnection()
        .select('id')
        .from('nubestock.tb_mae_origin')
        .where('name', nameToCheck)
        .where('id_city', cityToCheck)
        .where('id', '!=', originIdNum)
        .where('is_active', true)
        .first();

      if (duplicateOrigin) {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'Ya existe un origen con ese nombre en la ciudad especificada',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
    }

    // Preparar datos para actualizar
    const updateData: any = {
      modification_date: new Date(),
    };
    assignIfDefined(updateData, value);

    // Actualizar el origen
    const updatedOrigin = await db.update('nubestock.tb_mae_origin', originIdNum, updateData);

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedOrigin,
        message: 'Origen actualizado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    handleError(context, error, 'actualizar origen');
  }
}

export async function deleteOrigin(context: Context, req: HttpRequest): Promise<void> {
  try {
    const originId = req.query.id as string;
    if (!originId) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de origen requerido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const originIdNum = Number.parseInt(originId, 10);
    if (Number.isNaN(originIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de origen inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar que el origen existe
    const existingOrigin = await db.findById('nubestock.tb_mae_origin', originIdNum);
    if (!existingOrigin) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Origen no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si hay productos usando este origen
    const productsUsingOrigin = await db.getConnection()
      .select('id')
      .from('nubestock.tb_ope_product')
      .where('id_origin', originIdNum)
      .where('is_active', true)
      .limit(1)
      .first();

    if (productsUsingOrigin) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'No se puede eliminar el origen porque está siendo usado por productos activos',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Soft delete: marcar como inactivo
    await db.update('nubestock.tb_mae_origin', originIdNum, {
      is_active: false,
      modification_date: new Date(),
    });

    context.res = {
      status: 200,
      body: {
        success: true,
        message: 'Origen eliminado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    handleError(context, error, 'eliminar origen');
  }
}
