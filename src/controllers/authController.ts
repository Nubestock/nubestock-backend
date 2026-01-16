import { Context, HttpRequest } from '../types/azure-functions';
import { AuthService } from '../services/authService';
import { logger } from '../config/logger';
import { commonSchemas } from '../middleware/validation';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware';
import Joi from 'joi';

const authService = new AuthService();

export async function login(context: Context, req: HttpRequest): Promise<void> {
  try {
    // Validar datos de entrada
    const loginSchema = commonSchemas.login;
    const { error, value } = loginSchema.validate(req.body, {
      stripUnknown: true,
      abortEarly: false,
    });
    
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

    const result = await authService.login(value);
    
    context.res = {
      status: 200,
      body: {
        success: true,
        data: result,
        message: 'Login exitoso',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error en login:', error);
    context.res = {
      status: 401,
      body: {
        success: false,
        message: error instanceof Error ? error.message : 'Error en login',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function register(context: Context, req: HttpRequest): Promise<void> {
  try {
    // Validar datos de entrada
    const registerSchema = commonSchemas.user;
    const { error, value } = registerSchema.validate(req.body, {
      stripUnknown: true, // Eliminar campos no permitidos (como is_active)
      abortEarly: false,
    });
    
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

    const result = await authService.register(value);
    
    // Remover la contraseña del resultado
    const { pwd_hash, ...userWithoutPassword } = result;
    
    context.res = {
      status: 201,
      body: {
        success: true,
        data: userWithoutPassword,
        message: 'Usuario registrado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error en registro:', error);
    context.res = {
      status: 400,
      body: {
        success: false,
        message: error instanceof Error ? error.message : 'Error en registro',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function refresh(context: Context, req: HttpRequest): Promise<void> {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Token de refresh requerido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const result = await authService.refreshToken(refreshToken);
    
    context.res = {
      status: 200,
      body: {
        success: true,
        data: result,
        message: 'Token refrescado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al refrescar token:', error);
    context.res = {
      status: 401,
      body: {
        success: false,
        message: error instanceof Error ? error.message : 'Error al refrescar token',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function logout(context: Context, req: HttpRequest): Promise<void> {
  try {
    // Verificar autenticación usando el middleware
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

    const { userId } = authResult.user!;

    await authService.logout(userId);
    
    context.res = {
      status: 200,
      body: {
        success: true,
        message: 'Logout exitoso',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error en logout:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error en logout',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function changePassword(context: Context, req: HttpRequest): Promise<void> {
  try {
    // Verificar autenticación usando el middleware
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

    const { userId } = authResult.user!;

    const changePasswordSchema = Joi.object({
      currentPassword: Joi.string().required(),
      newPassword: Joi.string().min(8).max(100).required(),
    });

    const { error, value } = changePasswordSchema.validate(req.body);
    
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

    await authService.changePassword(userId, value.currentPassword, value.newPassword);
    
    context.res = {
      status: 200,
      body: {
        success: true,
        message: 'Contraseña cambiada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al cambiar contraseña:', error);
    context.res = {
      status: 400,
      body: {
        success: false,
        message: error instanceof Error ? error.message : 'Error al cambiar contraseña',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function resetPassword(context: Context, req: HttpRequest): Promise<void> {
  try {
    const method = req.method;

    if (method === 'POST') {
      // Solicitar reset de contraseña (generar token y enviar email)
      const { email } = req.body;
      
      if (!email) {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'Email requerido',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }

      await authService.requestPasswordReset(email);
      
      context.res = {
        status: 200,
        body: {
          success: true,
          message: 'Si el email existe, se enviará un enlace de restablecimiento',
          timestamp: new Date().toISOString(),
        },
      };
    } else if (method === 'PUT') {
      // Restablecer contraseña con token
      const resetPasswordSchema = Joi.object({
        token: Joi.string().required(),
        newPassword: Joi.string().min(8).max(100).required(),
      });

      const { error, value } = resetPasswordSchema.validate(req.body);
      
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

      const { token, newPassword } = value;

      await authService.resetPassword(token, newPassword);
      
      context.res = {
        status: 200,
        body: {
          success: true,
          message: 'Contraseña restablecida exitosamente',
          timestamp: new Date().toISOString(),
        },
      };
    } else {
      context.res = {
        status: 405,
        body: {
          success: false,
          message: 'Método no permitido. Use POST para solicitar reset o PUT para restablecer contraseña',
          timestamp: new Date().toISOString(),
        },
      };
    }
  } catch (error: any) {
    logger.error('Error en reset de contraseña:', error);
    
    // Manejar errores específicos
    if (error.message === 'Token de restablecimiento inválido o ya utilizado') {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Token de restablecimiento inválido o ya utilizado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    if (error.message === 'Token de restablecimiento expirado') {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Token de restablecimiento expirado. Por favor, solicite un nuevo restablecimiento',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    if (error.message === 'La contraseña debe tener al menos 8 caracteres') {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: error.message && error.message.includes('Token') ? 400 : 500,
      body: {
        success: false,
        message: error.message || 'Error al procesar restablecimiento de contraseña',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function adminResetPassword(context: Context, req: HttpRequest): Promise<void> {
  try {
    // Verificar que el usuario autenticado sea administrador
    const authResult = requireAdmin(req);
    if (!authResult.success) {
      context.res = {
        status: 403,
        body: {
          success: false,
          message: authResult.error || 'Se requieren permisos de administrador',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const adminUser = authResult.user!;

    // Validar datos de entrada
    const resetPasswordSchema = Joi.object({
      email: Joi.string().email().required(),
    });

    const { error, value } = resetPasswordSchema.validate(req.body);
    
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

    const { email } = value;

    // Solicitar reset de contraseña como administrador
    const userInfo = await authService.requestPasswordResetByAdmin(email, adminUser.userId);
    
    context.res = {
      status: 200,
      body: {
        success: true,
        message: 'Solicitud de restablecimiento de contraseña generada exitosamente',
        data: {
          userId: userInfo.userId,
          email: userInfo.email,
          name: userInfo.name,
        },
        requestedBy: {
          userId: adminUser.userId,
          email: adminUser.userEmail,
        },
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al solicitar reset de contraseña como administrador:', error);
    context.res = {
      status: error instanceof Error && error.message === 'Usuario no encontrado o inactivo' ? 404 : 500,
      body: {
        success: false,
        message: error instanceof Error ? error.message : 'Error al solicitar reset de contraseña',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
