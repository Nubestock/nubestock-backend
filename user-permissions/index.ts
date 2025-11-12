import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { Database } from '../src/config/database';
import { logger } from '../src/config/logger';
import { requireAuth } from '../src/middleware/authMiddleware';

const db = Database.getInstance();

const userPermissionsHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    const { action } = req.params;
    const method = req.method;
    
    logger.info('User permissions function triggered', {
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

    switch (method) {
      case 'GET':
        if (action === 'check') {
          await handleCheckPermission(context, req);
        } else if (action) {
          await handleGetUserPermissions(context, req, action);
        } else {
          await handleGetUserPermissions(context, req, authResult.user!.userId);
        }
        break;
      case 'POST':
        await handleAssignRole(context, req);
        break;
      case 'DELETE':
        if (action) {
          await handleRemoveRole(context, req, action);
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
    logger.error('Error en función de permisos de usuario:', error);
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

async function handleGetUserPermissions(context: Context, req: HttpRequest, userId: string): Promise<void> {
  try {
    // Obtener roles del usuario
    const userRoles = await db.getConnection()
      .select('r.*')
      .from('nubestock.tb_mae_user_role as ur')
      .join('nubestock.tb_mae_role as r', 'ur.idrole', 'r.idrole')
      .where('ur.iduser', userId)
      .where('ur.isactive', true)
      .where('r.isactive', true);

    // Obtener permisos del usuario (a través de sus roles)
    const userPermissions = await db.getConnection()
      .select('p.*')
      .from('nubestock.tb_mae_user_role as ur')
      .join('nubestock.tb_mae_role_permission as rp', 'ur.idrole', 'rp.idrole')
      .join('nubestock.tb_mae_permission as p', 'rp.idpermission', 'p.idpermission')
      .where('ur.iduser', userId)
      .where('ur.isactive', true)
      .where('rp.isactive', true)
      .where('p.isactive', true)
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

async function handleCheckPermission(context: Context, req: HttpRequest): Promise<void> {
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
      .select('p.idpermission')
      .from('nubestock.tb_mae_user_role as ur')
      .join('nubestock.tb_mae_role_permission as rp', 'ur.idrole', 'rp.idrole')
      .join('nubestock.tb_mae_permission as p', 'rp.idpermission', 'p.idpermission')
      .where('ur.iduser', userId)
      .where('p.namepermission', permission)
      .where('ur.isactive', true)
      .where('rp.isactive', true)
      .where('p.isactive', true)
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

async function handleAssignRole(context: Context, req: HttpRequest): Promise<void> {
  try {
    const { userId, roleId } = req.body;

    if (!userId || !roleId) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'userId y roleId son requeridos',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

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
      .select('iduser_role')
      .from('nubestock.tb_mae_user_role')
      .where('iduser', userId)
      .where('idrole', roleId)
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

    // Asignar el rol
    const newAssignment = await db.create('nubestock.tb_mae_user_role', {
      iduser: userId,
      idrole: roleId,
      isactive: true,
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

async function handleRemoveRole(context: Context, req: HttpRequest, userId: string): Promise<void> {
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

    // Desactivar la asignación de rol
    const result = await db.getConnection()
      .from('nubestock.tb_mae_user_role')
      .where('iduser', userId)
      .where('idrole', roleId)
      .update({
        isactive: false,
        modificationdate: new Date(),
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

export default userPermissionsHandler;
