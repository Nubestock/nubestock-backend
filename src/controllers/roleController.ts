import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import { logger } from '../config/logger';

const db = Database.getInstance();

export async function listRoles(context: Context, req: HttpRequest): Promise<void> {
  try {
    const roles = await db.getConnection()
      .select('*')
      .from('nubestock.tb_mae_role')
      .where('is_active', true)
      .orderBy('name');

    context.res = {
      status: 200,
      body: {
        success: true,
        data: roles,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al listar roles:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al listar roles',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function getAllRolesWithPermissions(context: Context, req: HttpRequest): Promise<void> {
  try {
    // Obtener todos los roles activos
    const roles = await db.getConnection()
      .select('*')
      .from('nubestock.tb_mae_role')
      .where('is_active', true)
      .orderBy('name');

    // Para cada rol, obtener sus permisos
    const rolesWithPermissions = await Promise.all(
      roles.map(async (role: any) => {
        const permissions = await db.getConnection()
          .select('p.*')
          .from('nubestock.tb_mae_role_permission as rp')
          .join('nubestock.tb_mae_permission as p', 'rp.id_permission', 'p.id')
          .where('rp.id_role', role.id)
          .where('rp.is_active', true)
          .where('p.is_active', true)
          .orderBy('p.name');

        return {
          ...role,
          permissions: permissions || [],
          permissionsCount: permissions?.length || 0,
        };
      })
    );

    // También obtener todos los permisos disponibles para referencia
    const allPermissions = await db.getConnection()
      .select('*')
      .from('nubestock.tb_mae_permission')
      .where('is_active', true)
      .orderBy('name');

    context.res = {
      status: 200,
      body: {
        success: true,
        data: {
          roles: rolesWithPermissions,
          totalRoles: rolesWithPermissions.length,
          allPermissions: allPermissions,
          totalPermissions: allPermissions.length,
        },
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener roles con permisos:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener roles con permisos',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function getRole(context: Context, req: HttpRequest, roleId: string): Promise<void> {
  try {
    const roleIdNum = parseInt(roleId, 10);
    if (isNaN(roleIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de rol inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const role = await db.findById('nubestock.tb_mae_role', roleIdNum);

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

    // Obtener permisos del rol
    const permissions = await db.getConnection()
      .select('p.*')
      .from('nubestock.tb_mae_role_permission as rp')
      .join('nubestock.tb_mae_permission as p', 'rp.id_permission', 'p.id')
      .where('rp.id_role', roleIdNum)
      .where('rp.is_active', true)
      .where('p.is_active', true);

    context.res = {
      status: 200,
      body: {
        success: true,
        data: { 
          ...(role as any), 
          permissions: permissions || [] 
        },
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener rol:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener rol',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function createRole(context: Context, req: HttpRequest): Promise<void> {
  try {
    const { name, description, permissions } = req.body;

    if (!name) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Nombre del rol es requerido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si el rol ya existe
    const existingRole = await db.getConnection()
      .select('id')
      .from('nubestock.tb_mae_role')
      .where('name', name)
      .first();

    if (existingRole) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'El rol ya existe',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Crear el rol
    const newRole = await db.create('nubestock.tb_mae_role', {
      name,
      description,
      is_active: true,
    });

    // Asignar permisos si se proporcionan
    if (permissions && Array.isArray(permissions)) {
      // Validar que todos los permisos existan antes de asignarlos
      const permissionIds = permissions
        .map(p => typeof p === 'string' ? parseInt(p, 10) : p)
        .filter(p => !isNaN(p));

      if (permissionIds.length > 0) {
        const existingPermissions = await db.getConnection()
          .select('id')
          .from('nubestock.tb_mae_permission')
          .whereIn('id', permissionIds)
          .where('is_active', true);

        const existingIds = existingPermissions.map(p => p.id);
        const invalidIds = permissionIds.filter(id => !existingIds.includes(id));

        if (invalidIds.length > 0) {
          context.res = {
            status: 400,
            body: {
              success: false,
              message: `Los siguientes IDs de permisos no existen: ${invalidIds.join(', ')}`,
              timestamp: new Date().toISOString(),
            },
          };
          return;
        }

        // Agregar nuevos permisos
        for (const permissionId of permissionIds) {
          await db.create('nubestock.tb_mae_role_permission', {
            id_role: (newRole as any).id,
            id_permission: permissionId,
            is_active: true,
          });
        }
      }
    }

    context.res = {
      status: 201,
      body: {
        success: true,
        data: newRole,
        message: 'Rol creado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al crear rol:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear rol',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function updateRole(context: Context, req: HttpRequest, roleId: string): Promise<void> {
  try {
    const roleIdNum = parseInt(roleId, 10);
    if (isNaN(roleIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de rol inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const { name, description, permissions } = req.body;

    const existingRole = await db.findById('nubestock.tb_mae_role', roleIdNum);
    if (!existingRole) {
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

    // Actualizar el rol
    const updateData: any = {
      modification_date: new Date(),
    };
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    const updatedRole = await db.update('nubestock.tb_mae_role', roleIdNum, updateData);

    // Actualizar permisos si se proporcionan
    if (permissions && Array.isArray(permissions)) {
      // Validar que todos los permisos existan antes de asignarlos
      const permissionIds = permissions
        .map(p => typeof p === 'string' ? parseInt(p, 10) : p)
        .filter(p => !isNaN(p));

      if (permissionIds.length > 0) {
        const existingPermissions = await db.getConnection()
          .select('id')
          .from('nubestock.tb_mae_permission')
          .whereIn('id', permissionIds)
          .where('is_active', true);

        const existingIds = existingPermissions.map(p => p.id);
        const invalidIds = permissionIds.filter(id => !existingIds.includes(id));

        if (invalidIds.length > 0) {
          context.res = {
            status: 400,
            body: {
              success: false,
              message: `Los siguientes IDs de permisos no existen: ${invalidIds.join(', ')}`,
              timestamp: new Date().toISOString(),
            },
          };
          return;
        }

        // Eliminar permisos existentes (soft delete: marcar como inactivos)
        await db.getConnection()
          .from('nubestock.tb_mae_role_permission')
          .where('id_role', roleIdNum)
          .update({ is_active: false, modification_date: new Date() });

        // Agregar nuevos permisos
        for (const permissionId of permissionIds) {
          await db.create('nubestock.tb_mae_role_permission', {
            id_role: roleIdNum,
            id_permission: permissionId,
            is_active: true,
          });
        }
      }
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedRole,
        message: 'Rol actualizado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al actualizar rol:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al actualizar rol',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function deleteRole(context: Context, req: HttpRequest, roleId: string): Promise<void> {
  try {
    const roleIdNum = parseInt(roleId, 10);
    if (isNaN(roleIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de rol inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const deletedRole = await db.softDelete('nubestock.tb_mae_role', roleIdNum);

    if (!deletedRole) {
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

    context.res = {
      status: 200,
      body: {
        success: true,
        data: deletedRole,
        message: 'Rol eliminado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al eliminar rol:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al eliminar rol',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
