import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import { logger } from '../config/logger';
import { requireAuth } from '../middleware/authMiddleware';
import { createAlert } from '../utils/alertHelper';
import Joi from 'joi';

const db = Database.getInstance();

export async function createAlertHandler(context: Context, req: HttpRequest): Promise<void> {
  try {
    const createSchema = Joi.object({
      alert_type: Joi.string().required().valid('stock_low', 'maintenance', 'payment_overdue', 'production', 'custom'),
      alert_title: Joi.string().required().max(200),
      alert_message: Joi.string().required(),
      entity_type: Joi.string().max(50).optional(),
      id_transaction: Joi.number().integer().optional(),
      priority: Joi.string().valid('low', 'medium', 'high').default('medium'),
      due_date: Joi.date().optional().allow(null),
      is_active: Joi.boolean().default(true),
    });

    const { error, value } = createSchema.validate(req.body);
    
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

    // Obtener usuario autenticado para resolved_by
    const authResult = requireAuth(req);
    const userId = authResult.user?.userId ? 
      (typeof authResult.user.userId === 'string' ? parseInt(authResult.user.userId, 10) : authResult.user.userId) 
      : 1;

    // Crear la alerta usando la función reutilizable
    const newAlert = await createAlert(
      {
        alert_type: value.alert_type,
        alert_title: value.alert_title,
        alert_message: value.alert_message,
        entity_type: value.entity_type,
        id_transaction: value.id_transaction,
        priority: value.priority,
        due_date: value.due_date,
        is_active: value.is_active,
        resolved_by: userId,
      },
      {
        checkDuplicates: true,
        failSilently: false, // En el endpoint queremos saber si falla
      }
    );

    if (!newAlert) {
      context.res = {
        status: 500,
        body: {
          success: false,
          message: 'Error al crear la alerta',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Mapear respuesta
    const mappedAlert = {
      id: newAlert.id,
      alert_type: newAlert.alert_type,
      alert_title: newAlert.alert_title,
      alert_message: newAlert.alert_message,
      entity_type: newAlert.entity_type,
      id_transaction: newAlert.id_transaction,
      priority: newAlert.priority,
      is_active: newAlert.is_active,
      resolved_by: newAlert.resolved_by,
      creation_date: newAlert.creation_date,
      modification_date: newAlert.modification_date,
      resolved_at: newAlert.resolved_at,
      due_date: newAlert.due_date,
    };

    context.res = {
      status: 201,
      body: {
        success: true,
        data: mappedAlert,
        message: 'Alerta creada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    logger.error('Error al crear alerta:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: error.message || 'Error al crear alerta',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function listAlerts(context: Context, req: HttpRequest): Promise<void> {
  try {
    const { is_active, entity_type, priority } = req.query;
    
    let query = db.getConnection()
      .select('*')
      .from('nubestock.tb_mae_alert')
      .orderBy('creation_date', 'desc');

    // Filtros opcionales
    if (is_active !== undefined) {
      query = query.where('is_active', is_active === 'true' || is_active === true);
    }

    if (entity_type) {
      query = query.where('entity_type', entity_type as string);
    }

    if (priority) {
      query = query.where('priority', priority as string);
    }

    const alerts = await query;

    // Mapear a formato esperado (mantener compatibilidad con API existente)
    const mappedAlerts = alerts.map((alert: any) => ({
      id: alert.id,
      alert_type: alert.alert_type,
      alert_title: alert.alert_title,
      alert_message: alert.alert_message,
      entity_type: alert.entity_type,
      id_transaction: alert.id_transaction,
      priority: alert.priority,
      is_active: alert.is_active,
      creation_date: alert.creation_date,
      modification_date: alert.modification_date,
      resolved_at: alert.resolved_at,
      resolved_by: alert.resolved_by,
      due_date: alert.due_date,
    }));

    context.res = {
      status: 200,
      body: {
        success: true,
        data: mappedAlerts,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al listar alertas:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al listar alertas',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function getAlert(context: Context, req: HttpRequest, alertId: string): Promise<void> {
  try {
    const alertIdNum = parseInt(alertId, 10);
    if (isNaN(alertIdNum)) {
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

    const alert = await db.findById('nubestock.tb_mae_alert', alertIdNum);

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

    const mappedAlert = {
      id: (alert as any).id,
      alert_type: (alert as any).alert_type,
      alert_title: (alert as any).alert_title,
      alert_message: (alert as any).alert_message,
      entity_type: (alert as any).entity_type,
      id_transaction: (alert as any).id_transaction,
      priority: (alert as any).priority,
      is_active: (alert as any).is_active,
      creation_date: (alert as any).creation_date,
      modification_date: (alert as any).modification_date,
      resolved_at: (alert as any).resolved_at,
      resolved_by: (alert as any).resolved_by,
      due_date: (alert as any).due_date,
    };

    context.res = {
      status: 200,
      body: {
        success: true,
        data: mappedAlert,
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

export async function acknowledgeAlert(context: Context, req: HttpRequest, alertId: string): Promise<void> {
  try {
    const alertIdNum = parseInt(alertId, 10);
    if (isNaN(alertIdNum)) {
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

    const alert = await db.findById('nubestock.tb_mae_alert', alertIdNum);

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

    // Note: New schema doesn't have status field, just is_active
    const updatedAlert = await db.update('nubestock.tb_mae_alert', alertIdNum, {
      modification_date: new Date(),
    });

    if (!updatedAlert) {
      context.res = {
        status: 500,
        body: {
          success: false,
          message: 'Error al reconocer la alerta',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedAlert,
        message: 'Alerta reconocida exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al reconocer alerta:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al reconocer la alerta',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function resolveAlert(context: Context, req: HttpRequest, alertId: string): Promise<void> {
  try {
    const alertIdNum = parseInt(alertId, 10);
    if (isNaN(alertIdNum)) {
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

    const alert = await db.findById('nubestock.tb_mae_alert', alertIdNum);

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

    const resolvedBy = authResult.user.userId;
    if (!resolvedBy) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'No se pudo obtener el ID del usuario',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const resolvedByNum = typeof resolvedBy === 'string' ? parseInt(resolvedBy, 10) : resolvedBy;

    const updatedAlert = await db.update('nubestock.tb_mae_alert', alertIdNum, {
      is_active: false,
      resolved_at: new Date(),
      resolved_by: resolvedByNum,
      modification_date: new Date(),
    });

    if (!updatedAlert) {
      context.res = {
        status: 500,
        body: {
          success: false,
          message: 'Error al resolver la alerta',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedAlert,
        message: 'Alerta resuelta exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al resolver alerta:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al resolver la alerta',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function dismissAlert(context: Context, req: HttpRequest, alertId: string): Promise<void> {
  try {
    const alertIdNum = parseInt(alertId, 10);
    if (isNaN(alertIdNum)) {
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

    const alert = await db.findById('nubestock.tb_mae_alert', alertIdNum);

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

    // Note: New schema doesn't have status field, just is_active
    const updatedAlert = await db.update('nubestock.tb_mae_alert', alertIdNum, {
      is_active: false,
      modification_date: new Date(),
    });

    if (!updatedAlert) {
      context.res = {
        status: 500,
        body: {
          success: false,
          message: 'Error al descartar la alerta',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedAlert,
        message: 'Alerta descartada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al descartar alerta:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al descartar la alerta',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function updateAlert(context: Context, req: HttpRequest, alertId: string): Promise<void> {
  try {
    const alertIdNum = parseInt(alertId, 10);
    if (isNaN(alertIdNum)) {
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

    const updateSchema = Joi.object({
      is_active: Joi.boolean().optional(),
      priority: Joi.string().valid('low', 'medium', 'high').optional(),
      alert_title: Joi.string().optional(),
      alert_message: Joi.string().optional(),
      due_date: Joi.date().optional().allow(null),
    });

    const { error, value } = updateSchema.validate(req.body);
    
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

    const alert = await db.findById('nubestock.tb_mae_alert', alertIdNum);
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

    const updateData: any = {
      modification_date: new Date(),
    };

    if (value.is_active !== undefined) {
      updateData.is_active = value.is_active;
    }

    if (value.priority) {
      updateData.priority = value.priority;
    }

    if (value.alert_title) {
      updateData.alert_title = value.alert_title;
    }

    if (value.alert_message) {
      updateData.alert_message = value.alert_message;
    }

    if (value.due_date !== undefined) {
      updateData.due_date = value.due_date;
    }

    const updatedAlert = await db.update('nubestock.tb_mae_alert', alertIdNum, updateData);

    if (!updatedAlert) {
      context.res = {
        status: 500,
        body: {
          success: false,
          message: 'Error al actualizar alerta',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedAlert,
        message: 'Alerta actualizada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al actualizar alerta:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al actualizar alerta',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function deleteAlert(context: Context, req: HttpRequest, alertId: string): Promise<void> {
  try {
    const alertIdNum = parseInt(alertId, 10);
    if (isNaN(alertIdNum)) {
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

    const alert = await db.findById('nubestock.tb_mae_alert', alertIdNum);
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

    const deleted = await db.delete('nubestock.tb_mae_alert', alertIdNum);

    if (!deleted) {
      context.res = {
        status: 500,
        body: {
          success: false,
          message: 'Error al eliminar alerta',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        message: 'Alerta eliminada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al eliminar alerta:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al eliminar alerta',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
