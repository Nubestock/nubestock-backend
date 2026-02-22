import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import Joi from 'joi';
import { validateSchema, createErrorResponse, handleError, validateIdRequired, validateId, assignIfDefined } from '../utils/controllerHelpers';

const db = Database.getInstance();

// Helper functions specific to categories

/**
 * Valida que categoryId exista en query y retorna respuesta 400 si falta
 */
function validateCategoryIdRequired(context: Context, categoryId: string | undefined): string | null {
  return validateIdRequired(context, categoryId, 'categoría');
}

/**
 * Valida categoryId y retorna respuesta 400 si es inválido
 * Retorna el número parseado si es válido, null si se estableció respuesta de error
 */
function validateCategoryId(context: Context, categoryId: string): number | null {
  return validateId(context, categoryId, 'categoría');
}

/**
 * Busca una categoría por ID y valida que exista y esté activa
 * Retorna la categoría si existe y está activa, null si no (y establece respuesta 404)
 */
async function findAndValidateCategory(context: Context, categoryIdNum: number, checkActive: boolean = false): Promise<Record<string, any> | null> {
  const category = await db.findById('nubestock.tb_mae_category', categoryIdNum) as Record<string, any> | undefined;
  
  if (!category || (checkActive && !category.is_active)) {
    context.res = {
      status: 404,
      body: {
        success: false,
        message: 'Categoría no encontrada',
        timestamp: new Date().toISOString(),
      },
    };
    return null;
  }
  return category;
}


export async function listCategories(context: Context, req: HttpRequest): Promise<void> {
  try {
    const categoryId = req.query.id as string;
    
    if (categoryId) {
      // Obtener categoría específica por ID
      const categoryIdNum = validateCategoryId(context, categoryId);
      if (categoryIdNum === null) return;

      const category = await findAndValidateCategory(context, categoryIdNum, true);
      if (!category) return;

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
    handleError(context, error, 'obtener categorías');
  }
}

export async function createCategory(context: Context, req: HttpRequest): Promise<void> {
  try {
    const categorySchema = Joi.object({
      name: Joi.string().min(2).max(100).required(),
    });

    const value = validateSchema(context, categorySchema, req.body);
    if (value === null) return;

    // Verificar si la categoría ya existe
    const existingCategory = await db.getConnection()
      .select('id')
      .from('nubestock.tb_mae_category')
      .where('name', value.name)
      .first();

    if (existingCategory) {
      context.res = createErrorResponse(400, 'La categoría ya existe');
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
    handleError(context, error, 'crear categoría');
  }
}

export async function updateCategory(context: Context, req: HttpRequest): Promise<void> {
  try {
    const categoryId = validateCategoryIdRequired(context, req.query.id as string);
    if (categoryId === null) return;

    const categoryIdNum = validateCategoryId(context, categoryId);
    if (categoryIdNum === null) return;

    const categorySchema = Joi.object({
      name: Joi.string().min(2).max(100).optional(),
      is_active: Joi.boolean().optional(),
    });

    const value = validateSchema(context, categorySchema, req.body);
    if (value === null) return;

    // Verificar que la categoría existe
    const existingCategory = await findAndValidateCategory(context, categoryIdNum);
    if (!existingCategory) return;

    // Si se está actualizando el nombre, verificar que no exista otra categoría con ese nombre
    if (value.name && value.name !== existingCategory.name) {
      const duplicateCategory = await db.getConnection()
        .select('id')
        .from('nubestock.tb_mae_category')
        .where('name', value.name)
        .where('id', '!=', categoryIdNum)
        .first();

      if (duplicateCategory) {
        context.res = createErrorResponse(400, 'Ya existe otra categoría con ese nombre');
        return;
      }
    }

    // Preparar datos para actualizar
    const updateData: any = {
      modification_date: new Date(),
    };
    assignIfDefined(updateData, value);

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
    handleError(context, error, 'actualizar categoría');
  }
}

export async function deleteCategory(context: Context, req: HttpRequest): Promise<void> {
  try {
    const categoryId = validateCategoryIdRequired(context, req.query.id as string);
    if (categoryId === null) return;

    const categoryIdNum = validateCategoryId(context, categoryId);
    if (categoryIdNum === null) return;

    // Verificar que la categoría existe
    const existingCategory = await findAndValidateCategory(context, categoryIdNum);
    if (!existingCategory) return;

    // Verificar si hay productos usando esta categoría
    const productsUsingCategory = await db.getConnection()
      .select('id')
      .from('nubestock.tb_ope_product')
      .where('id_category', categoryIdNum)
      .where('is_active', true)
      .limit(1)
      .first();

    if (productsUsingCategory) {
      context.res = createErrorResponse(400, 'No se puede eliminar la categoría porque hay productos asociados a ella');
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
    handleError(context, error, 'eliminar categoría');
  }
}
