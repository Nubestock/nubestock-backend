jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

const mockGetConnection = jest.fn();
const mockFindById = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => mockGetConnection(),
      findById: mockFindById,
      create: mockCreate,
      update: mockUpdate,
    }),
  },
}));

import { listMeasures, createMeasure, updateMeasure, deleteMeasure } from '../../src/controllers/measureController';
import { makeContext, makeRequest } from '../helpers/context';

describe('measureController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindById.mockReset();
    mockGetConnection.mockReset();
    mockCreate.mockReset();
    mockUpdate.mockReset();
    const chain: Record<string, any> = {
      select: () => chain,
      from: () => chain,
      orderBy: () => chain, // orderBy debe devolver chain, no promesa directamente
      first: () => Promise.resolve(null),
      limit: () => ({
        first: () => Promise.resolve(null),
      }),
    };
    chain.where = jest.fn().mockReturnValue(chain); // where debe ser una función que devuelve chain
    // Cuando se ejecuta la query (sin más métodos), devolver la promesa
    (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
    mockGetConnection.mockReturnValue(chain);
  });

  describe('listMeasures', () => {
    it('returns 200 with data', async () => {
      const context = makeContext();
      await listMeasures(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 400 when id is invalid', async () => {
      const context = makeContext();
      await listMeasures(context, makeRequest({ query: { id: 'abc' } }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when measure not found by id', async () => {
      mockFindById.mockResolvedValueOnce(null);
      const context = makeContext();
      await listMeasures(context, makeRequest({ query: { id: '999' } }));
      expect(context.res!.status).toBe(404);
    });

    it('returns 200 when measure found by id', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1, name: 'kg', is_active: true });
      const context = makeContext();
      await listMeasures(context, makeRequest({ query: { id: '1' } }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('createMeasure', () => {
    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await createMeasure(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when measure already exists', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        first: () => Promise.resolve({ id: 1 }), // Measure exists
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await createMeasure(context, makeRequest({
        body: {
          name: 'kg',
          description: 'Kilogram',
        },
      }));
      expect(context.res!.status).toBe(400);
    });

    it('creates measure successfully', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        first: () => Promise.resolve(null), // No duplicate
      };
      mockGetConnection.mockReturnValue(chain);
      mockCreate.mockResolvedValue({ id: 1, name: 'kg', description: 'Kilogram' });
      
      const context = makeContext();
      await createMeasure(context, makeRequest({
        body: {
          name: 'kg',
          description: 'Kilogram',
        },
      }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('updateMeasure', () => {
    it('returns 400 when id is missing', async () => {
      const context = makeContext();
      await updateMeasure(context, makeRequest({ query: {}, body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when id is invalid', async () => {
      const context = makeContext();
      await updateMeasure(context, makeRequest({ query: { id: 'abc' }, body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when measure not found', async () => {
      mockFindById.mockResolvedValueOnce(null);
      const context = makeContext();
      await updateMeasure(context, makeRequest({ query: { id: '999' }, body: { name: 'kg' } }));
      expect(context.res!.status).toBe(404);
    });

    it('returns 400 when duplicate name exists', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1, name: 'old' });
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        first: () => Promise.resolve({ id: 2 }), // Duplicate exists
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await updateMeasure(context, makeRequest({ query: { id: '1' }, body: { name: 'duplicate' } }));
      expect(context.res!.status).toBe(400);
    });

    it('updates measure successfully', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1, name: 'old' });
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve(null), // No duplicate
      };
      chain.where = jest.fn().mockReturnValue(chain); // where debe ser una función que devuelve chain
      mockGetConnection.mockReturnValue(chain);
      mockUpdate.mockResolvedValue({ id: 1, name: 'kg' });
      
      const context = makeContext();
      await updateMeasure(context, makeRequest({ query: { id: '1' }, body: { name: 'kg' } }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('deleteMeasure', () => {
    it('returns 400 when id is missing', async () => {
      const context = makeContext();
      await deleteMeasure(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when id is invalid', async () => {
      const context = makeContext();
      await deleteMeasure(context, makeRequest({ query: { id: 'abc' } }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when measure not found', async () => {
      mockFindById.mockResolvedValueOnce(null); // findAndValidateMeasure usa findById
      const context = makeContext();
      await deleteMeasure(context, makeRequest({ query: { id: '999' } }));
      expect(context.res!.status).toBe(404);
    });

    it('returns 400 when measure is in use', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1, is_active: true }); // findAndValidateMeasure usa findById
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        limit: () => ({
          first: () => Promise.resolve({ id: 1 }), // Product using measure
        }),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await deleteMeasure(context, makeRequest({ query: { id: '1' } }));
      expect(context.res!.status).toBe(400);
    });

    it('deletes measure successfully', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1, is_active: true }); // findAndValidateMeasure usa findById
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        limit: () => ({
          first: () => Promise.resolve(null), // No products using measure
        }),
      };
      chain.where = jest.fn().mockReturnValue(chain); // where debe ser una función que devuelve chain
      mockGetConnection.mockReturnValue(chain);
      mockUpdate.mockResolvedValue({ id: 1, is_active: false });
      
      const context = makeContext();
      await deleteMeasure(context, makeRequest({ query: { id: '1' } }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });
});
