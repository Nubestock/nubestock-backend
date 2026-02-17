import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import { logger } from '../config/logger';
import Joi from 'joi';
import { validateSchema, createErrorResponse, handleError, validateIdRequired, validateId, assignIfDefined } from '../utils/controllerHelpers';

const db = Database.getInstance();

// Helper functions specific to recipes

function validateRecipeIdRequired(context: Context, recipeId: string | undefined): string | null {
  return validateIdRequired(context, recipeId, 'receta');
}

function validateRecipeId(context: Context, recipeId: string): number | null {
  return validateId(context, recipeId, 'receta');
}

export async function listRecipes(context: Context, req: HttpRequest): Promise<void> {
  try {
    const productId = (req.query.productId as string) || (req.query.id_product as string);

    const productIdNum = productId ? Number.parseInt(productId, 10) : null;

    // Obtener recetas (tb_mae_receipe) con sus materiales (tb_mae_product_receipe)
    let query = db.getConnection()
      .select(
        'r.id as receipe_id',
        'r.id_product',
        'r.creation_date',
        'r.modification_date',
        'p.name as product_name',
        'p.sku as product_sku',
        'mp.id as material_id',
        'mp.name as material_name',
        'mp.sku as material_code',
        'mp.type as material_type',
        'm.name as measure_name'
      )
      .from('nubestock.tb_mae_receipe as r')
      .join('nubestock.tb_ope_product as p', 'r.id_product', 'p.id')
      .leftJoin('nubestock.tb_mae_product_receipe as pr', function() {
        this.on('r.id', '=', 'pr.id_receipe')
            .andOn(db.getConnection().raw('pr.is_active = true'));
      })
      .leftJoin('nubestock.tb_ope_product as mp', 'pr.id_product', 'mp.id')
      .leftJoin('nubestock.tb_mae_measure as m', 'mp.id_measure', 'm.id')
      .where('r.is_active', true)
      .where('p.is_active', true)
      .where('p.type', 'PF')
      .orderBy('r.creation_date', 'desc');

    // Si se proporciona productId, filtrar por ese producto
    if (productIdNum && !Number.isNaN(productIdNum)) {
      query = query.where('r.id_product', productIdNum);
    }

    const recipes = await query;

    // Agrupar recetas por producto
    const recipesByProduct = recipes.reduce((acc: any, recipe: any) => {
      const prodId = recipe.id_product;
      
      if (!acc[prodId]) {
        acc[prodId] = {
          id_product: prodId,
          product_name: recipe.product_name,
          sku: recipe.product_sku,
          receipe_id: recipe.receipe_id,
          creation_date: recipe.creation_date,
          modification_date: recipe.modification_date,
          materials: []
        };
      }
      
      // Agregar material si existe (puede ser null por el LEFT JOIN)
      if (recipe.material_id) {
        acc[prodId].materials.push({
          id: recipe.material_id,
          name: recipe.material_name,
          code: recipe.material_code,
          type: recipe.material_type,
          measure_name: recipe.measure_name,
        });
      }
      
      return acc;
    }, {});

    // Convertir el objeto agrupado a array
    const groupedRecipes = Object.values(recipesByProduct);

    context.res = {
      status: 200,
      body: {
        success: true,
        data: groupedRecipes,
        count: groupedRecipes.length,
        totalRecipes: groupedRecipes.length, // Número de productos agrupados
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    handleError(context, error, 'obtener recetas');
  }
}

export async function createRecipe(context: Context, req: HttpRequest): Promise<void> {
  try {
    // Esquema para validar la estructura: acepta un array de materiales (sin quantity en nuevo esquema)
    const recipeSchema = Joi.object({
      id_product: Joi.number().integer().required(), // Producto final (type='PF')
      materials: Joi.array().items(
        Joi.object({
          id_product: Joi.number().integer().required(), // Material (type='MP')
        })
      ).min(1).required(),
    });

    const value = validateSchema(context, recipeSchema, req.body);
    if (value === null) return;

    const { id_product, materials } = value;

    // Verificar que el producto final existe
    const product = await db.getConnection()
      .select('*')
      .from('nubestock.tb_ope_product')
      .where('id', id_product)
      .where('type', 'PF')
      .where('is_active', true)
      .first();
      
    if (!product) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Producto final no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar que todos los materiales existen
    const materialIds = materials.map((m: any) => m.id_product);
    const existingMaterials = await db.getConnection()
      .select('id')
      .from('nubestock.tb_ope_product')
      .whereIn('id', materialIds)
      .where('type', 'MP')
      .where('is_active', true);

    if (existingMaterials.length !== materialIds.length) {
      const foundIds = existingMaterials.map((m: any) => m.id);
      const missingIds = materialIds.filter((id: number) => !foundIds.includes(id));
      
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Algunos materiales no existen o están inactivos',
          missingMaterials: missingIds,
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Crear receta y relaciones receta-material en una transacción
    const result = await db.transaction(async (trx) => {
      // Verificar si ya existe una receta para este producto
      const existingReceipe = await trx('nubestock.tb_mae_receipe')
        .select('id')
        .where('id_product', id_product)
        .where('is_active', true)
        .first();

      let receipeId: number;
      const now = new Date();
      
      if (existingReceipe) {
        receipeId = existingReceipe.id;
        // Desactivar relaciones existentes (soft delete)
        await trx('nubestock.tb_mae_product_receipe')
          .where('id_receipe', receipeId)
          .where('is_active', true)
          .update({
            is_active: false,
            modification_date: now,
          });
      } else {
        // Crear nueva receta
        const [newReceipe] = await trx('nubestock.tb_mae_receipe')
          .insert({
            id_product,
            is_active: true,
            creation_date: now,
          })
          .returning('id');
        receipeId = newReceipe.id;
      }

      // Crear relaciones receta-material
      const createdProductReceipes = [];
      for (const material of materials) {
        const [newProductReceipe] = await trx('nubestock.tb_mae_product_receipe')
          .insert({
            id_receipe: receipeId,
            id_product: material.id_product,
            is_active: true,
            creation_date: now,
          })
          .returning('*');
        createdProductReceipes.push(newProductReceipe);
      }

      return { receipeId, createdProductReceipes };
    });

    context.res = {
      status: 201,
      body: {
        success: true,
        data: {
          receipe_id: result.receipeId,
          product_receipes: result.createdProductReceipes,
        },
        message: `Receta creada exitosamente con ${result.createdProductReceipes.length} material(es)`,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    handleError(context, error, 'crear receta');
  }
}

export async function updateRecipe(context: Context, req: HttpRequest): Promise<void> {
  try {
    const recipeId = validateRecipeIdRequired(context, req.query.id as string);
    if (recipeId === null) return;

    const recipeIdNum = validateRecipeId(context, recipeId);
    if (recipeIdNum === null) return;

    const recipeSchema = Joi.object({
      is_active: Joi.boolean().optional(),
    });

    const value = validateSchema(context, recipeSchema, req.body);
    if (value === null) return;

    // Verificar si la receta existe
    const existingRecipe = await db.getConnection()
      .select('id')
      .from('nubestock.tb_mae_receipe')
      .where('id', recipeIdNum)
      .first();

    if (!existingRecipe) {
      context.res = createErrorResponse(404, 'Receta no encontrada');
      return;
    }

    const updateData: any = {
      modification_date: new Date(),
    };
    assignIfDefined(updateData, value);

    const updatedRecipe = await db.update('nubestock.tb_mae_receipe', recipeIdNum, updateData);

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedRecipe,
        message: 'Receta actualizada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al actualizar receta:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al actualizar receta',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function updateProductRecipe(context: Context, req: HttpRequest): Promise<void> {
  try {
    // Esquema para validar la estructura: receta completa del producto (sin quantity en nuevo esquema)
    const recipeSchema = Joi.object({
      id_product: Joi.number().integer().required(), // Producto final (type='PF')
      materials: Joi.array().items(
        Joi.object({
          id_product: Joi.number().integer().required(), // Material (type='MP')
        })
      ).min(0).required(), // Permitir array vacío para quitar todos los materiales
    });

    const value = validateSchema(context, recipeSchema, req.body);
    if (value === null) return;

    const { id_product, materials } = value;

    // Verificar que el producto final existe
    const product = await db.getConnection()
      .select('id')
      .from('nubestock.tb_ope_product')
      .where('id', id_product)
      .where('type', 'PF')
      .where('is_active', true)
      .first();

    if (!product) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Producto final no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar que todos los materiales existen
    const materialIds = materials.map((m: any) => m.id_product);
    if (materialIds.length > 0) {
      const existingMaterials = await db.getConnection()
        .select('id')
        .from('nubestock.tb_ope_product')
        .whereIn('id', materialIds)
        .where('type', 'MP')
        .where('is_active', true);

      if (existingMaterials.length !== materialIds.length) {
        const foundIds = existingMaterials.map((m: any) => m.id);
        const missingIds = materialIds.filter((id: number) => !foundIds.includes(id));
        
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'Algunos materiales no existen o están inactivos',
            missingMaterials: missingIds,
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
    }

    // Obtener o crear receta para el producto
    const receipe = await db.getConnection()
      .select('id')
      .from('nubestock.tb_mae_receipe')
      .where('id_product', id_product)
      .where('is_active', true)
      .first();

    let receipeId: number;
    const now = new Date();
    const results = {
      added: [] as any[],
      removed: [] as any[],
      errors: [] as any[],
    };

    // Procesar en transacción
    await db.transaction(async (trx) => {
      // Obtener o crear receta
      if (!receipe) {
        // Crear nueva receta
        const [newReceipe] = await trx('nubestock.tb_mae_receipe')
          .insert({
            id_product,
            is_active: true,
            creation_date: now,
          })
          .returning('id');
        receipeId = newReceipe.id;
      } else {
        receipeId = receipe.id;
      }

      // Obtener relaciones receta-material actuales (solo activas)
      const existingProductReceipes = await trx('nubestock.tb_mae_product_receipe')
        .select('id', 'id_product')
        .where('id_receipe', receipeId)
        .where('is_active', true);

      const existingMaterialMap = new Map(
        existingProductReceipes.map((pr: any) => [pr.id_product, pr])
      );

      const materialsToProcess = new Set(materialIds);
      
      // 1. Agregar materiales nuevos (no existe quantity, solo relación)
      for (const material of materials) {
        const existingRelation = existingMaterialMap.get(material.id_product);
        
        if (!existingRelation) {
          // Material nuevo: agregar relación
          try {
            const [newProductReceipe] = await trx('nubestock.tb_mae_product_receipe')
              .insert({
                id_receipe: receipeId,
                id_product: material.id_product,
                is_active: true,
                creation_date: now,
              })
              .returning('*');
            
            if (newProductReceipe) {
              results.added.push({
                id: newProductReceipe.id,
                id_product: material.id_product,
              });
            }
          } catch (error) {
            logger.error(`Error al agregar material ${material.id_product}:`, error);
            results.errors.push({
              id_product: material.id_product,
              operation: 'add',
              error: error instanceof Error ? error.message : 'Error desconocido',
            });
          }
        }
        // Si existe, no hacer nada (ya está en la receta)
      }

      // 2. Quitar materiales que ya no están en la lista (soft delete)
      for (const existingRelation of existingProductReceipes) {
        if (!materialsToProcess.has(existingRelation.id_product)) {
          try {
            const removed = await trx('nubestock.tb_mae_product_receipe')
              .where('id', existingRelation.id)
              .update({
                is_active: false,
                modification_date: now,
              })
              .returning('*');
            
            if (removed && removed.length > 0) {
              results.removed.push({
                id: existingRelation.id,
                id_product: existingRelation.id_product,
              });
            }
          } catch (error) {
            logger.error(`Error al quitar material ${existingRelation.id_product}:`, error);
            results.errors.push({
              id_product: existingRelation.id_product,
              operation: 'remove',
              error: error instanceof Error ? error.message : 'Error desconocido',
            });
          }
        }
      }
    });

    // Obtener la receta actualizada completa (solo relaciones activas)
    const updatedRecipes = await db.getConnection()
      .select(
        'pr.id',
        'pr.id_receipe',
        'pr.id_product',
        'mp.name as material_name',
        'mp.sku as material_code',
        'mp.type as material_type'
      )
      .from('nubestock.tb_mae_product_receipe as pr')
      .join('nubestock.tb_ope_product as mp', 'pr.id_product', 'mp.id')
      .where('pr.id_receipe', receipeId)
      .where('pr.is_active', true)
      .where('mp.type', 'MP')
      .where('mp.is_active', true)
      .orderBy('mp.name');

    context.res = {
      status: results.errors.length === 0 ? 200 : 207, // 207 Multi-Status si hay errores
      body: {
        success: results.errors.length === 0,
        message: `Receta actualizada: ${results.added.length} agregado(s), ${results.removed.length} eliminado(s)`,
        data: {
          product_id: id_product,
          receipe_id: receipeId,
          changes: {
            added: results.added.length,
            removed: results.removed.length,
          },
          details: {
            added: results.added,
            removed: results.removed,
          },
          current_recipe: updatedRecipes.map((r: any) => ({
            id: r.id,
            id_product: r.id_product,
            material_name: r.material_name,
            material_code: r.material_code,
            material_type: r.material_type,
          })),
          errors: results.errors,
        },
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    handleError(context, error, 'actualizar receta del producto');
  }
}

export async function deleteRecipe(context: Context, req: HttpRequest): Promise<void> {
  try {
    const recipeId = validateRecipeIdRequired(context, req.query.id as string);
    if (recipeId === null) return;

    const recipeIdNum = validateRecipeId(context, recipeId);
    if (recipeIdNum === null) return;

    // Verificar si la receta existe
    const existingRecipe = await db.getConnection()
      .select('id')
      .from('nubestock.tb_mae_receipe')
      .where('id', recipeIdNum)
      .where('is_active', true)
      .first();

    if (!existingRecipe) {
      context.res = createErrorResponse(404, 'Receta no encontrada');
      return;
    }

    // Soft delete: desactivar receta y sus relaciones receta-material
    const now = new Date();
    await db.transaction(async (trx) => {
      // Desactivar relaciones receta-material (soft delete)
      await trx('nubestock.tb_mae_product_receipe')
        .where('id_receipe', recipeIdNum)
        .where('is_active', true)
        .update({
          is_active: false,
          modification_date: now,
        });

      // Desactivar receta
      await trx('nubestock.tb_mae_receipe')
        .where('id', recipeIdNum)
        .update({
          is_active: false,
          modification_date: now,
        });
    });

    context.res = {
      status: 200,
      body: {
        success: true,
        message: 'Receta eliminada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    handleError(context, error, 'eliminar receta');
  }
}
