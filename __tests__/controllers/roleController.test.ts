jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

const mockGetConnection = jest.fn();
const mockFindById = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockSoftDelete = jest.fn();
jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => mockGetConnection(),
      findById: mockFindById,
      create: mockCreate,
      update: mockUpdate,
      softDelete: mockSoftDelete,
    }),
  },
}));

import { 
  listRoles, 
  getAllRolesWithPermissions, 
  getRole, 
  createRole, 
  updateRole, 
  deleteRole 
} from '../../src/controllers/roleController';
import { makeContext, makeRequest } from '../helpers/context';

describe('roleController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindById.mockReset();
    mockGetConnection.mockReset();
    mockCreate.mockReset();
    mockUpdate.mockReset();
    mockSoftDelete.mockReset();
    const chain: Record<string, any> = {
      select: () => chain,
      from: () => chain,
      join: () => chain,
      whereIn: () => chain,
      orderBy: () => chain, // orderBy debe devolver chain, no promesa directamente
      update: () => Promise.resolve({}),
    };
    chain.where = jest.fn().mockReturnValue(chain); // where debe ser una función que devuelve chain
    // Cuando se ejecuta la query (sin más métodos), devolver la promesa
    (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
    mockGetConnection.mockReturnValue(chain);
  });

  describe('listRoles', () => {
    it('returns 200 with data array', async () => {
      // listRoles llama a orderBy después de where, así que necesitamos un chain thenable
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve([{ id: 1, name: 'Admin' }]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listRoles(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(Array.isArray(context.res!.body.data)).toBe(true);
    });
  });

  describe('getAllRolesWithPermissions', () => {
    it('returns 200 with roles and permissions', async () => {
      const rolesChain: Record<string, any> = {
        select: () => rolesChain,
        from: () => rolesChain,
        orderBy: () => rolesChain, // orderBy debe devolver chain
      };
      rolesChain.where = jest.fn().mockReturnValue(rolesChain);
      (rolesChain as any).then = (resolve: any) => Promise.resolve([{ id: 1, name: 'Admin' }]).then(resolve);
      
      const permissionsChain: Record<string, any> = {
        select: () => permissionsChain,
        from: () => permissionsChain,
        join: () => permissionsChain,
        orderBy: () => permissionsChain, // orderBy debe devolver chain
      };
      permissionsChain.where = jest.fn().mockReturnValue(permissionsChain);
      (permissionsChain as any).then = (resolve: any) => Promise.resolve([{ id: 1, name: 'read' }]).then(resolve);
      
      const allPermissionsChain: Record<string, any> = {
        select: () => allPermissionsChain,
        from: () => allPermissionsChain,
        orderBy: () => allPermissionsChain, // orderBy debe devolver chain
      };
      allPermissionsChain.where = jest.fn().mockReturnValue(allPermissionsChain);
      (allPermissionsChain as any).then = (resolve: any) => Promise.resolve([{ id: 1, name: 'read' }]).then(resolve);
      
      // Primera llamada: obtener roles
      // Segunda llamada (dentro de Promise.all para cada rol): obtener permisos del rol
      // Tercera llamada: obtener todos los permisos
      mockGetConnection
        .mockReturnValueOnce(rolesChain)
        .mockReturnValueOnce(permissionsChain) // Para el primer rol en Promise.all
        .mockReturnValueOnce(allPermissionsChain);
      
      const context = makeContext();
      await getAllRolesWithPermissions(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('getRole', () => {
    it('returns 400 when roleId is invalid', async () => {
      const context = makeContext();
      await getRole(context, makeRequest(), 'abc');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when role not found', async () => {
      mockFindById.mockResolvedValueOnce(null);
      const context = makeContext();
      await getRole(context, makeRequest(), '99999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 200 with role and permissions when found', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1, name: 'Admin' });
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        join: () => chain,
        orderBy: () => chain, // orderBy debe devolver chain
      };
      chain.where = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve([{ id: 1, name: 'read' }]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getRole(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toHaveProperty('permissions');
    });
  });

  describe('createRole', () => {
    it('returns 400 when name is missing', async () => {
      const context = makeContext();
      await createRole(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when role already exists', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve({ id: 1 }), // Role exists
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await createRole(context, makeRequest({ body: { name: 'Existing' } }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when invalid permissions provided', async () => {
      const roleChain: Record<string, any> = {
        select: () => roleChain,
        from: () => roleChain,
        where: () => roleChain,
        first: () => Promise.resolve(null), // No duplicate role
      };
      
      const permissionsChain: Record<string, any> = {
        select: () => permissionsChain,
        from: () => permissionsChain,
        whereIn: () => permissionsChain,
        where: () => Promise.resolve([]), // Permissions not found (empty array)
      };
      
      mockGetConnection
        .mockReturnValueOnce(roleChain)
        .mockReturnValueOnce(permissionsChain);
      mockCreate.mockResolvedValueOnce({ id: 1, name: 'New Role' });
      
      const context = makeContext();
      await createRole(context, makeRequest({ 
        body: { 
          name: 'New Role',
          permissions: [999] // Invalid permission
        } 
      }));
      expect(context.res!.status).toBe(400);
    });

    it('creates role successfully without permissions', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve(null), // No duplicate
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      mockCreate.mockResolvedValue({ id: 1, name: 'New Role' });
      
      const context = makeContext();
      await createRole(context, makeRequest({ body: { name: 'New Role' } }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
    });

    it('creates role successfully with permissions', async () => {
      const roleChain: Record<string, any> = {
        select: () => roleChain,
        from: () => roleChain,
        first: () => Promise.resolve(null), // No duplicate role
      };
      roleChain.where = jest.fn().mockReturnValue(roleChain);
      
      const permissionsChain: Record<string, any> = {
        select: () => permissionsChain,
        from: () => permissionsChain,
        whereIn: () => permissionsChain,
        where: () => Promise.resolve([{ id: 1 }]), // Permissions exist
      };
      
      mockGetConnection
        .mockReturnValueOnce(roleChain)
        .mockReturnValueOnce(permissionsChain);
      
      mockCreate
        .mockResolvedValueOnce({ id: 1, name: 'New Role' })
        .mockResolvedValue({ id: 1 });
      
      const context = makeContext();
      await createRole(context, makeRequest({ 
        body: { 
          name: 'New Role',
          permissions: [1]
        } 
      }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('updateRole', () => {
    it('returns 400 when roleId is invalid', async () => {
      const context = makeContext();
      await updateRole(context, makeRequest(), 'abc');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when role not found', async () => {
      mockFindById.mockReset();
      mockFindById.mockResolvedValueOnce(null); // Rol no encontrado
      const context = makeContext();
      await updateRole(context, makeRequest({ body: {} }), '999'); // Asegurar que body existe
      expect(context.res!.status).toBe(404);
    });

    it('returns 400 when invalid permissions provided', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1 }); // Rol existe
      mockUpdate.mockResolvedValueOnce({ id: 1, name: 'Test' }); // Actualización exitosa del rol (primero se actualiza el rol)
      
      const permissionsChain: Record<string, any> = {
        select: () => permissionsChain,
        from: () => permissionsChain,
        whereIn: () => permissionsChain,
        where: () => permissionsChain, // where debe devolver chain
      };
      (permissionsChain as any).then = (resolve: any) => Promise.resolve([]).then(resolve); // Permissions not found (empty array)
      mockGetConnection.mockReturnValueOnce(permissionsChain);
      
      const context = makeContext();
      await updateRole(context, makeRequest({ body: { permissions: [999] } }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('updates role successfully', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1 }); // Rol existe
      mockUpdate.mockResolvedValueOnce({ id: 1, name: 'Updated' }); // Actualizar rol (primero se actualiza el rol)
      
      const permissionsChain: Record<string, any> = {
        select: () => permissionsChain,
        from: () => permissionsChain,
        whereIn: () => permissionsChain,
        where: () => permissionsChain, // where debe devolver chain
      };
      (permissionsChain as any).then = (resolve: any) => Promise.resolve([{ id: 1 }]).then(resolve); // Permissions exist
      
      const updateChain: Record<string, any> = {
        from: () => updateChain,
        update: () => Promise.resolve({}), // Soft delete existing permissions
      };
      updateChain.where = jest.fn().mockReturnValue(updateChain);
      
      mockGetConnection
        .mockReturnValueOnce(permissionsChain) // Validar permisos
        .mockReturnValueOnce(updateChain); // Soft delete permisos existentes
      mockCreate.mockResolvedValue({ id: 1 }); // Crear nuevos permisos (se llama múltiples veces, una por cada permiso)
      
      const context = makeContext();
      await updateRole(context, makeRequest({ body: { name: 'Updated', permissions: [1] } }), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('deleteRole', () => {
    it('returns 400 when roleId is invalid', async () => {
      const context = makeContext();
      await deleteRole(context, makeRequest(), 'abc');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when role not found', async () => {
      mockSoftDelete.mockResolvedValueOnce(null);
      const context = makeContext();
      await deleteRole(context, makeRequest(), '999');
      expect(context.res!.status).toBe(404);
    });

    it('deletes role successfully', async () => {
      mockSoftDelete.mockResolvedValueOnce({ id: 1, is_active: false });
      const context = makeContext();
      await deleteRole(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });
});
