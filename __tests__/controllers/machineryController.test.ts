jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

const mockGetConnection = jest.fn();
jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => mockGetConnection(),
    }),
  },
}));

import { 
  listMachinery, 
  getMachinery, 
  createMachinery, 
  updateMachinery, 
  deleteMachinery 
} from '../../src/controllers/machineryController';
import { makeContext, makeRequest } from '../helpers/context';

describe('machineryController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConnection.mockReset();
    const chain: Record<string, any> = {
      select: () => chain,
      from: () => chain,
      orderBy: () => chain, // orderBy debe devolver chain, no promesa directamente
      first: () => Promise.resolve(null),
      insert: () => chain,
      into: () => chain,
      returning: () => Promise.resolve([{ id: 1 }]),
    };
    chain.where = jest.fn().mockReturnValue(chain); // where debe ser una función que devuelve chain
    // Cuando se ejecuta la query (sin más métodos), devolver la promesa
    (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
    mockGetConnection.mockReturnValue(chain);
  });

  describe('listMachinery', () => {
    it('returns 200 with data', async () => {
      const context = makeContext();
      await listMachinery(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('filters by is_active when provided', async () => {
      const context = makeContext();
      await listMachinery(context, makeRequest({ query: { is_active: 'true' } }));
      expect(context.res!.status).toBe(200);
    });

    it('filters by search when provided', async () => {
      // El código usa query.where(function() { this.where(...).orWhere(...) })
      // Necesitamos un mock que maneje esto
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        orderBy: () => chain,
        where: jest.fn((arg1: any, arg2?: any, arg3?: any) => {
          // Si es una función (callback), ejecutarla y devolver chain
          if (typeof arg1 === 'function') {
            const subChain: Record<string, any> = {
              where: () => subChain,
              orWhere: () => subChain,
            };
            arg1.call(subChain);
            return chain;
          }
          return chain;
        }),
      };
      (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listMachinery(context, makeRequest({ query: { search: 'test' } }));
      expect(context.res!.status).toBe(200);
    });
  });

  describe('getMachinery', () => {
    it('returns 400 when machineryId is invalid', async () => {
      const context = makeContext();
      await getMachinery(context, makeRequest(), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when not found', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        first: () => Promise.resolve(null),
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getMachinery(context, makeRequest(), '99999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 200 when machinery found', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        first: () => Promise.resolve({ id: 1, name: 'Test Machinery' }),
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getMachinery(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('createMachinery', () => {
    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await createMachinery(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('creates machinery successfully', async () => {
      const chain: Record<string, any> = {
        insert: () => chain,
        into: () => chain,
        returning: () => Promise.resolve([{ id: 1, name: 'Test', description: 'Test Desc' }]),
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await createMachinery(context, makeRequest({
        body: {
          name: 'Test Machinery',
          description: 'Test Description',
        },
      }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('updateMachinery', () => {
    it('returns 400 when machineryId is invalid', async () => {
      const context = makeContext();
      await updateMachinery(context, makeRequest(), 'abc');
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await updateMachinery(context, makeRequest({ body: { name: '' } }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when machinery not found', async () => {
      const chain: Record<string, any> = {
        where: () => chain,
        update: () => chain,
        into: () => chain,
        returning: () => Promise.resolve([]), // Empty array = not found
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await updateMachinery(context, makeRequest({ body: { name: 'Updated' } }), '999');
      expect(context.res!.status).toBe(404);
    });

    it('updates machinery successfully', async () => {
      const chain: Record<string, any> = {
        where: () => chain,
        update: () => chain,
        into: () => chain,
        returning: () => Promise.resolve([{ id: 1, name: 'Updated' }]),
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await updateMachinery(context, makeRequest({ body: { name: 'Updated' } }), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('deleteMachinery', () => {
    it('returns 400 when machineryId is invalid', async () => {
      const context = makeContext();
      await deleteMachinery(context, makeRequest(), 'abc');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when machinery not found', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        first: () => Promise.resolve(null),
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await deleteMachinery(context, makeRequest(), '999');
      expect(context.res!.status).toBe(404);
    });

    it('deletes machinery successfully', async () => {
      const findChain: Record<string, any> = {
        select: () => findChain,
        from: () => findChain,
        where: () => findChain,
        first: () => Promise.resolve({ id: 1 }),
      };
      
      const updateChain: Record<string, any> = {
        where: () => updateChain,
        update: () => updateChain,
        into: () => Promise.resolve({}),
      };
      
      mockGetConnection
        .mockReturnValueOnce(findChain)
        .mockReturnValueOnce(updateChain);
      
      const context = makeContext();
      await deleteMachinery(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });
});
