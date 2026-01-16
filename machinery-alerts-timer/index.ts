import { AzureFunction, Context } from '../src/types/azure-functions';
import { detectMaintenanceAlerts } from '../src/services/machineryAlertService';
import { logger } from '../src/config/logger';

/**
 * Timer Trigger que ejecuta la detección de alertas de mantenimiento cada 50 minutos
 * Se ejecuta en los minutos 0 y 50 de cada hora
 * Formato cron: segundo minuto hora dia mes dia-semana
 */
const timerTrigger: AzureFunction = async (context: Context, timer: any): Promise<void> => {
  const startTime = new Date();
  
  try {
    logger.info('Timer Trigger ejecutado - Iniciando detección automática de alertas de mantenimiento', {
      schedule: timer.Schedule,
      scheduleStatus: timer.ScheduleStatus,
      isPastDue: timer.IsPastDue,
      lastRun: timer.Last,
      nextRun: timer.Next,
    });

    // Ejecutar la detección de alertas
    // daysBeforeDue = 1: Genera alertas preventivas para mantenimientos que vencen en 1 día
    const daysBeforeDue = 1;
    await detectMaintenanceAlerts(daysBeforeDue);

    const executionTime = new Date().getTime() - startTime.getTime();
    logger.info('Detección de alertas completada exitosamente', {
      executionTimeMs: executionTime,
      nextRun: timer.Next,
    });

  } catch (error) {
    const executionTime = new Date().getTime() - startTime.getTime();
    logger.error('Error en detección automática de alertas de mantenimiento', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      executionTimeMs: executionTime,
    });
    
    // Re-lanzar el error para que Azure Functions lo registre
    throw error;
  }
};

export default timerTrigger;
