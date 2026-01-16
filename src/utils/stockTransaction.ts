import { Knex } from 'knex';
import { logger } from '../config/logger';
import { createStockLowAlert } from './alertHelper';

/**
 * Crea una transacción y alerta (si es necesario) cuando cambia el stock de un producto
 * @param trx - Transacción de Knex
 * @param productId - ID del producto
 * @param currentQuantity - Cantidad actual del producto antes del cambio
 * @param newQuantity - Nueva cantidad del producto
 * @param minStock - Stock mínimo del producto
 * @param productName - Nombre del producto (para la alerta)
 * @param productSku - SKU del producto (para la alerta)
 * @param userId - ID del usuario que realiza la operación
 * @param transactionType - Tipo de transacción: 'IN' (Ingreso) o 'OUT' (Salida no comercial)
 */
export async function createStockTransactionAndAlert(
  trx: Knex.Transaction,
  productId: number,
  currentQuantity: number,
  newQuantity: number,
  minStock: number,
  productName: string,
  productSku: string,
  userId: number,
  transactionType: 'IN' | 'OUT'
): Promise<void> {
  try {
    // Calcular la diferencia
    const difference = newQuantity - currentQuantity;

    // Si no hay diferencia, no crear transacción
    if (difference === 0) {
      return;
    }

    // Determinar dirección y cantidad absoluta
    const direction = difference > 0 ? '+' : '-';
    const absoluteQuantity = Math.abs(difference);

    // Crear la transacción
    const [transaction] = await trx('nubestock.tb_ope_transaction')
      .insert({
        id_product: productId,
        id_user: userId,
        quantity: absoluteQuantity,
        direction: direction,
        type: transactionType,
        creation_date: new Date(),
      })
      .returning('*');

    if (!transaction) {
      logger.error('Error al crear transacción de stock', {
        productId,
        currentQuantity,
        newQuantity,
        userId,
      });
      return;
    }

    // Si el stock nuevo está por debajo del mínimo, crear alerta
    if (newQuantity < minStock) {
      await createStockLowAlert(
        productId,
        productName,
        productSku,
        newQuantity,
        minStock,
        {
          trx,
          userId,
          id_transaction: transaction.id,
          checkDuplicates: true,
        }
      );
    }
  } catch (error) {
    logger.error('Error en createStockTransactionAndAlert:', error);
    // No lanzar error - las transacciones y alertas son secundarias
  }
}
