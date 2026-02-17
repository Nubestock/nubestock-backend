jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));

const mockGetConnection = jest.fn();
const mockFindById = jest.fn();
const mockCreate = jest.fn();
jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => mockGetConnection(),
      findById: mockFindById,
      create: mockCreate,
    }),
  },
}));

const mockRequireAuth = jest.fn();
const mockRequireAnyPermission = jest.fn();
jest.mock('../../src/middleware/authMiddleware', () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
  requireAnyPermission: (...args: any[]) => mockRequireAnyPermission(...args),
}));

const mockConfig = {
  security: {
    bootstrapKey: '',
  },
};
jest.mock('../../src/config/environment', () => ({
  config: mockConfig,
}));

import { getUserPermissions, checkPermission, assignRole, removeRole } from '../../src/controllers/userPermissionController';
import { makeContext, makeRequest } from '../helpers/context';

describe('userPermissionController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConnection.mockReset();
    mockFindById.mockReset();
    mockCreate.mockReset();
    mockRequireAuth.mockReset();
    mockRequireAnyPermission.mockReset();
    
    const chain: Record<string, any> = {
      select: () => chain,
      from: () => chain,
      join: () => chain,
      distinct: () => chain,
      update: () => Promise.resolve(1),
    };
    chain.where = jest.fn().mockReturnValue(chain);
    (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
    mockGetConnection.mockReturnValue(chain);
  });

  describe('getUserPermissions', () => {
    it('returns 200 with user roles and permissions', async () => {
      const rolesChain: Record<string, any> = {
        select: () => rolesChain,
        from: () => rolesChain,
        join: () => rolesChain,
      };
      rolesChain.where = jest.fn().mockReturnValue(rolesChain);
      (rolesChain as any).then = (resolve: any) => Promise.resolve([{ id: 1, name: 'Admin' }]).then(resolve);
      
      const permissionsChain: Record<string, any> = {
        select: () => permissionsChain,
        from: () => permissionsChain,
        join: () => permissionsChain,
        distinct: () => permissionsChain,
      };
      permissionsChain.where = jest.fn().mockReturnValue(permissionsChain);
      (permissionsChain as any).then = (resolve: any) => Promise.resolve([{ id: 1, name: 'read' }]).then(resolve);
      
      mockGetConnection
        .mockReturnValueOnce(rolesChain)
        .mockReturnValueOnce(permissionsChain);
      
      const context = makeContext();
      await getUserPermissions(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toHaveProperty('roles');
      expect(context.res!.body.data).toHaveProperty('permissions');
    });

    it('returns 200 with empty arrays when user has no roles', async () => {
      const rolesChain: Record<string, any> = {
        select: () => rolesChain,
        from: () => rolesChain,
        join: () => rolesChain,
      };
      rolesChain.where = jest.fn().mockReturnValue(rolesChain);
      (rolesChain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      
      const permissionsChain: Record<string, any> = {
        select: () => permissionsChain,
        from: () => permissionsChain,
        join: () => permissionsChain,
        distinct: () => permissionsChain,
      };
      permissionsChain.where = jest.fn().mockReturnValue(permissionsChain);
      (permissionsChain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      
      mockGetConnection
        .mockReturnValueOnce(rolesChain)
        .mockReturnValueOnce(permissionsChain);
      
      const context = makeContext();
      await getUserPermissions(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data.roles).toEqual([]);
      expect(context.res!.body.data.permissions).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await getUserPermissions(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
      expect(context.res!.body.success).toBe(false);
    });
  });

  describe('checkPermission', () => {
    it('returns 400 when userId is missing', async () => {
      const context = makeContext();
      await checkPermission(context, makeRequest({ query: { permission: 'read' } }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when permission is missing', async () => {
      const context = makeContext();
      await checkPermission(context, makeRequest({ query: { userId: '1' } }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 200 with hasPermission true when user has permission', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        join: () => chain,
        first: () => Promise.resolve({ id: 1 }),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await checkPermission(context, makeRequest({ query: { userId: '1', permission: 'read' } }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data.hasPermission).toBe(true);
    });

    it('returns 200 with hasPermission false when user does not have permission', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        join: () => chain,
        first: () => Promise.resolve(null),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await checkPermission(context, makeRequest({ query: { userId: '1', permission: 'write' } }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data.hasPermission).toBe(false);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await checkPermission(context, makeRequest({ query: { userId: '1', permission: 'read' } }));
      expect(context.res!.status).toBe(500);
      expect(context.res!.body.success).toBe(false);
    });
  });

  describe('assignRole', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockRequireAuth.mockReturnValue({ success: false, error: 'Usuario no autenticado' });
      
      const context = makeContext();
      await assignRole(context, makeRequest({ body: { userId: 1, roleId: 1, assignment_reason: 'Test reason' } }));
      expect(context.res!.status).toBe(401);
    });

    it('returns 403 when user does not have required permissions (non-bootstrap mode)', async () => {
      mockRequireAuth.mockReturnValue({ success: true, user: { userId: 1 } });
      mockRequireAnyPermission.mockReturnValue({ success: false, error: 'No tienes permisos' });
      mockConfig.security.bootstrapKey = '';
      
      const context = makeContext();
      await assignRole(context, makeRequest({ body: { userId: 1, roleId: 1, assignment_reason: 'Test reason' } }));
      expect(context.res!.status).toBe(403);
    });

    it('allows assignment in bootstrap mode without permission check', async () => {
      mockRequireAuth.mockReturnValue({ success: true, user: { userId: 1, userEmail: 'admin@test.com' } });
      mockConfig.security.bootstrapKey = 'bootstrap-key-123';
      
      mockFindById
        .mockResolvedValueOnce({ id: 1 }) // User exists
        .mockResolvedValueOnce({ id: 1 }); // Role exists
      
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve(null), // No existing assignment
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      mockCreate.mockResolvedValue({ id: 1, id_user: 1, id_role: 1 });
      
      const context = makeContext();
      await assignRole(context, makeRequest({
        headers: { 'x-bootstrap-key': 'bootstrap-key-123' },
        body: { userId: 1, roleId: 1, assignment_reason: 'Bootstrap initialization' },
      }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 400 when body is invalid', async () => {
      mockRequireAuth.mockReturnValue({ success: true, user: { userId: 1 } });
      mockRequireAnyPermission.mockReturnValue({ success: true });
      
      const context = makeContext();
      await assignRole(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when assignment_reason is too short', async () => {
      mockRequireAuth.mockReturnValue({ success: true, user: { userId: 1 } });
      mockRequireAnyPermission.mockReturnValue({ success: true });
      
      const context = makeContext();
      await assignRole(context, makeRequest({ body: { userId: 1, roleId: 1, assignment_reason: 'ab' } }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when user does not exist', async () => {
      mockRequireAuth.mockReturnValue({ success: true, user: { userId: 1 } });
      mockRequireAnyPermission.mockReturnValue({ success: true });
      mockFindById.mockResolvedValueOnce(null); // User not found
      
      const context = makeContext();
      await assignRole(context, makeRequest({ body: { userId: 999, roleId: 1, assignment_reason: 'Test reason' } }));
      expect(context.res!.status).toBe(404);
      expect(context.res!.body.message).toBe('Usuario no encontrado');
    });

    it('returns 404 when role does not exist', async () => {
      mockRequireAuth.mockReturnValue({ success: true, user: { userId: 1 } });
      mockRequireAnyPermission.mockReturnValue({ success: true });
      mockFindById
        .mockResolvedValueOnce({ id: 1 }) // User exists
        .mockResolvedValueOnce(null); // Role not found
      
      const context = makeContext();
      await assignRole(context, makeRequest({ body: { userId: 1, roleId: 999, assignment_reason: 'Test reason' } }));
      expect(context.res!.status).toBe(404);
      expect(context.res!.body.message).toBe('Rol no encontrado');
    });

    it('returns 400 when user already has the role assigned', async () => {
      mockRequireAuth.mockReturnValue({ success: true, user: { userId: 1 } });
      mockRequireAnyPermission.mockReturnValue({ success: true });
      mockFindById
        .mockResolvedValueOnce({ id: 1 }) // User exists
        .mockResolvedValueOnce({ id: 1 }); // Role exists
      
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve({ id: 1 }), // Existing assignment
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await assignRole(context, makeRequest({ body: { userId: 1, roleId: 1, assignment_reason: 'Test reason' } }));
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.message).toBe('El usuario ya tiene este rol asignado');
    });

    it('assigns role successfully', async () => {
      mockRequireAuth.mockReturnValue({ success: true, user: { userId: 1 } });
      mockRequireAnyPermission.mockReturnValue({ success: true });
      mockFindById
        .mockResolvedValueOnce({ id: 1 }) // User exists
        .mockResolvedValueOnce({ id: 1 }); // Role exists
      
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve(null), // No existing assignment
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      mockCreate.mockResolvedValue({ id: 1, id_user: 1, id_role: 1, assignment_reason: 'Test reason' });
      
      const context = makeContext();
      await assignRole(context, makeRequest({ body: { userId: 1, roleId: 1, assignment_reason: 'Test reason' } }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
      expect(mockCreate).toHaveBeenCalled();
    });

    it('handles string userId and roleId', async () => {
      mockRequireAuth.mockReturnValue({ success: true, user: { userId: '1' } });
      mockRequireAnyPermission.mockReturnValue({ success: true });
      mockFindById
        .mockResolvedValueOnce({ id: 1 }) // User exists
        .mockResolvedValueOnce({ id: 1 }); // Role exists
      
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve(null),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      mockCreate.mockResolvedValue({ id: 1 });
      
      const context = makeContext();
      await assignRole(context, makeRequest({ body: { userId: '1', roleId: '1', assignment_reason: 'Test reason' } }));
      expect(context.res!.status).toBe(201);
    });

    it('returns 500 on database error', async () => {
      mockRequireAuth.mockReturnValue({ success: true, user: { userId: 1 } });
      mockRequireAnyPermission.mockReturnValue({ success: true });
      mockFindById.mockRejectedValue(new Error('Database error'));
      
      const context = makeContext();
      await assignRole(context, makeRequest({ body: { userId: 1, roleId: 1, assignment_reason: 'Test reason' } }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('removeRole', () => {
    it('returns 400 when roleId is missing', async () => {
      const context = makeContext();
      await removeRole(context, makeRequest({ body: {} }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('removes role successfully', async () => {
      const chain: Record<string, any> = {
        from: () => chain,
        update: () => Promise.resolve(1), // One row updated
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await removeRole(context, makeRequest({ body: { roleId: 1 } }), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 404 when assignment does not exist', async () => {
      const chain: Record<string, any> = {
        from: () => chain,
        update: () => Promise.resolve(0), // No rows updated
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await removeRole(context, makeRequest({ body: { roleId: 999 } }), '1');
      expect(context.res!.status).toBe(404);
      expect(context.res!.body.message).toBe('Asignación de rol no encontrada');
    });

    it('handles string userId and roleId', async () => {
      const chain: Record<string, any> = {
        from: () => chain,
        update: () => Promise.resolve(1),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await removeRole(context, makeRequest({ body: { roleId: '1' } }), '1');
      expect(context.res!.status).toBe(200);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await removeRole(context, makeRequest({ body: { roleId: 1 } }), '1');
      expect(context.res!.status).toBe(500);
      expect(context.res!.body.success).toBe(false);
    });
  });
});
