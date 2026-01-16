import { Knex } from 'knex';
import { Database } from '../config/database';
import { logger } from '../config/logger';

const db = Database.getInstance();

/**
 * Interfaz para los parámetros de creación de alerta
 */
export interface CreateAlertParams {
  alert_type: string;
  alert_title: string;
  alert_message: string;
  entity_type?: string;
  id_transaction?: number;
  priority?: 'low' | 'medium' | 'high';
  due_date?: Date | string;
  is_active?: boolean;
  resolved_by?: number;
}

/**
 * Opciones para la creación de alertas
 */
export interface CreateAlertOptions {
  /**
   * Transacción de Knex (opcional). Si se proporciona, la alerta se crea dentro de la transacción.
   */
  trx?: Knex.Transaction;
  
  /**
   * Si es true, verifica si ya existe una alerta activa similar antes de crear una nueva.
   * Por defecto: true
   */
  checkDuplicates?: boolean;
  
  /**
   * Campos a usar para verificar duplicados. Por defecto usa entity_type + alert_type + id_transaction.
   */
  duplicateCheckFields?: {
    entity_type?: boolean;
    alert_type?: boolean;
    id_transaction?: boolean;
  };
  
  /**
   * Si es true, no lanza error si falla la creación (útil para alertas secundarias).
   * Por defecto: true
   */
  failSilently?: boolean;
}

/**
 * Crea una alerta en el sistema de manera genérica y reutilizable.
 * 
 * @param params - Parámetros de la alerta a crear
 * @param options - Opciones adicionales para la creación
 * @returns La alerta creada o null si falló (y failSilently es true)
 * 
 * @example
 * // Crear alerta de stock bajo
 * await createAlert({
 *   alert_type: 'stock_low',
 *   alert_title: 'Stock bajo: Harina',
 *   alert_message: 'El producto tiene stock bajo',
 *   entity_type: 'product',
 *   entity_id: 123,
 *   priority: 'high'
 * });
 * 
 * @example
 * // Crear alerta dentro de una transacción
 * await db.transaction(async (trx) => {
 *   await createAlert({
 *     alert_type: 'stock_low',
 *     alert_title: 'Stock bajo',
 *     alert_message: 'Mensaje',
 *     entity_type: 'product',
 *     entity_id: 123
 *   }, { trx });
 * });
 */
export async function createAlert(
  params: CreateAlertParams,
  options: CreateAlertOptions = {}
): Promise<any | null> {
  const {
    trx,
    checkDuplicates = true,
    duplicateCheckFields = {
      entity_type: true,
      alert_type: true,
      id_transaction: true,
    },
    failSilently = true,
  } = options;

  try {
    const connection = trx || db.getConnection();

    // Validar campos requeridos
    if (!params.alert_type || !params.alert_title || !params.alert_message) {
      const error = new Error('alert_type, alert_title y alert_message son requeridos');
      if (failSilently) {
        logger.error('Error al crear alerta:', error);
        return null;
      }
      throw error;
    }

    // Verificar duplicados si está habilitado
    if (checkDuplicates) {
      const duplicateQuery = connection('nubestock.tb_mae_alert')
        .where('is_active', true);

      if (duplicateCheckFields.alert_type) {
        duplicateQuery.where('alert_type', params.alert_type);
      }

      if (duplicateCheckFields.entity_type && params.entity_type) {
        duplicateQuery.where('entity_type', params.entity_type);
      }

      if (duplicateCheckFields.id_transaction && params.id_transaction) {
        duplicateQuery.where('id_transaction', params.id_transaction);
      }

      const existingAlert = await duplicateQuery.first();

      if (existingAlert) {
        logger.info('Alerta duplicada detectada, no se creará una nueva', {
          alert_type: params.alert_type,
          entity_type: params.entity_type,
          id_transaction: params.id_transaction,
          existing_alert_id: existingAlert.id,
        });
        return existingAlert;
      }
    }

    // Preparar datos de la alerta
    const alertData: any = {
      alert_type: params.alert_type,
      alert_title: params.alert_title,
      alert_message: params.alert_message,
      priority: params.priority || 'medium',
      is_active: params.is_active !== undefined ? params.is_active : true,
      creation_date: new Date(),
    };

    // Campos opcionales
    if (params.entity_type) {
      alertData.entity_type = params.entity_type;
    }

    if (params.id_transaction) {
      alertData.id_transaction = params.id_transaction;
    }

    if (params.due_date) {
      alertData.due_date = params.due_date instanceof Date 
        ? params.due_date 
        : new Date(params.due_date);
    }

    // resolved_by es requerido por la base de datos, usar 1 (admin) por defecto si no se proporciona
    alertData.resolved_by = params.resolved_by || 1;

    // Crear la alerta
    const [createdAlert] = await connection('nubestock.tb_mae_alert')
      .insert(alertData)
      .returning('*');

    if (!createdAlert) {
      const error = new Error('No se pudo crear la alerta');
      if (failSilently) {
        logger.error('Error al crear alerta:', error);
        return null;
      }
      throw error;
    }

    logger.info('Alerta creada exitosamente', {
      alert_id: createdAlert.id,
      alert_type: params.alert_type,
      entity_type: params.entity_type,
      id_transaction: params.id_transaction,
    });

    return createdAlert;
  } catch (error) {
    logger.error('Error al crear alerta:', error);
    
    if (failSilently) {
      return null;
    }
    
    throw error;
  }
}

/**
 * Crea una alerta de stock bajo de manera simplificada.
 * Helper específico para alertas de stock.
 * 
 * @param productId - ID del producto
 * @param productName - Nombre del producto
 * @param productSku - SKU del producto
 * @param currentStock - Stock actual
 * @param minStock - Stock mínimo requerido
 * @param options - Opciones adicionales (trx, userId, etc.)
 */
export async function createStockLowAlert(
  productId: number,
  productName: string,
  productSku: string,
  currentStock: number,
  minStock: number,
  options: {
    trx?: Knex.Transaction;
    userId?: number;
    id_transaction?: number;
    checkDuplicates?: boolean;
  } = {}
): Promise<any | null> {
  const connection = options.trx || db.getConnection();
  
  // Incluir el ID del producto en el mensaje para referencia
  const alertMessage = `El producto "${productName}" (ID: ${productId}, SKU: ${productSku}) tiene stock bajo. Stock actual: ${currentStock}, Mínimo requerido: ${minStock}`;
  
  // Verificar duplicados de manera más específica para stock bajo
  if (options.checkDuplicates !== false) {
    let duplicateQuery = connection('nubestock.tb_mae_alert')
      .where('is_active', true)
      .where('alert_type', 'stock_low')
      .where('entity_type', 'product');
    
    // Si hay id_transaction, verificar por transacción (una alerta por transacción)
    if (options.id_transaction) {
      duplicateQuery = duplicateQuery.where('id_transaction', options.id_transaction);
    } else {
      // Si no hay id_transaction, verificar por producto buscando en el mensaje
      // Esto evita múltiples alertas para el mismo producto
      duplicateQuery = duplicateQuery.whereRaw(`alert_message LIKE ?`, [`%ID: ${productId}%`]);
    }
    
    const existingAlert = await duplicateQuery.first();
    
    if (existingAlert) {
      logger.info('Alerta de stock bajo duplicada detectada, no se creará una nueva', {
        product_id: productId,
        product_name: productName,
        id_transaction: options.id_transaction,
        existing_alert_id: existingAlert.id,
      });
      return existingAlert;
    }
  }
  
  return createAlert(
    {
      alert_type: 'stock_low',
      alert_title: `Stock bajo: ${productName}`,
      alert_message: alertMessage,
      entity_type: 'product',
      id_transaction: options.id_transaction,
      priority: 'high',
      resolved_by: options.userId || 1,
    },
    {
      trx: options.trx,
      checkDuplicates: false, // Ya verificamos duplicados arriba
      duplicateCheckFields: {
        entity_type: false,
        alert_type: false,
        id_transaction: false,
      },
    }
  );
}
