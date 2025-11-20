import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { Database } from '../src/config/database';
import { logger } from '../src/config/logger';
import { requireAuth } from '../src/middleware/authMiddleware';
import Joi from 'joi';

const db = Database.getInstance();

const alertsHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    const { action } = req.params;
    const method = req.method;
    
    logger.info('Alerts function triggered', {
      action,
      method,
      url: req.url,
    });

    // Verificar autenticación
    const authResult = requireAuth(req);
    if (!authResult.success) {
      context.res = {
        status: 401,
        body: {
          success: false,
          message: authResult.error || 'Usuario no autenticado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    switch (method) {
      case 'GET':
        if (action) {
          await handleGetAlert(context, req, action);
        } else {
          await handleListAlerts(context, req);
        }
        break;
      case 'PUT':
        if (action) {
          // Verificar si el body contiene acciones especiales
          const body = req.body || {};
          
          if (body.acknowledge) {
            await handleAcknowledgeAlert(context, req, action);
          } else if (body.resolve) {
            await handleResolveAlert(context, req, action);
          } else if (body.dismiss) {
            await handleDismissAlert(context, req, action);
          } else {
            // Si action es un ID, actualizar alerta normalmente
            await handleUpdateAlert(context, req, action);
          }
        } else {
          context.res = {
            status: 400,
            body: {
              success: false,
              message: 'ID de alerta requerido',
              timestamp: new Date().toISOString(),
            },
          };
        }
        break;
      case 'DELETE':
        if (action) {
          await handleDeleteAlert(context, req, action);
        } else {
          context.res = {
            status: 400,
            body: {
              success: false,
              message: 'ID de alerta requerido',
              timestamp: new Date().toISOString(),
            },
          };
        }
        break;
      default:
        context.res = {
          status: 405,
          body: {
            success: false,
            message: 'Método no permitido',
            timestamp: new Date().toISOString(),
          },
        };
    }
  } catch (error) {
    logger.error('Error en función de alertas:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error interno del servidor',
        timestamp: new Date().toISOString(),
      },
    };
  }
};

async function handleListAlerts(context: Context, req: HttpRequest): Promise<void> {
  try {
    const { isactive, status, entity_type, priority } = req.query;
    
    let query = db.getConnection()
      .select('*')
      .from('nubestock.tb_mae_alert')
      .orderBy('creationdate', 'desc');

    // Filtros opcionales
    if (isactive !== undefined) {
      query = query.where('isactive', isactive === 'true' || isactive === true);
    }

    if (status) {
      query = query.where('status', status as string);
    }

    if (entity_type) {
      query = query.where('entity_type', entity_type as string);
    }

    if (priority) {
      query = query.where('priority', priority as string);
    }

    const alerts = await query;

    // Mapear a formato esperado
    const mappedAlerts = alerts.map((alert: any) => ({
      idalert: alert.idalert,
      alert_type: alert.alert_type,
      alert_title: alert.alert_title,
      alert_message: alert.alert_message,
      entity_type: alert.entity_type,
      entity_id: alert.entity_id,
      priority: alert.priority,
      status: alert.status || (alert.isactive ? 'active' : 'resolved'),
      isactive: alert.isactive,
      creationdate: alert.creationdate,
      modificationdate: alert.modificationdate,
      resolved_at: alert.resolved_at,
      resolved_by: alert.resolved_by,
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

async function handleGetAlert(context: Context, req: HttpRequest, alertId: string): Promise<void> {
  try {
    const alert = await db.findById('nubestock.tb_mae_alert', alertId);

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
      idalert: (alert as any).idalert,
      alert_type: (alert as any).alert_type,
      alert_title: (alert as any).alert_title,
      alert_message: (alert as any).alert_message,
      entity_type: (alert as any).entity_type,
      entity_id: (alert as any).entity_id,
      priority: (alert as any).priority,
      status: (alert as any).status || ((alert as any).isactive ? 'active' : 'resolved'),
      isactive: (alert as any).isactive,
      creationdate: (alert as any).creationdate,
      modificationdate: (alert as any).modificationdate,
      resolved_at: (alert as any).resolved_at,
      resolved_by: (alert as any).resolved_by,
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

async function handleAcknowledgeAlert(context: Context, req: HttpRequest, alertId: string): Promise<void> {
  try {
    const alert = await db.findById('nubestock.tb_mae_alert', alertId);

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

    const updatedAlert = await db.update('nubestock.tb_mae_alert', alertId, {
      status: 'acknowledged',
      modificationdate: new Date(),
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

async function handleResolveAlert(context: Context, req: HttpRequest, alertId: string): Promise<void> {
  try {
    const alert = await db.findById('nubestock.tb_mae_alert', alertId);

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
    const resolvedBy = authResult.success ? authResult.user?.userId : null;

    const updatedAlert = await db.update('nubestock.tb_mae_alert', alertId, {
      status: 'resolved',
      isactive: false,
      resolved_at: new Date(),
      resolved_by: resolvedBy,
      modificationdate: new Date(),
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

async function handleDismissAlert(context: Context, req: HttpRequest, alertId: string): Promise<void> {
  try {
    const alert = await db.findById('nubestock.tb_mae_alert', alertId);

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

    const updatedAlert = await db.update('nubestock.tb_mae_alert', alertId, {
      status: 'dismissed',
      isactive: false,
      modificationdate: new Date(),
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

async function handleUpdateAlert(context: Context, req: HttpRequest, alertId: string): Promise<void> {
  try {
    const updateSchema = Joi.object({
      status: Joi.string().valid('active', 'acknowledged', 'resolved', 'dismissed').optional(),
      priority: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
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

    const alert = await db.findById('nubestock.tb_mae_alert', alertId);
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
      modificationdate: new Date(),
    };

    if (value.status) {
      updateData.status = value.status;
      if (value.status === 'resolved' || value.status === 'dismissed') {
        updateData.isactive = false;
        if (value.status === 'resolved') {
          const authResult = requireAuth(req);
          updateData.resolved_at = new Date();
          updateData.resolved_by = authResult.success ? authResult.user?.userId : null;
        }
      }
    }

    if (value.priority) {
      updateData.priority = value.priority;
    }

    const updatedAlert = await db.update('tb_mae_alert', alertId, updateData);

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

async function handleDeleteAlert(context: Context, req: HttpRequest, alertId: string): Promise<void> {
  try {
    const alert = await db.findById('nubestock.tb_mae_alert', alertId);
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

    const deleted = await db.delete('nubestock.tb_mae_alert', alertId);

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

export default alertsHandler;

