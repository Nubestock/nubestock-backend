import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import Joi from 'joi';
import { validateSchema, createErrorResponse, handleError, validateIdRequired, validateId } from '../utils/controllerHelpers';

const db = Database.getInstance();

// Helper functions specific to measures

function validateMeasureIdRequired(context: Context, measureId: string | undefined): string | null {
  return validateIdRequired(context, measureId, 'medida');
}

function validateMeasureId(context: Context, measureId: string): number | null {
  return validateId(context, measureId, 'medida');
}

async function findAndValidateMeasure(context: Context, measureIdNum: number, checkActive: boolean = false): Promise<any | null> {
  const measure = await db.findById('nubestock.tb_mae_measure', measureIdNum);
  
  if (!measure || (checkActive && !(measure as any).is_active)) {
    context.res = {
      status: 404,
      body: {
        success: false,
        message: 'Medida no encontrada',
        timestamp: new Date().toISOString(),
      },
    };
    return null;
  }
  return measure;
}


export async function listMeasures(context: Context, req: HttpRequest): Promise<void> {
  try {
    const measureId = req.query.id as string;
    
    if (measureId) {
      const measureIdNum = validateMeasureId(context, measureId);
      if (measureIdNum === null) return;

      const measure = await findAndValidateMeasure(context, measureIdNum, true);
      if (!measure) return;

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
    handleError(context, error, 'obtener medidas');
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
    handleError(context, error, 'crear medida');
  }
}

export async function updateMeasure(context: Context, req: HttpRequest): Promise<void> {
  try {
    const measureId = validateMeasureIdRequired(context, req.query.id as string);
    if (measureId === null) return;

    const measureIdNum = validateMeasureId(context, measureId);
    if (measureIdNum === null) return;

    const measureSchema = Joi.object({
      name: Joi.string().min(1).max(5).optional(),
      description: Joi.string().min(0).max(100).optional(),
      is_active: Joi.boolean().optional(),
    });

    const value = validateSchema(context, measureSchema, req.body);
    if (value === null) return;

    const existingMeasure = await findAndValidateMeasure(context, measureIdNum);
    if (!existingMeasure) return;

    // Si se está actualizando el nombre, verificar que no exista otra medida con ese nombre
    if (value.name && value.name !== (existingMeasure as any).name) {
      const duplicateMeasure = await db.getConnection()
        .select('id')
        .from('nubestock.tb_mae_measure')
        .where('name', value.name)
        .where('id', '!=', measureIdNum)
        .first();

      if (duplicateMeasure) {
        context.res = createErrorResponse(400, 'Ya existe otra medida con ese nombre');
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
    handleError(context, error, 'actualizar medida');
  }
}

export async function deleteMeasure(context: Context, req: HttpRequest): Promise<void> {
  try {
    const measureId = validateMeasureIdRequired(context, req.query.id as string);
    if (measureId === null) return;

    const measureIdNum = validateMeasureId(context, measureId);
    if (measureIdNum === null) return;

    const existingMeasure = await findAndValidateMeasure(context, measureIdNum);
    if (!existingMeasure) return;

    // Verificar si hay productos usando esta medida
    const productsUsingMeasure = await db.getConnection()
      .select('id')
      .from('nubestock.tb_ope_product')
      .where('id_measure', measureIdNum)
      .where('is_active', true)
      .limit(1)
      .first();

    if (productsUsingMeasure) {
      context.res = createErrorResponse(400, 'No se puede eliminar la medida porque hay productos asociados a ella');
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
    handleError(context, error, 'eliminar medida');
  }
}
