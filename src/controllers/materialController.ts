import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import { logger } from '../config/logger';
import Joi from 'joi';

const db = Database.getInstance();

export async function listMaterials(context: Context, req: HttpRequest): Promise<void> {
  try {
    const id_origin = req.query.id_origin as string;
    const idOriginNum = id_origin ? parseInt(id_origin, 10) : null;

    // Materiales ahora son productos con type='MP'
    let query = db.getConnection()
      .select('p.*', 'c.name as category_name', 'o.name as origin_name', 'm.name as measure_name')
      .from('nubestock.tb_ope_product as p')
      .leftJoin('nubestock.tb_mae_category as c', 'p.id_category', 'c.id')
      .leftJoin('nubestock.tb_mae_origin as o', 'p.id_origin', 'o.id')
      .leftJoin('nubestock.tb_mae_measure as m', 'p.id_measure', 'm.id')
      .where('p.type', 'MP')
      .where('p.is_active', true)
      .orderBy('p.name');

    if (idOriginNum && !isNaN(idOriginNum)) {
      query = query.where('p.id_origin', idOriginNum);
    }

    const materials = await query;

    context.res = {
      status: 200,
      body: {
        success: true,
        data: materials,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener materiales:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener materiales',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function createMaterial(context: Context, req: HttpRequest): Promise<void> {
  try {
    const materialSchema = Joi.object({
      name: Joi.string().min(2).max(200).required(),
      sku: Joi.string().min(2).max(100).required(),
      id_category: Joi.number().integer().optional(),
      id_origin: Joi.number().integer().required(),
      id_measure: Joi.number().integer().required(),
      min_stock: Joi.number().min(0).default(0),
      quantity: Joi.number().min(0).default(0),
    });

    const { error, value } = materialSchema.validate(req.body);
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

    // Verificar si el material ya existe (por SKU)
    const existingMaterial = await db.getConnection()
      .select('id')
      .from('nubestock.tb_ope_product')
      .where('sku', value.sku)
      .where('type', 'MP')
      .first();

    if (existingMaterial) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'El material (SKU) ya existe',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const newMaterial = await db.create('nubestock.tb_ope_product', {
      name: value.name,
      sku: value.sku,
      id_category: value.id_category || null,
      id_origin: value.id_origin,
      id_measure: value.id_measure,
      type: 'MP',
      min_stock: value.min_stock || 0,
      quantity: value.quantity || 0,
      is_active: true,
    });

    context.res = {
      status: 201,
      body: {
        success: true,
        data: newMaterial,
        message: 'Material creado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al crear material:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear material',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function updateMaterial(context: Context, req: HttpRequest): Promise<void> {
  try {
    const materialId = req.query.id as string;
    
    if (!materialId) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de material requerido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const materialIdNum = parseInt(materialId, 10);
    if (isNaN(materialIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de material inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const materialSchema = Joi.object({
      name: Joi.string().min(2).max(200).optional(),
      sku: Joi.string().min(2).max(100).optional(),
      id_category: Joi.number().integer().optional(),
      id_origin: Joi.number().integer().optional(),
      id_measure: Joi.number().integer().optional(),
      quantity: Joi.number().min(0).optional(),
      min_stock: Joi.number().min(0).optional(),
      is_active: Joi.boolean().optional(),
    });

    const { error, value } = materialSchema.validate(req.body);
    
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

    // Verificar si el material existe (debe ser type='MP')
    const existingMaterial = await db.getConnection()
      .select('id', 'sku')
      .from('nubestock.tb_ope_product')
      .where('id', materialIdNum)
      .where('type', 'MP')
      .first();

    if (!existingMaterial) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Material no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Si se actualiza el SKU, verificar que no exista otro material con el mismo SKU
    if (value.sku && value.sku !== existingMaterial.sku) {
      const duplicateMaterial = await db.getConnection()
        .select('id')
        .from('nubestock.tb_ope_product')
        .where('sku', value.sku)
        .where('type', 'MP')
        .where('id', '!=', materialIdNum)
        .first();

      if (duplicateMaterial) {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'El SKU ya está registrado',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
    }

    const updateData: any = {
      modification_date: new Date(),
    };
    if (value.name !== undefined) updateData.name = value.name;
    if (value.sku !== undefined) updateData.sku = value.sku;
    if (value.id_category !== undefined) updateData.id_category = value.id_category;
    if (value.id_origin !== undefined) updateData.id_origin = value.id_origin;
    if (value.id_measure !== undefined) updateData.id_measure = value.id_measure;
    if (value.quantity !== undefined) updateData.quantity = value.quantity;
    if (value.min_stock !== undefined) updateData.min_stock = value.min_stock;
    if (value.is_active !== undefined) updateData.is_active = value.is_active;

    const updatedMaterial = await db.update('nubestock.tb_ope_product', materialIdNum, updateData);

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedMaterial,
        message: 'Material actualizado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al actualizar material:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al actualizar material',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function deleteMaterial(context: Context, req: HttpRequest): Promise<void> {
  try {
    const materialId = req.query.id as string;
    
    if (!materialId) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de material requerido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const materialIdNum = parseInt(materialId, 10);
    if (isNaN(materialIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de material inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si el material existe (debe ser type='MP')
    const existingMaterial = await db.getConnection()
      .select('id')
      .from('nubestock.tb_ope_product')
      .where('id', materialIdNum)
      .where('type', 'MP')
      .first();

    if (!existingMaterial) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Material no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Soft delete: desactivar en lugar de eliminar
    await db.update('nubestock.tb_ope_product', materialIdNum, {
      is_active: false,
      modification_date: new Date(),
    });

    context.res = {
      status: 200,
      body: {
        success: true,
        message: 'Material desactivado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al eliminar material:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al eliminar material',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
