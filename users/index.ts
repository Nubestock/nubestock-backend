import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { Database } from '../src/config/database';
import { logger } from '../src/config/logger';
import { User, QueryFilters } from '../src/types';
import { requireAuth } from '../src/middleware/authMiddleware';
import Joi from 'joi';

const db = Database.getInstance();

const usersHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    const { action } = req.params;
    const method = req.method;
    
    logger.info('Users function triggered', {
      action,
      method,
      url: req.url,
    });

    // Verificar autenticación
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

    switch (method) {
      case 'GET':
        if (action === 'list') {
          await handleListUsers(context, req);
        } else if (action) {
          await handleGetUser(context, req, action);
        } else {
          await handleListUsers(context, req);
        }
        break;
      case 'POST':
        await handleCreateUser(context, req);
        break;
      case 'PUT':
        if (action) {
          await handleUpdateUser(context, req, action);
        } else {
          context.res = {
            status: 400,
            body: {
              success: false,
              message: 'ID de usuario requerido',
              timestamp: new Date().toISOString(),
            },
          };
        }
        break;
      case 'DELETE':
        if (action) {
          await handleDeleteUser(context, req, action);
        } else {
          context.res = {
            status: 400,
            body: {
              success: false,
              message: 'ID de usuario requerido',
              timestamp: new Date().toISOString(),
            },
          };
        }
        break;
      default:
        context.res = {
          status: 405,
          body: {
            success: false,
            message: 'Método no permitido',
            timestamp: new Date().toISOString(),
          },
        };
    }
  } catch (error) {
    logger.error('Error en función de usuarios:', error);
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

async function handleListUsers(context: Context, req: HttpRequest): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const isactive = req.query.isactive as string;

        let query = db.getConnection()
          .select('iduser', 'nameuser', 'email', 'phone', 'isactive', 'last_login', 'creationdate')
          .from('nubestock.tb_mae_user')
          .orderBy('creationdate', 'desc');

    // Aplicar filtros
    if (search) {
      query = query.where(function() {
        this.where('nameuser', 'ilike', `%${search}%`)
          .orWhere('email', 'ilike', `%${search}%`);
      });
    }

    if (isactive !== undefined) {
      query = query.where('isactive', isactive === 'true');
    }

        // Contar total usando query builder para evitar problemas de parámetros
        const countQuery = db.getConnection()
          .count('* as count')
          .from('nubestock.tb_mae_user');

        if (search) {
          countQuery.where(function() {
            this.where('nameuser', 'ilike', `%${search}%`)
              .orWhere('email', 'ilike', `%${search}%`);
          });
        }

        if (isactive !== undefined) {
          countQuery.where('isactive', isactive === 'true');
        }

        const countResult = await countQuery;
        const total = parseInt((countResult[0] as any).count as string);

    // Aplicar paginación
    const offset = (page - 1) * limit;
    const users = await query.offset(offset).limit(limit);

    context.res = {
      status: 200,
      body: {
        success: true,
        data: users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al listar usuarios:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al listar usuarios',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleGetUser(context: Context, req: HttpRequest, userId: string): Promise<void> {
  try {
    const user = await db.findById<User>('nubestock.tb_mae_user', userId, [
      'iduser', 'nameuser', 'email', 'phone', 'isactive', 
      'last_login', 'failed_login_attempts', 'creationdate', 'modificationdate'
    ]);

    if (!user) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Usuario no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Obtener roles del usuario
    const roles = await db.getConnection()
      .select('r.namerole', 'r.description')
      .from('nubestock.tb_mae_user_role as ur')
      .join('nubestock.tb_mae_role as r', 'ur.idrole', 'r.idrole')
      .where('ur.iduser', userId)
      .where('ur.isactive', true)
      .where('r.isactive', true);

    context.res = {
      status: 200,
      body: {
        success: true,
        data: {
          ...user,
          roles: roles.map(role => role.namerole),
        },
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener usuario:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener usuario',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleCreateUser(context: Context, req: HttpRequest): Promise<void> {
  try {
    const userSchema = Joi.object({
      nameuser: Joi.string().min(2).max(100).required(),
      email: Joi.string().email().required(),
      password: Joi.string().min(8).max(100).required(),
      phone: Joi.string().min(10).max(20).optional(),
      isactive: Joi.boolean().optional(),
    });

    const { error, value } = userSchema.validate(req.body);
    
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

    // Verificar si el email ya existe
    const existingUser = await db.getConnection()
      .select('iduser')
      .from('nubestock.tb_mae_user')
      .where('email', value.email)
      .first();

    if (existingUser) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'El email ya está registrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Encriptar contraseña
    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash(value.password, 12);

    const newUser = await db.create('nubestock.tb_mae_user', {
      nameuser: value.nameuser,
      email: value.email,
      passwordhash: passwordHash,
      phone: value.phone,
      isactive: value.isactive !== undefined ? value.isactive : true,
      failed_login_attempts: 0,
    });

    // Remover la contraseña del resultado
    const { passwordhash, ...userWithoutPassword } = newUser;

    context.res = {
      status: 201,
      body: {
        success: true,
        data: userWithoutPassword,
        message: 'Usuario creado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al crear usuario:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear usuario',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleUpdateUser(context: Context, req: HttpRequest, userId: string): Promise<void> {
  try {
    const updateSchema = Joi.object({
      nameuser: Joi.string().min(2).max(100).optional(),
      email: Joi.string().email().optional(),
      phone: Joi.string().min(10).max(20).optional(),
      isactive: Joi.boolean().optional(),
    });

    const { error, value } = updateSchema.validate(req.body);
    
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

    // Verificar si el usuario existe
    const existingUser = await db.findById<User>('nubestock.tb_mae_user', userId);
    if (!existingUser) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Usuario no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si el email ya existe (si se está cambiando)
    if (value.email && value.email !== existingUser.email) {
      const emailExists = await db.getConnection()
        .select('iduser')
        .from('nubestock.tb_mae_user')
        .where('email', value.email)
        .where('iduser', '!=', userId)
        .first();

      if (emailExists) {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'El email ya está registrado',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
    }

    const updatedUser = await db.update('nubestock.tb_mae_user', userId, {
      ...value,
      modificationdate: new Date(),
    });

    if (!updatedUser) {
      context.res = {
        status: 500,
        body: {
          success: false,
          message: 'Error al actualizar usuario',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Remover la contraseña del resultado
    const { passwordhash, ...userWithoutPassword } = updatedUser as any;

    context.res = {
      status: 200,
      body: {
        success: true,
        data: userWithoutPassword,
        message: 'Usuario actualizado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al actualizar usuario:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al actualizar usuario',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleDeleteUser(context: Context, req: HttpRequest, userId: string): Promise<void> {
  try {
    // Verificar si el usuario existe
    const existingUser = await db.findById<User>('nubestock.tb_mae_user', userId);
    if (!existingUser) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Usuario no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Soft delete
    const success = await db.softDelete('nubestock.tb_mae_user', userId);

    if (!success) {
      context.res = {
        status: 500,
        body: {
          success: false,
          message: 'Error al eliminar usuario',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        message: 'Usuario eliminado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al eliminar usuario:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al eliminar usuario',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export default usersHandler;
