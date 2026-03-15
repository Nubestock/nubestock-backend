import { logger } from '../config/logger';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
}

export interface ExpoPushResult {
  success: boolean;
  sent: number;
  failed: number;
  errors: string[];
}

/**
 * Envía notificaciones push vía API de Expo (exp.host).
 * Solo se envían a tokens con formato ExponentPushToken[...].
 */
export async function sendExpoPushNotifications(messages: ExpoPushMessage[]): Promise<ExpoPushResult> {
  const valid = messages.filter((m) => m.to && String(m.to).startsWith('ExponentPushToken['));
  if (valid.length === 0) {
    return {
      success: false,
      sent: 0,
      failed: messages.length,
      errors: ['No hay tokens Expo válidos (ExponentPushToken[...])'],
    };
  }

  const result: ExpoPushResult = {
    success: true,
    sent: 0,
    failed: 0,
    errors: [],
  };

  // Expo acepta hasta 100 mensajes por request
  const chunkSize = 100;
  for (let i = 0; i < valid.length; i += chunkSize) {
    const chunk = valid.slice(i, i + chunkSize).map((m) => ({
      to: m.to,
      title: m.title,
      body: m.body,
      data: m.data ?? {},
      sound: m.sound ?? 'default',
      ...(m.badge != null && { badge: m.badge }),
      ...(m.channelId && { channelId: m.channelId }),
      ...(m.priority && { priority: m.priority }),
    }));

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(chunk),
      });

      if (!res.ok) {
        const text = await res.text();
        result.success = false;
        result.failed += chunk.length;
        result.errors.push(`Expo API ${res.status}: ${text}`);
        continue;
      }

      const data = (await res.json()) as { data?: { status: string; message?: string }[] };
      const tickets = data?.data ?? [];

      for (const ticket of tickets) {
        if (ticket.status === 'ok') {
          result.sent += 1;
        } else {
          result.failed += 1;
          result.errors.push(ticket.message ?? ticket.status);
        }
      }

      if (tickets.length !== chunk.length) {
        result.failed += Math.max(0, chunk.length - tickets.length);
        result.errors.push('Expo devolvió menos tickets que mensajes enviados');
      }
    } catch (err) {
      result.success = false;
      result.failed += chunk.length;
      result.errors.push(err instanceof Error ? err.message : String(err));
      logger.error('Error al enviar push vía Expo:', { error: err, chunkSize: chunk.length });
    }
  }

  if (result.sent === 0 && result.failed > 0) {
    result.success = false;
  }
  return result;
}
