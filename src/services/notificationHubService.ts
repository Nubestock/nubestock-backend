import crypto from 'crypto';
import {
  NotificationHubsClient,
  createAppleInstallation,
  createFcmV1Installation,
  createAppleNotification,
  createFcmV1Notification,
} from '@azure/notification-hubs';
import { config } from '../config/environment';
import { logger } from '../config/logger';

type Platform = 'ios' | 'android' | 'web';

interface RegisterInstallationParams {
  deviceToken: string;
  platform: Platform;
  userId: number;
}

interface SendAlertParams {
  userIds: number[];
  title: string;
  body: string;
  data?: Record<string, any>;
  platforms?: Array<'ios' | 'android'>;
}

interface SendResult {
  success: boolean;
  sent: number;
  failed: number;
  errors: string[];
}

function getHubClient(): NotificationHubsClient | null {
  if (!config.notifications.notificationHubEnabled) {
    logger.info('Notification Hub deshabilitado (NOTIFICATION_HUB_ENABLED=false).');
    return null;
  }

  if (!config.notifications.notificationHubConnectionString || !config.notifications.notificationHubName) {
    logger.warn('Notification Hub no configurado. Revisa NOTIFICATION_HUB_CONNECTION_STRING y NOTIFICATION_HUB_NAME.');
    return null;
  }

  return new NotificationHubsClient(
    config.notifications.notificationHubConnectionString,
    config.notifications.notificationHubName
  );
}

function getInstallationId(deviceToken: string): string {
  return crypto.createHash('sha256').update(deviceToken).digest('hex');
}

function buildUserTagExpression(userIds: number[]): string {
  const uniqueIds = Array.from(new Set(userIds)).filter((id) => Number.isFinite(id));
  return uniqueIds.map((id) => `user:${id}`).join(' || ');
}

export async function registerInstallation(params: RegisterInstallationParams): Promise<void> {
  const client = getHubClient();
  if (!client) {
    return;
  }

  if (params.platform === 'web') {
    return;
  }

  const installationId = getInstallationId(params.deviceToken);
  const tags = [`user:${params.userId}`, `platform:${params.platform}`];

  try {
    if (params.platform === 'ios') {
      const installation = createAppleInstallation({
        installationId,
        pushChannel: params.deviceToken,
        tags,
        userId: String(params.userId),
      });
      await client.createOrUpdateInstallation(installation);
      logger.info('Installation registrada en Notification Hub', {
        installationId,
        platform: params.platform,
        userId: params.userId,
        tags,
      });
      return;
    }

    if (params.platform === 'android') {
      const installation = createFcmV1Installation({
        installationId,
        pushChannel: params.deviceToken,
        tags,
        userId: String(params.userId),
      });
      await client.createOrUpdateInstallation(installation);
      logger.info('Installation registrada en Notification Hub', {
        installationId,
        platform: params.platform,
        userId: params.userId,
        tags,
      });
    }
  } catch (error) {
    logger.error('Error al registrar instalación en Notification Hub:', {
      error: error instanceof Error ? error.message : String(error),
      installationId,
      platform: params.platform,
      userId: params.userId,
    });
  }
}

export async function sendAlertNotification(params: SendAlertParams): Promise<SendResult> {
  const client = getHubClient();
  if (!client) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: ['Notification Hub no configurado'],
    };
  }

  if (!params.userIds.length) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: ['No hay usuarios destino para la notificación'],
    };
  }

  const userExpression = buildUserTagExpression(params.userIds);
  if (!userExpression) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: ['Tag expression inválida para usuarios'],
    };
  }

  const result: SendResult = {
    success: true,
    sent: 0,
    failed: 0,
    errors: [],
  };

  const androidPayload = {
    notification: {
      title: params.title,
      body: params.body,
    },
    data: params.data || {},
  };

  const iosPayload = {
    aps: {
      alert: {
        title: params.title,
        body: params.body,
      },
      sound: 'default',
    },
    data: params.data || {},
  };

  const androidNotification = createFcmV1Notification({
    body: JSON.stringify(androidPayload),
  });

  const iosNotification = createAppleNotification({
    body: JSON.stringify(iosPayload),
    headers: {
      'apns-priority': '10',
      'apns-push-type': 'alert',
    },
  });

  const platforms = params.platforms && params.platforms.length
    ? Array.from(new Set(params.platforms))
    : (['android', 'ios'] as Array<'android' | 'ios'>);

  if (platforms.includes('android')) {
    try {
      await client.sendNotification(androidNotification, {
        tagExpression: `(${userExpression}) && platform:android`,
      });
      result.sent += 1;
    } catch (error) {
      result.success = false;
      result.failed += 1;
      result.errors.push(`Android send failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (platforms.includes('ios')) {
    try {
      await client.sendNotification(iosNotification, {
        tagExpression: `(${userExpression}) && platform:ios`,
      });
      result.sent += 1;
    } catch (error) {
      result.success = false;
      result.failed += 1;
      result.errors.push(`iOS send failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}
