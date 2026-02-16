jest.mock('../../src/config/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn() },
}));

const mockCreateStockLowAlert = jest.fn().mockResolvedValue(undefined);
jest.mock('../../src/utils/alertHelper', () => ({
  createStockLowAlert: (...args: any[]) => mockCreateStockLowAlert(...args),
}));

const mockReturning = jest.fn();
const mockInsert = jest.fn();
// trx('table').insert(...).returning('*') => insert returns chain with returning
const chain = { returning: mockReturning };
mockInsert.mockReturnValue(chain);
const mockTrx = jest.fn((_table: string) => ({
  insert: mockInsert,
  returning: mockReturning,
}));

import { createStockTransactionAndAlert } from '../../src/utils/stockTransaction';

describe('stockTransaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInsert.mockReturnThis();
  });

  it('does nothing when difference is 0', async () => {
    await createStockTransactionAndAlert(
      mockTrx as any,
      1,
      10,
      10,
      5,
      'Product',
      'SKU',
      1,
      'IN'
    );
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockCreateStockLowAlert).not.toHaveBeenCalled();
  });

  it('inserts transaction and does not create alert when newQuantity >= minStock', async () => {
    mockReturning.mockResolvedValueOnce([{ id: 100 }]);
    await createStockTransactionAndAlert(
      mockTrx as any,
      1,
      10,
      15,
      5,
      'Product',
      'SKU',
      1,
      'IN'
    );
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id_product: 1,
        id_user: 1,
        quantity: 5,
        direction: '+',
        type: 'IN',
      })
    );
    expect(mockCreateStockLowAlert).not.toHaveBeenCalled();
  });

  it('inserts transaction and creates alert when newQuantity < minStock', async () => {
    mockReturning.mockResolvedValueOnce([{ id: 101 }]);
    await createStockTransactionAndAlert(
      mockTrx as any,
      2,
      20,
      15,
      18,
      'Prod2',
      'SKU2',
      3,
      'OUT'
    );
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: 5,
        direction: '-',
        type: 'OUT',
      })
    );
    expect(mockCreateStockLowAlert).toHaveBeenCalledWith(
      2,
      'Prod2',
      'SKU2',
      15,
      18,
      expect.objectContaining({
        userId: 3,
        id_transaction: 101,
        checkDuplicates: true,
      })
    );
  });

  it('does not throw when insert returns empty', async () => {
    mockReturning.mockResolvedValueOnce([]);
    await expect(
      createStockTransactionAndAlert(
        mockTrx as any,
        3,
        5,
        8,
        2,
        'P',
        'S',
        1,
        'IN'
      )
    ).resolves.not.toThrow();
  });

  it('catches errors and does not rethrow', async () => {
    mockInsert.mockImplementationOnce(() => {
      throw new Error('DB error');
    });
    await expect(
      createStockTransactionAndAlert(
        mockTrx as any,
        1,
        5,
        10,
        1,
        'P',
        'S',
        1,
        'IN'
      )
    ).resolves.not.toThrow();
  });
});
