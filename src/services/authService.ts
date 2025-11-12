import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Database } from '../config/database';
import { config } from '../config/environment';
import { logger } from '../config/logger';
import { User, LoginRequest, LoginResponse, RegisterRequest } from '../types';

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

      // Generar tokens
      const token = this.generateToken(user.iduser);
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

      const newToken = this.generateToken(user.iduser);
      
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
   * Solicita restablecimiento de contraseña
   */
  async requestPasswordReset(email: string): Promise<void> {
    try {
      const user = await this.db.getConnection()
        .select('iduser', 'nameuser')
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

      // Aquí implementarías el envío de email con token de reset
      // Por ahora solo logueamos la acción
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
   * Restablece la contraseña con un token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      // Verificar el token (implementar lógica de tokens de reset)
      // Por ahora solo logueamos la acción
      logger.info('Contraseña restablecida con token', {
        token: token.substring(0, 10) + '...',
      });
    } catch (error) {
      logger.error('Error al restablecer contraseña:', error);
      throw error;
    }
  }

  /**
   * Genera un token JWT
   */
  private generateToken(userId: string): string {
    return jwt.sign(
      { 
        userId, 
        type: 'access',
        iat: Math.floor(Date.now() / 1000)
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as any
    );
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

      await this.db.update('tb_mae_user', userId, updateData);

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
