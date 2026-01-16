import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import { logger } from '../config/logger';
import Joi from 'joi';

const db = Database.getInstance();

export async function listMeasures(context: Context, req: HttpRequest): Promise<void> {
  try {
    const measureId = req.query.id as string;
    
    if (measureId) {
      // Obtener medida específica por ID
      const measureIdNum = parseInt(measureId, 10);
      if (isNaN(measureIdNum)) {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'ID de medida inválido',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }

      const measure = await db.findById('nubestock.tb_mae_measure', measureIdNum);
      
      if (!measure || !(measure as any).is_active) {
        context.res = {
          status: 404,
          body: {
            success: false,
            message: 'Medida no encontrada',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }

      context.res = {
        status: 200,
        body: {
          success: true,
          data: measure,
          timestamp: new Date().toISOString(),
        },
      };
    } else {
      // Obtener todas las medidas
      const measures = await db.getConnection()
        .select('*')
        .from('nubestock.tb_mae_measure')
        .where('is_active', true)
        .orderBy('name');

      context.res = {
        status: 200,
        body: {
          success: true,
          data: measures,
          timestamp: new Date().toISOString(),
        },
      };
    }
  } catch (error) {
    logger.error('Error al obtener medidas:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener medidas',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function createMeasure(context: Context, req: HttpRequest): Promise<void> {
  try {
    const measureSchema = Joi.object({
      name: Joi.string().min(1).max(5).required(),
      description: Joi.string().min(0).max(100).required(),
      is_active: Joi.boolean().optional().default(true),
    });

    const { error, value } = measureSchema.validate(req.body);
    if (error) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => ({
            field: detail.path[0],
            message: detail.message,
          })),
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si la medida ya existe
    const existingMeasure = await db.getConnection()
      .select('id')
      .from('nubestock.tb_mae_measure')
      .where('name', value.name)
      .first();

    if (existingMeasure) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'La medida ya existe',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const newMeasure = await db.create('nubestock.tb_mae_measure', {
      name: value.name,
      description: value.description,
      is_active: value.is_active !== undefined ? value.is_active : true,
      creation_date: new Date(),
    });

    context.res = {
      status: 201,
      body: {
        success: true,
        data: newMeasure,
        message: 'Medida creada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al crear medida:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear medida',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function updateMeasure(context: Context, req: HttpRequest): Promise<void> {
  try {
    const measureId = req.query.id as string;
    if (!measureId) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de medida requerido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const measureIdNum = parseInt(measureId, 10);
    if (isNaN(measureIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de medida inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const measureSchema = Joi.object({
      name: Joi.string().min(1).max(5).optional(),
      description: Joi.string().min(0).max(100).optional(),
      is_active: Joi.boolean().optional(),
    });

    const { error, value } = measureSchema.validate(req.body);
    if (error) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => ({
            field: detail.path[0],
            message: detail.message,
          })),
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar que la medida existe
    const existingMeasure = await db.findById('nubestock.tb_mae_measure', measureIdNum);
    if (!existingMeasure) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Medida no encontrada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Si se está actualizando el nombre, verificar que no exista otra medida con ese nombre
    if (value.name && value.name !== (existingMeasure as any).name) {
      const duplicateMeasure = await db.getConnection()
        .select('id')
        .from('nubestock.tb_mae_measure')
        .where('name', value.name)
        .where('id', '!=', measureIdNum)
        .first();

      if (duplicateMeasure) {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'Ya existe otra medida con ese nombre',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
    }

    // Preparar datos para actualizar
    const updateData: any = {
      modification_date: new Date(),
    };

    if (value.name !== undefined) {
      updateData.name = value.name;
    }
    if (value.description !== undefined) {
      updateData.description = value.description;
    }
    if (value.is_active !== undefined) {
      updateData.is_active = value.is_active;
    }

    const updatedMeasure = await db.update('nubestock.tb_mae_measure', measureIdNum, updateData);

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedMeasure,
        message: 'Medida actualizada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al actualizar medida:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al actualizar medida',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function deleteMeasure(context: Context, req: HttpRequest): Promise<void> {
  try {
    const measureId = req.query.id as string;
    if (!measureId) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de medida requerido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const measureIdNum = parseInt(measureId, 10);
    if (isNaN(measureIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de medida inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar que la medida existe
    const existingMeasure = await db.findById('nubestock.tb_mae_measure', measureIdNum);
    if (!existingMeasure) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Medida no encontrada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si hay productos usando esta medida
    const productsUsingMeasure = await db.getConnection()
      .select('id')
      .from('nubestock.tb_ope_product')
      .where('id_measure', measureIdNum)
      .where('is_active', true)
      .limit(1)
      .first();

    if (productsUsingMeasure) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'No se puede eliminar la medida porque hay productos asociados a ella',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Eliminar la medida (soft delete - marcar como inactiva)
    const deletedMeasure = await db.update('nubestock.tb_mae_measure', measureIdNum, {
      is_active: false,
      modification_date: new Date(),
    });

    context.res = {
      status: 200,
      body: {
        success: true,
        data: deletedMeasure,
        message: 'Medida eliminada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al eliminar medida:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al eliminar medida',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
