import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import { logger } from '../config/logger';

const db = Database.getInstance();

export async function getPermissions(context: Context, req: HttpRequest): Promise<void> {
  try {
    const permissions = await db.getConnection()
      .select('*')
      .from('nubestock.tb_mae_permission')
      .where('is_active', true)
      .orderBy('name');

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

export async function createPermission(context: Context, req: HttpRequest): Promise<void> {
  try {
    const { name, description, resource, action } = req.body;

    // Validación básica
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'El nombre del permiso es requerido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    if (!resource || typeof resource !== 'string' || resource.trim().length === 0) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'El recurso (resource) del permiso es requerido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    if (!action || typeof action !== 'string' || action.trim().length === 0) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'La acción (action) del permiso es requerida',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si el permiso ya existe
    const existingPermission = await db.getConnection()
      .select('id')
      .from('nubestock.tb_mae_permission')
      .where('name', name.trim())
      .first();

    if (existingPermission) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Ya existe un permiso con ese nombre',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Crear el permiso
    const newPermission = await db.create('nubestock.tb_mae_permission', {
      name: name.trim(),
      description: description?.trim() || null,
      resource: resource.trim(),
      action: action.trim(),
      is_active: true,
    });

    context.res = {
      status: 201,
      body: {
        success: true,
        data: newPermission,
        message: 'Permiso creado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al crear permiso:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear permiso',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
