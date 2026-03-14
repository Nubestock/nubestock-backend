import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Database } from '../config/database';
import { config } from '../config/environment';
import { logger } from '../config/logger';
import { User, LoginRequest, LoginResponse, RegisterRequest } from '../interfaces';
import { emailService } from './emailService';

export class AuthService {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
    // Configurar el esquema por defecto
    this.db.setSchema();
  }

  /**
   * Registra un nuevo usuario en el sistema
   */
  async register(userData: RegisterRequest): Promise<User> {
    try {
      // Verificar si el email ya existe
      const existingUser = await this.db.getConnection()
        .select('id')
        .from('nubestock.tb_mae_user')
        .where('email', userData.email)
        .first();

      if (existingUser) {
        throw new Error('El email ya está registrado');
      }

      // Guardar la contraseña en texto plano temporalmente para el email (antes de hashearla)
      const plainPassword = userData.password;

      // Encriptar la contraseña
      const passwordHash = await bcrypt.hash(userData.password, config.security.bcryptRounds);

      // Crear el usuario
      const newUser = await this.db.create<User>('nubestock.tb_mae_user', {
        name: userData.name,
        email: userData.email,
        pwd_hash: passwordHash,
        phone: userData.phone,
        is_active: true,
        last_login: new Date(),
      });

      // Enviar email de bienvenida con la contraseña por defecto
      logger.info('[Auth] Enviando notificación de bienvenida a nuevo usuario', {
        userId: (newUser as any).id,
        email: newUser.email,
      });
      try {
        const emailSent = await emailService.sendWelcomeEmail(
          newUser.email,
          newUser.name,
          plainPassword
        );
        if (emailSent) {
          logger.info('[Auth] Notificación de bienvenida enviada correctamente', {
            userId: (newUser as any).id,
            email: newUser.email,
          });
        } else {
          logger.warn('[Auth] Notificación de bienvenida NO enviada (servicio de email deshabilitado)', {
            userId: (newUser as any).id,
            email: newUser.email,
          });
        }
      } catch (emailError) {
        logger.error('[Auth] Error al enviar notificación de bienvenida', {
          userId: (newUser as any).id,
          email: newUser.email,
          error: emailError,
        });
        // No fallamos la operación si el email falla, solo logueamos el error
        // El usuario ya fue creado exitosamente
      }

      logger.info('Usuario registrado exitosamente', {
        userId: (newUser as any).id,
        email: newUser.email,
      });

      return newUser as User;
    } catch (error) {
      logger.error('Error en registro de usuario:', error);
      throw error;
    }
  }

  /**
   * Autentica un usuario y genera tokens
   */
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    try {
      // Buscar el usuario por email
      const user = await this.db.getConnection()
        .select('*')
        .from('nubestock.tb_mae_user')
        .where('email', credentials.email)
        .where('is_active', true)
        .first();

      if (!user) {
        throw new Error('Credenciales inválidas');
      }

      // Verificar si la cuenta está bloqueada (campo eliminado en nuevo esquema)
      // account_locked_until ya no existe

      // Verificar la contraseña
      const isValidPassword = await bcrypt.compare(credentials.password, user.pwd_hash);
      
      if (!isValidPassword) {
        throw new Error('Credenciales inválidas');
      }

      // Actualizar último login
      await this.updateLastLogin(user.id.toString());

      // Obtener roles y permisos del usuario
      const userRolesAndPermissions = await this.getUserRolesAndPermissions(user.id.toString());

      // Generar tokens con información completa
      const token = this.generateToken(user.id.toString(), userRolesAndPermissions);
      const refreshToken = this.generateRefreshToken(user.id.toString());

      // Remover la contraseña del objeto de respuesta
      const { pwd_hash, ...userWithoutPassword } = user;

      logger.info('Login exitoso', {
        userId: user.id,
        email: user.email,
      });

      return {
        user: userWithoutPassword,
        token,
        refreshToken,
        expiresIn: this.getTokenExpirationTime(),
      };
    } catch (error) {
      logger.error('Error en login:', error);
      throw error;
    }
  }

  /**
   * Refresca un token de acceso
   */
  async refreshToken(refreshToken: string): Promise<{ token: string; expiresIn: number }> {
    try {
      const decoded = jwt.verify(refreshToken, config.jwt.secret) as any;
      
      if (decoded.type !== 'refresh') {
        throw new Error('Token de refresh inválido');
      }

      const user = await this.db.findById<User>('nubestock.tb_mae_user', decoded.userId);
      
      if (!user || !user.is_active) {
        throw new Error('Usuario no válido');
      }

      // Obtener roles y permisos para el nuevo token
      const userRolesAndPermissions = await this.getUserRolesAndPermissions(user.id.toString());
      const newToken = this.generateToken(user.id.toString(), userRolesAndPermissions);
      
      logger.info('Token refrescado exitosamente', {
        userId: user.id,
      });

      return {
        token: newToken,
        expiresIn: this.getTokenExpirationTime(),
      };
    } catch (error) {
      logger.error('Error al refrescar token:', error);
      throw new Error('Token de refresh inválido');
    }
  }

  /**
   * Cierra la sesión de un usuario
   */
  async logout(userId: string): Promise<void> {
    try {
      // Aquí podrías implementar una lista negra de tokens
      // Por ahora solo logueamos la acción
      logger.info('Usuario cerró sesión', {
        userId,
      });
    } catch (error) {
      logger.error('Error en logout:', error);
      throw error;
    }
  }

  /**
   * Cambia la contraseña de un usuario
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    try {
      const user = await this.db.findById<User>('nubestock.tb_mae_user', userId);
      
      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // Verificar la contraseña actual
      const isValidPassword = await bcrypt.compare(currentPassword, user.pwd_hash);
      
      if (!isValidPassword) {
        throw new Error('Contraseña actual incorrecta');
      }

      // Encriptar la nueva contraseña
      const newPasswordHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);

      // Actualizar la contraseña
      await this.db.update('nubestock.tb_mae_user', userId, {
        pwd_hash: newPasswordHash,
        modification_date: new Date(),
      });

      logger.info('Contraseña cambiada exitosamente', {
        userId,
      });
    } catch (error) {
      logger.error('Error al cambiar contraseña:', error);
      throw error;
    }
  }

  /**
   * Solicita restablecimiento de contraseña (auto-solicitado por el usuario)
   */
  async requestPasswordReset(email: string): Promise<void> {
    try {
      const user = await this.db.getConnection()
        .select('id', 'name', 'email')
        .from('nubestock.tb_mae_user')
        .where('email', email)
        .where('is_active', true)
        .first();

      if (!user) {
        // Por seguridad, no revelamos si el email existe o no
        logger.warn('Intento de reset de contraseña para email no encontrado', {
          email,
        });
        return;
      }

      // Generar token de restablecimiento
      const resetToken = this.generateResetToken();
      
      // Calcular fecha de expiración (1 hora desde ahora)
      const expiresAt = new Date(Date.now() + config.security.passwordResetTokenExpiry);

      // Almacenar token en la base de datos
      await this.storeResetToken(user.id, resetToken, expiresAt);

      // Enviar email al usuario
      logger.info('[Auth] Enviando notificación de restablecimiento de contraseña (solicitud usuario)', {
        userId: user.id,
        email: user.email,
      });
      try {
        const emailSent = await emailService.sendPasswordResetEmail(user.email, user.name, resetToken);
        if (emailSent) {
          logger.info('[Auth] Notificación de restablecimiento enviada correctamente', {
            userId: user.id,
            email: user.email,
          });
        } else {
          logger.warn('[Auth] Notificación NO enviada (servicio de email deshabilitado). Token generado correctamente.', {
            userId: user.id,
            email: user.email,
            resetToken: resetToken.substring(0, 10) + '...',
          });
        }
      } catch (emailError) {
        logger.error('[Auth] Error al enviar notificación de restablecimiento', {
          userId: user.id,
          email: user.email,
          error: emailError,
        });
        // No fallamos la operación si el email falla, solo logueamos el error
      }

      logger.info('Solicitud de reset de contraseña', {
        userId: user.id,
        email,
      });
    } catch (error) {
      logger.error('Error en solicitud de reset de contraseña:', error);
      throw error;
    }
  }

  /**
   * Genera un token de restablecimiento de contraseña único y seguro
   */
  private generateResetToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Almacena el token de restablecimiento en la base de datos
   */
  private async storeResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    try {
      // Intentar actualizar token existente o insertar uno nuevo
      // Usaremos una tabla temporal o podemos almacenar en la tabla de usuarios directamente
      // Por ahora, almacenaremos en una estructura simple en la tabla de usuarios
      // En producción, deberías crear una tabla específica para tokens de reset
      
      // Opción 1: Usar una columna temporal en tb_mae_user (si existe password_reset_token)
      // Opción 2: Crear tabla tb_ope_password_reset_token
      
      // Por simplicidad, vamos a usar una tabla dedicada si existe, o podemos crear un registro
      // temporal. Para este caso, usaremos el enfoque de tabla dedicada.
      
      // Verificar si existe la tabla, si no, crear registro temporal
      // Por ahora, almacenamos en una tabla dedicada que debería existir
      const tokenData = {
        id_user: userId,
        reset_token: token,
        expires_at: expiresAt,
        is_active: true,
        creation_date: new Date(),
        modification_date: new Date(),
      };

      // Intentar insertar o actualizar
      await this.db.getConnection()
        .from('nubestock.tb_ope_password_reset_token')
        .where('id_user', userId)
        .where('is_active', true)
        .update({ is_active: false, modification_date: new Date() });

      await this.db.getConnection()
        .insert(tokenData)
        .into('nubestock.tb_ope_password_reset_token');

      logger.info('Token de restablecimiento almacenado', {
        userId,
        expiresAt,
      });
    } catch (error: any) {
      // Si la tabla no existe, logueamos pero no fallamos
      if (error.message && error.message.includes('does not exist')) {
        logger.warn('Tabla de tokens de reset no existe. Creando token sin almacenar en BD.', {
          userId,
        });
      } else {
        logger.error('Error al almacenar token de restablecimiento:', error);
        throw error;
      }
    }
  }

  /**
   * Solicita restablecimiento de contraseña por parte de un administrador
   * Genera un token, lo almacena y envía un email al usuario
   */
  async requestPasswordResetByAdmin(targetEmail: string, requestedBy: string): Promise<{ userId: string; email: string; name: string; token?: string }> {
    try {
      const user = await this.db.getConnection()
        .select('id', 'name', 'email')
        .from('nubestock.tb_mae_user')
        .where('email', targetEmail)
        .where('is_active', true)
        .first();

      if (!user) {
        throw new Error('Usuario no encontrado o inactivo');
      }

      // Generar token de restablecimiento
      const resetToken = this.generateResetToken();
      
      // Calcular fecha de expiración (1 hora desde ahora)
      const expiresAt = new Date(Date.now() + config.security.passwordResetTokenExpiry);

      // Almacenar token en la base de datos
      await this.storeResetToken(user.id, resetToken, expiresAt);

      // Enviar email al usuario
      logger.info('[Auth] Enviando notificación de restablecimiento de contraseña (solicitud admin)', {
        targetUserId: user.id,
        targetEmail: user.email,
        requestedBy,
      });
      try {
        const emailSent = await emailService.sendPasswordResetEmail(user.email, user.name, resetToken);
        if (emailSent) {
          logger.info('[Auth] Notificación de restablecimiento enviada correctamente (admin)', {
            targetUserId: user.id,
            targetEmail: user.email,
          });
        } else {
          logger.warn('[Auth] Notificación NO enviada (servicio de email deshabilitado). Token generado correctamente.', {
            targetUserId: user.id,
            targetEmail: user.email,
            resetToken: resetToken.substring(0, 10) + '...',
          });
        }
      } catch (emailError) {
        logger.error('[Auth] Error al enviar notificación de restablecimiento (admin)', {
          targetUserId: user.id,
          targetEmail: user.email,
          error: emailError,
        });
        // No fallamos la operación si el email falla, solo logueamos el error
      }

      // Loguear la acción de administrador
      logger.info('Solicitud de reset de contraseña por administrador', {
        targetUserId: user.id,
        targetEmail: user.email,
        requestedBy,
        tokenGenerated: true,
      });

      return {
        userId: user.id,
        email: user.email,
        name: user.name,
        // No incluimos el token en la respuesta por seguridad (solo se envía por email)
      };
    } catch (error) {
      logger.error('Error en solicitud de reset de contraseña por administrador:', error);
      throw error;
    }
  }

  /**
   * Restablece la contraseña con un token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      // Validar que la nueva contraseña cumpla con los requisitos
      if (!newPassword || newPassword.length < 8) {
        throw new Error('La contraseña debe tener al menos 8 caracteres');
      }

      // Buscar el token en la base de datos
      const resetToken = await this.db.getConnection()
        .select('*')
        .from('nubestock.tb_ope_password_reset_token')
        .where('reset_token', token)
        .where('is_active', true)
        .first();

      if (!resetToken) {
        throw new Error('Token de restablecimiento inválido o ya utilizado');
      }

      // Verificar que el token no haya expirado
      const now = new Date();
      const expiresAt = new Date(resetToken.expires_at);
      
      if (now > expiresAt) {
        // Marcar el token como inactivo
        await this.db.getConnection()
          .from('nubestock.tb_ope_password_reset_token')
          .where('id', resetToken.id)
          .update({ is_active: false, modification_date: now });

        throw new Error('Token de restablecimiento expirado');
      }

      // Verificar que el usuario existe y está activo
      const user = await this.db.getConnection()
        .select('id', 'email')
        .from('nubestock.tb_mae_user')
        .where('id', resetToken.id_user)
        .where('is_active', true)
        .first();

      if (!user) {
        throw new Error('Usuario no encontrado o inactivo');
      }

      // Generar hash de la nueva contraseña
      const passwordHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);

      // Actualizar la contraseña del usuario y marcar el token como usado
      await this.db.transaction(async (trx) => {
        // Actualizar contraseña
        await trx('nubestock.tb_mae_user')
          .where('id', resetToken.id_user)
          .update({
            pwd_hash: passwordHash,
            modification_date: now,
          });

        // Marcar el token como usado
        await trx('nubestock.tb_ope_password_reset_token')
          .where('id', resetToken.id)
          .update({
            is_active: false,
            modification_date: now,
          });
      });

      logger.info('Contraseña restablecida exitosamente con token', {
        userId: resetToken.id_user,
        email: user.email,
        tokenUsed: true,
      });
    } catch (error: any) {
      logger.error('Error al restablecer contraseña:', error);
      throw error;
    }
  }

  /**
   * Obtiene los roles y permisos de un usuario
   */
  private async getUserRolesAndPermissions(userId: string): Promise<{ 
    roles: string[], 
    rolesDetails: Array<{ idrole: string, namerole: string, description?: string }>,
    permissions: string[] 
  }> {
    try {
      // Obtener roles del usuario con información completa
      const userRoles = await this.db.getConnection()
        .select('r.id', 'r.name', 'r.description')
        .from('nubestock.tb_mae_user_role as ur')
        .join('nubestock.tb_mae_role as r', 'ur.id_role', 'r.id')
        .where('ur.id_user', userId)
        .where('ur.is_active', true)
        .where('r.is_active', true);

      // Obtener permisos del usuario (a través de sus roles)
      const userPermissions = await this.db.getConnection()
        .select('p.name')
        .from('nubestock.tb_mae_user_role as ur')
        .join('nubestock.tb_mae_role_permission as rp', 'ur.id_role', 'rp.id_role')
        .join('nubestock.tb_mae_permission as p', 'rp.id_permission', 'p.id')
        .where('ur.id_user', userId)
        .where('ur.is_active', true)
        .where('rp.is_active', true)
        .where('p.is_active', true)
        .distinct();

      return {
        roles: userRoles.map(r => r.name),
        rolesDetails: userRoles.map(r => ({
          idrole: r.id.toString(),
          namerole: r.name,
          description: r.description || undefined
        })),
        permissions: userPermissions.map(p => p.name)
      };
    } catch (error) {
      logger.error('Error al obtener roles y permisos del usuario:', error);
      return { roles: [], rolesDetails: [], permissions: [] };
    }
  }

  /**
   * Genera un token JWT con información completa (roles y permisos)
   */
  private generateToken(userId: string, rolesAndPermissions?: { 
    roles: string[], 
    rolesDetails: Array<{ idrole: string, namerole: string, description?: string }>,
    permissions: string[] 
  }): string {
    if (!config.jwt.secret) {
      logger.error('JWT_SECRET is not configured when generating token');
      throw new Error('JWT_SECRET is not configured');
    }
    
    const tokenPayload: any = { 
      userId, 
      type: 'access',
      iat: Math.floor(Date.now() / 1000)
    };

    // Incluir roles y permisos si están disponibles
    if (rolesAndPermissions) {
      tokenPayload.roles = rolesAndPermissions.roles; // Array de nombres de roles
      tokenPayload.rolesDetails = rolesAndPermissions.rolesDetails; // Array completo de información de roles
      tokenPayload.permissions = rolesAndPermissions.permissions; // Array de permisos
    }
    
    const token = jwt.sign(
      tokenPayload,
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as any
    );
    
    return token;
  }

  /**
   * Genera un token de refresh
   */
  private generateRefreshToken(userId: string): string {
    return jwt.sign(
      { 
        userId, 
        type: 'refresh',
        iat: Math.floor(Date.now() / 1000)
      },
      config.jwt.secret,
      { expiresIn: config.jwt.refreshExpiresIn } as any
    );
  }

  /**
   * Obtiene el tiempo de expiración del token en segundos
   */
  private getTokenExpirationTime(): number {
    const expiresIn = config.jwt.expiresIn;
    if (expiresIn.endsWith('h')) {
      return Number.parseInt(expiresIn) * 3600;
    } else if (expiresIn.endsWith('d')) {
      return Number.parseInt(expiresIn) * 86400;
    } else if (expiresIn.endsWith('m')) {
      return Number.parseInt(expiresIn) * 60;
    }
    return 86400; // 24 horas por defecto
  }


  /**
   * Actualiza el último login del usuario
   */
  private async updateLastLogin(userId: string): Promise<void> {
    try {
      await this.db.update('nubestock.tb_mae_user', userId, {
        last_login: new Date(),
        modification_date: new Date(),
      });
    } catch (error) {
      logger.error('Error al actualizar último login:', error);
    }
  }
}

export default AuthService;
