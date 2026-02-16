jest.mock('../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const mockFindById = jest.fn();
const mockGetConnection = jest.fn();
jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      findById: mockFindById,
      getConnection: () => mockGetConnection(),
    }),
  },
}));

import { listCategories, createCategory } from '../../src/controllers/categoryController';
import { makeContext, makeRequest } from '../helpers/context';

describe('categoryController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConnection.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({ orderBy: () => Promise.resolve([{ id: 1, name: 'Cat1' }]) }),
          orderBy: () => Promise.resolve([{ id: 1, name: 'Cat1' }]),
        }),
      }),
    });
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
  });
});
