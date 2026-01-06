import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { Database } from '../src/config/database';
import { logger } from '../src/config/logger';
import { requireAuth, requireAdmin, requireAnyPermission } from '../src/middleware/authMiddleware';

const db = Database.getInstance();

const rolesHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    const { action } = req.params;
    const method = req.method;
    
    logger.info('Roles function triggered', {
      action,
      method,
      url: req.url,
    });

    // Verificar autenticación y permisos (roles requiere permisos de administrador)
    let authResult: { success: boolean; user?: any; error?: string };
    
    switch (method) {
      case 'GET':
        // GET requiere permiso de lectura de roles (admin o users_manage)
        authResult = requireAnyPermission(req, ['roles_read', 'users_manage', 'admin']);
        break;
      case 'POST':
      case 'PUT':
      case 'DELETE':
        // POST/PUT/DELETE requiere permisos de administrador
        authResult = requireAnyPermission(req, ['roles_write', 'users_manage', 'admin']);
        break;
      default:
        authResult = requireAuth(req);
    }

    if (!authResult.success) {
      context.res = {
        status: authResult.error?.includes('permisos') ? 403 : 401,
        body: {
          success: false,
          message: authResult.error || 'Usuario no autenticado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    switch (method) {
      case 'GET':
        if (action === 'permissions') {
          await handleGetPermissions(context, req);
        } else if (action === 'all') {
          await handleGetAllRolesWithPermissions(context, req);
        } else if (action) {
          await handleGetRole(context, req, action);
        } else {
          await handleListRoles(context, req);
        }
        break;
      case 'POST':
        await handleCreateRole(context, req);
        break;
      case 'PUT':
        if (action) {
          await handleUpdateRole(context, req, action);
        } else {
          context.res = {
            status: 400,
            body: {
              success: false,
              message: 'ID de rol requerido',
              timestamp: new Date().toISOString(),
            },
          };
        }
        break;
      case 'DELETE':
        if (action) {
          await handleDeleteRole(context, req, action);
        } else {
          context.res = {
            status: 400,
            body: {
              success: false,
              message: 'ID de rol requerido',
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
    logger.error('Error en función de roles:', error);
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

async function handleListRoles(context: Context, req: HttpRequest): Promise<void> {
  try {
    const roles = await db.getConnection()
      .select('*')
      .from('nubestock.tb_mae_role')
      .where('isactive', true)
      .orderBy('namerole');

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

async function handleGetAllRolesWithPermissions(context: Context, req: HttpRequest): Promise<void> {
  try {
    // Obtener todos los roles activos
    const roles = await db.getConnection()
      .select('*')
      .from('nubestock.tb_mae_role')
      .where('isactive', true)
      .orderBy('namerole');

    // Para cada rol, obtener sus permisos
    const rolesWithPermissions = await Promise.all(
      roles.map(async (role: any) => {
        const permissions = await db.getConnection()
          .select('p.*')
          .from('nubestock.tb_mae_role_permission as rp')
          .join('nubestock.tb_mae_permission as p', 'rp.idpermission', 'p.idpermission')
          .where('rp.idrole', role.idrole)
          .where('rp.isactive', true)
          .where('p.isactive', true)
          .orderBy('p.namepermission');

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
      .where('isactive', true)
      .orderBy('namepermission');

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

async function handleGetRole(context: Context, req: HttpRequest, roleId: string): Promise<void> {
  try {
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

    // Obtener permisos del rol
    const permissions = await db.getConnection()
      .select('p.*')
      .from('nubestock.tb_mae_role_permission as rp')
      .join('nubestock.tb_mae_permission as p', 'rp.idpermission', 'p.idpermission')
      .where('rp.idrole', roleId)
      .where('rp.isactive', true)
      .where('p.isactive', true);

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

async function handleGetPermissions(context: Context, req: HttpRequest): Promise<void> {
  try {
    const permissions = await db.getConnection()
      .select('*')
      .from('nubestock.tb_mae_permission')
      .where('isactive', true)
      .orderBy('namepermission');

    context.res = {
      status: 200,
      body: {
        success: true,
        data: permissions,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener permisos:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener permisos',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleCreateRole(context: Context, req: HttpRequest): Promise<void> {
  try {
    const { namerole, description, permissions } = req.body;

    if (!namerole) {
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
      .select('idrole')
      .from('nubestock.tb_mae_role')
      .where('namerole', namerole)
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
      namerole,
      description,
      isactive: true,
    });

    // Asignar permisos si se proporcionan
    if (permissions && Array.isArray(permissions)) {
      for (const permissionId of permissions) {
        await db.create('nubestock.tb_mae_role_permission', {
          idrole: (newRole as any).idrole,
          idpermission: permissionId,
          isactive: true,
        });
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

async function handleUpdateRole(context: Context, req: HttpRequest, roleId: string): Promise<void> {
  try {
    const { namerole, description, permissions } = req.body;

    const existingRole = await db.findById('nubestock.tb_mae_role', roleId);
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
    const updatedRole = await db.update('nubestock.tb_mae_role', roleId, {
      namerole,
      description,
      modificationdate: new Date(),
    });

    // Actualizar permisos si se proporcionan
    if (permissions && Array.isArray(permissions)) {
      // Eliminar permisos existentes
      await db.getConnection()
        .from('nubestock.tb_mae_role_permission')
        .where('idrole', roleId)
        .del();

      // Agregar nuevos permisos
      for (const permissionId of permissions) {
        await db.create('nubestock.tb_mae_role_permission', {
          idrole: roleId,
          idpermission: permissionId,
          isactive: true,
        });
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

async function handleDeleteRole(context: Context, req: HttpRequest, roleId: string): Promise<void> {
  try {
    const deletedRole = await db.softDelete('nubestock.tb_mae_role', roleId);

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

export default rolesHandler;
