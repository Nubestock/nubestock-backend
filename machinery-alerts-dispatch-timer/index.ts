import { AzureFunction, Context } from '../src/types/azure-functions';
import { logger } from '../src/config/logger';
import { sendPendingMaintenanceAlerts } from '../src/services/machineryAlertService';

/**
 * Timer Trigger que envía alertas pendientes cada 10 minutos
 */
const timerTrigger: AzureFunction = async (context: Context, timer: any): Promise<void> => {
  const startTime = new Date();

  try {
    logger.info('Timer Trigger - Envío automático de alertas pendientes', {
      schedule: timer.Schedule,
      scheduleStatus: timer.ScheduleStatus,
      isPastDue: timer.IsPastDue,
      lastRun: timer.Last,
      nextRun: timer.Next,
    });

    const result = await sendPendingMaintenanceAlerts();

    const executionTime = new Date().getTime() - startTime.getTime();
    logger.info('Envío de alertas completado', {
      executionTimeMs: executionTime,
      result,
      nextRun: timer.Next,
    });
  } catch (error) {
    const executionTime = new Date().getTime() - startTime.getTime();
    logger.error('Error en envío automático de alertas', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      executionTimeMs: executionTime,
    });
    throw error;
  }
};

export default timerTrigger;
