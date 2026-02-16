jest.mock('../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockWhere = jest.fn().mockReturnThis();
const mockWhereRaw = jest.fn().mockReturnThis();
const mockFirst = jest.fn();
const mockInsert = jest.fn().mockReturnThis();
const mockReturning = jest.fn();

const mockConnection = {
  where: mockWhere,
  whereRaw: mockWhereRaw,
  first: mockFirst,
  insert: mockInsert,
  returning: mockReturning,
};

// getConnection() must return a callable: connection('table') => queryBuilder
jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => (table: string) => mockConnection,
    }),
  },
}));

import {
  createAlert,
  createStockLowAlert,
  CreateAlertParams,
} from '../../src/utils/alertHelper';

describe('alertHelper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnThis();
    mockWhereRaw.mockReturnThis();
    mockInsert.mockReturnThis();
  });

  describe('createAlert', () => {
    it('returns null when required fields are missing and failSilently is true', async () => {
      const result = await createAlert(
        { alert_type: '', alert_title: 't', alert_message: 'm' } as CreateAlertParams,
        { failSilently: true }
      );
      expect(result).toBeNull();
    });

    it('throws when required fields are missing and failSilently is false', async () => {
      await expect(
        createAlert(
          { alert_type: '', alert_title: 't', alert_message: 'm' } as CreateAlertParams,
          { failSilently: false }
        )
      ).rejects.toThrow(/alert_type, alert_title y alert_message son requeridos/);
    });

    it('returns existing alert when duplicate is found', async () => {
      const existing = { id: 1, alert_type: 'stock_low' };
      mockFirst.mockResolvedValueOnce(existing);
      const result = await createAlert(
        {
          alert_type: 'stock_low',
          alert_title: 'Stock bajo',
          alert_message: 'Msg',
          entity_type: 'product',
          id_transaction: 10,
        },
        { checkDuplicates: true }
      );
      expect(result).toEqual(existing);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('inserts and returns new alert when no duplicate', async () => {
      mockFirst.mockResolvedValueOnce(undefined);
      const created = { id: 2, alert_type: 'stock_low', alert_title: 'Stock bajo' };
      mockReturning.mockResolvedValueOnce([created]);
      const result = await createAlert({
        alert_type: 'stock_low',
        alert_title: 'Stock bajo',
        alert_message: 'Msg',
        entity_type: 'product',
        id_transaction: 5,
      });
      expect(result).toEqual(created);
      expect(mockInsert).toHaveBeenCalled();
      expect(mockReturning).toHaveBeenCalledWith('*');
    });

    it('returns null when insert returns empty and failSilently is true', async () => {
      mockFirst.mockResolvedValueOnce(undefined);
      mockReturning.mockResolvedValueOnce([]);
      const result = await createAlert(
        {
          alert_type: 'x',
          alert_title: 'y',
          alert_message: 'z',
        },
        { failSilently: true }
      );
      expect(result).toBeNull();
    });

    it('uses due_date when provided as Date', async () => {
      mockFirst.mockResolvedValueOnce(undefined);
      const d = new Date('2025-01-01');
      mockReturning.mockResolvedValueOnce([{ id: 1 }]);
      await createAlert({
        alert_type: 'a',
        alert_title: 'b',
        alert_message: 'c',
        due_date: d,
      });
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          due_date: d,
          resolved_by: 1,
        })
      );
    });

    it('converts due_date string to Date', async () => {
      mockFirst.mockResolvedValueOnce(undefined);
      mockReturning.mockResolvedValueOnce([{ id: 1 }]);
      await createAlert({
        alert_type: 'a',
        alert_title: 'b',
        alert_message: 'c',
        due_date: '2025-06-01',
      });
      const insertCall = mockInsert.mock.calls[0][0];
      expect(insertCall.due_date).toBeInstanceOf(Date);
    });

    it('respects duplicateCheckFields', async () => {
      mockFirst.mockResolvedValueOnce(undefined);
      mockReturning.mockResolvedValueOnce([{ id: 1 }]);
      await createAlert(
        {
          alert_type: 't',
          alert_title: 't2',
          alert_message: 'm',
          entity_type: 'product',
        },
        {
          checkDuplicates: true,
          duplicateCheckFields: { entity_type: false, alert_type: false, id_transaction: false },
        }
      );
      expect(mockWhere).toHaveBeenCalledWith('is_active', true);
    });
  });

  describe('createStockLowAlert', () => {
    it('creates alert via createAlert when no duplicate', async () => {
      mockFirst.mockResolvedValueOnce(undefined);
      mockReturning.mockResolvedValueOnce([{ id: 3 }]);
      const result = await createStockLowAlert(
        100,
        'Product A',
        'SKU-001',
        5,
        10,
        { checkDuplicates: true }
      );
      expect(result).toEqual({ id: 3 });
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          alert_type: 'stock_low',
          alert_title: 'Stock bajo: Product A',
          entity_type: 'product',
          priority: 'high',
        })
      );
      const msg = mockInsert.mock.calls[0][0].alert_message;
      expect(msg).toContain('Product A');
      expect(msg).toContain('SKU-001');
      expect(msg).toContain('5');
      expect(msg).toContain('10');
    });

    it('returns existing alert when duplicate by id_transaction', async () => {
      const existing = { id: 4 };
      mockFirst.mockResolvedValueOnce(existing);
      const result = await createStockLowAlert(
        101,
        'B',
        'SKU-2',
        1,
        5,
        { id_transaction: 99, checkDuplicates: true }
      );
      expect(result).toEqual(existing);
      expect(mockWhere).toHaveBeenCalledWith('id_transaction', 99);
    });

    it('returns existing alert when duplicate by product id in message', async () => {
      const existing = { id: 5 };
      mockFirst.mockResolvedValueOnce(existing);
      const result = await createStockLowAlert(102, 'C', 'SKU-3', 0, 2, {
      });
      expect(result).toEqual(existing);
      expect(mockWhereRaw).toHaveBeenCalledWith('alert_message LIKE ?', ['%ID: 102%']);
    });

    it('skips duplicate check when checkDuplicates is false', async () => {
      mockReturning.mockResolvedValueOnce([{ id: 6 }]);
      const result = await createStockLowAlert(103, 'D', 'SKU-4', 1, 10, { checkDuplicates: false });
      expect(mockFirst).not.toHaveBeenCalled();
      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual({ id: 6 });
    });
  });
});
