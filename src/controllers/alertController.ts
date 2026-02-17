import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import { requireAuth } from '../middleware/authMiddleware';
import { createAlert } from '../utils/alertHelper';
import Joi from 'joi';
import { createErrorResponse, handleError, validateId } from '../utils/controllerHelpers';

const db = Database.getInstance();

// Helper functions specific to alerts

/**
 * Valida alertId y retorna respuesta 400 si es inválido
 * Retorna el número parseado si es válido, null si se estableció respuesta de error
 */
function validateAlertId(context: Context, alertId: string): number | null {
  return validateId(context, alertId, 'alerta');
}

/**
 * Busca una alerta por ID y valida que exista
 * Retorna la alerta si existe, null si no existe (y establece respuesta 404)
 */
async function findAndValidateAlert(context: Context, alertIdNum: number): Promise<any | null> {
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
    return null;
  }
  return alert;
}

/**
 * Mapea una alerta a formato estándar de respuesta
 */
function mapAlert(alert: any): any {
  return {
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
  };
}


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
      (typeof authResult.user.userId === 'string' ? Number.parseInt(authResult.user.userId, 10) : authResult.user.userId) 
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
      context.res = createErrorResponse(500, 'Error al crear la alerta');
      return;
    }

    context.res = {
      status: 201,
      body: {
        success: true,
        data: mapAlert(newAlert),
        message: 'Alerta creada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    handleError(context, error, 'crear alerta');
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

    context.res = {
      status: 200,
      body: {
        success: true,
        data: alerts.map(mapAlert),
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    handleError(context, error, 'listar alertas');
  }
}

export async function getAlert(context: Context, req: HttpRequest, alertId: string): Promise<void> {
  try {
    const alertIdNum = validateAlertId(context, alertId);
    if (alertIdNum === null) return;

    const alert = await findAndValidateAlert(context, alertIdNum);
    if (!alert) return;

    context.res = {
      status: 200,
      body: {
        success: true,
        data: mapAlert(alert),
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    handleError(context, error, 'obtener alerta');
  }
}

export async function acknowledgeAlert(context: Context, req: HttpRequest, alertId: string): Promise<void> {
  try {
    const alertIdNum = validateAlertId(context, alertId);
    if (alertIdNum === null) return;

    const alert = await findAndValidateAlert(context, alertIdNum);
    if (!alert) return;

    const updatedAlert = await db.update('nubestock.tb_mae_alert', alertIdNum, {
      modification_date: new Date(),
    });

    if (!updatedAlert) {
      context.res = createErrorResponse(500, 'Error al reconocer la alerta');
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
    handleError(context, error, 'reconocer alerta');
  }
}

export async function resolveAlert(context: Context, req: HttpRequest, alertId: string): Promise<void> {
  try {
    const alertIdNum = validateAlertId(context, alertId);
    if (alertIdNum === null) return;

    const alert = await findAndValidateAlert(context, alertIdNum);
    if (!alert) return;

    const authResult = requireAuth(req);
    if (!authResult.success || !authResult.user) {
      context.res = createErrorResponse(401, 'Usuario no autenticado');
      return;
    }

    const resolvedBy = authResult.user.userId;
    if (!resolvedBy) {
      context.res = createErrorResponse(400, 'No se pudo obtener el ID del usuario');
      return;
    }

    const resolvedByNum = typeof resolvedBy === 'string' ? Number.parseInt(resolvedBy, 10) : resolvedBy;

    const updatedAlert = await db.update('nubestock.tb_mae_alert', alertIdNum, {
      is_active: false,
      resolved_at: new Date(),
      resolved_by: resolvedByNum,
      modification_date: new Date(),
    });

    if (!updatedAlert) {
      context.res = createErrorResponse(500, 'Error al resolver la alerta');
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
    handleError(context, error, 'resolver alerta');
  }
}

export async function dismissAlert(context: Context, req: HttpRequest, alertId: string): Promise<void> {
  try {
    const alertIdNum = validateAlertId(context, alertId);
    if (alertIdNum === null) return;

    const alert = await findAndValidateAlert(context, alertIdNum);
    if (!alert) return;

    const updatedAlert = await db.update('nubestock.tb_mae_alert', alertIdNum, {
      is_active: false,
      modification_date: new Date(),
    });

    if (!updatedAlert) {
      context.res = createErrorResponse(500, 'Error al descartar la alerta');
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
    handleError(context, error, 'descartar alerta');
  }
}

export async function updateAlert(context: Context, req: HttpRequest, alertId: string): Promise<void> {
  try {
    const alertIdNum = validateAlertId(context, alertId);
    if (alertIdNum === null) return;

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

    const alert = await findAndValidateAlert(context, alertIdNum);
    if (!alert) return;

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
      context.res = createErrorResponse(500, 'Error al actualizar alerta');
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
    handleError(context, error, 'actualizar alerta');
  }
}

export async function deleteAlert(context: Context, req: HttpRequest, alertId: string): Promise<void> {
  try {
    const alertIdNum = validateAlertId(context, alertId);
    if (alertIdNum === null) return;

    const alert = await findAndValidateAlert(context, alertIdNum);
    if (!alert) return;

    const deleted = await db.delete('nubestock.tb_mae_alert', alertIdNum);

    if (!deleted) {
      context.res = createErrorResponse(500, 'Error al eliminar alerta');
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
    handleError(context, error, 'eliminar alerta');
  }
}
