jest.mock('../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const mockFindById = jest.fn();
const mockGetConnection = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      findById: mockFindById,
      getConnection: () => mockGetConnection(),
      create: mockCreate,
      update: mockUpdate,
    }),
  },
}));

import { listCategories, createCategory, updateCategory, deleteCategory } from '../../src/controllers/categoryController';
import { makeContext, makeRequest } from '../helpers/context';

describe('categoryController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const chain: Record<string, any> = {
      select: () => chain,
      from: () => chain,
      where: () => chain,
      orderBy: () => Promise.resolve([{ id: 1, name: 'Cat1' }]),
      first: () => Promise.resolve(null),
      limit: () => ({
        first: () => Promise.resolve(null),
      }),
    };
    mockGetConnection.mockReturnValue(chain);
  });

  describe('listCategories', () => {
    it('returns 200 and list when no id in query', async () => {
      const context = makeContext();
      const req = makeRequest({ query: {} });
      await listCategories(context, req);
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(Array.isArray(context.res!.body.data)).toBe(true);
    });

    it('returns 400 when id is not a number', async () => {
      const context = makeContext();
      const req = makeRequest({ query: { id: 'abc' } });
      await listCategories(context, req);
      expect(context.res!.status).toBe(400);
    });

    it('returns 200 and category when findById returns data', async () => {
      mockFindById.mockResolvedValue({ id: 1, name: 'Cat', is_active: true });
      const context = makeContext();
      const req = makeRequest({ query: { id: '1' } });
      await listCategories(context, req);
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.data).toEqual({ id: 1, name: 'Cat', is_active: true });
    });

    it('returns 404 when category not found', async () => {
      mockFindById.mockResolvedValue(null);
      const context = makeContext();
      const req = makeRequest({ query: { id: '999' } });
      await listCategories(context, req);
      expect(context.res!.status).toBe(404);
    });
  });

  describe('createCategory', () => {
    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      const req = makeRequest({ body: {} });
      await createCategory(context, req);
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when category already exists', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        first: () => Promise.resolve({ id: 1 }), // Category exists
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await createCategory(context, makeRequest({ body: { name: 'Existing' } }));
      expect(context.res!.status).toBe(400);
    });

    it('creates category successfully', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        first: () => Promise.resolve(null), // No duplicate
      };
      mockGetConnection.mockReturnValue(chain);
      mockCreate.mockResolvedValue({ id: 1, name: 'New Category' });
      
      const context = makeContext();
      await createCategory(context, makeRequest({ body: { name: 'New Category' } }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('updateCategory', () => {
    it('returns 400 when id is missing', async () => {
      const context = makeContext();
      await updateCategory(context, makeRequest({ query: {}, body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when id is invalid', async () => {
      const context = makeContext();
      await updateCategory(context, makeRequest({ query: { id: 'abc' }, body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when category not found', async () => {
      mockFindById.mockResolvedValueOnce(null);
      const context = makeContext();
      await updateCategory(context, makeRequest({ query: { id: '999' }, body: { name: 'Updated' } }));
      expect(context.res!.status).toBe(404);
    });

    it('returns 400 when duplicate name exists', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1, name: 'Old' });
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        first: () => Promise.resolve({ id: 2 }), // Duplicate exists
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await updateCategory(context, makeRequest({ query: { id: '1' }, body: { name: 'Duplicate' } }));
      expect(context.res!.status).toBe(400);
    });

    it('updates category successfully', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1, name: 'Old' });
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        first: () => Promise.resolve(null), // No duplicate
      };
      mockGetConnection.mockReturnValue(chain);
      mockUpdate.mockResolvedValue({ id: 1, name: 'Updated' });
      
      const context = makeContext();
      await updateCategory(context, makeRequest({ query: { id: '1' }, body: { name: 'Updated' } }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('deleteCategory', () => {
    it('returns 400 when id is missing', async () => {
      const context = makeContext();
      await deleteCategory(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when id is invalid', async () => {
      const context = makeContext();
      await deleteCategory(context, makeRequest({ query: { id: 'abc' } }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when category not found', async () => {
      mockFindById.mockResolvedValueOnce(null);
      const context = makeContext();
      await deleteCategory(context, makeRequest({ query: { id: '999' } }));
      expect(context.res!.status).toBe(404);
    });

    it('returns 400 when category is in use', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1 });
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        limit: () => ({
          first: () => Promise.resolve({ id: 1 }), // Product using category
        }),
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await deleteCategory(context, makeRequest({ query: { id: '1' } }));
      expect(context.res!.status).toBe(400);
    });

    it('deletes category successfully', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1 });
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        limit: () => ({
          first: () => Promise.resolve(null), // No products using category
        }),
      };
      mockGetConnection.mockReturnValue(chain);
      mockUpdate.mockResolvedValue({ id: 1, is_active: false });
      
      const context = makeContext();
      await deleteCategory(context, makeRequest({ query: { id: '1' } }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });
});
