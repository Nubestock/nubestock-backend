import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import { logger } from '../config/logger';
import { requireAuth } from '../middleware/authMiddleware';
import Joi from 'joi';

const db = Database.getInstance();

// ========== MACHINERY ALERTS (tb_ope_machinery_alert) ==========

export async function listMachineryAlerts(context: Context, req: HttpRequest): Promise<void> {
  try {
    const { id_mantainance, type, is_sent, user_id } = req.query;

    let query = db.getConnection()
      .select(
        'ma.*',
        'm.name as maintenance_name',
        'm.type as maintenance_type',
        'mc.name as machinery_name'
      )
      .from('nubestock.tb_ope_machinery_alert as ma')
      .leftJoin('nubestock.tb_mae_mantainance as m', 'ma.id_mantainance', 'm.id')
      .leftJoin('nubestock.tb_mae_machinery as mc', 'm.id_machinery', 'mc.id')
      .orderBy('ma.creation_date', 'desc');

    if (id_mantainance) {
      const idMaintenanceNum = Number.parseInt(id_mantainance as string, 10);
      if (!Number.isNaN(idMaintenanceNum)) {
        query = query.where('ma.id_mantainance', idMaintenanceNum);
      }
    }

    if (type) {
      query = query.where('ma.type', type);
    }

    if (is_sent !== undefined) {
      query = query.where('ma.is_sent', is_sent === 'true' || is_sent === true);
    }

    // Si se proporciona user_id, filtrar solo las alertas asignadas a ese usuario
    if (user_id) {
      const userIdNum = Number.parseInt(user_id as string, 10);
      if (!Number.isNaN(userIdNum)) {
        query = query
          .join('nubestock.tb_ope_alert_user as au', 'ma.id', 'au.id_machinery_alert')
          .where('au.id_user', userIdNum);
      }
    }

    const alerts = await query;

    context.res = {
      status: 200,
      body: {
        success: true,
        data: alerts,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al listar alertas de maquinaria:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al listar alertas de maquinaria',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function getUserAlerts(context: Context, req: HttpRequest): Promise<void> {
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

    const { is_read } = req.query;

    let query = db.getConnection()
      .select(
        'ma.id',
        'ma.title',
        'ma.message',
        'ma.type',
        'ma.date',
        'ma.creation_date',
        'au.is_read',
        'au.read_date',
        'm.name as maintenance_name',
        'm.type as maintenance_type',
        'mc.name as machinery_name'
      )
      .from('nubestock.tb_ope_machinery_alert as ma')
      .join('nubestock.tb_ope_alert_user as au', 'ma.id', 'au.id_machinery_alert')
      .leftJoin('nubestock.tb_mae_mantainance as m', 'ma.id_mantainance', 'm.id')
      .leftJoin('nubestock.tb_mae_machinery as mc', 'm.id_machinery', 'mc.id')
      .where('au.id_user', userIdNum)
      .orderBy('ma.creation_date', 'desc');

    if (is_read !== undefined) {
      query = query.where('au.is_read', is_read === 'true' || is_read === true);
    }

    const alerts = await query;

    context.res = {
      status: 200,
      body: {
        success: true,
        data: alerts,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener alertas del usuario:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener alertas del usuario',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function getMachineryAlert(context: Context, req: HttpRequest, alertId: string): Promise<void> {
  try {
    const alertIdNum = Number.parseInt(alertId, 10);
    if (Number.isNaN(alertIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de alerta inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const alert = await db.getConnection()
      .select(
        'ma.*',
        'm.name as maintenance_name',
        'm.type as maintenance_type',
        'mc.name as machinery_name'
      )
      .from('nubestock.tb_ope_machinery_alert as ma')
      .leftJoin('nubestock.tb_mae_mantainance as m', 'ma.id_mantainance', 'm.id')
      .leftJoin('nubestock.tb_mae_machinery as mc', 'm.id_machinery', 'mc.id')
      .where('ma.id', alertIdNum)
      .first();

    if (!alert) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Alerta no encontrada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: alert,
        message: 'Alerta obtenida exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener alerta:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener alerta',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function createMachineryAlert(context: Context, req: HttpRequest): Promise<void> {
  try {
    const alertSchema = Joi.object({
      id_mantainance: Joi.number().integer().required(),
      type: Joi.string().max(30).required(),
      date: Joi.date().required(),
      title: Joi.string().max(150).required(),
      message: Joi.string().required(),
      is_sent: Joi.boolean().default(false),
      user_ids: Joi.array().items(Joi.number().integer()).optional(),
    });

    const { error, value } = alertSchema.validate(req.body);

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

    // Crear la alerta dentro de una transacción
    const result = await db.transaction(async (trx) => {
      // Crear la alerta
      const [newAlert] = await trx('nubestock.tb_ope_machinery_alert')
        .insert({
          id_mantainance: value.id_mantainance,
          type: value.type,
          date: value.date,
          title: value.title,
          message: value.message,
          is_sent: value.is_sent !== undefined ? value.is_sent : false,
          creation_date: new Date(),
        })
        .returning('*');

      // Si se proporcionaron user_ids, asignar la alerta a esos usuarios
      if (value.user_ids && Array.isArray(value.user_ids) && value.user_ids.length > 0) {
        const alertUsers = value.user_ids.map((userId: number) => ({
          id_machinery_alert: newAlert.id,
          id_user: userId,
          is_read: false,
          creation_date: new Date(),
        }));

        await trx('nubestock.tb_ope_alert_user').insert(alertUsers);
      }

      return newAlert;
    });

    context.res = {
      status: 201,
      body: {
        success: true,
        data: result,
        message: 'Alerta creada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al crear alerta de maquinaria:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear alerta de maquinaria',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function markAlertAsRead(context: Context, req: HttpRequest, alertId: string): Promise<void> {
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

    const alertIdNum = Number.parseInt(alertId, 10);
    if (Number.isNaN(alertIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de alerta inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Actualizar el estado de lectura
    const [updated] = await db.getConnection()
      .where('id_machinery_alert', alertIdNum)
      .where('id_user', userIdNum)
      .update({
        is_read: true,
        read_date: new Date(),
        modification_date: new Date(),
      })
      .into('nubestock.tb_ope_alert_user')
      .returning('*');

    if (!updated) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Alerta no encontrada o no asignada al usuario',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updated,
        message: 'Alerta marcada como leída',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al marcar alerta como leída:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al marcar alerta como leída',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function assignAlertToUsers(
  context: Context,
  req: HttpRequest,
  alertId: string
): Promise<void> {
  try {
    const alertIdNum = Number.parseInt(alertId, 10);
    if (Number.isNaN(alertIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de alerta inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const assignSchema = Joi.object({
      user_ids: Joi.array().items(Joi.number().integer()).min(1).required(),
    });

    const { error, value } = assignSchema.validate(req.body);

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

    // Verificar que la alerta existe
    const alert = await db.getConnection()
      .select('*')
      .from('nubestock.tb_ope_machinery_alert')
      .where('id', alertIdNum)
      .first();

    if (!alert) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Alerta no encontrada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar que los usuarios existen y crear las asignaciones
    const alertUsers = value.user_ids.map((userId: number) => ({
      id_machinery_alert: alertIdNum,
      id_user: userId,
      is_read: false,
      creation_date: new Date(),
    }));

    // Insertar solo las que no existen ya
    for (const alertUser of alertUsers) {
      const exists = await db.getConnection()
        .select('*')
        .from('nubestock.tb_ope_alert_user')
        .where('id_machinery_alert', alertUser.id_machinery_alert)
        .where('id_user', alertUser.id_user)
        .first();

      if (!exists) {
        await db.getConnection()
          .insert(alertUser)
          .into('nubestock.tb_ope_alert_user');
      }
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        message: 'Alerta asignada a usuarios exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al asignar alerta a usuarios:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al asignar alerta a usuarios',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

// ========== USER DEVICES (tb_ope_user_device) ==========

export async function registerUserDevice(context: Context, req: HttpRequest): Promise<void> {
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

    const deviceSchema = Joi.object({
      device_token: Joi.string().required(),
      platform: Joi.string().valid('ios', 'android', 'web').required(),
    });

    const { error, value } = deviceSchema.validate(req.body);

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

    // Verificar si ya existe un dispositivo con ese token para este usuario
    const existingDevice = await db.getConnection()
      .select('*')
      .from('nubestock.tb_ope_user_device')
      .where('id_user', userIdNum)
      .where('device_token', value.device_token)
      .first();

    if (existingDevice) {
      // Actualizar el dispositivo existente
      const [updated] = await db.getConnection()
        .where('id', existingDevice.id)
        .update({
          platform: value.platform,
          is_active: true,
          modification_date: new Date(),
        })
        .into('nubestock.tb_ope_user_device')
        .returning('*');

      context.res = {
        status: 200,
        body: {
          success: true,
          data: updated,
          message: 'Dispositivo actualizado exitosamente',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Crear nuevo dispositivo
    const [newDevice] = await db.getConnection()
      .insert({
        id_user: userIdNum,
        device_token: value.device_token,
        platform: value.platform,
        is_active: true,
        creation_date: new Date(),
      })
      .into('nubestock.tb_ope_user_device')
      .returning('*');

    context.res = {
      status: 201,
      body: {
        success: true,
        data: newDevice,
        message: 'Dispositivo registrado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al registrar dispositivo:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al registrar dispositivo',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function getUserDevices(context: Context, req: HttpRequest): Promise<void> {
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

    const devices = await db.getConnection()
      .select('*')
      .from('nubestock.tb_ope_user_device')
      .where('id_user', userIdNum)
      .where('is_active', true)
      .orderBy('creation_date', 'desc');

    context.res = {
      status: 200,
      body: {
        success: true,
        data: devices,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener dispositivos del usuario:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener dispositivos del usuario',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function unregisterUserDevice(context: Context, req: HttpRequest, deviceId: string): Promise<void> {
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

    const deviceIdNum = Number.parseInt(deviceId, 10);
    if (Number.isNaN(deviceIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de dispositivo inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Marcar como inactivo
    await db.getConnection()
      .where('id', deviceIdNum)
      .where('id_user', userIdNum)
      .update({
        is_active: false,
        modification_date: new Date(),
      })
      .into('nubestock.tb_ope_user_device');

    context.res = {
      status: 200,
      body: {
        success: true,
        message: 'Dispositivo desregistrado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al desregistrar dispositivo:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al desregistrar dispositivo',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
