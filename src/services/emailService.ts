import { EmailClient } from '@azure/communication-email';
import { config } from '../config/environment';
import { logger } from '../config/logger';
import { EmailOptions } from '../interfaces';

export class EmailService {
  private emailClient: EmailClient | null = null;

  constructor() {
    if (config.email.enabled) {
      // Validar que el connection string esté configurado
      if (!config.email.connectionString) {
        logger.error('Email service enabled but Azure Communication Services connection string is missing. Please configure AZURE_COMMUNICATION_CONNECTION_STRING.', {
          hasConnectionString: !!config.email.connectionString,
        });
        return;
      }

      try {
        this.emailClient = new EmailClient(config.email.connectionString);
        logger.info('Azure Communication Services Email client initialized successfully', {
          from: config.email.from,
        });
      } catch (error) {
        logger.error('Error initializing Azure Communication Services Email client:', error);
      }
    } else {
      logger.warn('Email service is disabled. Set EMAIL_ENABLED=true to enable.');
    }
  }

  /**
   * Envía un correo electrónico usando Azure Communication Services
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!config.email.enabled || !this.emailClient) {
      logger.warn('Email service is disabled. Email not sent.', {
        to: options.to,
        subject: options.subject,
      });
      return false;
    }

    try {
      const emailMessage = {
        senderAddress: config.email.from,
        content: {
          subject: options.subject,
          plainText: options.text || options.html.replace(/<[^>]*>/g, ''), // Versión texto plano
          html: options.html,
        },
        recipients: {
          to: [
            {
              address: options.to,
              displayName: options.to.split('@')[0], // Usar parte antes del @ como nombre
            },
          ],
        },
      };

      const poller = await this.emailClient.beginSend(emailMessage);
      const result = await poller.pollUntilDone();

      logger.info('Email sent successfully via Azure Communication Services', {
        to: options.to,
        subject: options.subject,
        messageId: result.id,
      });
      return true;
    } catch (error) {
      logger.error('Error sending email via Azure Communication Services:', error);
      throw error;
    }
  }

  /**
   * Envía un correo de bienvenida con la contraseña por defecto
   */
  async sendWelcomeEmail(
    userEmail: string,
    userName: string,
    defaultPassword: string
  ): Promise<boolean> {
    const loginUrl = `${config.app.frontendUrl}/login`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bienvenido a Nubestock</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h1 style="color: #2c3e50; margin-top: 0;">¡Bienvenido a Nubestock!</h1>
        </div>
        
        <p>Hola <strong>${userName}</strong>,</p>
        
        <p>Tu cuenta ha sido creada exitosamente en el sistema Nubestock. A continuación encontrarás tus credenciales de acceso:</p>
        
        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0 0 10px 0;"><strong>📧 Email:</strong> ${userEmail}</p>
          <p style="margin: 0;"><strong>🔑 Contraseña temporal:</strong> <code style="background-color: #f8f9fa; padding: 4px 8px; border-radius: 3px; font-size: 14px;">${defaultPassword}</code></p>
        </div>
        
        <p><strong>⚠️ IMPORTANTE - Seguridad:</strong></p>
        <ul>
          <li>Esta es una contraseña temporal. <strong style="color: #dc3545;">Debes cambiarla inmediatamente</strong> después de tu primer inicio de sesión.</li>
          <li>No compartas tus credenciales con nadie.</li>
          <li>Utiliza una contraseña segura que incluya letras, números y caracteres especiales.</li>
        </ul>
        
        <p>Para iniciar sesión, visita:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${loginUrl}" 
             style="background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            Iniciar Sesión
          </a>
        </div>
        
        <p>O copia y pega el siguiente enlace en tu navegador:</p>
        <p style="background-color: #f8f9fa; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px;">
          ${loginUrl}
        </p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        
        <p style="color: #7f8c8d; font-size: 12px;">
          Este es un correo automático, por favor no respondas a este mensaje.<br>
          Si tienes alguna pregunta, contacta al administrador del sistema.<br>
          © ${new Date().getFullYear()} Nubestock. Todos los derechos reservados.
        </p>
      </body>
      </html>
    `;

    const text = `
¡Bienvenido a Nubestock!

Hola ${userName},

Tu cuenta ha sido creada exitosamente en el sistema Nubestock. A continuación encontrarás tus credenciales de acceso:

📧 Email: ${userEmail}
🔑 Contraseña temporal: ${defaultPassword}

⚠️ IMPORTANTE - Seguridad:
- Esta es una contraseña temporal. DEBES CAMBIARLA INMEDIATAMENTE después de tu primer inicio de sesión.
- No compartas tus credenciales con nadie.
- Utiliza una contraseña segura que incluya letras, números y caracteres especiales.

Para iniciar sesión, visita:
${loginUrl}

Este es un correo automático, por favor no respondas a este mensaje.
Si tienes alguna pregunta, contacta al administrador del sistema.
© ${new Date().getFullYear()} Nubestock. Todos los derechos reservados.
    `;

    return this.sendEmail({
      to: userEmail,
      subject: 'Bienvenido a Nubestock - Credenciales de Acceso',
      html,
      text,
    });
  }

  /**
   * Envía un correo de restablecimiento de contraseña
   */
  async sendPasswordResetEmail(
    userEmail: string,
    userName: string,
    resetToken: string
  ): Promise<boolean> {
    const resetUrl = `${config.app.frontendUrl}${config.app.resetPasswordPath}?token=${resetToken}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Restablecer Contraseña - Nubestock</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h1 style="color: #2c3e50; margin-top: 0;">Restablecer Contraseña</h1>
        </div>
        
        <p>Hola <strong>${userName}</strong>,</p>
        
        <p>Has recibido este correo porque un administrador ha generado una solicitud de restablecimiento de contraseña para tu cuenta en Nubestock.</p>
        
        <p>Para restablecer tu contraseña, haz clic en el siguiente enlace:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            Restablecer Contraseña
          </a>
        </div>
        
        <p>O copia y pega el siguiente enlace en tu navegador:</p>
        <p style="background-color: #f8f9fa; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px;">
          ${resetUrl}
        </p>
        
        <p><strong>Importante:</strong></p>
        <ul>
          <li>Este enlace expirará en 1 hora.</li>
          <li>Si no solicitaste este restablecimiento, puedes ignorar este correo de forma segura.</li>
          <li>Si continúas teniendo problemas, contacta al administrador del sistema.</li>
        </ul>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        
        <p style="color: #7f8c8d; font-size: 12px;">
          Este es un correo automático, por favor no respondas a este mensaje.<br>
          © ${new Date().getFullYear()} Nubestock. Todos los derechos reservados.
        </p>
      </body>
      </html>
    `;

    const text = `
Restablecer Contraseña - Nubestock

Hola ${userName},

Has recibido este correo porque un administrador ha generado una solicitud de restablecimiento de contraseña para tu cuenta en Nubestock.

Para restablecer tu contraseña, visita el siguiente enlace:
${resetUrl}

Importante:
- Este enlace expirará en 1 hora.
- Si no solicitaste este restablecimiento, puedes ignorar este correo de forma segura.
- Si continúas teniendo problemas, contacta al administrador del sistema.

Este es un correo automático, por favor no respondas a este mensaje.
© ${new Date().getFullYear()} Nubestock. Todos los derechos reservados.
    `;

    return this.sendEmail({
      to: userEmail,
      subject: 'Restablecer Contraseña - Nubestock',
      html,
      text,
    });
  }
}

// Exportar instancia singleton
export const emailService = new EmailService();
