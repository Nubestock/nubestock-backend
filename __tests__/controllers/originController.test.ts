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

import { listOrigins, createOrigin, updateOrigin, deleteOrigin } from '../../src/controllers/originController';
import { makeContext, makeRequest } from '../helpers/context';

describe('originController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindById.mockReset();
    mockGetConnection.mockReset();
    mockCreate.mockReset();
    mockUpdate.mockReset();
    const chain: Record<string, any> = {
      select: () => chain,
      from: () => chain,
      leftJoin: () => chain,
      orderBy: () => chain, // orderBy debe devolver chain, no promesa directamente
      first: () => Promise.resolve(null),
      limit: () => ({
        first: () => Promise.resolve(null),
      }),
      raw: () => '',
    };
    chain.where = jest.fn().mockReturnValue(chain); // where debe ser una función que devuelve chain
    // Cuando se ejecuta la query (sin más métodos), devolver la promesa
    (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
    mockGetConnection.mockReturnValue(chain);
  });

  describe('listOrigins', () => {
    it('returns 200 with data', async () => {
      const context = makeContext();
      await listOrigins(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 400 when id is invalid', async () => {
      const context = makeContext();
      await listOrigins(context, makeRequest({ query: { id: 'abc' } }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when origin not found by id', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        first: () => Promise.resolve(null),
        raw: () => '',
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listOrigins(context, makeRequest({ query: { id: '999' } }));
      expect(context.res!.status).toBe(404);
    });

    it('returns 200 when origin found by id', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        first: () => Promise.resolve({ id: 1, name: 'Test', is_active: true }),
        raw: () => '',
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listOrigins(context, makeRequest({ query: { id: '1' } }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('createOrigin', () => {
    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await createOrigin(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when city not found', async () => {
      mockFindById.mockResolvedValueOnce(null);
      const context = makeContext();
      await createOrigin(context, makeRequest({
        body: {
          name: 'Test Origin',
          id_city: 999,
        },
      }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when origin already exists', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1, is_active: true });
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        first: () => Promise.resolve({ id: 1 }), // Origin exists
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await createOrigin(context, makeRequest({
        body: {
          name: 'Test Origin',
          id_city: 1,
        },
      }));
      expect(context.res!.status).toBe(400);
    });

    it('creates origin successfully', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1, is_active: true });
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        first: () => Promise.resolve(null), // No duplicate
      };
      mockGetConnection.mockReturnValue(chain);
      mockCreate.mockResolvedValue({ id: 1, name: 'Test Origin' });
      
      const context = makeContext();
      await createOrigin(context, makeRequest({
        body: {
          name: 'Test Origin',
          id_city: 1,
        },
      }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('updateOrigin', () => {
    it('returns 400 when id is missing', async () => {
      const context = makeContext();
      await updateOrigin(context, makeRequest({ query: {}, body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when id is invalid', async () => {
      const context = makeContext();
      await updateOrigin(context, makeRequest({ query: { id: 'abc' }, body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when body is invalid', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1 });
      const context = makeContext();
      await updateOrigin(context, makeRequest({ query: { id: '1' }, body: { name: 'a' } }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when origin not found', async () => {
      mockFindById.mockResolvedValueOnce(null); // Verificar origen existe - no encontrado
      const context = makeContext();
      await updateOrigin(context, makeRequest({ query: { id: '999' }, body: { name: 'Updated' } }));
      expect(context.res!.status).toBe(404);
    });

    it('returns 400 when city not found', async () => {
      mockFindById
        .mockResolvedValueOnce({ id: 1, is_active: true }) // Origin exists
        .mockResolvedValueOnce(null); // City not found
      
      const context = makeContext();
      await updateOrigin(context, makeRequest({ query: { id: '1' }, body: { id_city: 999 } }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when duplicate origin exists', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1, name: 'Old', id_city: 1, is_active: true });
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve({ id: 2 }), // Duplicate exists
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await updateOrigin(context, makeRequest({ query: { id: '1' }, body: { name: 'Duplicate' } }));
      expect(context.res!.status).toBe(400);
    });

    it('updates origin successfully', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1, name: 'Old', id_city: 1, is_active: true });
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve(null), // No duplicate
      };
      chain.where = jest.fn().mockReturnValue(chain); // where debe ser una función que devuelve chain
      mockGetConnection.mockReturnValue(chain);
      mockUpdate.mockResolvedValue({ id: 1, name: 'Updated' });
      
      const context = makeContext();
      await updateOrigin(context, makeRequest({ query: { id: '1' }, body: { name: 'Updated' } }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('deleteOrigin', () => {
    it('returns 400 when id is missing', async () => {
      const context = makeContext();
      await deleteOrigin(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when id is invalid', async () => {
      const context = makeContext();
      await deleteOrigin(context, makeRequest({ query: { id: 'abc' } }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when origin not found', async () => {
      mockFindById.mockResolvedValueOnce(null);
      const context = makeContext();
      await deleteOrigin(context, makeRequest({ query: { id: '999' } }));
      expect(context.res!.status).toBe(404);
    });

    it('returns 400 when origin is in use', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1, is_active: true });
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        limit: () => ({
          first: () => Promise.resolve({ id: 1 }), // Product using origin
        }),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await deleteOrigin(context, makeRequest({ query: { id: '1' } }));
      expect(context.res!.status).toBe(400);
    });

    it('deletes origin successfully', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1, is_active: true });
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        limit: () => ({
          first: () => Promise.resolve(null), // No products using origin
        }),
      };
      chain.where = jest.fn().mockReturnValue(chain); // where debe ser una función que devuelve chain
      mockGetConnection.mockReturnValue(chain);
      mockUpdate.mockResolvedValue({ id: 1, is_active: false });
      
      const context = makeContext();
      await deleteOrigin(context, makeRequest({ query: { id: '1' } }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });
});
