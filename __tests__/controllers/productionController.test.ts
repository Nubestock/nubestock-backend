jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

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
  getDailyProduction,
  getProductionStats,
  getTransactions,
  registerProductionMaterials,
  completeProduction,
  registerProduction,
  createTransaction,
  updateProduction,
} from '../../src/controllers/productionController';
import { makeContext, makeRequest } from '../helpers/context';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetConnection.mockReset();
  mockFindById.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockTransaction.mockReset();
});

describe('productionController', () => {
  describe('getDailyProduction', () => {
    it('returns 200 with pending productions', async () => {
      const productions = [{ id: 1, is_pending: true }];
      const pendingRecords = [{ id_transaction: 1 }];
      const materialTransactions = [{ id: 1, id_product: 1, quantity: 10 }];
      
      const baseChain: Record<string, any> = {
        from: () => baseChain,
        leftJoin: () => baseChain,
        select: () => baseChain,
        groupBy: () => baseChain,
        orderBy: () => baseChain,
        offset: () => baseChain,
        limit: () => baseChain,
        clearSelect: () => baseChain,
        clearOrder: () => baseChain,
        clearGroup: () => baseChain,
        countDistinct: () => baseChain,
      };
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      baseChain.first = jest.fn().mockResolvedValue({ count: '10' });
      (baseChain as any).then = (resolve: any) => Promise.resolve(productions).then(resolve);
      
      const pendingChain: Record<string, any> = {
        select: () => pendingChain,
        from: () => pendingChain,
        where: () => pendingChain,
      };
      (pendingChain as any).then = (resolve: any) => Promise.resolve(pendingRecords).then(resolve);
      
      const materialChain: Record<string, any> = {
        select: () => materialChain,
        from: () => materialChain,
        leftJoin: () => materialChain,
        whereIn: () => materialChain,
        orderBy: () => materialChain,
      };
      materialChain.where = jest.fn().mockReturnValue(materialChain);
      (materialChain as any).then = (resolve: any) => Promise.resolve(materialTransactions).then(resolve);
      
      const rawValue = { toString: () => 'raw', valueOf: () => 'raw' };
      baseChain.raw = jest.fn().mockReturnValue(rawValue);
      // clone() is used for count query: await countQuery must resolve to [{ count: '10' }]
      const countChain: Record<string, any> = {
        clearSelect: () => countChain,
        clearOrder: () => countChain,
        clearGroup: () => countChain,
        countDistinct: () => countChain,
      };
      (countChain as any).then = (resolve: any) => Promise.resolve([{ count: '10' }]).then(resolve);
      baseChain.clone = jest.fn().mockReturnValue(countChain);
      
      // Order: baseQuery, then 10x getConnection().raw() in select, then enrichment (pending, material)
      mockGetConnection
        .mockReturnValueOnce(baseChain)
        .mockReturnValueOnce(baseChain).mockReturnValueOnce(baseChain).mockReturnValueOnce(baseChain)
        .mockReturnValueOnce(baseChain).mockReturnValueOnce(baseChain).mockReturnValueOnce(baseChain)
        .mockReturnValueOnce(baseChain).mockReturnValueOnce(baseChain).mockReturnValueOnce(baseChain)
        .mockReturnValueOnce(baseChain) // 10 raw() in select
        .mockReturnValueOnce(pendingChain)
        .mockReturnValueOnce(materialChain);
      
      const context = makeContext();
      await getDailyProduction(context, makeRequest({ query: { status: 'pending' } }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 200 with completed productions', async () => {
      const productions = [{ id: 1, is_pending: false }];
      const pendingRecords = [{ id_transaction: 1 }];
      const materialTransactions = [{ id: 1, id_product: 1, quantity: 10, has_waste: false }];
      
      const baseChain: Record<string, any> = {
        from: () => baseChain,
        select: () => baseChain,
        orderBy: () => baseChain,
        offset: () => baseChain,
        limit: () => baseChain,
      };
      baseChain.leftJoin = jest.fn().mockReturnValue(baseChain);
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      baseChain.whereNull = jest.fn().mockReturnValue(baseChain);
      baseChain.clone = jest.fn().mockReturnValue({
        ...baseChain,
        count: jest.fn().mockResolvedValue([{ count: '5' }]),
      });
      baseChain.raw = jest.fn().mockReturnValue({ toString: () => 'raw', valueOf: () => 'raw' });
      (baseChain as any).then = (resolve: any) => Promise.resolve(productions).then(resolve);
      
      const pendingChain: Record<string, any> = {
        select: () => pendingChain,
        from: () => pendingChain,
        where: () => pendingChain,
      };
      (pendingChain as any).then = (resolve: any) => Promise.resolve(pendingRecords).then(resolve);
      
      const materialChain: Record<string, any> = {
        select: () => materialChain,
        from: () => materialChain,
        leftJoin: () => materialChain,
        whereIn: () => materialChain,
        orderBy: () => materialChain,
      };
      materialChain.where = jest.fn().mockReturnValue(materialChain);
      (materialChain as any).then = (resolve: any) => Promise.resolve(materialTransactions).then(resolve);
      
      let callCount = 0;
      mockGetConnection.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return baseChain; // baseQuery (includes raw in leftJoin)
        if (callCount === 2) return baseChain; // raw() in select
        if (callCount === 3) return pendingChain; // pending records (enrichment loop)
        if (callCount === 4) return materialChain; // material transactions (enrichment loop)
        return baseChain;
      });
      
      const context = makeContext();
      await getDailyProduction(context, makeRequest({ query: { status: 'completed' } }));
      expect(context.res!.status).toBe(200);
    });

    it('returns 200 with all productions (no status filter)', async () => {
      const pendingProductions: any[] = [];
      const completedProductions: any[] = [];
      
      const baseChain: Record<string, any> = {
        from: () => baseChain,
        leftJoin: () => baseChain,
        select: () => baseChain,
        orderBy: () => baseChain,
        clearSelect: () => baseChain,
        clearOrder: () => baseChain,
        clearGroup: () => baseChain,
      };
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      baseChain.raw = jest.fn().mockReturnValue({ toString: () => 'raw', valueOf: () => 'raw' });
      (baseChain as any).then = (resolve: any) => Promise.resolve(completedProductions).then(resolve);
      
      const completedCountChain: Record<string, any> = {
        count: jest.fn().mockResolvedValue([{ count: '0' }]),
      };
      baseChain.clone = jest.fn().mockReturnValue(completedCountChain);
      
      const pendingCountChain: Record<string, any> = {
        from: () => pendingCountChain,
        leftJoin: () => pendingCountChain,
        clearSelect: () => pendingCountChain,
        clearOrder: () => pendingCountChain,
        clearGroup: () => pendingCountChain,
        countDistinct: () => pendingCountChain,
      };
      pendingCountChain.where = jest.fn().mockReturnValue(pendingCountChain);
      (pendingCountChain as any).then = (resolve: any) => Promise.resolve([{ count: '0' }]).then(resolve);
      
      const pendingQueryChain: Record<string, any> = {
        from: () => pendingQueryChain,
        leftJoin: () => pendingQueryChain,
        select: () => pendingQueryChain,
        groupBy: () => pendingQueryChain,
        orderBy: () => pendingQueryChain,
      };
      pendingQueryChain.where = jest.fn().mockReturnValue(pendingQueryChain);
      pendingQueryChain.raw = jest.fn().mockReturnValue({ toString: () => 'raw', valueOf: () => 'raw' });
      (pendingQueryChain as any).then = (resolve: any) => Promise.resolve(pendingProductions).then(resolve);
      
      let callCount = 0;
      mockGetConnection.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return baseChain;           // baseQuery (completed base)
        if (callCount === 2) return pendingCountChain;   // pendingCountQuery
        if (callCount === 3) return pendingQueryChain;   // pendingQuery
        if (callCount >= 4 && callCount <= 11) return pendingQueryChain; // raw() in pending select (8 calls)
        if (callCount === 12) return baseChain;          // raw() in completed select
        return baseChain;
      });
      
      const context = makeContext();
      await getDailyProduction(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
    });

    it('applies filters correctly', async () => {
      const productions = [{ id: 1, is_pending: true }];
      const pendingRecords = [{ id_transaction: 1 }];
      const materialTransactions = [{ id: 1, id_product: 1, quantity: 10 }];
      
      const baseChain: Record<string, any> = {
        from: () => baseChain,
        leftJoin: () => baseChain,
        select: () => baseChain,
        groupBy: () => baseChain,
        orderBy: () => baseChain,
        offset: () => baseChain,
        limit: () => baseChain,
        clearSelect: () => baseChain,
        clearOrder: () => baseChain,
        clearGroup: () => baseChain,
        countDistinct: jest.fn().mockResolvedValue([{ count: '5' }]),
      };
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      baseChain.clone = jest.fn().mockReturnValue(baseChain);
      baseChain.raw = jest.fn().mockReturnValue({ toString: () => 'raw', valueOf: () => 'raw' });
      (baseChain as any).then = (resolve: any) => Promise.resolve(productions).then(resolve);
      
      const pendingChain: Record<string, any> = {
        select: () => pendingChain,
        from: () => pendingChain,
        where: () => pendingChain,
      };
      (pendingChain as any).then = (resolve: any) => Promise.resolve(pendingRecords).then(resolve);
      
      const materialChain: Record<string, any> = {
        select: () => materialChain,
        from: () => materialChain,
        leftJoin: () => materialChain,
        whereIn: () => materialChain,
        orderBy: () => materialChain,
      };
      materialChain.where = jest.fn().mockReturnValue(materialChain);
      (materialChain as any).then = (resolve: any) => Promise.resolve(materialTransactions).then(resolve);
      
      // clone for count must resolve to [{ count: '5' }]
      const countChainFilters: Record<string, any> = {
        clearSelect: () => countChainFilters,
        clearOrder: () => countChainFilters,
        clearGroup: () => countChainFilters,
        countDistinct: () => countChainFilters,
      };
      (countChainFilters as any).then = (resolve: any) => Promise.resolve([{ count: '5' }]).then(resolve);
      baseChain.clone = jest.fn().mockReturnValue(countChainFilters);
      
      let callCount = 0;
      mockGetConnection.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return baseChain; // baseQuery
        if (callCount >= 2 && callCount <= 11) return baseChain; // 10 raw() in select
        if (callCount === 12) return pendingChain; // pending records (enrichment)
        if (callCount === 13) return materialChain; // material transactions (enrichment)
        return baseChain;
      });
      
      const context = makeContext();
      await getDailyProduction(context, makeRequest({
        query: {
          status: 'pending',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          id_user: '1',
          id_product: '2',
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
      await getDailyProduction(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('getProductionStats', () => {
    it('returns 200 with stats data', async () => {
      const productStats = [{ product_name: 'Product 1', total_produced: '100' }];
      const userStats = [{ user_name: 'User 1', total_produced: '50' }];
      const generalStats = { total_production: '1000', active_users: '5', products_produced: '10', total_records: '20' };
      
      const createChainWithRaw = () => {
        const chain: Record<string, any> = {
          select: () => chain,
          from: () => chain,
          leftJoin: () => chain,
          groupBy: () => chain,
          orderBy: () => chain,
        };
        chain.where = jest.fn().mockReturnValue(chain);
        chain.raw = jest.fn().mockReturnValue({ toString: () => 'raw', valueOf: () => 'raw' });
        return chain;
      };
      
      const productChain = createChainWithRaw();
      (productChain as any).then = (resolve: any) => Promise.resolve(productStats).then(resolve);
      
      const userChain = createChainWithRaw();
      (userChain as any).then = (resolve: any) => Promise.resolve(userStats).then(resolve);
      
      const generalChain = createChainWithRaw();
      generalChain.first = jest.fn().mockResolvedValue(generalStats);
      
      let callCount = 0;
      mockGetConnection.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return productChain; // productStats query
        if (callCount >= 2 && callCount <= 4) return productChain; // raw() calls in select (3 calls)
        if (callCount === 5) return userChain; // userStats query
        if (callCount >= 6 && callCount <= 7) return userChain; // raw() calls in select (2 calls)
        if (callCount === 8) return generalChain; // generalStats query
        if (callCount >= 9 && callCount <= 12) return generalChain; // raw() calls in select (4 calls)
        return productChain;
      });
      
      const context = makeContext();
      await getProductionStats(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data.general).toBeDefined();
      expect(context.res!.body.data.byProduct).toBeDefined();
      expect(context.res!.body.data.byUser).toBeDefined();
    });

    it('uses date range from query params', async () => {
      const createChainWithRaw = () => {
        const chain: Record<string, any> = {
          select: () => chain,
          from: () => chain,
          leftJoin: () => chain,
          groupBy: () => chain,
          orderBy: () => chain,
        };
        chain.where = jest.fn().mockReturnValue(chain);
        chain.raw = jest.fn().mockReturnValue({ toString: () => 'raw', valueOf: () => 'raw' });
        return chain;
      };
      
      const productChain = createChainWithRaw();
      (productChain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      
      const userChain = createChainWithRaw();
      (userChain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      
      const generalChain = createChainWithRaw();
      generalChain.first = jest.fn().mockResolvedValue({ total_production: '0', active_users: '0', products_produced: '0', total_records: '0' });
      
      let callCount = 0;
      mockGetConnection.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return productChain;
        if (callCount >= 2 && callCount <= 4) return productChain;
        if (callCount === 5) return userChain;
        if (callCount >= 6 && callCount <= 7) return userChain;
        if (callCount === 8) return generalChain;
        if (callCount >= 9 && callCount <= 12) return generalChain;
        return productChain;
      });
      
      const context = makeContext();
      await getProductionStats(context, makeRequest({
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
      await getProductionStats(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('getTransactions', () => {
    it('returns 200 with transactions data', async () => {
      const transactions = [{ id: 1, type: 'PROD' }];
      
      const baseChain: Record<string, any> = {
        from: () => baseChain,
        leftJoin: () => baseChain,
        select: () => baseChain,
        orderBy: () => baseChain,
        offset: () => baseChain,
        limit: () => baseChain,
      };
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      baseChain.clone = jest.fn().mockReturnValue({
        ...baseChain,
        count: jest.fn().mockResolvedValue([{ count: '10' }]),
      });
      (baseChain as any).then = (resolve: any) => Promise.resolve(transactions).then(resolve);
      
      mockGetConnection.mockReturnValue(baseChain);
      
      const context = makeContext();
      await getTransactions(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(transactions);
    });

    it('applies filters correctly', async () => {
      const baseChain: Record<string, any> = {
        from: () => baseChain,
        leftJoin: () => baseChain,
        select: () => baseChain,
        orderBy: () => baseChain,
        offset: () => baseChain,
        limit: () => baseChain,
      };
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      baseChain.clone = jest.fn().mockReturnValue({
        ...baseChain,
        count: jest.fn().mockResolvedValue([{ count: '5' }]),
      });
      (baseChain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      
      mockGetConnection.mockReturnValue(baseChain);
      
      const context = makeContext();
      await getTransactions(context, makeRequest({
        query: {
          type: 'PROD',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
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
      await getTransactions(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('registerProductionMaterials', () => {
    it('returns 400 when userId is invalid', async () => {
      const context = makeContext();
      await registerProductionMaterials(context, makeRequest({ body: {} }), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await registerProductionMaterials(context, makeRequest({ body: {} }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when product final does not exist', async () => {
      const productChain: Record<string, any> = {
        select: () => productChain,
        from: () => productChain,
      };
      productChain.where = jest.fn().mockReturnValue(productChain);
      productChain.first = jest.fn().mockResolvedValue(null);
      mockGetConnection.mockReturnValue(productChain);
      
      const context = makeContext();
      await registerProductionMaterials(context, makeRequest({
        body: {
          id_product: 999,
          materials: [{ id_product: 1, quantity_used: 10 }],
        },
      }), '1');
      expect(context.res!.status).toBe(404);
    });

    it('returns 400 when materials do not exist', async () => {
      const product = { id: 1, type: 'PF' };
      const productChain: Record<string, any> = {
        select: () => productChain,
        from: () => productChain,
      };
      productChain.where = jest.fn().mockReturnValue(productChain);
      productChain.first = jest.fn().mockResolvedValue(product);
      productChain.whereIn = jest.fn().mockReturnValue(productChain);
      (productChain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      
      mockGetConnection
        .mockReturnValueOnce(productChain)
        .mockReturnValueOnce(productChain);
      
      const context = makeContext();
      await registerProductionMaterials(context, makeRequest({
        body: {
          id_product: 1,
          materials: [{ id_product: 999, quantity_used: 10 }],
        },
      }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when stock is insufficient', async () => {
      const product = { id: 1, type: 'PF' };
      const material = { id: 1, name: 'Material 1', quantity: 5 };
      
      const productChain: Record<string, any> = {
        select: () => productChain,
        from: () => productChain,
      };
      productChain.where = jest.fn().mockReturnValue(productChain);
      productChain.first = jest.fn().mockResolvedValue(product);
      productChain.whereIn = jest.fn().mockReturnValue(productChain);
      (productChain as any).then = (resolve: any) => Promise.resolve([material]).then(resolve);
      
      mockGetConnection
        .mockReturnValueOnce(productChain)
        .mockReturnValueOnce(productChain);
      
      const context = makeContext();
      await registerProductionMaterials(context, makeRequest({
        body: {
          id_product: 1,
          materials: [{ id_product: 1, quantity_used: 10 }], // requesting 10, but only 5 available
        },
      }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('registers production materials successfully', async () => {
      const product = { id: 1, type: 'PF', name: 'Product 1', sku: 'SKU1' };
      const material = { id: 1, name: 'Material 1', sku: 'MAT1', quantity: 100 };
      
      const productChain: Record<string, any> = {
        select: () => productChain,
        from: () => productChain,
      };
      productChain.where = jest.fn().mockReturnValue(productChain);
      productChain.first = jest.fn().mockResolvedValue(product);
      productChain.whereIn = jest.fn().mockReturnValue(productChain);
      (productChain as any).then = (resolve: any) => Promise.resolve([material]).then(resolve);
      
      const materialTransaction = { id: 1, id_product: 1, quantity: 10 };
      const pendingTransaction = { id: 1, id_product: 1, id_transaction: 1 };
      
      mockTransaction.mockImplementation(async (callback: any) => {
        const trx = jest.fn().mockImplementation((table: string) => {
          if (table === 'nubestock.tb_ope_transaction') {
            return {
              insert: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([materialTransaction]),
              }),
            };
          }
          if (table === 'nubestock.tb_ope_pending_transaction') {
            return {
              insert: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([pendingTransaction]),
              }),
            };
          }
          if (table === 'nubestock.tb_ope_product') {
            return {
              where: jest.fn().mockReturnValue({
                decrement: jest.fn().mockResolvedValue(1),
              }),
            };
          }
          return {};
        });
        return callback(trx);
      });
      
      mockGetConnection
        .mockReturnValueOnce(productChain)
        .mockReturnValueOnce(productChain);
      
      const context = makeContext();
      await registerProductionMaterials(context, makeRequest({
        body: {
          id_product: 1,
          materials: [{ id_product: 1, quantity_used: 10 }],
        },
      }), '1');
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await registerProductionMaterials(context, makeRequest({
        body: {
          id_product: 1,
          materials: [{ id_product: 1, quantity_used: 10 }],
        },
      }), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('completeProduction', () => {
    it('returns 400 when productionId is invalid', async () => {
      const context = makeContext();
      await completeProduction(context, makeRequest(), 'x', '1');
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await completeProduction(context, makeRequest({ body: {} }), '1', '1');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when product final does not exist', async () => {
      const productChain: Record<string, any> = {
        select: () => productChain,
        from: () => productChain,
      };
      productChain.where = jest.fn().mockReturnValue(productChain);
      productChain.first = jest.fn().mockResolvedValue(null);
      mockGetConnection.mockReturnValue(productChain);
      
      const context = makeContext();
      await completeProduction(context, makeRequest({
        body: { quantity: 10 },
      }), '999', '1');
      expect(context.res!.status).toBe(404);
    });

    it('returns 404 when no pending transactions exist', async () => {
      const product = { id: 1, type: 'PF' };
      const productChain: Record<string, any> = {
        select: () => productChain,
        from: () => productChain,
      };
      productChain.where = jest.fn().mockReturnValue(productChain);
      productChain.first = jest.fn().mockResolvedValue(product);
      (productChain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      
      mockGetConnection
        .mockReturnValueOnce(productChain)
        .mockReturnValueOnce(productChain);
      
      const context = makeContext();
      await completeProduction(context, makeRequest({
        body: { quantity: 10 },
      }), '1', '1');
      expect(context.res!.status).toBe(404);
    });

    it('returns 400 when production is older than 1 day', async () => {
      const product = { id: 1, type: 'PF' };
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 2);
      const pendingTransactions = [{ id: 1, creation_date: oldDate.toISOString() }];
      
      const productChain: Record<string, any> = {
        select: () => productChain,
        from: () => productChain,
      };
      productChain.where = jest.fn().mockReturnValue(productChain);
      productChain.first = jest.fn().mockResolvedValue(product);
      (productChain as any).then = (resolve: any) => Promise.resolve(pendingTransactions).then(resolve);
      
      mockGetConnection
        .mockReturnValueOnce(productChain)
        .mockReturnValueOnce(productChain);
      
      const context = makeContext();
      await completeProduction(context, makeRequest({
        body: { quantity: 10 },
      }), '1', '1');
      expect(context.res!.status).toBe(400);
    });

    it('completes production successfully', async () => {
      const product = { id: 1, type: 'PF', name: 'Product 1', sku: 'SKU1' };
      const recentDate = new Date();
      const pendingTransactions = [{ id: 1, id_transaction: 1, creation_date: recentDate.toISOString() }];
      const productionTransaction = { id: 1, id_product: 1, quantity: 10 };
      const materialTransactions = [{ id: 1, id_product: 1, quantity: 5, has_waste: false }];
      
      const productChain: Record<string, any> = {
        select: () => productChain,
        from: () => productChain,
      };
      productChain.where = jest.fn().mockReturnValue(productChain);
      productChain.first = jest.fn().mockResolvedValue(product);
      (productChain as any).then = (resolve: any) => Promise.resolve(pendingTransactions).then(resolve);
      
      mockFindById.mockResolvedValue(product);
      
      let productCallCount = 0;
      mockTransaction.mockImplementation(async (callback: any) => {
        const trx = jest.fn().mockImplementation((table: string) => {
          if (table === 'nubestock.tb_ope_transaction') {
            const insertChain = {
              returning: jest.fn().mockResolvedValue([productionTransaction]),
            };
            const selectChain: Record<string, any> = {
              from: () => selectChain,
              leftJoin: () => selectChain,
              whereIn: () => selectChain,
              orderBy: () => selectChain,
            };
            selectChain.where = jest.fn().mockReturnValue(selectChain);
            (selectChain as any).then = (resolve: any) => Promise.resolve(materialTransactions).then(resolve);
            return {
              insert: jest.fn().mockReturnValue(insertChain),
              select: jest.fn().mockReturnValue(selectChain),
            };
          }
          if (table === 'nubestock.tb_ope_pending_transaction') {
            return {
              where: jest.fn().mockReturnValue({
                where: jest.fn().mockReturnValue({
                  update: jest.fn().mockResolvedValue(1),
                }),
              }),
            };
          }
          if (table === 'nubestock.tb_ope_product') {
            productCallCount++;
            // The code calls trx('nubestock.tb_ope_product') twice - both times with where().increment()
            return {
              where: jest.fn().mockReturnValue({
                increment: jest.fn().mockResolvedValue(1),
              }),
            };
          }
          return {};
        });
        return callback(trx);
      });
      
      mockGetConnection
        .mockReturnValueOnce(productChain)
        .mockReturnValueOnce(productChain);
      
      const context = makeContext();
      await completeProduction(context, makeRequest({
        body: { quantity: 10 },
      }), '1', '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await completeProduction(context, makeRequest({
        body: { quantity: 10 },
      }), '1', '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('registerProduction', () => {
    it('returns 400 when userId is invalid', async () => {
      const context = makeContext();
      await registerProduction(context, makeRequest({ body: {} }), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await registerProduction(context, makeRequest({ body: {} }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('registers production successfully', async () => {
      const product = { id: 1, type: 'PF' };
      const transaction = { id: 1, id_product: 1, quantity: 10 };
      
      let productCallCount = 0;
      mockTransaction.mockImplementation(async (callback: any) => {
        const trx = jest.fn().mockImplementation((table: string) => {
          if (table === 'nubestock.tb_ope_product') {
            productCallCount++;
            if (productCallCount === 1) {
              // First call: select().where().where().where().first()
              const productChain: Record<string, any> = {
                select: () => productChain,
              };
              productChain.where = jest.fn().mockReturnValue(productChain);
              productChain.first = jest.fn().mockResolvedValue(product);
              return productChain;
            } else {
              // Second call: where().increment()
              return {
                where: jest.fn().mockReturnValue({
                  increment: jest.fn().mockResolvedValue(1),
                }),
              };
            }
          }
          if (table === 'nubestock.tb_ope_transaction') {
            return {
              insert: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([transaction]),
              }),
            };
          }
          return {};
        });
        return callback(trx);
      });
      
      const context = makeContext();
      await registerProduction(context, makeRequest({
        body: {
          id_product: 1,
          quantity: 10,
        },
      }), '1');
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 404 when product does not exist', async () => {
      mockTransaction.mockImplementation(async (callback: any) => {
        const trx = jest.fn().mockImplementation((table: string) => {
          if (table === 'nubestock.tb_ope_product') {
            const productChain: Record<string, any> = {
              select: () => productChain,
              first: jest.fn().mockResolvedValue(null),
            };
            productChain.where = jest.fn().mockReturnValue(productChain);
            return productChain;
          }
          return {};
        });
        return callback(trx);
      });
      
      const context = makeContext();
      await registerProduction(context, makeRequest({
        body: {
          id_product: 999,
          quantity: 10,
        },
      }), '1');
      expect(context.res!.status).toBe(404);
    });

    it('returns 500 on database error', async () => {
      mockTransaction.mockRejectedValue(new Error('Database error'));
      
      const context = makeContext();
      await registerProduction(context, makeRequest({
        body: {
          id_product: 1,
          quantity: 10,
        },
      }), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('createTransaction', () => {
    it('returns 400 when userId is invalid', async () => {
      const context = makeContext();
      await createTransaction(context, makeRequest({ body: {} }), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await createTransaction(context, makeRequest({ body: {} }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('creates transaction successfully with positive direction', async () => {
      const transaction = { id: 1, id_product: 1, quantity: 10, direction: '+' };
      mockCreate.mockResolvedValue(transaction);
      
      const updateChain: Record<string, any> = {
        from: () => updateChain,
      };
      updateChain.where = jest.fn().mockReturnValue({
        increment: jest.fn().mockResolvedValue(1),
      });
      mockGetConnection.mockReturnValue(updateChain);
      
      const context = makeContext();
      await createTransaction(context, makeRequest({
        body: {
          id_product: 1,
          quantity: 10,
          type: 'IN',
          direction: '+',
        },
      }), '1');
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
    });

    it('creates transaction successfully with negative direction', async () => {
      const transaction = { id: 1, id_product: 1, quantity: 10, direction: '-' };
      mockCreate.mockResolvedValue(transaction);
      
      const updateChain: Record<string, any> = {
        from: () => updateChain,
      };
      updateChain.where = jest.fn().mockReturnValue({
        decrement: jest.fn().mockResolvedValue(1),
      });
      mockGetConnection.mockReturnValue(updateChain);
      
      const context = makeContext();
      await createTransaction(context, makeRequest({
        body: {
          id_product: 1,
          quantity: 10,
          type: 'OUT',
          direction: '-',
        },
      }), '1');
      expect(context.res!.status).toBe(201);
    });

    it('returns 500 on database error', async () => {
      mockCreate.mockRejectedValue(new Error('Database error'));
      
      const context = makeContext();
      await createTransaction(context, makeRequest({
        body: {
          id_product: 1,
          quantity: 10,
          type: 'IN',
          direction: '+',
        },
      }), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('updateProduction', () => {
    it('returns 400 when productionId is invalid', async () => {
      const context = makeContext();
      await updateProduction(context, makeRequest(), 'x', '1');
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await updateProduction(context, makeRequest({
        body: { quantity: -10 },
      }), '1', '1');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when production does not exist', async () => {
      const transactionChain: Record<string, any> = {
        select: () => transactionChain,
        from: () => transactionChain,
      };
      transactionChain.where = jest.fn().mockReturnValue(transactionChain);
      transactionChain.first = jest.fn().mockResolvedValue(null);
      mockGetConnection.mockReturnValue(transactionChain);
      
      const context = makeContext();
      await updateProduction(context, makeRequest({
        body: { quantity: 10 },
      }), '999', '1');
      expect(context.res!.status).toBe(404);
    });

    it('updates production successfully', async () => {
      const existingTransaction = { id: 1, type: 'PROD', quantity: 5 };
      const updatedTransaction = { ...existingTransaction, quantity: 10 };
      
      const transactionChain: Record<string, any> = {
        select: () => transactionChain,
        from: () => transactionChain,
      };
      transactionChain.where = jest.fn().mockReturnValue(transactionChain);
      transactionChain.first = jest.fn().mockResolvedValue(existingTransaction);
      mockGetConnection.mockReturnValue(transactionChain);
      mockUpdate.mockResolvedValue(updatedTransaction);
      
      const context = makeContext();
      await updateProduction(context, makeRequest({
        body: { quantity: 10 },
      }), '1', '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(updatedTransaction);
    });

    it('returns 500 when update fails', async () => {
      const existingTransaction = { id: 1, type: 'PROD' };
      const transactionChain: Record<string, any> = {
        select: () => transactionChain,
        from: () => transactionChain,
      };
      transactionChain.where = jest.fn().mockReturnValue(transactionChain);
      transactionChain.first = jest.fn().mockResolvedValue(existingTransaction);
      mockGetConnection.mockReturnValue(transactionChain);
      mockUpdate.mockResolvedValue(null);
      
      const context = makeContext();
      await updateProduction(context, makeRequest({
        body: { quantity: 10 },
      }), '1', '1');
      expect(context.res!.status).toBe(500);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await updateProduction(context, makeRequest({
        body: { quantity: 10 },
      }), '1', '1');
      expect(context.res!.status).toBe(500);
    });
  });
});
