jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

const mockGetConnection = jest.fn();
const mockCreate = jest.fn();
jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => mockGetConnection(),
      create: mockCreate,
    }),
  },
}));

import { getPermissions, createPermission } from '../../src/controllers/permissionController';
import { makeContext, makeRequest } from '../helpers/context';

describe('permissionController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const chain: Record<string, any> = {
      select: () => chain,
      from: () => chain,
      where: () => chain,
      orderBy: () => Promise.resolve([]),
      first: () => Promise.resolve(null),
    };
    mockGetConnection.mockReturnValue(chain);
  });

  describe('getPermissions', () => {
    it('returns 200 with data', async () => {
      const context = makeContext();
      await getPermissions(context, makeRequest());
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('createPermission', () => {
    it('returns 400 when name is missing', async () => {
      const context = makeContext();
      await createPermission(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when resource is missing', async () => {
      const context = makeContext();
      await createPermission(context, makeRequest({ body: { name: 'test' } }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when action is missing', async () => {
      const context = makeContext();
      await createPermission(context, makeRequest({ body: { name: 'test', resource: 'users' } }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when permission already exists', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        first: () => Promise.resolve({ id: 1 }), // Permission exists
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await createPermission(context, makeRequest({
        body: {
          name: 'existing',
          resource: 'users',
          action: 'read',
        },
      }));
      expect(context.res!.status).toBe(400);
    });

    it('creates permission successfully', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        first: () => Promise.resolve(null), // No duplicate
      };
      mockGetConnection.mockReturnValue(chain);
      mockCreate.mockResolvedValue({ id: 1, name: 'test', resource: 'users', action: 'read' });
      
      const context = makeContext();
      await createPermission(context, makeRequest({
        body: {
          name: 'test',
          resource: 'users',
          action: 'read',
        },
      }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
    });
  });
});
