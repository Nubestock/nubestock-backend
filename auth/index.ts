import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { AuthService } from '../src/services/authService';
import { logger } from '../src/config/logger';
import { validateRequest, commonSchemas } from '../src/middleware/validation';
import Joi from 'joi';

const authService = new AuthService();

const authHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    const { action } = req.params;
    
    logger.info('Auth function triggered', {
      action,
      method: req.method,
      url: req.url,
    });

    switch (action) {
      case 'login':
        await handleLogin(context, req);
        break;
      case 'register':
        await handleRegister(context, req);
        break;
      case 'refresh':
        await handleRefresh(context, req);
        break;
      case 'logout':
        await handleLogout(context, req);
        break;
      case 'change-password':
        await handleChangePassword(context, req);
        break;
      case 'reset-password':
        await handleResetPassword(context, req);
        break;
      default:
        context.res = {
          status: 404,
          body: {
            success: false,
            message: 'Acción no encontrada',
            timestamp: new Date().toISOString(),
          },
        };
        return;
    }
  } catch (error) {
    logger.error('Error en función de autenticación:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error interno del servidor',
        timestamp: new Date().toISOString(),
      },
    };
  }
};

async function handleLogin(context: Context, req: HttpRequest): Promise<void> {
  try {
    // Validar datos de entrada
    const loginSchema = commonSchemas.login;
    const { error, value } = loginSchema.validate(req.body);
    
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

async function handleRegister(context: Context, req: HttpRequest): Promise<void> {
  try {
    // Validar datos de entrada
    const registerSchema = commonSchemas.user;
    const { error, value } = registerSchema.validate(req.body);
    
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
    const { passwordhash, ...userWithoutPassword } = result;
    
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

async function handleRefresh(context: Context, req: HttpRequest): Promise<void> {
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

async function handleLogout(context: Context, req: HttpRequest): Promise<void> {
  try {
    const userId = req.headers['x-user-id'] as string;
    
    if (!userId) {
      context.res = {
        status: 401,
        body: {
          success: false,
          message: 'Usuario no autenticado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

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

async function handleChangePassword(context: Context, req: HttpRequest): Promise<void> {
  try {
    const userId = req.headers['x-user-id'] as string;
    
    if (!userId) {
      context.res = {
        status: 401,
        body: {
          success: false,
          message: 'Usuario no autenticado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

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

async function handleResetPassword(context: Context, req: HttpRequest): Promise<void> {
  try {
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
  } catch (error) {
    logger.error('Error al solicitar reset de contraseña:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al solicitar reset de contraseña',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export default authHandler;
