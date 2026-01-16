import { Database } from '../config/database';
import { logger } from '../config/logger';
import { sendAlertNotification } from './notificationHubService';

const db = Database.getInstance();

/**
 * Detecta mantenimientos vencidos y próximos a vencer, generando alertas
 * Este método debe ejecutarse periódicamente (ej: cada 50 minutos)
 * 
 * @param daysBeforeDue - Días de anticipación para alertas preventivas (default: 1 día)
 */
export async function detectMaintenanceAlerts(daysBeforeDue: number = 1): Promise<void> {
  try {
    logger.info('Iniciando detección de alertas de mantenimiento', { daysBeforeDue });

    // Obtener usuarios que deben recibir alertas (una sola vez para ambas detecciones)
    const users = await db.getConnection()
      .select('u.id')
      .from('nubestock.tb_mae_user as u')
      .leftJoin('nubestock.tb_mae_user_role as ur', 'u.id', 'ur.id_user')
      .leftJoin('nubestock.tb_mae_role as r', 'ur.id_role', 'r.id')
      .leftJoin('nubestock.tb_mae_role_permission as rp', 'r.id', 'rp.id_role')
      .leftJoin('nubestock.tb_mae_permission as p', 'rp.id_permission', 'p.id')
      .where('u.is_active', true)
      .where(function() {
        this.where('p.name', 'inventory_manage')
          .orWhere('p.name', 'admin');
      })
      .groupBy('u.id')
      .distinct();

    // ========== DETECCIÓN DE MANTENIMIENTOS VENCIDOS ==========
    // Para mantenimientos periódicos: usa last_mantainance_date + next_maintainance_value
    const overdueMaintenances = await db.getConnection()
      .select(
        'mt.id as mantainance_id',
        'mt.name as maintenance_name',
        'mt.type as maintenance_type',
        'mt.last_mantainance_date',
        'mt.next_maintainance_value',
        'mc.id as machinery_id',
        'mc.name as machinery_name',
        db.getConnection().raw(`
          (mt.last_mantainance_date + INTERVAL '1 day' * COALESCE(mt.next_maintainance_value, 0)) as due_date
        `)
      )
      .from('nubestock.tb_mae_mantainance as mt')
      .leftJoin('nubestock.tb_mae_machinery as mc', 'mt.id_machinery', 'mc.id')
      .where('mt.is_active', true)
      .whereNotNull('mt.next_maintainance_value') // Solo mantenimientos periódicos
      .whereRaw(`
        (mt.last_mantainance_date + INTERVAL '1 day' * COALESCE(mt.next_maintainance_value, 0)) <= now()
      `);

    logger.info(`Se encontraron ${overdueMaintenances.length} mantenimientos vencidos`);

    let overdueAlertsCreated = 0;

    for (const maintenance of overdueMaintenances) {
      // Verificar si ya existe una alerta de vencimiento para este mantenimiento
      const existingAlert = await db.getConnection()
        .select('*')
        .from('nubestock.tb_ope_machinery_alert')
        .where('id_mantainance', maintenance.mantainance_id)
        .where('type', 'MAINTENANCE_DUE')
        .whereRaw('date >= ?', [new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]) // Últimos 7 días
        .first();

      if (existingAlert) {
        logger.info(`Alerta de vencimiento ya existe para mantenimiento ${maintenance.mantainance_id}, omitiendo`);
        continue;
      }

      // Crear la alerta de vencimiento
      const dueDate = maintenance.due_date
        ? new Date(maintenance.due_date)
        : new Date();

      const title = `Mantenimiento Vencido: ${maintenance.maintenance_name}`;
      const message = `El mantenimiento "${maintenance.maintenance_name}" de la maquinaria "${maintenance.machinery_name}" estaba programado para ${dueDate.toLocaleDateString()} y ya ha vencido.`;

      const [newAlert] = await db.getConnection()
        .insert({
          id_mantainance: maintenance.mantainance_id,
          type: 'MAINTENANCE_DUE',
          date: dueDate,
          title,
          message,
          is_sent: false,
          creation_date: new Date(),
        })
        .into('nubestock.tb_ope_machinery_alert')
        .returning('*');

      // Asignar a usuarios
      if (users.length > 0) {
        const alertUsers = users.map((user: any) => ({
          id_machinery_alert: newAlert.id,
          id_user: user.id,
          is_read: false,
          creation_date: new Date(),
        }));

        await db.getConnection()
          .insert(alertUsers)
          .into('nubestock.tb_ope_alert_user');

        logger.info(`Alerta de vencimiento ${newAlert.id} asignada a ${users.length} usuarios`);
      }

      overdueAlertsCreated++;
    }

    // ========== DETECCIÓN DE MANTENIMIENTOS PRÓXIMOS A VENCER ==========
    // Para mantenimientos periódicos: alerta preventiva cuando estamos dentro de los N días antes del vencimiento
    // Fecha de vencimiento = last_mantainance_date + next_maintainance_value días
    // Alerta preventiva: si now() está entre (due_date - daysBeforeDue) y due_date, y aún no ha vencido
    const upcomingMaintenances = await db.getConnection()
      .select(
        'mt.id as mantainance_id',
        'mt.name as maintenance_name',
        'mt.type as maintenance_type',
        'mt.last_mantainance_date',
        'mt.next_maintainance_value',
        'mc.id as machinery_id',
        'mc.name as machinery_name',
        db.getConnection().raw(`
          (mt.last_mantainance_date + INTERVAL '1 day' * COALESCE(mt.next_maintainance_value, 0)) as due_date
        `)
      )
      .from('nubestock.tb_mae_mantainance as mt')
      .leftJoin('nubestock.tb_mae_machinery as mc', 'mt.id_machinery', 'mc.id')
      .where('mt.is_active', true)
      .whereNotNull('mt.next_maintainance_value') // Solo mantenimientos periódicos
      .whereRaw(`
        (mt.last_mantainance_date + INTERVAL '1 day' * COALESCE(mt.next_maintainance_value, 0)) > now()
        AND
        (mt.last_mantainance_date + INTERVAL '1 day' * COALESCE(mt.next_maintainance_value, 0)) <= now() + INTERVAL '${daysBeforeDue} days'
      `);

    logger.info(`Se encontraron ${upcomingMaintenances.length} mantenimientos próximos a vencer (en ${daysBeforeDue} día(s))`);

    let upcomingAlertsCreated = 0;

    for (const maintenance of upcomingMaintenances) {
      // Verificar si ya existe una alerta preventiva para este mantenimiento
      const existingAlert = await db.getConnection()
        .select('*')
        .from('nubestock.tb_ope_machinery_alert')
        .where('id_mantainance', maintenance.mantainance_id)
        .where('type', 'MAINTENANCE_SOON')
        .whereRaw('date >= ?', [new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]) // Últimos 7 días
        .first();

      if (existingAlert) {
        logger.info(`Alerta preventiva ya existe para mantenimiento ${maintenance.mantainance_id}, omitiendo`);
        continue;
      }

      // Crear la alerta preventiva
      const dueDate = maintenance.due_date
        ? new Date(maintenance.due_date)
        : new Date();

      const daysUntilDue = Math.ceil(
        (dueDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );

      const title = `Mantenimiento Próximo: ${maintenance.maintenance_name}`;
      const message = `El mantenimiento "${maintenance.maintenance_name}" de la maquinaria "${maintenance.machinery_name}" está programado para ${dueDate.toLocaleDateString()} (en ${daysUntilDue} día(s)).`;

      const [newAlert] = await db.getConnection()
        .insert({
          id_mantainance: maintenance.mantainance_id,
          type: 'MAINTENANCE_SOON',
          date: dueDate,
          title,
          message,
          is_sent: false,
          creation_date: new Date(),
        })
        .into('nubestock.tb_ope_machinery_alert')
        .returning('*');

      // Asignar a usuarios
      if (users.length > 0) {
        const alertUsers = users.map((user: any) => ({
          id_machinery_alert: newAlert.id,
          id_user: user.id,
          is_read: false,
          creation_date: new Date(),
        }));

        await db.getConnection()
          .insert(alertUsers)
          .into('nubestock.tb_ope_alert_user');

        logger.info(`Alerta preventiva ${newAlert.id} asignada a ${users.length} usuarios`);
      }

      upcomingAlertsCreated++;
    }

    logger.info(`Detección de alertas completada. ${overdueAlertsCreated} alertas de vencimiento y ${upcomingAlertsCreated} alertas preventivas creadas`);
  } catch (error) {
    logger.error('Error en detección de alertas de mantenimiento:', error);
    throw error;
  }
}

/**
 * Obtiene los tokens de dispositivos de un usuario para enviar notificaciones push
 */
export async function getUserDeviceTokens(userId: number): Promise<string[]> {
  try {
    const devices = await db.getConnection()
      .select('device_token')
      .from('nubestock.tb_ope_user_device')
      .where('id_user', userId)
      .where('is_active', true);

    return devices.map((d: any) => d.device_token);
  } catch (error) {
    logger.error(`Error al obtener tokens de dispositivos para usuario ${userId}:`, error);
    return [];
  }
}

/**
 * Marca una alerta como enviada
 */
export async function markAlertAsSent(alertId: number): Promise<void> {
  try {
    await db.getConnection()
      .where('id', alertId)
      .update({
        is_sent: true,
      })
      .into('nubestock.tb_ope_machinery_alert');
  } catch (error) {
    logger.error(`Error al marcar alerta ${alertId} como enviada:`, error);
    throw error;
  }
}

/**
 * Envía notificaciones pendientes a los usuarios asignados
 */
export async function sendPendingMaintenanceAlerts(limit: number = 50): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  const pendingAlerts = await db.getConnection()
    .select('id', 'title', 'message', 'type')
    .from('nubestock.tb_ope_machinery_alert')
    .where('is_sent', false)
    .orderBy('creation_date', 'asc')
    .limit(limit);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const alert of pendingAlerts) {
    try {
      const userRows = await db.getConnection()
        .select('id_user')
        .from('nubestock.tb_ope_alert_user')
        .where('id_machinery_alert', alert.id);

      const userIds = userRows.map((row: any) => row.id_user);
      if (!userIds.length) {
        skipped++;
        continue;
      }

      const deviceRows = await db.getConnection()
        .select('platform')
        .from('nubestock.tb_ope_user_device')
        .whereIn('id_user', userIds)
        .where('is_active', true);

      const platforms = Array.from(
        new Set(deviceRows.map((row: any) => row.platform).filter((platform: string) => platform === 'ios' || platform === 'android'))
      );

      if (!platforms.length) {
        skipped++;
        continue;
      }

      const result = await sendAlertNotification({
        userIds,
        title: alert.title,
        body: alert.message,
        data: {
          alertId: alert.id,
          type: alert.type,
        },
        platforms,
      });

      if (result.success) {
        await markAlertAsSent(alert.id);
        sent++;
      } else {
        failed++;
        logger.warn('Fallo en envío de alerta', {
          alertId: alert.id,
          errors: result.errors,
        });
      }
    } catch (error) {
      failed++;
      logger.error('Error al enviar alerta pendiente', {
        alertId: alert.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    processed: pendingAlerts.length,
    sent,
    failed,
    skipped,
  };
}
