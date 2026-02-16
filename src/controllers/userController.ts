import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import { logger } from '../config/logger';
import { User } from '../interfaces';
import Joi from 'joi';
import bcrypt from 'bcryptjs';
import { emailService } from '../services/emailService';

const db = Database.getInstance();

export async function listUsers(context: Context, req: HttpRequest): Promise<void> {
  try {
    const page = Number.parseInt(req.query.page as string) || 1;
    const limit = Number.parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const is_active = req.query.is_active as string;

    let query = db.getConnection()
      .select(
        'u.id',
        'u.name',
        'u.email',
        'u.phone',
        'u.is_active',
        'u.last_login',
        'u.creation_date'
      )
      .from('nubestock.tb_mae_user as u')
      .orderBy('u.creation_date', 'desc');

    // Aplicar filtros
    if (search) {
      query = query.where(function() {
        this.where('u.name', 'ilike', `%${search}%`)
          .orWhere('u.email', 'ilike', `%${search}%`);
      });
    }

    if (is_active !== undefined) {
      query = query.where('u.is_active', is_active === 'true');
    }

    // Contar total usando query builder para evitar problemas de parámetros
    const countQuery = db.getConnection()
      .count('* as count')
      .from('nubestock.tb_mae_user as u');

    if (search) {
      countQuery.where(function() {
        this.where('u.name', 'ilike', `%${search}%`)
          .orWhere('u.email', 'ilike', `%${search}%`);
      });
    }

    if (is_active !== undefined) {
      countQuery.where('u.is_active', is_active === 'true');
    }

    const countResult = await countQuery;
    const total = Number.parseInt((countResult[0] as any).count as string);

    // Aplicar paginación
    const offset = (page - 1) * limit;
    const users = await query.offset(offset).limit(limit);

    // Obtener roles para cada usuario
    const userIds = users.map((u: any) => u.id);
    const userRoles = await db.getConnection()
      .select('ur.id_user', 'r.name')
      .from('nubestock.tb_mae_user_role as ur')
      .join('nubestock.tb_mae_role as r', 'ur.id_role', 'r.id')
      .whereIn('ur.id_user', userIds)
      .where('ur.is_active', true)
      .where('r.is_active', true);

    // Agrupar roles por usuario
    const rolesByUser: Record<number, string[]> = {};
    userRoles.forEach((ur: any) => {
      if (!rolesByUser[ur.id_user]) {
        rolesByUser[ur.id_user] = [];
      }
      rolesByUser[ur.id_user].push(ur.name);
    });

    // Agregar roles a cada usuario
    const usersWithRoles = users.map((user: any) => ({
      ...user,
      roles: rolesByUser[user.id] || [],
    }));

    context.res = {
      status: 200,
      body: {
        success: true,
        data: usersWithRoles,
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

export async function getUser(context: Context, req: HttpRequest, userId: string): Promise<void> {
  try {
    const userIdNum = Number.parseInt(userId, 10);
    if (Number.isNaN(userIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de usuario inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const user = await db.findById<User>('nubestock.tb_mae_user', userIdNum, [
      'id', 'name', 'email', 'phone', 'is_active', 
      'last_login', 'creation_date', 'modification_date'
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
      .select('r.name', 'r.description')
      .from('nubestock.tb_mae_user_role as ur')
      .join('nubestock.tb_mae_role as r', 'ur.id_role', 'r.id')
      .where('ur.id_user', userIdNum)
      .where('ur.is_active', true)
      .where('r.is_active', true);

    context.res = {
      status: 200,
      body: {
        success: true,
        data: {
          ...user,
          roles: roles.map(role => role.name),
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

export async function createUser(context: Context, req: HttpRequest): Promise<void> {
  try {
    const userSchema = Joi.object({
      name: Joi.string().min(2).max(100).required(),
      email: Joi.string().email().required(),
      password: Joi.string().min(8).max(100).required(),
      phone: Joi.string().min(10).max(20).required(),
      is_active: Joi.boolean().optional(),
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
      .select('id')
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

    // Guardar la contraseña en texto plano temporalmente para el email (antes de hashearla)
    const plainPassword = value.password;

    // Encriptar contraseña
    const passwordHash = await bcrypt.hash(value.password, 12);

    const newUser = await db.create('nubestock.tb_mae_user', {
      name: value.name,
      email: value.email,
      pwd_hash: passwordHash,
      phone: value.phone,
      is_active: value.is_active !== undefined ? value.is_active : true,
      last_login: new Date(), // Required field in new schema
    });

    // Enviar email de bienvenida con la contraseña por defecto
    try {
      const emailSent = await emailService.sendWelcomeEmail(
        value.email,
        value.name,
        plainPassword
      );
      if (emailSent) {
        logger.info('Email de bienvenida enviado exitosamente', {
          userId: (newUser as any).id,
          email: value.email,
        });
      } else {
        logger.warn('Email de bienvenida no enviado (servicio deshabilitado)', {
          userId: (newUser as any).id,
          email: value.email,
        });
      }
    } catch (emailError) {
      logger.error('Error al enviar email de bienvenida:', emailError);
      // No fallamos la operación si el email falla, solo logueamos el error
      // El usuario ya fue creado exitosamente
    }

    // Remover la contraseña del resultado
    const { pwd_hash, ...userWithoutPassword } = newUser as any;

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

export async function updateUser(context: Context, req: HttpRequest, userId: string): Promise<void> {
  try {
    const userIdNum = Number.parseInt(userId, 10);
    if (Number.isNaN(userIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de usuario inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const updateSchema = Joi.object({
      name: Joi.string().min(2).max(100).optional(),
      email: Joi.string().email().optional(),
      phone: Joi.string().min(10).max(20).optional(),
      is_active: Joi.boolean().optional(),
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
    const existingUser = await db.findById<User>('nubestock.tb_mae_user', userIdNum);
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
        .select('id')
        .from('nubestock.tb_mae_user')
        .where('email', value.email)
        .where('id', '!=', userIdNum)
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

    const updatedUser = await db.update('nubestock.tb_mae_user', userIdNum, {
      ...value,
      modification_date: new Date(),
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
    const { pwd_hash, ...userWithoutPassword } = updatedUser as any;

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

export async function deleteUser(context: Context, req: HttpRequest, userId: string): Promise<void> {
  try {
    const userIdNum = Number.parseInt(userId, 10);
    if (Number.isNaN(userIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de usuario inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si el usuario existe
    const existingUser = await db.findById<User>('nubestock.tb_mae_user', userIdNum);
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
    const success = await db.softDelete('nubestock.tb_mae_user', userIdNum);

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
