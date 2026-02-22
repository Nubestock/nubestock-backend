import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import { logger } from '../config/logger';
import Joi from 'joi';

const db = Database.getInstance();

interface ProductionFilters {
  startDate?: string;
  endDate?: string;
  idUserNum: number | null;
  idProductNum: number | null;
  status?: string;
}

function buildPendingBaseQuery() {
  return db.getConnection()
    .from('nubestock.tb_ope_pending_transaction as pt')
    .leftJoin('nubestock.tb_ope_product as p', 'pt.id_product', 'p.id')
    .leftJoin('nubestock.tb_mae_category as c', 'p.id_category', 'c.id')
    .leftJoin('nubestock.tb_ope_transaction as t_ref', 'pt.id_transaction', 't_ref.id')
    .leftJoin('nubestock.tb_mae_user as u', 't_ref.id_user', 'u.id')
    .where('pt.is_active', true)
    .where('p.type', 'PF');
}

function buildCompletedBaseQuery() {
  return db.getConnection()
    .from('nubestock.tb_ope_transaction as t')
    .leftJoin('nubestock.tb_mae_user as u', 't.id_user', 'u.id')
    .leftJoin('nubestock.tb_ope_product as p', 't.id_product', 'p.id')
    .leftJoin('nubestock.tb_mae_category as c', 'p.id_category', 'c.id')
    .leftJoin('nubestock.tb_ope_pending_transaction as pt_active', function() {
      this.on('p.id', '=', 'pt_active.id_product')
        .andOn('pt_active.is_active', '=', db.getConnection().raw('true'));
    })
    .where('p.type', 'PF')
    .where('t.type', 'PROD')
    .where('t.direction', '+')
    .whereNull('pt_active.id');
}

function buildDefaultBaseQuery() {
  return db.getConnection()
    .from('nubestock.tb_ope_transaction as t')
    .leftJoin('nubestock.tb_mae_user as u', 't.id_user', 'u.id')
    .leftJoin('nubestock.tb_ope_product as p', 't.id_product', 'p.id')
    .leftJoin('nubestock.tb_mae_category as c', 'p.id_category', 'c.id')
    .where('p.type', 'PF')
    .where('t.type', 'PROD')
    .where('t.direction', '+');
}

function applyPendingFilters(query: any, filters: ProductionFilters): any {
  const { startDate, endDate, idProductNum, idUserNum } = filters;
  if (startDate) query = query.where('pt.creation_date', '>=', startDate);
  if (endDate) query = query.where('pt.creation_date', '<=', endDate);
  if (idProductNum && !Number.isNaN(idProductNum)) query = query.where('pt.id_product', idProductNum);
  if (idUserNum && !Number.isNaN(idUserNum)) query = query.where('t_ref.id_user', idUserNum);
  return query;
}

function applyTransactionFilters(query: any, filters: ProductionFilters): any {
  const { startDate, endDate, idProductNum, idUserNum } = filters;
  if (startDate) query = query.where('t.creation_date', '>=', startDate);
  if (endDate) query = query.where('t.creation_date', '<=', endDate);
  if (idUserNum && !Number.isNaN(idUserNum)) query = query.where('t.id_user', idUserNum);
  if (idProductNum && !Number.isNaN(idProductNum)) query = query.where('t.id_product', idProductNum);
  return query;
}

function buildProductionBaseQuery(status: string | undefined, filters: ProductionFilters): any {
  let baseQuery: any;
  
  if (status === 'pending') {
    baseQuery = buildPendingBaseQuery();
    baseQuery = applyPendingFilters(baseQuery, filters);
  } else if (status === 'completed') {
    baseQuery = buildCompletedBaseQuery();
    baseQuery = applyTransactionFilters(baseQuery, filters);
  } else {
    baseQuery = buildDefaultBaseQuery();
    baseQuery = applyTransactionFilters(baseQuery, filters);
  }
  
  return baseQuery;
}

async function countProductions(
  baseQuery: any,
  status: string | undefined,
  filters: ProductionFilters
): Promise<{ total: number; totalPending: number; totalCompleted: number }> {
  let total = 0;
  let totalPending = 0;
  let totalCompleted = 0;

  if (status === 'pending') {
    const countQuery = baseQuery.clone()
      .clearSelect()
      .clearOrder()
      .clearGroup()
      .countDistinct('pt.id_product as count');
    const [{ count }] = await countQuery;
    total = Number.parseInt(count as string);
    totalPending = total;
  } else if (status === 'completed') {
    const [{ count }] = await baseQuery.clone().count('t.id as count');
    total = Number.parseInt(count as string);
    totalCompleted = total;
  } else {
    let pendingCountQuery = buildPendingBaseQuery();
    pendingCountQuery = applyPendingFilters(pendingCountQuery, filters);
    
    const [{ count: pendingCount }] = await pendingCountQuery
      .clearSelect()
      .clearOrder()
      .clearGroup()
      .countDistinct('pt.id_product as count');
    totalPending = Number.parseInt(pendingCount as string);
    
    const [{ count: completedCount }] = await baseQuery.clone().count('t.id as count');
    totalCompleted = Number.parseInt(completedCount as string);
    
    total = totalPending + totalCompleted;
  }

  return { total, totalPending, totalCompleted };
}

function getPendingSelectFields() {
  return [
    'pt.id_product as id',
    'pt.id_product',
    db.getConnection().raw('(SELECT id_user FROM nubestock.tb_ope_transaction WHERE id = MIN(pt.id_transaction) LIMIT 1) as id_user'),
    db.getConnection().raw('0 as quantity'),
    db.getConnection().raw("'PROD' as type"),
    db.getConnection().raw("'+' as direction"),
    db.getConnection().raw('MIN(pt.creation_date) as creation_date'),
    db.getConnection().raw('NULL as modification_date'),
    db.getConnection().raw('NULL as details'),
    db.getConnection().raw('(SELECT name FROM nubestock.tb_mae_user WHERE id = (SELECT id_user FROM nubestock.tb_ope_transaction WHERE id = MIN(pt.id_transaction) LIMIT 1)) as user_name'),
    'p.name as product_name',
    'p.sku',
    'c.name as category_name',
    db.getConnection().raw('true as is_pending'),
    db.getConnection().raw('COUNT(DISTINCT pt.id) as pending_count')
  ];
}

function getCompletedSelectFields() {
  return [
    't.id',
    't.id_product',
    't.id_user',
    't.quantity',
    't.type',
    't.direction',
    't.creation_date',
    't.modification_date',
    't.details',
    'u.name as user_name',
    'p.name as product_name',
    'p.sku',
    'c.name as category_name',
    db.getConnection().raw('false as is_pending')
  ];
}

async function fetchProductions(
  baseQuery: any,
  status: string | undefined,
  filters: ProductionFilters,
  offset: number,
  limit: number
): Promise<any[]> {
  if (status === 'pending') {
    return baseQuery
      .select(...getPendingSelectFields())
      .groupBy('pt.id_product', 'p.id', 'p.name', 'p.sku', 'c.id', 'c.name')
      .orderBy('creation_date', 'desc')
      .offset(offset)
      .limit(limit);
  }
  
  if (status === 'completed') {
    return baseQuery
      .select(...getCompletedSelectFields())
      .orderBy('t.creation_date', 'desc')
      .offset(offset)
      .limit(limit);
  }
  
  let pendingQuery = buildPendingBaseQuery();
  pendingQuery = applyPendingFilters(pendingQuery, filters);
  
  const pendingProductions = await pendingQuery
    .select(
      'pt.id_product as id',
      'pt.id_product',
      't_ref.id_user as id_user',
      db.getConnection().raw('0 as quantity'),
      db.getConnection().raw("'PROD' as type"),
      db.getConnection().raw("'+' as direction"),
      db.getConnection().raw('MIN(pt.creation_date) as creation_date'),
      db.getConnection().raw('NULL as modification_date'),
      db.getConnection().raw('NULL as details'),
      'u.name as user_name',
      'p.name as product_name',
      'p.sku',
      'c.name as category_name',
      db.getConnection().raw('true as is_pending'),
      db.getConnection().raw('COUNT(DISTINCT pt.id) as pending_count')
    )
    .groupBy('pt.id_product', 'p.id', 'p.name', 'p.sku', 'c.id', 'c.name', 't_ref.id_user', 'u.name')
    .orderBy('creation_date', 'desc');
  
  const completedProductions = await baseQuery
    .select(...getCompletedSelectFields())
    .orderBy('t.creation_date', 'desc');
  
  return [...pendingProductions, ...completedProductions]
    .sort((a: any, b: any) => new Date(b.creation_date).getTime() - new Date(a.creation_date).getTime())
    .slice(offset, offset + limit);
}

async function getMaterialTransactions(productId: number, isActive: boolean): Promise<any[]> {
  const pendingRecords = await db.getConnection()
    .select('id_transaction')
    .from('nubestock.tb_ope_pending_transaction')
    .where('id_product', productId)
    .where('is_active', isActive);

  if (pendingRecords.length === 0) return [];

  const transactionIds = pendingRecords.map((pr: any) => pr.id_transaction);
  
  return db.getConnection()
    .select(
      't.*',
      'p.name as material_name',
      'p.sku as material_sku',
      'p.quantity as current_stock'
    )
    .from('nubestock.tb_ope_transaction as t')
    .leftJoin('nubestock.tb_ope_product as p', 't.id_product', 'p.id')
    .whereIn('t.id', transactionIds)
    .where('t.type', 'PROD')
    .where('t.direction', '-')
    .orderBy('t.creation_date', 'desc');
}

function processMaterialTransactions(materialTransactions: any[]): any[] {
  const materialMap = new Map();
  
  materialTransactions.forEach((mt: any) => {
    if (!materialMap.has(mt.id)) {
      const waste = mt.has_waste ? Number.parseFloat(String(mt.waste_quantity || 0)) : 0;
      const quantityUsed = Number.parseFloat(String(mt.quantity || 0));
      
      materialMap.set(mt.id, {
        id_product: mt.id_product,
        name: mt.material_name,
        sku: mt.material_sku,
        quantity_used: quantityUsed,
        waste: waste,
        effective_quantity: Number.parseFloat((quantityUsed - waste).toFixed(2)),
        has_waste: mt.has_waste,
        current_stock: mt.current_stock ? Number.parseFloat(String(mt.current_stock)) : null,
        transaction_id: mt.id,
        details: mt.details,
      });
    }
  });
  
  return Array.from(materialMap.values());
}

function calculateMaterialTotals(materials: any[]): { totalConsumed: number; totalWaste: number } {
  const totalConsumed = Number.parseFloat(
    materials.reduce((sum: number, m: any) => sum + (Number.parseFloat(String(m.quantity_used)) || 0), 0).toFixed(2)
  );
  
  const totalWaste = Number.parseFloat(
    materials.reduce((sum: number, m: any) => sum + (Number.parseFloat(String(m.waste)) || 0), 0).toFixed(2)
  );
  
  return { totalConsumed, totalWaste };
}

async function enrichProductionWithMaterials(prod: any): Promise<any> {
  const prodStatus = prod.is_pending ? 'pending' : 'completed';
  const isActive = prodStatus === 'pending';
  
  const materialTransactions = await getMaterialTransactions(prod.id_product, isActive);
  const materials_consumed = processMaterialTransactions(materialTransactions);
  const { totalConsumed: total_consumed, totalWaste: total_waste } = calculateMaterialTotals(materials_consumed);

  const baseDetails = {
    materials_consumed,
    total_consumed,
    total_waste,
    registered_by: prod.id_user,
    registered_at: prod.creation_date,
  };

  return {
    ...prod,
    status: prodStatus,
    production_details: prodStatus === 'pending' 
      ? baseDetails 
      : { ...baseDetails, completed_at: prod.modification_date || prod.creation_date },
  };
}

export async function getDailyProduction(context: Context, req: HttpRequest): Promise<void> {
  try {
    const page = Number.parseInt(req.query.page as string) || 1;
    const limit = Number.parseInt(req.query.limit as string) || 10;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const id_user = req.query.id_user as string;
    const id_product = req.query.id_product as string;
    const status = req.query.status as string;
    const idUserNum = id_user ? Number.parseInt(id_user, 10) : null;
    const idProductNum = id_product ? Number.parseInt(id_product, 10) : null;

    const filters: ProductionFilters = { startDate, endDate, idUserNum, idProductNum, status };
    const baseQuery = buildProductionBaseQuery(status, filters);

    const { total, totalPending, totalCompleted } = await countProductions(baseQuery, status, filters);

    logger.info('Production query results:', {
      total,
      status,
      page,
      limit,
    });

    const offset = (page - 1) * limit;
    const productions = await fetchProductions(baseQuery, status, filters, offset, limit);

    logger.info('Productions found:', {
      count: productions.length,
      status,
      pending_count: productions.filter((p: any) => p.is_pending).length,
    });

    const enrichedProductions = await Promise.all(productions.map(enrichProductionWithMaterials));

    // Contar producciones por estado en los resultados
    const pendingInResults = enrichedProductions.filter((p: any) => p.status === 'pending').length;
    const completedInResults = enrichedProductions.filter((p: any) => p.status === 'completed').length;

    context.res = {
      status: 200,
      body: {
        success: true,
        data: {
          productions: enrichedProductions,
          summary: {
            total,
            total_pending: status === 'pending' ? totalPending : (status === 'completed' ? 0 : totalPending),
            total_completed: status === 'completed' ? totalCompleted : (status === 'pending' ? 0 : totalCompleted),
            in_current_page: {
              pending: pendingInResults,
              completed: completedInResults,
            },
          },
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
        message: `Producciones diarias obtenidas exitosamente. ${status ? `Filtro: ${status}` : 'Mostrando todas las producciones (pendientes y completadas)'}`,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener producción diaria:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener producción diaria',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function getProductionStats(context: Context, req: HttpRequest): Promise<void> {
  try {
    const startDate = req.query.startDate as string || new Date().toISOString().split('T')[0];
    const endDate = req.query.endDate as string || new Date().toISOString().split('T')[0];

    // Estadísticas de producción por producto (usar tb_ope_transaction con type='PROD' - solo completadas)
    const productStats = await db.getConnection()
      .select(
        'p.name as product_name',
        'p.sku',
        'c.name as category_name',
        db.getConnection().raw('SUM(t.quantity) as total_produced'),
        db.getConnection().raw('COUNT(t.id) as production_count'),
        db.getConnection().raw('AVG(t.quantity) as average_production')
      )
      .from('nubestock.tb_ope_transaction as t')
      .leftJoin('nubestock.tb_ope_product as p', 't.id_product', 'p.id')
      .leftJoin('nubestock.tb_mae_category as c', 'p.id_category', 'c.id')
      .where('t.type', 'PROD') // Solo producciones completadas
      .where('p.type', 'PF')
      .where('t.direction', '+') // Solo producto final generado
      .where('t.creation_date', '>=', startDate)
      .where('t.creation_date', '<=', endDate)
      .groupBy('p.id', 'p.name', 'p.sku', 'c.name')
      .orderBy('total_produced', 'desc');

    // Estadísticas por usuario
    const userStats = await db.getConnection()
      .select(
        'u.name as user_name',
        db.getConnection().raw('SUM(t.quantity) as total_produced'),
        db.getConnection().raw('COUNT(t.id) as production_count')
      )
      .from('nubestock.tb_ope_transaction as t')
      .leftJoin('nubestock.tb_mae_user as u', 't.id_user', 'u.id')
      .leftJoin('nubestock.tb_ope_product as p', 't.id_product', 'p.id')
      .where('t.type', 'PROD')
      .where('p.type', 'PF')
      .where('t.creation_date', '>=', startDate)
      .where('t.creation_date', '<=', endDate)
      .groupBy('u.id', 'u.name')
      .orderBy('total_produced', 'desc');

    // Estadísticas generales
    const generalStats = await db.getConnection()
      .select(
        db.getConnection().raw('SUM(t.quantity) as total_production'),
        db.getConnection().raw('COUNT(DISTINCT t.id_user) as active_users'),
        db.getConnection().raw('COUNT(DISTINCT t.id_product) as products_produced'),
        db.getConnection().raw('COUNT(*) as total_records')
      )
      .from('nubestock.tb_ope_transaction as t')
      .leftJoin('nubestock.tb_ope_product as p', 't.id_product', 'p.id')
      .where('t.type', 'PROD')
      .where('p.type', 'PF')
      .where('t.creation_date', '>=', startDate)
      .where('t.creation_date', '<=', endDate)
      .first();

    context.res = {
      status: 200,
      body: {
        success: true,
        data: {
          general: generalStats,
          byProduct: productStats,
          byUser: userStats,
          dateRange: {
            start: startDate,
            end: endDate,
          },
        },
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener estadísticas de producción:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener estadísticas de producción',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function getTransactions(context: Context, req: HttpRequest): Promise<void> {
  try {
    const page = Number.parseInt(req.query.page as string) || 1;
    const limit = Number.parseInt(req.query.limit as string) || 10;
    const transactionType = req.query.type as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    // Crear query base para filtros (sin select para poder usarlo en count)
    let baseQuery = db.getConnection()
      .from('nubestock.tb_ope_transaction as t')
      .leftJoin('nubestock.tb_mae_user as u', 't.id_user', 'u.id')
      .leftJoin('nubestock.tb_ope_product as p', 't.id_product', 'p.id');

    // Aplicar filtros
    if (transactionType) {
      baseQuery = baseQuery.where('t.type', transactionType);
    }

    if (startDate) {
      baseQuery = baseQuery.where('t.creation_date', '>=', startDate);
    }

    if (endDate) {
      baseQuery = baseQuery.where('t.creation_date', '<=', endDate);
    }

    // Contar total (usando la query base sin select)
    const [{ count }] = await baseQuery.clone().count('t.id as count');
    const total = Number.parseInt(count as string);

    // Obtener datos con select y paginación
    const offset = (page - 1) * limit;
    const transactions = await baseQuery
      .select(
        't.id',
        't.id_product',
        't.id_user',
        't.quantity',
        't.type',
        't.direction',
        't.creation_date',
        't.modification_date',
        'u.name as user_name',
        'p.name as product_name',
        'p.sku',
        'p.type as product_type'
      )
      .orderBy('t.creation_date', 'desc')
      .offset(offset)
      .limit(limit);

    context.res = {
      status: 200,
      body: {
        success: true,
        data: transactions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener transacciones:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener transacciones',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

/**
 * ETAPA 1: Operador registra consumo de materias primas
 * - Selecciona producto final
 * - Ve la receta
 * - Registra cuánto usó de cada materia prima
 * - Registra desperdicios
 * - El sistema RESTA las materias primas del inventario
 */
export async function registerProductionMaterials(context: Context, req: HttpRequest, userId: string): Promise<void> {
  try {
    const userIdNum = typeof userId === 'string' ? Number.parseInt(userId, 10) : userId;
    if (Number.isNaN(userIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de usuario inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const productionSchema = Joi.object({
      id_product: Joi.number().integer().required(), // Producto final (type='PF')
      materials: Joi.array().items(
        Joi.object({
          id_product: Joi.number().integer().required(), // Material (type='MP')
          quantity_used: Joi.number().positive().required(), // Cantidad usada total (ej: 3kg)
          waste: Joi.number().min(0).default(0), // Desperdicio (ej: 0.5kg) - solo informativo
          details: Joi.string().optional(), // Imagen en base64 (opcional)
        })
      ).min(1).required(),
    });

    const { error, value } = productionSchema.validate(req.body);
    
    if (error) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
          })),
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

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

    // Verificar que todos los materiales existen y tienen stock suficiente
    const materialIds = materials.map((m: any) => m.id_product);
    const existingMaterials = await db.getConnection()
      .select('id', 'name', 'sku', 'quantity')
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

    // Verificar stock suficiente
    const insufficientStock: any[] = [];
    for (const material of materials) {
      const materialData = existingMaterials.find((m: any) => m.id === material.id_product);
      if (materialData && materialData.quantity < material.quantity_used) {
        insufficientStock.push({
          id_product: material.id_product,
          name: materialData.name,
          required: material.quantity_used,
          available: materialData.quantity,
        });
      }
    }

    if (insufficientStock.length > 0) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Stock insuficiente para algunos materiales',
          insufficientStock,
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Crear transacciones PROD solo para materiales consumidos y registrar en pending_transaction
    // IMPORTANTE: El producto final NO se registra en tb_ope_transaction, solo en tb_ope_pending_transaction
    const result = await db.transaction(async (trx) => {
      const now = new Date();

      // Crear transacciones PROD para cada material (type='PROD', direction='-')
      // IMPORTANTE: Estas transacciones representan "producción negativa" = consumo de materiales
      // Se restan del inventario de la materia prima (cantidad total usada, incluye desperdicio)
      const materialTransactions = [];
      const pendingTransactionIds: number[] = [];
      
      for (const material of materials) {
        const wasteQuantity = Number.parseFloat((material.waste || 0).toFixed(2)); // decimal(15,2)
        const hasWaste = wasteQuantity > 0;
        
        // Obtener datos del material
        const materialData = existingMaterials.find((m: any) => m.id === material.id_product);
        
        // Crear transacción PROD negativa para el material (producción negativa = consumo)
        // Esta transacción está "atada" a la materia prima utilizada
        const [materialTransaction] = await trx('nubestock.tb_ope_transaction')
          .insert({
            id_product: material.id_product, // ID del material (materia prima)
            id_user: userIdNum,
            quantity: Number.parseFloat(material.quantity_used.toFixed(2)), // Cantidad usada (ej: 5.5)
            type: 'PROD', // Tipo PROD (producción)
            direction: '-', // Dirección NEGATIVA (producción negativa = material que se ocupa/consume)
            has_waste: hasWaste, // true si waste > 0
            waste_quantity: wasteQuantity, // Cantidad de desperdicio (ej: 2)
            details: material.details || null, // Imagen en base64 si se proporciona
          })
          .returning('*');

        // Crear registro en tb_ope_pending_transaction para relacionar este material con el producto final
        // Cada transacción de material tiene su propio registro en pending_transaction
        const [pendingTransaction] = await trx('nubestock.tb_ope_pending_transaction')
          .insert({
            id_product: id_product, // Producto final
            id_transaction: materialTransaction.id, // Transacción de este material específico
            is_active: true, // Pendiente
          })
          .returning('*');

        pendingTransactionIds.push(pendingTransaction.id);

        materialTransactions.push({
          ...materialTransaction,
          material_name: materialData?.name,
          material_sku: materialData?.sku,
          pending_transaction_id: pendingTransaction.id, // ID del registro en pending_transaction
        });

        // ACTUALIZAR inventario: RESTAR la cantidad total usada (incluye desperdicio)
        // Ejemplo: Si había 10kg y se usaron 5.5kg (con 2kg de desperdicio), queda 4.5kg
        await trx('nubestock.tb_ope_product')
          .where('id', material.id_product)
          .decrement('quantity', Number.parseFloat(material.quantity_used.toFixed(2)));
      }

      return {
        production_pending_ids: pendingTransactionIds, // IDs de los registros en tb_ope_pending_transaction (uno por material)
        product_final_id: id_product,
        materials: materialTransactions,
        total_waste: materials.reduce((sum: number, m: any) => sum + (m.waste || 0), 0),
        total_consumed: materials.reduce((sum: number, m: any) => sum + m.quantity_used, 0),
      };
    });

    context.res = {
      status: 201,
      body: {
        success: true,
        data: {
          production_pending_ids: result.production_pending_ids, // IDs de los registros en tb_ope_pending_transaction (uno por material)
          product_final: {
            id: product?.id,
            name: product?.name,
            sku: product?.sku,
          },
          materials_consumed: result.materials.map((mt: any) => {
            const waste = mt.has_waste ? (mt.waste_quantity || 0) : 0;
            return {
              id_product: mt.id_product,
              name: mt.material_name,
              sku: mt.material_sku,
              quantity_used: mt.quantity,
              waste: waste,
              effective_quantity: mt.quantity - waste,
              has_waste: mt.has_waste,
              transaction_id: mt.id, // ID de la transacción del material
              pending_transaction_id: mt.pending_transaction_id, // ID del registro en tb_ope_pending_transaction
            };
          }),
          summary: {
            total_consumed: result.total_consumed,
            total_waste: result.total_waste,
            status: 'pending', // Pendiente de que administrador complete con cantidad final
            transactions_count: result.materials.length, // Número de transacciones PROD creadas (solo materiales)
            pending_transactions_count: result.production_pending_ids.length, // Número de registros en pending_transaction
          },
        },
        message: `Consumo de materiales registrado exitosamente. Se crearon ${result.materials.length} transacciones PROD de materiales y ${result.production_pending_ids.length} registros en tb_ope_pending_transaction (uno por material). Pendiente registro de cantidad final por administrador.`,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    logger.error('Error al registrar consumo de materiales:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: error.message || 'Error al registrar consumo de materiales',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

/**
 * ETAPA 2: Administrador completa el registro con cantidad de producto final generado
 * - Ve reporte de producción diaria con materias primas gastadas
 * - Registra cuánto producto final se generó
 * - El sistema SUMA el producto final al inventario
 */
export async function completeProduction(context: Context, req: HttpRequest, productionId: string, userId: string): Promise<void> {
  try {
    const productionIdNum = Number.parseInt(productionId, 10);
    if (Number.isNaN(productionIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de producción inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const completeSchema = Joi.object({
      quantity: Joi.number().positive().required(), // Cantidad de producto final generado (decimal 15,2)
    });

    const { error, value } = completeSchema.validate(req.body);
    
    if (error) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
          })),
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar que el producto final existe y tiene producciones pendientes
    // productionId es el ID del producto final (id_product)
    const productFinal = await db.getConnection()
      .select('*')
      .from('nubestock.tb_ope_product')
      .where('id', productionIdNum)
      .where('type', 'PF')
      .where('is_active', true)
      .first();

    if (!productFinal) {
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

    // Verificar que hay registros pendientes para este producto final
    const pendingTransactions = await db.getConnection()
      .select('*')
      .from('nubestock.tb_ope_pending_transaction')
      .where('id_product', productionIdNum)
      .where('is_active', true);

    if (pendingTransactions.length === 0) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'No hay producciones pendientes para este producto final',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar que la producción no tenga más de 1 día de antigüedad (usar la fecha más antigua)
    const oldestPendingDate = new Date(Math.min(...pendingTransactions.map((pt: any) => new Date(pt.creation_date).getTime())));
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    if (oldestPendingDate < oneDayAgo) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Esta producción pendiente tiene más de 1 día de antigüedad y no puede ser completada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Completar la producción: crear transacción del producto final y marcar todos los pending_transaction como inactivos
    const result = await db.transaction(async (trx) => {
      const now = new Date();
      const userIdNum = typeof userId === 'string' ? Number.parseInt(userId, 10) : userId;

      // Crear transacción PROD para el producto final (ahora sí se crea en tb_ope_transaction)
      const finalQuantity = Number.parseFloat(value.quantity.toFixed(2)); // decimal(15,2)

      const [productionTransaction] = await trx('nubestock.tb_ope_transaction')
        .insert({
          id_product: productionIdNum, // ID del producto final
          id_user: userIdNum,
          quantity: finalQuantity, // Cantidad final generada
          type: 'PROD', // Tipo PROD (producción)
          direction: '+', // Dirección positiva (entrada de producto final)
          has_waste: false,
          waste_quantity: 0,
          details: null,
        })
        .returning('*');

      // SUMAR el producto final al inventario
      await trx('nubestock.tb_ope_product')
        .where('id', productionIdNum)
        .increment('quantity', finalQuantity);

      // Marcar TODOS los pending_transaction de este producto final como completados (is_active=false)
      await trx('nubestock.tb_ope_pending_transaction')
        .where('id_product', productionIdNum)
        .where('is_active', true)
        .update({
          is_active: false,
          modification_date: now,
        });

      // SUMAR el producto final al inventario
      await trx('nubestock.tb_ope_product')
        .where('id', productionIdNum)
        .increment('quantity', finalQuantity);

      // Obtener detalles de materiales consumidos desde los pending_transaction relacionados
      // Cada pending_transaction tiene un id_transaction que apunta a la transacción del material
      const pendingTransactionIds = pendingTransactions.map((pt: any) => pt.id_transaction);
      
      const materialTransactions = await trx('nubestock.tb_ope_transaction')
        .select(
          't.*',
          'p.name as material_name',
          'p.sku as material_sku'
        )
        .from('nubestock.tb_ope_transaction as t')
        .leftJoin('nubestock.tb_ope_product as p', 't.id_product', 'p.id')
        .whereIn('t.id', pendingTransactionIds) // Solo las transacciones relacionadas con este producto final
        .where('t.type', 'PROD') // Transacciones de producción
        .where('t.direction', '-') // Materiales consumidos
        .orderBy('t.creation_date', 'desc');

      // Mapear materiales consumidos desde las transacciones (usando columnas has_waste y waste_quantity)
      const materialsInfo = materialTransactions.map((mt: any) => {
        const waste = mt.has_waste ? (mt.waste_quantity || 0) : 0;
        return {
          id_product: mt.id_product,
          name: mt.material_name,
          sku: mt.material_sku,
          quantity_used: mt.quantity,
          waste: waste,
          effective_quantity: mt.quantity - waste,
          has_waste: mt.has_waste,
          transaction_id: mt.id,
          details: mt.details, // Imagen en base64 si existe
        };
      });

      return {
        production: productionTransaction, // Transacción del producto final creada
        materials: materialsInfo,
      };
    });

    // Obtener información del producto final
    const product = await db.findById('nubestock.tb_ope_product', productionIdNum);

    context.res = {
      status: 200,
      body: {
        success: true,
        data: {
          production_id: result.production.id,
          product_final: {
            id: (product as any)?.id,
            name: (product as any)?.name,
            sku: (product as any)?.sku,
            quantity_generated: value.quantity,
          },
          materials_consumed: result.materials,
          status: 'completed',
        },
        message: `Producción completada: ${value.quantity} unidades de producto final agregadas al inventario`,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    logger.error('Error al completar producción:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: error.message || 'Error al completar producción',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

/**
 * Registro de producción (legacy - mantener para compatibilidad)
 * Ahora solo para uso directo del administrador sin el flujo de dos etapas
 */
export async function registerProduction(context: Context, req: HttpRequest, userId: string): Promise<void> {
  try {
    const userIdNum = typeof userId === 'string' ? Number.parseInt(userId, 10) : userId;
    if (Number.isNaN(userIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de usuario inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const productionSchema = Joi.object({
      id_user: Joi.number().integer().optional(), // Opcional: si no se proporciona, se usa el del token
      id_product: Joi.number().integer().required(), // Producto final (type='PF')
      quantity: Joi.number().positive().required(),
    });

    const { error, value } = productionSchema.validate(req.body);
    
    if (error) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
          })),
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar que el producto existe y crear producción como transacción
    const result = await db.transaction(async (trx) => {
      // Verificar que el producto existe y es un producto final
      const product = await trx('nubestock.tb_ope_product')
        .select('*')
        .where('id', value.id_product)
        .where('type', 'PF')
        .where('is_active', true)
        .first();
      
      if (!product) {
        throw new Error('Producto final no encontrado');
      }

      const currentUserId = value.id_user || userIdNum;

      // Crear transacción de producción (type='PROD', direction='+')
      const [newTransaction] = await trx('nubestock.tb_ope_transaction')
        .insert({
          id_product: value.id_product,
          id_user: currentUserId,
          quantity: Number.parseFloat(value.quantity.toFixed(2)), // decimal(15,2)
          type: 'PROD',
          direction: '+',
          has_waste: false,
          waste_quantity: 0,
        })
        .returning('*');

      // Actualizar cantidad del producto
      await trx('nubestock.tb_ope_product')
        .where('id', value.id_product)
        .increment('quantity', value.quantity);

      return newTransaction;
    });

    context.res = {
      status: 201,
      body: {
        success: true,
        data: result,
        message: 'Producción registrada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    logger.error('Error al registrar producción:', error);
    
    // Manejar errores específicos
    if (error.message === 'Producto final no encontrado') {
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

    // Manejar errores de conexión
    if (error.message && error.message.includes('Connection terminated')) {
      context.res = {
        status: 503,
        body: {
          success: false,
          message: 'Error de conexión con la base de datos. Por favor, intente nuevamente.',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al registrar producción',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function createTransaction(context: Context, req: HttpRequest, userId: string): Promise<void> {
  try {
    const userIdNum = typeof userId === 'string' ? Number.parseInt(userId, 10) : userId;
    if (Number.isNaN(userIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de usuario inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const transactionSchema = Joi.object({
      id_user: Joi.number().integer().optional(),
      id_product: Joi.number().integer().required(),
      quantity: Joi.number().positive().required(),
      type: Joi.string().valid('IN', 'OUT', 'SAL', 'PROD').required(),
      direction: Joi.string().valid('+', '-').required(),
    });

    const { error, value } = transactionSchema.validate(req.body);
    
    if (error) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
          })),
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const newTransaction = await db.create('nubestock.tb_ope_transaction', {
      id_product: value.id_product,
      id_user: value.id_user || userIdNum,
      quantity: Number.parseFloat(value.quantity.toFixed(2)), // decimal(15,2)
      type: value.type,
      direction: value.direction,
      has_waste: false, // Se puede establecer después si es necesario
      waste_quantity: 0,
    });

    // Actualizar cantidad del producto según la dirección
    if (value.direction === '+') {
      await db.getConnection()
        .from('nubestock.tb_ope_product')
        .where('id', value.id_product)
        .increment('quantity', value.quantity);
    } else {
      await db.getConnection()
        .from('nubestock.tb_ope_product')
        .where('id', value.id_product)
        .decrement('quantity', value.quantity);
    }

    context.res = {
      status: 201,
      body: {
        success: true,
        data: newTransaction,
        message: 'Transacción creada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al crear transacción:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear transacción',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function updateProduction(context: Context, req: HttpRequest, productionId: string, userId: string): Promise<void> {
  try {
    const productionIdNum = Number.parseInt(productionId, 10);
    if (Number.isNaN(productionIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de producción inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const updateSchema = Joi.object({
      quantity: Joi.number().positive().optional(),
    });

    const { error, value } = updateSchema.validate(req.body);
    
    if (error) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
          })),
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si la transacción de producción existe
    const existingTransaction = await db.getConnection()
      .select('*')
      .from('nubestock.tb_ope_transaction')
      .where('id', productionIdNum)
      .where('type', 'PROD')
      .first();
      
    if (!existingTransaction) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Producción no encontrada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Actualizar transacción (solo quantity puede cambiar)
    const updateData: any = {
      modification_date: new Date(),
    };
    if (value.quantity !== undefined) {
      updateData.quantity = value.quantity;
    }

    const updatedTransaction = await db.update('nubestock.tb_ope_transaction', productionIdNum, updateData);

    if (!updatedTransaction) {
      context.res = {
        status: 500,
        body: {
          success: false,
          message: 'Error al actualizar producción',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedTransaction,
        message: 'Producción actualizada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al actualizar producción:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al actualizar producción',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
