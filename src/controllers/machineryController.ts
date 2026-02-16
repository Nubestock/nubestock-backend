import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import { logger } from '../config/logger';
import { Machinery } from '../interfaces';
import Joi from 'joi';

const db = Database.getInstance();

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
    logger.error('Error al listar maquinaria:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al listar maquinaria',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function getMachinery(context: Context, req: HttpRequest, machineryId: string): Promise<void> {
  try {
    const machineryIdNum = Number.parseInt(machineryId, 10);
    if (Number.isNaN(machineryIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de maquinaria inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

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
      return;
    }

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
    logger.error('Error al obtener maquinaria:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener maquinaria',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function createMachinery(context: Context, req: HttpRequest): Promise<void> {
  try {
    const machinerySchema = Joi.object({
      name: Joi.string().min(1).max(100).required(),
      description: Joi.string().min(1).max(100).required(),
      is_active: Joi.boolean().default(true),
    });

    const { error, value } = machinerySchema.validate(req.body);

    if (error) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
          })),
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

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
    logger.error('Error al crear maquinaria:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear maquinaria',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function updateMachinery(context: Context, req: HttpRequest, machineryId: string): Promise<void> {
  try {
    const machineryIdNum = Number.parseInt(machineryId, 10);
    if (Number.isNaN(machineryIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de maquinaria inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const machinerySchema = Joi.object({
      name: Joi.string().min(1).max(100).optional(),
      description: Joi.string().min(1).max(100).optional(),
      is_active: Joi.boolean().optional(),
    });

    const { error, value } = machinerySchema.validate(req.body);

    if (error) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
          })),
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

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
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Maquinaria no encontrada',
          timestamp: new Date().toISOString(),
        },
      };
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
    logger.error('Error al actualizar maquinaria:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al actualizar maquinaria',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function deleteMachinery(context: Context, req: HttpRequest, machineryId: string): Promise<void> {
  try {
    const machineryIdNum = Number.parseInt(machineryId, 10);
    if (Number.isNaN(machineryIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de maquinaria inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si existe
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
      return;
    }

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
    logger.error('Error al eliminar maquinaria:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al eliminar maquinaria',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
