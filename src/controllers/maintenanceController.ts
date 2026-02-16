import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import { logger } from '../config/logger';
import { Maintenance, MaintenanceHistory, MaintenanceDetails } from '../interfaces';
import { requireAuth } from '../middleware/authMiddleware';
import Joi from 'joi';

const db = Database.getInstance();

// ========== MAINTENANCE (tb_mae_mantainance) ==========

export async function listMaintenances(context: Context, req: HttpRequest): Promise<void> {
  try {
    const { id_machinery, type, is_active } = req.query;

    let query = db.getConnection()
      .select(
        'm.*',
        'mc.name as machinery_name',
        'mc.description as machinery_description'
      )
      .from('nubestock.tb_mae_mantainance as m')
      .leftJoin('nubestock.tb_mae_machinery as mc', 'm.id_machinery', 'mc.id')
      .orderBy('m.creation_date', 'desc');

    if (id_machinery) {
      const idMachineryNum = Number.parseInt(id_machinery as string, 10);
      if (!Number.isNaN(idMachineryNum)) {
        query = query.where('m.id_machinery', idMachineryNum);
      }
    }

    if (type) {
      query = query.where('m.type', type);
    }

    if (is_active !== undefined) {
      query = query.where('m.is_active', is_active === 'true' || is_active === true);
    }

    const maintenances = await query;

    context.res = {
      status: 200,
      body: {
        success: true,
        data: maintenances,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al listar mantenimientos:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al listar mantenimientos',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function getMaintenance(context: Context, req: HttpRequest, maintenanceId: string): Promise<void> {
  try {
    const maintenanceIdNum = Number.parseInt(maintenanceId, 10);
    if (Number.isNaN(maintenanceIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de mantenimiento inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const maintenance = await db.getConnection()
      .select(
        'm.*',
        'mc.name as machinery_name',
        'mc.description as machinery_description'
      )
      .from('nubestock.tb_mae_mantainance as m')
      .leftJoin('nubestock.tb_mae_machinery as mc', 'm.id_machinery', 'mc.id')
      .where('m.id', maintenanceIdNum)
      .first();

    if (!maintenance) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Mantenimiento no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: maintenance,
        message: 'Mantenimiento obtenido exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener mantenimiento:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener mantenimiento',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function createMaintenance(context: Context, req: HttpRequest): Promise<void> {
  try {
    const maintenanceSchema = Joi.object({
      id_machinery: Joi.number().integer().required(),
      name: Joi.string().min(1).max(100).required(),
      type: Joi.string().valid('PRV', 'COR').required(),
      is_active: Joi.boolean().default(true),
      next_maintainance_value: Joi.number().integer().positive().allow(null).optional(),
      last_mantainance_date: Joi.date().required(),
    });

    const { error, value } = maintenanceSchema.validate(req.body);

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

    // Verificar que la maquinaria existe
    const machinery = await db.getConnection()
      .select('*')
      .from('nubestock.tb_mae_machinery')
      .where('id', value.id_machinery)
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

    const [newMaintenance] = await db.getConnection()
      .insert({
        id_machinery: value.id_machinery,
        name: value.name,
        type: value.type,
        is_active: value.is_active !== undefined ? value.is_active : true,
        next_maintainance_value: value.next_maintainance_value || null,
        last_mantainance_date: value.last_mantainance_date,
        creation_date: new Date(),
      })
      .into('nubestock.tb_mae_mantainance')
      .returning('*');

    context.res = {
      status: 201,
      body: {
        success: true,
        data: newMaintenance,
        message: 'Mantenimiento creado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al crear mantenimiento:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear mantenimiento',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function updateMaintenance(context: Context, req: HttpRequest, maintenanceId: string): Promise<void> {
  try {
    const maintenanceIdNum = Number.parseInt(maintenanceId, 10);
    if (Number.isNaN(maintenanceIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de mantenimiento inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const maintenanceSchema = Joi.object({
      id_machinery: Joi.number().integer().optional(),
      name: Joi.string().min(1).max(100).optional(),
      type: Joi.string().valid('PRV', 'COR').optional(),
      is_active: Joi.boolean().optional(),
      next_maintainance_value: Joi.number().integer().positive().allow(null).optional(),
      last_mantainance_date: Joi.date().optional(),
    });

    const { error, value } = maintenanceSchema.validate(req.body);

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

    // Si se actualiza id_machinery, verificar que existe
    if (value.id_machinery !== undefined) {
      const machinery = await db.getConnection()
        .select('*')
        .from('nubestock.tb_mae_machinery')
        .where('id', value.id_machinery)
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
    }

    const updateData: any = {
      modification_date: new Date(),
    };

    if (value.id_machinery !== undefined) {
      updateData.id_machinery = value.id_machinery;
    }

    if (value.name !== undefined) {
      updateData.name = value.name;
    }

    if (value.type !== undefined) {
      updateData.type = value.type;
    }

    if (value.is_active !== undefined) {
      updateData.is_active = value.is_active;
    }

    if (value.next_maintainance_value !== undefined) {
      updateData.next_maintainance_value = value.next_maintainance_value;
    }

    if (value.last_mantainance_date !== undefined) {
      updateData.last_mantainance_date = value.last_mantainance_date;
    }

    const [updatedMaintenance] = await db.getConnection()
      .where('id', maintenanceIdNum)
      .update(updateData)
      .into('nubestock.tb_mae_mantainance')
      .returning('*');

    if (!updatedMaintenance) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Mantenimiento no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedMaintenance,
        message: 'Mantenimiento actualizado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al actualizar mantenimiento:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al actualizar mantenimiento',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function deleteMaintenance(context: Context, req: HttpRequest, maintenanceId: string): Promise<void> {
  try {
    const maintenanceIdNum = Number.parseInt(maintenanceId, 10);
    if (Number.isNaN(maintenanceIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de mantenimiento inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si existe
    const maintenance = await db.getConnection()
      .select('*')
      .from('nubestock.tb_mae_mantainance')
      .where('id', maintenanceIdNum)
      .first();

    if (!maintenance) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Mantenimiento no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Soft delete: marcar como inactivo
    await db.getConnection()
      .where('id', maintenanceIdNum)
      .update({
        is_active: false,
        modification_date: new Date(),
      })
      .into('nubestock.tb_mae_mantainance');

    context.res = {
      status: 200,
      body: {
        success: true,
        message: 'Mantenimiento eliminado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al eliminar mantenimiento:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al eliminar mantenimiento',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

// ========== MAINTENANCE HISTORY (tb_ope_mantainance_history) ==========

export async function listMaintenanceHistory(context: Context, req: HttpRequest): Promise<void> {
  try {
    const { id_mantainance, id_machinery } = req.query;

    let query = db.getConnection()
      .select(
        'h.*',
        'm.name as maintenance_name',
        'm.type as maintenance_type',
        'mc.name as machinery_name',
        'u.name as user_name',
        'u.email as user_email'
      )
      .from('nubestock.tb_ope_mantainance_history as h')
      .leftJoin('nubestock.tb_mae_mantainance as m', 'h.id_mantainance', 'm.id')
      .leftJoin('nubestock.tb_mae_machinery as mc', 'm.id_machinery', 'mc.id')
      .leftJoin('nubestock.tb_mae_user as u', 'h.id_user', 'u.id')
      .orderBy('h.creation_date', 'desc');

    if (id_mantainance) {
      const idMaintenanceNum = Number.parseInt(id_mantainance as string, 10);
      if (!Number.isNaN(idMaintenanceNum)) {
        query = query.where('h.id_mantainance', idMaintenanceNum);
      }
    }

    if (id_machinery) {
      const idMachineryNum = Number.parseInt(id_machinery as string, 10);
      if (!Number.isNaN(idMachineryNum)) {
        query = query.where('m.id_machinery', idMachineryNum);
      }
    }

    const history = await query;

    // Parsear details JSON para cada registro
    const parsedHistory = history.map((item: any) => {
      try {
        const details = typeof item.details === 'string' ? JSON.parse(item.details) : item.details;
        return {
          ...item,
          details,
        };
      } catch {
        return {
          ...item,
          details: { attachments: [] },
        };
      }
    });

    context.res = {
      status: 200,
      body: {
        success: true,
        data: parsedHistory,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al listar historial de mantenimientos:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al listar historial de mantenimientos',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function getMaintenanceHistory(context: Context, req: HttpRequest, historyId: string): Promise<void> {
  try {
    const historyIdNum = Number.parseInt(historyId, 10);
    if (Number.isNaN(historyIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de historial inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const history = await db.getConnection()
      .select(
        'h.*',
        'm.name as maintenance_name',
        'm.type as maintenance_type',
        'mc.name as machinery_name',
        'u.name as user_name',
        'u.email as user_email'
      )
      .from('nubestock.tb_ope_mantainance_history as h')
      .leftJoin('nubestock.tb_mae_mantainance as m', 'h.id_mantainance', 'm.id')
      .leftJoin('nubestock.tb_mae_machinery as mc', 'm.id_machinery', 'mc.id')
      .leftJoin('nubestock.tb_mae_user as u', 'h.id_user', 'u.id')
      .where('h.id', historyIdNum)
      .first();

    if (!history) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Historial de mantenimiento no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Parsear details JSON
    let details;
    try {
      details = typeof history.details === 'string' ? JSON.parse(history.details) : history.details;
    } catch {
      details = { attachments: [] };
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: {
          ...history,
          details,
        },
        message: 'Historial de mantenimiento obtenido exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener historial de mantenimiento:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener historial de mantenimiento',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function createMaintenanceHistory(context: Context, req: HttpRequest): Promise<void> {
  try {
    // Obtener usuario autenticado
    const authResult = requireAuth(req);
    if (!authResult.success || !authResult.user) {
      context.res = {
        status: 401,
        body: {
          success: false,
          message: 'Usuario no autenticado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const userId = authResult.user.userId;
    const userIdNum = typeof userId === 'string' ? Number.parseInt(userId, 10) : userId;

    const historySchema = Joi.object({
      id_mantainance: Joi.number().integer().required(),
      details: Joi.object({
        attachments: Joi.array().items(
          Joi.object({
            id: Joi.number().integer().required(),
            content: Joi.string().required(),
          })
        ).required(),
      }).required(),
      price: Joi.number().positive().required(),
      next_mantainance_date: Joi.date().allow(null).optional(),
    });

    const { error, value } = historySchema.validate(req.body);

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

    // Verificar que el mantenimiento existe
    const maintenance = await db.getConnection()
      .select('*')
      .from('nubestock.tb_mae_mantainance')
      .where('id', value.id_mantainance)
      .first();

    if (!maintenance) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Mantenimiento no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Convertir details a JSON string
    const detailsJson = JSON.stringify(value.details);

    const [newHistory] = await db.getConnection()
      .insert({
        id_mantainance: value.id_mantainance,
        id_user: userIdNum,
        details: detailsJson,
        price: value.price,
        next_mantainance_date: value.next_mantainance_date || null,
        creation_date: new Date(),
      })
      .into('nubestock.tb_ope_mantainance_history')
      .returning('*');

    // Parsear details en la respuesta
    let details;
    try {
      details = typeof newHistory.details === 'string' ? JSON.parse(newHistory.details) : newHistory.details;
    } catch {
      details = { attachments: [] };
    }

    context.res = {
      status: 201,
      body: {
        success: true,
        data: {
          ...newHistory,
          details,
        },
        message: 'Historial de mantenimiento creado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al crear historial de mantenimiento:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear historial de mantenimiento',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function updateMaintenanceHistory(context: Context, req: HttpRequest, historyId: string): Promise<void> {
  try {
    const historyIdNum = Number.parseInt(historyId, 10);
    if (Number.isNaN(historyIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de historial inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const historySchema = Joi.object({
      details: Joi.object({
        attachments: Joi.array().items(
          Joi.object({
            id: Joi.number().integer().required(),
            content: Joi.string().required(),
          })
        ).required(),
      }).optional(),
      price: Joi.number().positive().optional(),
      next_mantainance_date: Joi.date().allow(null).optional(),
    });

    const { error, value } = historySchema.validate(req.body);

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

    if (value.details !== undefined) {
      updateData.details = JSON.stringify(value.details);
    }

    if (value.price !== undefined) {
      updateData.price = value.price;
    }

    if (value.next_mantainance_date !== undefined) {
      updateData.next_mantainance_date = value.next_mantainance_date;
    }

    const [updatedHistory] = await db.getConnection()
      .where('id', historyIdNum)
      .update(updateData)
      .into('nubestock.tb_ope_mantainance_history')
      .returning('*');

    if (!updatedHistory) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Historial de mantenimiento no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Parsear details en la respuesta
    let details;
    try {
      details = typeof updatedHistory.details === 'string' ? JSON.parse(updatedHistory.details) : updatedHistory.details;
    } catch {
      details = { attachments: [] };
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: {
          ...updatedHistory,
          details,
        },
        message: 'Historial de mantenimiento actualizado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al actualizar historial de mantenimiento:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al actualizar historial de mantenimiento',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function deleteMaintenanceHistory(context: Context, req: HttpRequest, historyId: string): Promise<void> {
  try {
    const historyIdNum = Number.parseInt(historyId, 10);
    if (Number.isNaN(historyIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de historial inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si existe
    const history = await db.getConnection()
      .select('*')
      .from('nubestock.tb_ope_mantainance_history')
      .where('id', historyIdNum)
      .first();

    if (!history) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Historial de mantenimiento no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Eliminar físicamente (no hay soft delete en esta tabla)
    await db.getConnection()
      .where('id', historyIdNum)
      .delete()
      .from('nubestock.tb_ope_mantainance_history');

    context.res = {
      status: 200,
      body: {
        success: true,
        message: 'Historial de mantenimiento eliminado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al eliminar historial de mantenimiento:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al eliminar historial de mantenimiento',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
