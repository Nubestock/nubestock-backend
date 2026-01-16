import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import { logger } from '../config/logger';
import Joi from 'joi';

const db = Database.getInstance();

export async function listCategories(context: Context, req: HttpRequest): Promise<void> {
  try {
    const categoryId = req.query.id as string;
    
    if (categoryId) {
      // Obtener categoría específica por ID
      const categoryIdNum = parseInt(categoryId, 10);
      if (isNaN(categoryIdNum)) {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'ID de categoría inválido',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }

      const category = await db.findById('nubestock.tb_mae_category', categoryIdNum);
      
      if (!category || !(category as any).is_active) {
        context.res = {
          status: 404,
          body: {
            success: false,
            message: 'Categoría no encontrada',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }

      context.res = {
        status: 200,
        body: {
          success: true,
          data: category,
          timestamp: new Date().toISOString(),
        },
      };
    } else {
      // Obtener todas las categorías
      const categories = await db.getConnection()
        .select('*')
        .from('nubestock.tb_mae_category')
        .where('is_active', true)
        .orderBy('name');

      context.res = {
        status: 200,
        body: {
          success: true,
          data: categories,
          timestamp: new Date().toISOString(),
        },
      };
    }
  } catch (error) {
    logger.error('Error al obtener categorías:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener categorías',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function createCategory(context: Context, req: HttpRequest): Promise<void> {
  try {
    const categorySchema = Joi.object({
      name: Joi.string().min(2).max(100).required(),
    });

    const { error, value } = categorySchema.validate(req.body);
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

    // Verificar si la categoría ya existe
    const existingCategory = await db.getConnection()
      .select('id')
      .from('nubestock.tb_mae_category')
      .where('name', value.name)
      .first();

    if (existingCategory) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'La categoría ya existe',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Crear la categoría usando INSERT directo
    const categoryData = {
      name: value.name,
      creation_date: new Date(),
    };

    const newCategory = await db.create('nubestock.tb_mae_category', categoryData);

    context.res = {
      status: 201,
      body: {
        success: true,
        data: newCategory,
        message: 'Categoría creada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al crear categoría:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear categoría',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function updateCategory(context: Context, req: HttpRequest): Promise<void> {
  try {
    const categoryId = req.query.id as string;
    if (!categoryId) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de categoría requerido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const categoryIdNum = parseInt(categoryId, 10);
    if (isNaN(categoryIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de categoría inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const categorySchema = Joi.object({
      name: Joi.string().min(2).max(100).optional(),
      is_active: Joi.boolean().optional(),
    });

    const { error, value } = categorySchema.validate(req.body);
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

    // Verificar que la categoría existe
    const existingCategory = await db.findById('nubestock.tb_mae_category', categoryIdNum);
    if (!existingCategory) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Categoría no encontrada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Si se está actualizando el nombre, verificar que no exista otra categoría con ese nombre
    if (value.name && value.name !== (existingCategory as any).name) {
      const duplicateCategory = await db.getConnection()
        .select('id')
        .from('nubestock.tb_mae_category')
        .where('name', value.name)
        .where('id', '!=', categoryIdNum)
        .first();

      if (duplicateCategory) {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'Ya existe otra categoría con ese nombre',
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
    if (value.is_active !== undefined) {
      updateData.is_active = value.is_active;
    }

    const updatedCategory = await db.update('nubestock.tb_mae_category', categoryIdNum, updateData);

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedCategory,
        message: 'Categoría actualizada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al actualizar categoría:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al actualizar categoría',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function deleteCategory(context: Context, req: HttpRequest): Promise<void> {
  try {
    const categoryId = req.query.id as string;
    if (!categoryId) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de categoría requerido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const categoryIdNum = parseInt(categoryId, 10);
    if (isNaN(categoryIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de categoría inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar que la categoría existe
    const existingCategory = await db.findById('nubestock.tb_mae_category', categoryIdNum);
    if (!existingCategory) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Categoría no encontrada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si hay productos usando esta categoría
    const productsUsingCategory = await db.getConnection()
      .select('id')
      .from('nubestock.tb_ope_product')
      .where('id_category', categoryIdNum)
      .where('is_active', true)
      .limit(1)
      .first();

    if (productsUsingCategory) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'No se puede eliminar la categoría porque hay productos asociados a ella',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Eliminar la categoría (soft delete - marcar como inactiva)
    const deletedCategory = await db.update('nubestock.tb_mae_category', categoryIdNum, {
      is_active: false,
      modification_date: new Date(),
    });

    context.res = {
      status: 200,
      body: {
        success: true,
        data: deletedCategory,
        message: 'Categoría eliminada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al eliminar categoría:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al eliminar categoría',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
