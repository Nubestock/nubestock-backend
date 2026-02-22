jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock('../../src/services/emailService', () => ({
  emailService: {
    sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  },
}));

const mockGetConnection = jest.fn();
const mockFindById = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockSoftDelete = jest.fn();

jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => mockGetConnection(),
      findById: (table: string, id: number, columns?: string[]) => mockFindById(table, id, columns),
      create: (table: string, data: any) => mockCreate(table, data),
      update: (table: string, id: number, data: any) => mockUpdate(table, id, data),
      softDelete: (table: string, id: number) => mockSoftDelete(table, id),
    }),
  },
}));

import { listUsers, getUser, createUser, updateUser, deleteUser } from '../../src/controllers/userController';
import { makeContext, makeRequest } from '../helpers/context';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetConnection.mockReset();
  mockFindById.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockSoftDelete.mockReset();
});

describe('userController', () => {
  describe('listUsers', () => {
    it('returns 200 with users list', async () => {
      const users = [{ id: 1, name: 'Test User', email: 'test@test.com' }];
      const userRoles = [{ id_user: 1, name: 'admin' }];
      
      // First chain for main query
      const mainChain: Record<string, any> = {
        select: () => mainChain,
        from: () => mainChain,
        orderBy: () => mainChain,
        offset: () => mainChain,
        limit: () => mainChain,
      };
      mainChain.where = jest.fn().mockReturnValue(mainChain);
      (mainChain as any).then = (resolve: any) => Promise.resolve(users).then(resolve);
      
      // Second chain for count query
      const countChain: Record<string, any> = {
        count: () => countChain,
        from: () => countChain,
      };
      countChain.where = jest.fn().mockReturnValue(countChain);
      (countChain as any).then = (resolve: any) => Promise.resolve([{ count: '1' }]).then(resolve);
      
      // Third chain for roles query
      const rolesChain: Record<string, any> = {
        select: () => rolesChain,
        from: () => rolesChain,
        join: () => rolesChain,
        whereIn: () => rolesChain,
      };
      rolesChain.where = jest.fn().mockReturnValue(rolesChain);
      (rolesChain as any).then = (resolve: any) => Promise.resolve(userRoles).then(resolve);
      
      let callCount = 0;
      mockGetConnection.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return mainChain;
        if (callCount === 2) return countChain;
        return rolesChain;
      });

      const context = makeContext();
      await listUsers(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('applies search filter', async () => {
      const users = [{ id: 1, name: 'Test User', email: 'test@test.com' }];
      const userRoles = [{ id_user: 1, name: 'admin' }];
      
      const mainChain: Record<string, any> = {
        select: () => mainChain,
        from: () => mainChain,
        orderBy: () => mainChain,
        offset: () => mainChain,
        limit: () => mainChain,
      };
      mainChain.where = jest.fn().mockReturnValue(mainChain);
      (mainChain as any).then = (resolve: any) => Promise.resolve(users).then(resolve);
      
      const countChain: Record<string, any> = {
        count: () => countChain,
        from: () => countChain,
      };
      countChain.where = jest.fn().mockReturnValue(countChain);
      (countChain as any).then = (resolve: any) => Promise.resolve([{ count: '1' }]).then(resolve);
      
      const rolesChain: Record<string, any> = {
        select: () => rolesChain,
        from: () => rolesChain,
        join: () => rolesChain,
        whereIn: () => rolesChain,
      };
      rolesChain.where = jest.fn().mockReturnValue(rolesChain);
      (rolesChain as any).then = (resolve: any) => Promise.resolve(userRoles).then(resolve);
      
      let callCount = 0;
      mockGetConnection.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return mainChain;
        if (callCount === 2) return countChain;
        return rolesChain;
      });

      const context = makeContext();
      await listUsers(context, makeRequest({ query: { search: 'test', is_active: 'true' } }));
      expect(context.res!.status).toBe(200);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => { throw new Error('DB error'); });

      const context = makeContext();
      await listUsers(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('getUser', () => {
    it('returns 400 for invalid userId', async () => {
      const context = makeContext();
      await getUser(context, makeRequest({}), 'invalid');
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.message).toBe('ID de usuario inválido');
    });

    it('returns 404 when user not found', async () => {
      mockFindById.mockResolvedValue(null);

      const context = makeContext();
      await getUser(context, makeRequest({}), '999');
      expect(context.res!.status).toBe(404);
      expect(context.res!.body.message).toBe('Usuario no encontrado');
    });

    it('returns 200 with user data', async () => {
      const user = { id: 1, name: 'Test User', email: 'test@test.com' };
      const roles = [{ name: 'admin', description: 'Admin role' }];
      mockFindById.mockResolvedValue(user);
      
      const baseChain: Record<string, any> = {
        select: () => baseChain,
        from: () => baseChain,
        join: () => baseChain,
      };
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      (baseChain as any).then = (resolve: any) => Promise.resolve(roles).then(resolve);
      mockGetConnection.mockReturnValue(baseChain);

      const context = makeContext();
      await getUser(context, makeRequest({}), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.data.roles).toContain('admin');
    });

    it('returns 500 on database error', async () => {
      mockFindById.mockRejectedValue(new Error('DB error'));

      const context = makeContext();
      await getUser(context, makeRequest({}), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('createUser', () => {
    it('returns 400 for invalid input', async () => {
      const context = makeContext();
      await createUser(context, makeRequest({ body: { name: 'A' } }));
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.message).toBe('Datos de entrada inválidos');
    });

    it('returns 400 when email already exists', async () => {
      const baseChain: Record<string, any> = {
        select: () => baseChain,
        from: () => baseChain,
        where: () => baseChain,
      };
      baseChain.first = jest.fn().mockResolvedValue({ id: 1 });
      mockGetConnection.mockReturnValue(baseChain);

      const context = makeContext();
      await createUser(context, makeRequest({
        body: {
          name: 'Test User',
          email: 'existing@test.com',
          password: 'password123',
          phone: '1234567890',
        },
      }));
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.message).toBe('El email ya está registrado');
    });

    it('returns 201 when user created successfully', async () => {
      const baseChain: Record<string, any> = {
        select: () => baseChain,
        from: () => baseChain,
        where: () => baseChain,
      };
      baseChain.first = jest.fn().mockResolvedValue(null);
      mockGetConnection.mockReturnValue(baseChain);
      mockCreate.mockResolvedValue({ id: 1, name: 'Test User', email: 'test@test.com', pwd_hash: 'hash' });

      const context = makeContext();
      await createUser(context, makeRequest({
        body: {
          name: 'Test User',
          email: 'test@test.com',
          password: 'password123',
          phone: '1234567890',
        },
      }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.message).toBe('Usuario creado exitosamente');
    });

    it('returns 500 on database error', async () => {
      const baseChain: Record<string, any> = {
        select: () => baseChain,
        from: () => baseChain,
        where: () => baseChain,
      };
      baseChain.first = jest.fn().mockResolvedValue(null);
      mockGetConnection.mockReturnValue(baseChain);
      mockCreate.mockRejectedValue(new Error('DB error'));

      const context = makeContext();
      await createUser(context, makeRequest({
        body: {
          name: 'Test User',
          email: 'test@test.com',
          password: 'password123',
          phone: '1234567890',
        },
      }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('updateUser', () => {
    it('returns 400 for invalid userId', async () => {
      const context = makeContext();
      await updateUser(context, makeRequest({ body: {} }), 'invalid');
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.message).toBe('ID de usuario inválido');
    });

    it('returns 400 for invalid input', async () => {
      const context = makeContext();
      await updateUser(context, makeRequest({ body: { name: 'A' } }), '1');
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.message).toBe('Datos de entrada inválidos');
    });

    it('returns 404 when user not found', async () => {
      mockFindById.mockResolvedValue(null);

      const context = makeContext();
      await updateUser(context, makeRequest({ body: { name: 'Updated Name' } }), '999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 400 when email already exists', async () => {
      mockFindById.mockResolvedValue({ id: 1, email: 'old@test.com' });
      
      const baseChain: Record<string, any> = {
        select: () => baseChain,
        from: () => baseChain,
      };
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      baseChain.first = jest.fn().mockResolvedValue({ id: 2 });
      mockGetConnection.mockReturnValue(baseChain);

      const context = makeContext();
      await updateUser(context, makeRequest({ body: { email: 'existing@test.com' } }), '1');
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.message).toBe('El email ya está registrado');
    });

    it('returns 200 when user updated successfully', async () => {
      mockFindById.mockResolvedValue({ id: 1, email: 'test@test.com' });
      mockUpdate.mockResolvedValue({ id: 1, name: 'Updated Name', email: 'test@test.com' });
      
      const baseChain: Record<string, any> = {
        select: () => baseChain,
        from: () => baseChain,
      };
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      baseChain.first = jest.fn().mockResolvedValue(null);
      mockGetConnection.mockReturnValue(baseChain);

      const context = makeContext();
      await updateUser(context, makeRequest({ body: { name: 'Updated Name' } }), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.message).toBe('Usuario actualizado exitosamente');
    });

    it('returns 500 when update fails', async () => {
      mockFindById.mockResolvedValue({ id: 1, email: 'test@test.com' });
      mockUpdate.mockResolvedValue(null);

      const context = makeContext();
      await updateUser(context, makeRequest({ body: { name: 'Updated Name' } }), '1');
      expect(context.res!.status).toBe(500);
    });

    it('returns 500 on database error', async () => {
      mockFindById.mockRejectedValue(new Error('DB error'));

      const context = makeContext();
      await updateUser(context, makeRequest({ body: { name: 'Test' } }), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('deleteUser', () => {
    it('returns 400 for invalid userId', async () => {
      const context = makeContext();
      await deleteUser(context, makeRequest({}), 'invalid');
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.message).toBe('ID de usuario inválido');
    });

    it('returns 404 when user not found', async () => {
      mockFindById.mockResolvedValue(null);

      const context = makeContext();
      await deleteUser(context, makeRequest({}), '999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 200 when user deleted successfully', async () => {
      mockFindById.mockResolvedValue({ id: 1 });
      mockSoftDelete.mockResolvedValue(true);

      const context = makeContext();
      await deleteUser(context, makeRequest({}), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.message).toBe('Usuario eliminado exitosamente');
    });

    it('returns 500 when delete fails', async () => {
      mockFindById.mockResolvedValue({ id: 1 });
      mockSoftDelete.mockResolvedValue(false);

      const context = makeContext();
      await deleteUser(context, makeRequest({}), '1');
      expect(context.res!.status).toBe(500);
    });

    it('returns 500 on database error', async () => {
      mockFindById.mockRejectedValue(new Error('DB error'));

      const context = makeContext();
      await deleteUser(context, makeRequest({}), '1');
      expect(context.res!.status).toBe(500);
    });
  });
});
