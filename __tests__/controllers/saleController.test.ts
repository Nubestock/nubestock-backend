jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
jest.mock('../../src/utils/alertHelper', () => ({
  createStockLowAlert: jest.fn().mockResolvedValue(undefined),
}));

const mockGetConnection = jest.fn();
const mockFindById = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockTransaction = jest.fn();

jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => mockGetConnection(),
      findById: (table: string, id: number) => mockFindById(table, id),
      create: (table: string, data: any) => mockCreate(table, data),
      update: (table: string, id: number, data: any) => mockUpdate(table, id, data),
      transaction: (cb: any) => mockTransaction(cb),
    }),
  },
}));

import {
  listSales,
  getSale,
  createSale,
  updatePaymentStatus,
  getSalesStats,
  getOverdueSales,
  updateSale,
} from '../../src/controllers/saleController';
import { makeContext, makeRequest } from '../helpers/context';
import { createStockLowAlert } from '../../src/utils/alertHelper';

const mockCreateStockLowAlert = createStockLowAlert as jest.MockedFunction<typeof createStockLowAlert>;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetConnection.mockReset();
  mockFindById.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockTransaction.mockReset();
  mockCreateStockLowAlert.mockResolvedValue(undefined);
});

describe('saleController', () => {
  describe('listSales', () => {
    it('returns 200 with data and pagination', async () => {
      const sales = [{ id: 1, total_amount: 100 }];
      const countResult = { count: '10' };
      
      const baseChain: Record<string, any> = {
        from: () => baseChain,
        leftJoin: () => baseChain,
        select: () => baseChain,
        orderBy: () => baseChain,
        offset: () => baseChain,
        limit: () => baseChain,
        clone: () => baseChain,
        count: () => baseChain,
      };
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      baseChain.first = jest.fn().mockResolvedValue(countResult);
      (baseChain as any).then = (resolve: any) => Promise.resolve(sales).then(resolve);
      mockGetConnection.mockReturnValue(baseChain);
      
      const context = makeContext();
      await listSales(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(sales);
      expect(context.res!.body.pagination).toBeDefined();
    });

    it('applies filters correctly', async () => {
      const baseChain: Record<string, any> = {
        from: () => baseChain,
        leftJoin: () => baseChain,
        select: () => baseChain,
        orderBy: () => baseChain,
        offset: () => baseChain,
        limit: () => baseChain,
        clone: () => baseChain,
        count: () => baseChain,
      };
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      baseChain.first = jest.fn().mockResolvedValue({ count: '5' });
      (baseChain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      mockGetConnection.mockReturnValue(baseChain);
      
      const context = makeContext();
      await listSales(context, makeRequest({
        query: {
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          id_client: '1',
          status: 'paid',
          page: '2',
          limit: '20',
        },
      }));
      expect(context.res!.status).toBe(200);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await listSales(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('getSale', () => {
    it('returns 400 when saleId is invalid', async () => {
      const context = makeContext();
      await getSale(context, makeRequest(), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when sale not found', async () => {
      const chain: Record<string, any> = {
        raw: jest.fn().mockResolvedValue({ rows: [] }),
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getSale(context, makeRequest(), '999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 200 with sale data when found', async () => {
      const saleJson = {
        sale: { sale_id: 1, status: 'paid' },
        client: { name: 'Client 1' },
        items: [],
      };
      
      const chain: Record<string, any> = {
        raw: jest.fn().mockResolvedValue({ rows: [{ sale_json: saleJson }] }),
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getSale(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(saleJson);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await getSale(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('createSale', () => {
    it('returns 400 when userId is invalid', async () => {
      const context = makeContext();
      await createSale(context, makeRequest({ body: {} }), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await createSale(context, makeRequest({ body: {} }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when no products provided', async () => {
      const context = makeContext();
      await createSale(context, makeRequest({
        body: {
          id_client: 1,
          total_amount: 100,
          method: 'cash',
          due_date: '2024-12-31',
          dispatch_guide: 'G001',
        },
      }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when client does not exist', async () => {
      mockFindById.mockResolvedValue(null);
      
      const context = makeContext();
      await createSale(context, makeRequest({
        body: {
          id_client: 999,
          total_amount: 100,
          method: 'cash',
          due_date: '2024-12-31',
          dispatch_guide: 'G001',
          products: [{ id_product: 1, quantity: 1 }],
        },
      }), '1');
      expect(context.res!.status).toBe(404);
    });

    it('returns 404 when product does not exist', async () => {
      mockFindById
        .mockResolvedValueOnce({ id: 1 }) // client exists
        .mockResolvedValueOnce(null); // product does not exist
      
      const context = makeContext();
      await createSale(context, makeRequest({
        body: {
          id_client: 1,
          total_amount: 100,
          method: 'cash',
          due_date: '2024-12-31',
          dispatch_guide: 'G001',
          products: [{ id_product: 999, quantity: 1 }],
        },
      }), '1');
      expect(context.res!.status).toBe(404);
    });

    it('returns 400 when product is not final product', async () => {
      mockFindById
        .mockResolvedValueOnce({ id: 1 }) // client exists
        .mockResolvedValueOnce({ id: 1, type: 'MP' }); // product is material, not final
      
      const context = makeContext();
      await createSale(context, makeRequest({
        body: {
          id_client: 1,
          total_amount: 100,
          method: 'cash',
          due_date: '2024-12-31',
          dispatch_guide: 'G001',
          products: [{ id_product: 1, quantity: 1 }],
        },
      }), '1');
      expect(context.res!.status).toBe(404);
    });

    it('returns 400 when stock is insufficient', async () => {
      mockFindById
        .mockResolvedValueOnce({ id: 1 }) // client exists
        .mockResolvedValueOnce({ id: 1, type: 'PF', quantity: 5 }); // product has only 5 units
      
      const context = makeContext();
      await createSale(context, makeRequest({
        body: {
          id_client: 1,
          total_amount: 100,
          method: 'cash',
          due_date: '2024-12-31',
          dispatch_guide: 'G001',
          products: [{ id_product: 1, quantity: 10 }], // requesting 10
        },
      }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('creates sale successfully', async () => {
      const client = { id: 1 };
      const product = { id: 1, type: 'PF', quantity: 100, name: 'Product 1', sku: 'SKU1', min_stock: 10 };
      const sale = { id: 1, id_client: 1 };
      const transaction = { id: 1, id_product: 1 };
      const salesDetail = { id: 1, id_sales: 1 };
      
      mockFindById
        .mockResolvedValueOnce(client)
        .mockResolvedValueOnce(product);
      
      mockTransaction.mockImplementation(async (callback: any) => {
        const trx = jest.fn().mockImplementation((table: string) => {
          if (table === 'nubestock.tb_ope_sales') {
            return {
              insert: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([sale]),
              }),
            };
          }
          if (table === 'nubestock.tb_ope_transaction') {
            return {
              insert: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([transaction]),
              }),
            };
          }
          if (table === 'nubestock.tb_ope_sales_detail') {
            return {
              insert: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([salesDetail]),
              }),
            };
          }
          if (table === 'nubestock.tb_ope_product') {
            return {
              where: jest.fn().mockReturnValue({
                decrement: jest.fn().mockResolvedValue(1),
                first: jest.fn().mockResolvedValue({ ...product, quantity: 90 }),
              }),
            };
          }
          return {};
        });
        return callback(trx);
      });
      
      const context = makeContext();
      await createSale(context, makeRequest({
        body: {
          id_client: 1,
          total_amount: 100,
          method: 'cash',
          due_date: '2024-12-31',
          dispatch_guide: 'G001',
          products: [{ id_product: 1, quantity: 10 }],
        },
      }), '1');
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
    });

    it('creates sale with details alias for backward compatibility', async () => {
      const client = { id: 1 };
      const product = { id: 1, type: 'PF', quantity: 100, name: 'Product 1', sku: 'SKU1', min_stock: 10 };
      const sale = { id: 1, id_client: 1 };
      const transaction = { id: 1, id_product: 1 };
      const salesDetail = { id: 1, id_sales: 1 };
      
      mockFindById
        .mockResolvedValueOnce(client)
        .mockResolvedValueOnce(product);
      
      mockTransaction.mockImplementation(async (callback: any) => {
        const trx = jest.fn().mockImplementation((table: string) => {
          if (table === 'nubestock.tb_ope_sales') {
            return {
              insert: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([sale]),
              }),
            };
          }
          if (table === 'nubestock.tb_ope_transaction') {
            return {
              insert: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([transaction]),
              }),
            };
          }
          if (table === 'nubestock.tb_ope_sales_detail') {
            return {
              insert: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([salesDetail]),
              }),
            };
          }
          if (table === 'nubestock.tb_ope_product') {
            return {
              where: jest.fn().mockReturnValue({
                decrement: jest.fn().mockResolvedValue(1),
                first: jest.fn().mockResolvedValue({ ...product, quantity: 90 }),
              }),
            };
          }
          return {};
        });
        return callback(trx);
      });
      
      const context = makeContext();
      await createSale(context, makeRequest({
        body: {
          id_client: 1,
          total_amount: 100,
          method: 'cash',
          due_date: '2024-12-31',
          dispatch_guide: 'G001',
          details: [{ id_product: 1, quantity: 10 }],
        },
      }), '1');
      expect(context.res!.status).toBe(201);
    });

    it('generates stock low alert when stock falls below minimum', async () => {
      const client = { id: 1 };
      const product = { id: 1, type: 'PF', quantity: 100, name: 'Product 1', sku: 'SKU1', min_stock: 10 };
      const sale = { id: 1, id_client: 1 };
      const transaction = { id: 1, id_product: 1 };
      const salesDetail = { id: 1, id_sales: 1 };
      
      mockFindById
        .mockResolvedValueOnce(client)
        .mockResolvedValueOnce(product);
      
      mockTransaction.mockImplementation(async (callback: any) => {
        const trx = jest.fn().mockImplementation((table: string) => {
          if (table === 'nubestock.tb_ope_sales') {
            return {
              insert: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([sale]),
              }),
            };
          }
          if (table === 'nubestock.tb_ope_transaction') {
            return {
              insert: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([transaction]),
              }),
            };
          }
          if (table === 'nubestock.tb_ope_sales_detail') {
            return {
              insert: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([salesDetail]),
              }),
            };
          }
          if (table === 'nubestock.tb_ope_product') {
            return {
              where: jest.fn().mockReturnValue({
                decrement: jest.fn().mockResolvedValue(1),
                first: jest.fn().mockResolvedValue({ ...product, quantity: 5 }), // below min_stock
              }),
            };
          }
          return {};
        });
        return callback(trx);
      });
      
      const context = makeContext();
      await createSale(context, makeRequest({
        body: {
          id_client: 1,
          total_amount: 100,
          method: 'cash',
          due_date: '2024-12-31',
          dispatch_guide: 'G001',
          products: [{ id_product: 1, quantity: 95 }], // reduces stock to 5
        },
      }), '1');
      expect(context.res!.status).toBe(201);
      expect(mockCreateStockLowAlert).toHaveBeenCalled();
    });

    it('returns 500 on database error', async () => {
      mockFindById.mockRejectedValue(new Error('Database error'));
      
      const context = makeContext();
      await createSale(context, makeRequest({
        body: {
          id_client: 1,
          total_amount: 100,
          method: 'cash',
          due_date: '2024-12-31',
          dispatch_guide: 'G001',
          products: [{ id_product: 1, quantity: 1 }],
        },
      }), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('updatePaymentStatus', () => {
    it('returns 400 when saleId or status is missing', async () => {
      const context = makeContext();
      await updatePaymentStatus(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when saleId is invalid', async () => {
      const context = makeContext();
      await updatePaymentStatus(context, makeRequest({
        body: { saleId: 'x', status: 'paid' },
      }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when status is invalid', async () => {
      const context = makeContext();
      await updatePaymentStatus(context, makeRequest({
        body: { saleId: '1', status: 'invalid' },
      }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when sale not found', async () => {
      mockUpdate.mockResolvedValue(null);
      
      const context = makeContext();
      await updatePaymentStatus(context, makeRequest({
        body: { saleId: '999', status: 'paid' },
      }));
      expect(context.res!.status).toBe(404);
    });

    it('updates payment status successfully', async () => {
      const updatedSale = { id: 1, status: 'paid' };
      mockUpdate.mockResolvedValue(updatedSale);
      
      const context = makeContext();
      await updatePaymentStatus(context, makeRequest({
        body: { saleId: '1', status: 'paid' },
      }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(updatedSale);
    });

    it('returns 500 on database error', async () => {
      mockUpdate.mockRejectedValue(new Error('Database error'));
      
      const context = makeContext();
      await updatePaymentStatus(context, makeRequest({
        body: { saleId: '1', status: 'paid' },
      }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('getSalesStats', () => {
    it('returns 200 with stats data', async () => {
      const generalStats = {
        total_sales: '1000',
        total_sales_count: '10',
        average_sale: '100',
        unique_clients: '5',
      };
      const paymentStats = [{ status: 'paid', count: '5', total_amount: '500' }];
      const topClients = [{ name: 'Client 1', total_purchased: '300', sales_count: '3' }];
      
      // Create a chain factory that includes raw() method
      const createChainWithRaw = (firstResult: any, thenResult: any = null) => {
        const rawValue = { toString: () => 'raw', valueOf: () => 'raw' };
        const chain: Record<string, any> = {
          from: () => chain,
          groupBy: () => chain,
          orderBy: () => chain,
          limit: () => chain,
          innerJoin: () => chain,
          where: () => chain,
          raw: jest.fn().mockReturnValue(rawValue), // Add raw() method to chain
        };
        chain.select = jest.fn().mockReturnValue(chain);
        chain.first = jest.fn().mockResolvedValue(firstResult);
        if (thenResult !== null) {
          (chain as any).then = (resolve: any) => Promise.resolve(thenResult).then(resolve);
        }
        // Clone returns a new chain with same structure
        chain.clone = jest.fn().mockImplementation(() => createChainWithRaw(firstResult, thenResult));
        return chain;
      };
      
      const baseChain = createChainWithRaw(null);
      const generalChain = createChainWithRaw(generalStats);
      const paymentChain = createChainWithRaw(null, paymentStats);
      const topClientsChain = createChainWithRaw(null, topClients);
      
      // Make baseChain.clone() return the appropriate chains
      baseChain.clone = jest.fn()
        .mockReturnValueOnce(generalChain) // First clone for generalStats
        .mockReturnValueOnce(paymentChain); // Second clone for paymentStats
      
      // Mock getConnection to return chains with raw() method
      // The sequence is: baseQuery, then raw() calls (which return the same chain with raw())
      let callCount = 0;
      mockGetConnection.mockImplementation(() => {
        callCount++;
        // First call: baseQuery
        if (callCount === 1) return baseChain;
        // Calls 2-5: raw() calls for generalStats select (4 calls)
        if (callCount >= 2 && callCount <= 5) return baseChain;
        // Calls 6-8: raw() calls for paymentStats select (3 calls: one for clone, 2 for raw)
        // Actually, clone is called on baseChain, not getConnection
        // So calls 6-7 are for raw() calls
        if (callCount >= 6 && callCount <= 7) return baseChain;
        // Call 8: new query for topClients
        if (callCount === 8) return topClientsChain;
        // Calls 9-10: raw() calls for topClients select (2 calls)
        if (callCount >= 9 && callCount <= 10) return topClientsChain;
        return baseChain;
      });
      
      const context = makeContext();
      await getSalesStats(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data.general).toBeDefined();
      expect(context.res!.body.data.byStatus).toBeDefined();
      expect(context.res!.body.data.topClients).toBeDefined();
    });

    it('uses date range from query params', async () => {
      const generalStats = { total_sales: '0', total_sales_count: '0', average_sale: '0', unique_clients: '0' };
      
      const createChainWithRaw = (firstResult: any, thenResult: any = null) => {
        const rawValue = { toString: () => 'raw', valueOf: () => 'raw' };
        const chain: Record<string, any> = {
          from: () => chain,
          groupBy: () => chain,
          orderBy: () => chain,
          limit: () => chain,
          innerJoin: () => chain,
          where: () => chain,
          raw: jest.fn().mockReturnValue(rawValue),
        };
        chain.select = jest.fn().mockReturnValue(chain);
        chain.first = jest.fn().mockResolvedValue(firstResult);
        if (thenResult !== null) {
          (chain as any).then = (resolve: any) => Promise.resolve(thenResult).then(resolve);
        }
        chain.clone = jest.fn().mockImplementation(() => createChainWithRaw(firstResult, thenResult));
        return chain;
      };
      
      const baseChain = createChainWithRaw(null);
      const generalChain = createChainWithRaw(generalStats);
      const paymentChain = createChainWithRaw(null, []);
      const topClientsChain = createChainWithRaw(null, []);
      
      baseChain.clone = jest.fn()
        .mockReturnValueOnce(generalChain)
        .mockReturnValueOnce(paymentChain);
      
      let callCount = 0;
      mockGetConnection.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return baseChain;
        if (callCount >= 2 && callCount <= 5) return baseChain;
        if (callCount >= 6 && callCount <= 7) return baseChain;
        if (callCount === 8) return topClientsChain;
        if (callCount >= 9 && callCount <= 10) return topClientsChain;
        return baseChain;
      });
      
      const context = makeContext();
      await getSalesStats(context, makeRequest({
        query: {
          startDate: '2024-01-01',
          endDate: '2024-12-31',
        },
      }));
      expect(context.res!.status).toBe(200);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await getSalesStats(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('getOverdueSales', () => {
    it('returns 200 with overdue sales', async () => {
      const overdueSales = [
        { id: 1, status: 'overdue', client_name: 'Client 1' },
      ];
      
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve(overdueSales).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getOverdueSales(context, makeRequest());
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(overdueSales);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await getOverdueSales(context, makeRequest());
      expect(context.res!.status).toBe(500);
    });
  });

  describe('updateSale', () => {
    it('returns 400 when saleId is invalid', async () => {
      const context = makeContext();
      await updateSale(context, makeRequest(), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await updateSale(context, makeRequest({
        body: { total_amount: -10 },
      }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when sale not found', async () => {
      mockFindById.mockResolvedValue(null);
      
      const context = makeContext();
      await updateSale(context, makeRequest({
        body: { status: 'paid' },
      }), '999');
      expect(context.res!.status).toBe(404);
    });

    it('updates sale successfully', async () => {
      const existingSale = { id: 1, status: 'pending' };
      const updatedSale = { ...existingSale, status: 'paid' };
      mockFindById.mockResolvedValue(existingSale);
      mockUpdate.mockResolvedValue(updatedSale);
      
      const context = makeContext();
      await updateSale(context, makeRequest({
        body: { status: 'paid' },
      }), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(updatedSale);
    });

    it('returns 500 when update fails', async () => {
      const existingSale = { id: 1 };
      mockFindById.mockResolvedValue(existingSale);
      mockUpdate.mockResolvedValue(null);
      
      const context = makeContext();
      await updateSale(context, makeRequest({
        body: { status: 'paid' },
      }), '1');
      expect(context.res!.status).toBe(500);
    });

    it('returns 500 on database error', async () => {
      mockFindById.mockRejectedValue(new Error('Database error'));
      
      const context = makeContext();
      await updateSale(context, makeRequest({
        body: { status: 'paid' },
      }), '1');
      expect(context.res!.status).toBe(500);
    });
  });
});
