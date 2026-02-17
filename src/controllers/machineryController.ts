import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import { Machinery } from '../interfaces';
import Joi from 'joi';
import { validateSchema, createErrorResponse, handleError, validateId } from '../utils/controllerHelpers';

const db = Database.getInstance();

// Helper functions specific to machinery

/**
 * Valida machineryId y retorna respuesta 400 si es inválido
 * Retorna el número parseado si es válido, null si se estableció respuesta de error
 */
function validateMachineryId(context: Context, machineryId: string): number | null {
  return validateId(context, machineryId, 'maquinaria');
}

/**
 * Busca una maquinaria por ID y valida que exista
 * Retorna la maquinaria si existe, null si no existe (y establece respuesta 404)
 */
async function findAndValidateMachinery(context: Context, machineryIdNum: number): Promise<any | null> {
  const machinery = await db.getConnection()
    .select('*')
    .from('nubestock.tb_mae_machinery')
    .where('id', machineryIdNum)
    .first();

  if (!machinery) {
    context.res = {
      status: 404,
      body: {
        success: false,
        message: 'Maquinaria no encontrada',
        timestamp: new Date().toISOString(),
      },
    };
    return null;
  }
  return machinery;
}


export async function listMachinery(context: Context, req: HttpRequest): Promise<void> {
  try {
    const { search, is_active } = req.query;

    let query = db.getConnection()
      .select('*')
      .from('nubestock.tb_mae_machinery')
      .orderBy('creation_date', 'desc');

    if (is_active !== undefined) {
      query = query.where('is_active', is_active === 'true' || is_active === true);
    }

    if (search) {
      query = query.where(function() {
        this.where('name', 'ilike', `%${search}%`)
          .orWhere('description', 'ilike', `%${search}%`);
      });
    }

    const machinery = await query;

    context.res = {
      status: 200,
      body: {
        success: true,
        data: machinery,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    handleError(context, error, 'listar maquinaria');
  }
}

export async function getMachinery(context: Context, req: HttpRequest, machineryId: string): Promise<void> {
  try {
    const machineryIdNum = validateMachineryId(context, machineryId);
    if (machineryIdNum === null) return;

    const machinery = await findAndValidateMachinery(context, machineryIdNum);
    if (!machinery) return;

    context.res = {
      status: 200,
      body: {
        success: true,
        data: machinery,
        message: 'Maquinaria obtenida exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    handleError(context, error, 'obtener maquinaria');
  }
}

export async function createMachinery(context: Context, req: HttpRequest): Promise<void> {
  try {
    const machinerySchema = Joi.object({
      name: Joi.string().min(1).max(100).required(),
      description: Joi.string().min(1).max(100).required(),
      is_active: Joi.boolean().default(true),
    });

    const value = validateSchema(context, machinerySchema, req.body);
    if (value === null) return;

    const [newMachinery] = await db.getConnection()
      .insert({
        name: value.name,
        description: value.description,
        is_active: value.is_active !== undefined ? value.is_active : true,
        creation_date: new Date(),
      })
      .into('nubestock.tb_mae_machinery')
      .returning('*');

    context.res = {
      status: 201,
      body: {
        success: true,
        data: newMachinery,
        message: 'Maquinaria creada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    handleError(context, error, 'crear maquinaria');
  }
}

export async function updateMachinery(context: Context, req: HttpRequest, machineryId: string): Promise<void> {
  try {
    const machineryIdNum = validateMachineryId(context, machineryId);
    if (machineryIdNum === null) return;

    const machinerySchema = Joi.object({
      name: Joi.string().min(1).max(100).optional(),
      description: Joi.string().min(1).max(100).optional(),
      is_active: Joi.boolean().optional(),
    });

    const value = validateSchema(context, machinerySchema, req.body);
    if (value === null) return;

    const updateData: any = {
      modification_date: new Date(),
    };

    if (value.name !== undefined) {
      updateData.name = value.name;
    }

    if (value.description !== undefined) {
      updateData.description = value.description;
    }

    if (value.is_active !== undefined) {
      updateData.is_active = value.is_active;
    }

    const [updatedMachinery] = await db.getConnection()
      .where('id', machineryIdNum)
      .update(updateData)
      .into('nubestock.tb_mae_machinery')
      .returning('*');

    if (!updatedMachinery) {
      context.res = createErrorResponse(404, 'Maquinaria no encontrada');
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedMachinery,
        message: 'Maquinaria actualizada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    handleError(context, error, 'actualizar maquinaria');
  }
}

export async function deleteMachinery(context: Context, req: HttpRequest, machineryId: string): Promise<void> {
  try {
    const machineryIdNum = validateMachineryId(context, machineryId);
    if (machineryIdNum === null) return;

    const machinery = await findAndValidateMachinery(context, machineryIdNum);
    if (!machinery) return;

    // Soft delete: marcar como inactivo
    await db.getConnection()
      .where('id', machineryIdNum)
      .update({
        is_active: false,
        modification_date: new Date(),
      })
      .into('nubestock.tb_mae_machinery');

    context.res = {
      status: 200,
      body: {
        success: true,
        message: 'Maquinaria eliminada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    handleError(context, error, 'eliminar maquinaria');
  }
}
