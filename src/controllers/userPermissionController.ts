import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import { logger } from '../config/logger';
import { requireAuth, requireAnyPermission } from '../middleware/authMiddleware';
import { config } from '../config/environment';
import Joi from 'joi';

const db = Database.getInstance();

export async function getUserPermissions(context: Context, req: HttpRequest, userId: string): Promise<void> {
  try {
    // Obtener roles del usuario
    const userRoles = await db.getConnection()
      .select('r.*')
      .from('nubestock.tb_mae_user_role as ur')
      .join('nubestock.tb_mae_role as r', 'ur.id_role', 'r.id')
      .where('ur.id_user', userId)
      .where('ur.is_active', true)
      .where('r.is_active', true);

    // Obtener permisos del usuario (a través de sus roles)
    const userPermissions = await db.getConnection()
      .select('p.*')
      .from('nubestock.tb_mae_user_role as ur')
      .join('nubestock.tb_mae_role_permission as rp', 'ur.id_role', 'rp.id_role')
      .join('nubestock.tb_mae_permission as p', 'rp.id_permission', 'p.id')
      .where('ur.id_user', userId)
      .where('ur.is_active', true)
      .where('rp.is_active', true)
      .where('p.is_active', true)
      .distinct();

    context.res = {
      status: 200,
      body: {
        success: true,
        data: {
          roles: userRoles,
          permissions: userPermissions,
        },
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener permisos del usuario:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener permisos del usuario',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function checkPermission(context: Context, req: HttpRequest): Promise<void> {
  try {
    const { userId, permission } = req.query;

    if (!userId || !permission) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'userId y permission son requeridos',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si el usuario tiene el permiso específico
    const hasPermission = await db.getConnection()
      .select('p.id')
      .from('nubestock.tb_mae_user_role as ur')
      .join('nubestock.tb_mae_role_permission as rp', 'ur.id_role', 'rp.id_role')
      .join('nubestock.tb_mae_permission as p', 'rp.id_permission', 'p.id')
      .where('ur.id_user', userId)
      .where('p.name', permission)
      .where('ur.is_active', true)
      .where('rp.is_active', true)
      .where('p.is_active', true)
      .first();

    context.res = {
      status: 200,
      body: {
        success: true,
        data: {
          hasPermission: !!hasPermission,
          permission,
        },
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al verificar permiso:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al verificar permiso',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function assignRole(context: Context, req: HttpRequest): Promise<void> {
  try {
    // Verificar bypass flag para inicialización del sistema
    // Este flag permite saltarse la validación de permisos solo durante la inicialización
    const headers = req.headers || {};
    const bootstrapKeyHeader = Object.keys(headers).find(
      key => key.toLowerCase() === 'x-bootstrap-key'
    );
    const providedBootstrapKey = bootstrapKeyHeader ? headers[bootstrapKeyHeader] : null;
    const isBootstrapMode = config.security.bootstrapKey && 
                           config.security.bootstrapKey !== '' &&
                           providedBootstrapKey === config.security.bootstrapKey;

    // Obtener el usuario que está asignando el rol (del token JWT)
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

    // Si NO está en modo bootstrap, verificar permisos
    if (!isBootstrapMode) {
      const permissionResult = requireAnyPermission(req, ['roles_write', 'users_manage', 'admin']);
      if (!permissionResult.success) {
        context.res = {
          status: 403,
          body: {
            success: false,
            message: permissionResult.error || 'No tienes permisos para realizar esta acción',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
    } else {
      // Log de seguridad cuando se usa el bypass
      logger.warn('Bootstrap mode activado para asignación de rol', {
        userId: authResult.user!.userId,
        userEmail: authResult.user!.userEmail,
        timestamp: new Date().toISOString(),
      });
    }

    const assignedBy = authResult.user!.userId;

    // Validar el body
    const assignRoleSchema = Joi.object({
      userId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).required(),
      roleId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).required(),
      assignment_reason: Joi.string().min(3).max(500).required(),
    });

    const { error, value } = assignRoleSchema.validate(req.body);
    
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

    // Convertir userId y roleId a números si vienen como string
    const userId = typeof value.userId === 'string' ? parseInt(value.userId, 10) : value.userId;
    const roleId = typeof value.roleId === 'string' ? parseInt(value.roleId, 10) : value.roleId;
    const { assignment_reason } = value;

    // Verificar si el usuario existe
    const user = await db.findById('nubestock.tb_mae_user', userId);
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

    // Verificar si el rol existe
    const role = await db.findById('nubestock.tb_mae_role', roleId);
    if (!role) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Rol no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si ya tiene el rol asignado
    const existingAssignment = await db.getConnection()
      .select('id')
      .from('nubestock.tb_mae_user_role')
      .where('id_user', userId)
      .where('id_role', roleId)
      .where('is_active', true)
      .first();

    if (existingAssignment) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'El usuario ya tiene este rol asignado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Convertir assignedBy a número si es string
    const assignedByNum = typeof assignedBy === 'string' ? parseInt(assignedBy, 10) : assignedBy;

    // Asignar el rol
    const newAssignment = await db.create('nubestock.tb_mae_user_role', {
      id_user: userId,
      id_role: roleId,
      assigned_by: assignedByNum,
      assignment_reason: assignment_reason,
      is_active: true,
      creation_date: new Date(),
    });

    context.res = {
      status: 201,
      body: {
        success: true,
        data: newAssignment,
        message: 'Rol asignado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al asignar rol:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al asignar rol',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function removeRole(context: Context, req: HttpRequest, userId: string): Promise<void> {
  try {
    const { roleId } = req.body;

    if (!roleId) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'roleId es requerido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    const roleIdNum = typeof roleId === 'string' ? parseInt(roleId, 10) : roleId;

    // Desactivar la asignación de rol
    const result = await db.getConnection()
      .from('nubestock.tb_mae_user_role')
      .where('id_user', userIdNum)
      .where('id_role', roleIdNum)
      .update({
        is_active: false,
        modification_date: new Date(),
      });

    if (result === 0) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Asignación de rol no encontrada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        message: 'Rol removido exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al remover rol:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al remover rol',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
