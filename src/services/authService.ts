import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Database } from '../config/database';
import { config } from '../config/environment';
import { logger } from '../config/logger';
import { User, LoginRequest, LoginResponse, RegisterRequest } from '../types';
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
        .select('iduser')
        .from('nubestock.tb_mae_user')
        .where('email', userData.email)
        .first();

      if (existingUser) {
        throw new Error('El email ya está registrado');
      }

      // Encriptar la contraseña
      const passwordHash = await bcrypt.hash(userData.password, config.security.bcryptRounds);

      // Crear el usuario
      const newUser = await this.db.create<User>('nubestock.tb_mae_user', {
        nameuser: userData.nameuser,
        email: userData.email,
        passwordhash: passwordHash,
        phone: userData.phone,
        isactive: true,
        failed_login_attempts: 0,
      });

      logger.info('Usuario registrado exitosamente', {
        userId: (newUser as any).iduser,
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
        .where('isactive', true)
        .first();

      if (!user) {
        throw new Error('Credenciales inválidas');
      }

      // Verificar si la cuenta está bloqueada
      if (user.account_locked_until && new Date() < user.account_locked_until) {
        throw new Error('Cuenta bloqueada temporalmente');
      }

      // Verificar la contraseña
      const isValidPassword = await bcrypt.compare(credentials.password, user.passwordhash);
      
      if (!isValidPassword) {
        // Incrementar intentos fallidos
        await this.incrementFailedAttempts(user.iduser);
        throw new Error('Credenciales inválidas');
      }

      // Resetear intentos fallidos si el login es exitoso
      await this.resetFailedAttempts(user.iduser);

      // Actualizar último login
      await this.updateLastLogin(user.iduser);

      // Obtener roles y permisos del usuario
      const userRolesAndPermissions = await this.getUserRolesAndPermissions(user.iduser);

      // Generar tokens con información completa
      const token = this.generateToken(user.iduser, userRolesAndPermissions);
      const refreshToken = this.generateRefreshToken(user.iduser);

      // Remover la contraseña del objeto de respuesta
      const { passwordhash, ...userWithoutPassword } = user;

      logger.info('Login exitoso', {
        userId: user.iduser,
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
      
      if (!user || !user.isactive) {
        throw new Error('Usuario no válido');
      }

      // Obtener roles y permisos para el nuevo token
      const userRolesAndPermissions = await this.getUserRolesAndPermissions(user.iduser);
      const newToken = this.generateToken(user.iduser, userRolesAndPermissions);
      
      logger.info('Token refrescado exitosamente', {
        userId: user.iduser,
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
      const isValidPassword = await bcrypt.compare(currentPassword, user.passwordhash);
      
      if (!isValidPassword) {
        throw new Error('Contraseña actual incorrecta');
      }

      // Encriptar la nueva contraseña
      const newPasswordHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);

      // Actualizar la contraseña
      await this.db.update('nubestock.tb_mae_user', userId, {
        passwordhash: newPasswordHash,
        modificationdate: new Date(),
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
        .select('iduser', 'nameuser', 'email')
        .from('nubestock.tb_mae_user')
        .where('email', email)
        .where('isactive', true)
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
      await this.storeResetToken(user.iduser, resetToken, expiresAt);

      // Enviar email al usuario
      try {
        const emailSent = await emailService.sendPasswordResetEmail(user.email, user.nameuser, resetToken);
        if (emailSent) {
          logger.info('Email de restablecimiento enviado exitosamente', {
            userId: user.iduser,
            email: user.email,
          });
        } else {
          logger.warn('Email de restablecimiento no enviado (servicio deshabilitado). Token generado:', {
            userId: user.iduser,
            email: user.email,
            resetToken: resetToken.substring(0, 10) + '...', // Solo primeros 10 caracteres para logs
          });
        }
      } catch (emailError) {
        logger.error('Error al enviar email de restablecimiento:', emailError);
        // No fallamos la operación si el email falla, solo logueamos el error
      }

      logger.info('Solicitud de reset de contraseña', {
        userId: user.iduser,
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
        iduser: userId,
        reset_token: token,
        expires_at: expiresAt,
        isactive: true,
        creationdate: new Date(),
        modificationdate: new Date(),
      };

      // Intentar insertar o actualizar
      await this.db.getConnection()
        .from('nubestock.tb_ope_password_reset_token')
        .where('iduser', userId)
        .where('isactive', true)
        .update({ isactive: false, modificationdate: new Date() });

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
  async requestPasswordResetByAdmin(targetEmail: string, requestedBy: string): Promise<{ userId: string; email: string; nameuser: string; token?: string }> {
    try {
      const user = await this.db.getConnection()
        .select('iduser', 'nameuser', 'email')
        .from('nubestock.tb_mae_user')
        .where('email', targetEmail)
        .where('isactive', true)
        .first();

      if (!user) {
        throw new Error('Usuario no encontrado o inactivo');
      }

      // Generar token de restablecimiento
      const resetToken = this.generateResetToken();
      
      // Calcular fecha de expiración (1 hora desde ahora)
      const expiresAt = new Date(Date.now() + config.security.passwordResetTokenExpiry);

      // Almacenar token en la base de datos
      await this.storeResetToken(user.iduser, resetToken, expiresAt);

      // Enviar email al usuario
      try {
        const emailSent = await emailService.sendPasswordResetEmail(user.email, user.nameuser, resetToken);
        if (emailSent) {
          logger.info('Email de restablecimiento enviado exitosamente', {
            targetUserId: user.iduser,
            targetEmail: user.email,
          });
        } else {
          logger.warn('Email de restablecimiento no enviado (servicio deshabilitado). Token generado:', {
            targetUserId: user.iduser,
            targetEmail: user.email,
            resetToken: resetToken.substring(0, 10) + '...', // Solo primeros 10 caracteres para logs
          });
        }
      } catch (emailError) {
        logger.error('Error al enviar email de restablecimiento:', emailError);
        // No fallamos la operación si el email falla, solo logueamos el error
      }

      // Loguear la acción de administrador
      logger.info('Solicitud de reset de contraseña por administrador', {
        targetUserId: user.iduser,
        targetEmail: user.email,
        requestedBy,
        tokenGenerated: true,
      });

      return {
        userId: user.iduser,
        email: user.email,
        nameuser: user.nameuser,
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
        .where('isactive', true)
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
          .where('idreset_token', resetToken.idreset_token)
          .update({ isactive: false, modificationdate: now });

        throw new Error('Token de restablecimiento expirado');
      }

      // Verificar que el usuario existe y está activo
      const user = await this.db.getConnection()
        .select('iduser', 'email')
        .from('nubestock.tb_mae_user')
        .where('iduser', resetToken.iduser)
        .where('isactive', true)
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
          .where('iduser', resetToken.iduser)
          .update({
            passwordhash: passwordHash,
            modificationdate: now,
          });

        // Marcar el token como usado
        await trx('nubestock.tb_ope_password_reset_token')
          .where('idreset_token', resetToken.idreset_token)
          .update({
            isactive: false,
            modificationdate: now,
          });
      });

      logger.info('Contraseña restablecida exitosamente con token', {
        userId: resetToken.iduser,
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
        .select('r.idrole', 'r.namerole', 'r.description')
        .from('nubestock.tb_mae_user_role as ur')
        .join('nubestock.tb_mae_role as r', 'ur.idrole', 'r.idrole')
        .where('ur.iduser', userId)
        .where('ur.isactive', true)
        .where('r.isactive', true);

      // Obtener permisos del usuario (a través de sus roles)
      const userPermissions = await this.db.getConnection()
        .select('p.namepermission')
        .from('nubestock.tb_mae_user_role as ur')
        .join('nubestock.tb_mae_role_permission as rp', 'ur.idrole', 'rp.idrole')
        .join('nubestock.tb_mae_permission as p', 'rp.idpermission', 'p.idpermission')
        .where('ur.iduser', userId)
        .where('ur.isactive', true)
        .where('rp.isactive', true)
        .where('p.isactive', true)
        .distinct();

      return {
        roles: userRoles.map(r => r.namerole),
        rolesDetails: userRoles.map(r => ({
          idrole: r.idrole,
          namerole: r.namerole,
          description: r.description || undefined
        })),
        permissions: userPermissions.map(p => p.namepermission)
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
      return parseInt(expiresIn) * 3600;
    } else if (expiresIn.endsWith('d')) {
      return parseInt(expiresIn) * 86400;
    } else if (expiresIn.endsWith('m')) {
      return parseInt(expiresIn) * 60;
    }
    return 86400; // 24 horas por defecto
  }

  /**
   * Incrementa los intentos fallidos de login
   */
  private async incrementFailedAttempts(userId: string): Promise<void> {
    try {
      const user = await this.db.findById<User>('nubestock.tb_mae_user', userId);
      if (!user) return;

      const newAttempts = user.failed_login_attempts + 1;
      const updateData: Partial<User> = {
        failed_login_attempts: newAttempts,
        modificationdate: new Date(),
      };

      // Bloquear la cuenta si se excede el límite
      if (newAttempts >= config.security.maxLoginAttempts) {
        updateData.account_locked_until = new Date(
          Date.now() + config.security.lockoutDuration
        );
      }

      await this.db.update('nubestock.tb_mae_user', userId, updateData);

      logger.warn('Intento de login fallido', {
        userId,
        attempts: newAttempts,
        locked: newAttempts >= config.security.maxLoginAttempts,
      });
    } catch (error) {
      logger.error('Error al incrementar intentos fallidos:', error);
    }
  }

  /**
   * Resetea los intentos fallidos de login
   */
  private async resetFailedAttempts(userId: string): Promise<void> {
    try {
      await this.db.update('nubestock.tb_mae_user', userId, {
        failed_login_attempts: 0,
        account_locked_until: null,
        modificationdate: new Date(),
      });
    } catch (error) {
      logger.error('Error al resetear intentos fallidos:', error);
    }
  }

  /**
   * Actualiza el último login del usuario
   */
  private async updateLastLogin(userId: string): Promise<void> {
    try {
      await this.db.update('nubestock.tb_mae_user', userId, {
        last_login: new Date(),
        modificationdate: new Date(),
      });
    } catch (error) {
      logger.error('Error al actualizar último login:', error);
    }
  }
}

export default AuthService;
