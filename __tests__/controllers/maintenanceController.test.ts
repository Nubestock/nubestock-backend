jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

const mockGetConnection = jest.fn();
jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => mockGetConnection(),
    }),
  },
}));

const mockRequireAuth = jest.fn();
jest.mock('../../src/middleware/authMiddleware', () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
}));

import {
  listMaintenances,
  getMaintenance,
  createMaintenance,
  updateMaintenance,
  deleteMaintenance,
  listMaintenanceHistory,
  getMaintenanceHistory,
  createMaintenanceHistory,
  updateMaintenanceHistory,
  deleteMaintenanceHistory,
} from '../../src/controllers/maintenanceController';
import { makeContext, makeRequest } from '../helpers/context';

describe('maintenanceController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConnection.mockReset();
    mockRequireAuth.mockReset();
    
    const chain: Record<string, any> = {
      select: () => chain,
      from: () => chain,
      leftJoin: () => chain,
      orderBy: () => chain,
      first: () => Promise.resolve(null),
      insert: () => chain,
      into: () => chain,
      returning: () => Promise.resolve([{ id: 1 }]),
      update: () => Promise.resolve(1),
      delete: () => Promise.resolve(1),
    };
    chain.where = jest.fn().mockReturnValue(chain);
    (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
    mockGetConnection.mockReturnValue(chain);
  });

  describe('listMaintenances', () => {
    it('returns 200 with data', async () => {
      const context = makeContext();
      await listMaintenances(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(Array.isArray(context.res!.body.data)).toBe(true);
    });

    it('filters by id_machinery when provided', async () => {
      const context = makeContext();
      await listMaintenances(context, makeRequest({ query: { id_machinery: '1' } }));
      expect(context.res!.status).toBe(200);
      expect(mockGetConnection().where).toHaveBeenCalled();
    });

    it('filters by type when provided', async () => {
      const context = makeContext();
      await listMaintenances(context, makeRequest({ query: { type: 'PRV' } }));
      expect(context.res!.status).toBe(200);
    });

    it('filters by is_active when provided as string true', async () => {
      const context = makeContext();
      await listMaintenances(context, makeRequest({ query: { is_active: 'true' } }));
      expect(context.res!.status).toBe(200);
    });

    it('filters by is_active when provided as boolean true', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listMaintenances(context, makeRequest({ query: { is_active: true } }));
      expect(context.res!.status).toBe(200);
    });

    it('ignores invalid id_machinery', async () => {
      const context = makeContext();
      await listMaintenances(context, makeRequest({ query: { id_machinery: 'invalid' } }));
      expect(context.res!.status).toBe(200);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await listMaintenances(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(500);
      expect(context.res!.body.success).toBe(false);
    });
  });

  describe('getMaintenance', () => {
    it('returns 400 when maintenanceId is invalid', async () => {
      const context = makeContext();
      await getMaintenance(context, makeRequest(), 'x');
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.message).toContain('inválido');
    });

    it('returns 404 when maintenance not found', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        first: () => Promise.resolve(null),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getMaintenance(context, makeRequest(), '99999');
      expect(context.res!.status).toBe(404);
      expect(context.res!.body.message).toContain('no encontrado');
    });

    it('returns 200 with maintenance data when found', async () => {
      const maintenanceData = {
        id: 1,
        id_machinery: 1,
        name: 'Test Maintenance',
        type: 'PRV',
        is_active: true,
        machinery_name: 'Test Machinery',
      };
      
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        first: () => Promise.resolve(maintenanceData),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getMaintenance(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(maintenanceData);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await getMaintenance(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('createMaintenance', () => {
    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await createMaintenance(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.message).toContain('inválidos');
    });

    it('returns 400 when required fields are missing', async () => {
      const context = makeContext();
      await createMaintenance(context, makeRequest({ body: { name: 'Test' } }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when type is invalid', async () => {
      const context = makeContext();
      await createMaintenance(context, makeRequest({
        body: {
          id_machinery: 1,
          name: 'Test',
          type: 'INVALID',
          last_mantainance_date: new Date(),
        },
      }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when machinery does not exist', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve(null),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await createMaintenance(context, makeRequest({
        body: {
          id_machinery: 999,
          name: 'Test Maintenance',
          type: 'PRV',
          last_mantainance_date: new Date(),
        },
      }));
      expect(context.res!.status).toBe(404);
      expect(context.res!.body.message).toContain('Maquinaria no encontrada');
    });

    it('creates maintenance successfully', async () => {
      const machineryData = { id: 1, name: 'Test Machinery' };
      const newMaintenance = {
        id: 1,
        id_machinery: 1,
        name: 'Test Maintenance',
        type: 'PRV',
        is_active: true,
        last_mantainance_date: new Date(),
      };
      
      const checkChain: Record<string, any> = {
        select: () => checkChain,
        from: () => checkChain,
        first: () => Promise.resolve(machineryData),
      };
      checkChain.where = jest.fn().mockReturnValue(checkChain);
      
      const insertChain: Record<string, any> = {
        insert: () => insertChain,
        into: () => insertChain,
        returning: () => Promise.resolve([newMaintenance]),
      };
      
      mockGetConnection
        .mockReturnValueOnce(checkChain)
        .mockReturnValueOnce(insertChain);
      
      const context = makeContext();
      await createMaintenance(context, makeRequest({
        body: {
          id_machinery: 1,
          name: 'Test Maintenance',
          type: 'PRV',
          last_mantainance_date: new Date(),
        },
      }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(newMaintenance);
    });

    it('creates maintenance with optional fields', async () => {
      const machineryData = { id: 1 };
      const newMaintenance = {
        id: 1,
        id_machinery: 1,
        name: 'Test Maintenance',
        type: 'COR',
        is_active: false,
        next_maintainance_value: 1000,
        last_mantainance_date: new Date(),
      };
      
      const checkChain: Record<string, any> = {
        select: () => checkChain,
        from: () => checkChain,
        first: () => Promise.resolve(machineryData),
      };
      checkChain.where = jest.fn().mockReturnValue(checkChain);
      
      const insertChain: Record<string, any> = {
        insert: () => insertChain,
        into: () => insertChain,
        returning: () => Promise.resolve([newMaintenance]),
      };
      
      mockGetConnection
        .mockReturnValueOnce(checkChain)
        .mockReturnValueOnce(insertChain);
      
      const context = makeContext();
      await createMaintenance(context, makeRequest({
        body: {
          id_machinery: 1,
          name: 'Test Maintenance',
          type: 'COR',
          is_active: false,
          next_maintainance_value: 1000,
          last_mantainance_date: new Date(),
        },
      }));
      expect(context.res!.status).toBe(201);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await createMaintenance(context, makeRequest({
        body: {
          id_machinery: 1,
          name: 'Test',
          type: 'PRV',
          last_mantainance_date: new Date(),
        },
      }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('updateMaintenance', () => {
    it('returns 400 when maintenanceId is invalid', async () => {
      const context = makeContext();
      await updateMaintenance(context, makeRequest(), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await updateMaintenance(context, makeRequest({ body: { name: '' } }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when type is invalid', async () => {
      const context = makeContext();
      await updateMaintenance(context, makeRequest({ body: { type: 'INVALID' } }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when machinery does not exist (when updating id_machinery)', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve(null),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await updateMaintenance(context, makeRequest({ body: { id_machinery: 999 } }), '1');
      expect(context.res!.status).toBe(404);
      expect(context.res!.body.message).toContain('Maquinaria no encontrada');
    });

    it('updates maintenance successfully', async () => {
      const updatedMaintenance = {
        id: 1,
        id_machinery: 1,
        name: 'Updated Maintenance',
        type: 'COR',
        is_active: false,
      };
      
      const updateChain: Record<string, any> = {
        update: () => updateChain,
        into: () => updateChain,
        returning: () => Promise.resolve([updatedMaintenance]),
      };
      updateChain.where = jest.fn().mockReturnValue(updateChain);
      mockGetConnection.mockReturnValue(updateChain);
      
      const context = makeContext();
      await updateMaintenance(context, makeRequest({
        body: {
          name: 'Updated Maintenance',
          type: 'COR',
          is_active: false,
        },
      }), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(updatedMaintenance);
    });

    it('updates maintenance with partial data', async () => {
      const updatedMaintenance = {
        id: 1,
        name: 'Updated Name',
      };
      
      const updateChain: Record<string, any> = {
        update: () => updateChain,
        into: () => updateChain,
        returning: () => Promise.resolve([updatedMaintenance]),
      };
      updateChain.where = jest.fn().mockReturnValue(updateChain);
      mockGetConnection.mockReturnValue(updateChain);
      
      const context = makeContext();
      await updateMaintenance(context, makeRequest({ body: { name: 'Updated Name' } }), '1');
      expect(context.res!.status).toBe(200);
    });

    it('returns 404 when maintenance not found', async () => {
      const updateChain: Record<string, any> = {
        update: () => updateChain,
        into: () => updateChain,
        returning: () => Promise.resolve([]),
      };
      updateChain.where = jest.fn().mockReturnValue(updateChain);
      mockGetConnection.mockReturnValue(updateChain);
      
      const context = makeContext();
      await updateMaintenance(context, makeRequest({ body: { name: 'Updated' } }), '999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await updateMaintenance(context, makeRequest({ body: { name: 'Updated' } }), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('deleteMaintenance', () => {
    it('returns 400 when maintenanceId is invalid', async () => {
      const context = makeContext();
      await deleteMaintenance(context, makeRequest(), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when maintenance not found', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve(null),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await deleteMaintenance(context, makeRequest(), '999');
      expect(context.res!.status).toBe(404);
    });

    it('deletes maintenance successfully (soft delete)', async () => {
      const maintenanceData = { id: 1, name: 'Test Maintenance' };
      
      const checkChain: Record<string, any> = {
        select: () => checkChain,
        from: () => checkChain,
        first: () => Promise.resolve(maintenanceData),
      };
      checkChain.where = jest.fn().mockReturnValue(checkChain);
      
      const updateChain: Record<string, any> = {
        into: () => Promise.resolve(),
      };
      updateChain.where = jest.fn().mockReturnValue(updateChain);
      updateChain.update = jest.fn().mockReturnValue(updateChain);
      
      mockGetConnection
        .mockReturnValueOnce(checkChain)
        .mockReturnValueOnce(updateChain);
      
      const context = makeContext();
      await deleteMaintenance(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await deleteMaintenance(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('listMaintenanceHistory', () => {
    it('returns 200 with data', async () => {
      const context = makeContext();
      await listMaintenanceHistory(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(Array.isArray(context.res!.body.data)).toBe(true);
    });

    it('filters by id_mantainance when provided', async () => {
      const context = makeContext();
      await listMaintenanceHistory(context, makeRequest({ query: { id_mantainance: '1' } }));
      expect(context.res!.status).toBe(200);
    });

    it('filters by id_machinery when provided', async () => {
      const context = makeContext();
      await listMaintenanceHistory(context, makeRequest({ query: { id_machinery: '1' } }));
      expect(context.res!.status).toBe(200);
    });

    it('parses JSON details correctly', async () => {
      const historyData = [
        {
          id: 1,
          details: '{"attachments":[{"id":1,"content":"test"}]}',
          price: 100,
        },
      ];
      
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve(historyData).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listMaintenanceHistory(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.data[0].details).toEqual({ attachments: [{ id: 1, content: 'test' }] });
    });

    it('handles invalid JSON in details gracefully', async () => {
      const historyData = [
        {
          id: 1,
          details: 'invalid json',
          price: 100,
        },
      ];
      
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve(historyData).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listMaintenanceHistory(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.data[0].details).toEqual({ attachments: [] });
    });

    it('ignores invalid id_mantainance', async () => {
      const context = makeContext();
      await listMaintenanceHistory(context, makeRequest({ query: { id_mantainance: 'invalid' } }));
      expect(context.res!.status).toBe(200);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await listMaintenanceHistory(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('getMaintenanceHistory', () => {
    it('returns 400 when historyId is invalid', async () => {
      const context = makeContext();
      await getMaintenanceHistory(context, makeRequest(), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when history not found', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        first: () => Promise.resolve(null),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getMaintenanceHistory(context, makeRequest(), '999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 200 with history data when found', async () => {
      const historyData = {
        id: 1,
        id_mantainance: 1,
        details: '{"attachments":[{"id":1,"content":"test"}]}',
        price: 100,
      };
      
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        first: () => Promise.resolve(historyData),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getMaintenanceHistory(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data.details).toEqual({ attachments: [{ id: 1, content: 'test' }] });
    });

    it('handles invalid JSON in details', async () => {
      const historyData = {
        id: 1,
        details: 'invalid json',
        price: 100,
      };
      
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        first: () => Promise.resolve(historyData),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getMaintenanceHistory(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.data.details).toEqual({ attachments: [] });
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await getMaintenanceHistory(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('createMaintenanceHistory', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockRequireAuth.mockReturnValue({ success: false, error: 'Not authenticated' });
      
      const context = makeContext();
      await createMaintenanceHistory(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(401);
    });

    it('returns 400 when body is invalid', async () => {
      mockRequireAuth.mockReturnValue({ success: true, user: { userId: 1 } });
      
      const context = makeContext();
      await createMaintenanceHistory(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when details structure is invalid', async () => {
      mockRequireAuth.mockReturnValue({ success: true, user: { userId: 1 } });
      
      const context = makeContext();
      await createMaintenanceHistory(context, makeRequest({
        body: {
          id_mantainance: 1,
          details: { invalid: 'structure' },
          price: 100,
        },
      }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when maintenance does not exist', async () => {
      mockRequireAuth.mockReturnValue({ success: true, user: { userId: 1 } });
      
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve(null),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await createMaintenanceHistory(context, makeRequest({
        body: {
          id_mantainance: 999,
          details: { attachments: [] },
          price: 100,
        },
      }));
      expect(context.res!.status).toBe(404);
    });

    it('creates maintenance history successfully', async () => {
      mockRequireAuth.mockReturnValue({ success: true, user: { userId: 1 } });
      
      const maintenanceData = { id: 1 };
      const newHistory = {
        id: 1,
        id_mantainance: 1,
        id_user: 1,
        details: '{"attachments":[]}',
        price: 100,
      };
      
      const checkChain: Record<string, any> = {
        select: () => checkChain,
        from: () => checkChain,
        first: () => Promise.resolve(maintenanceData),
      };
      checkChain.where = jest.fn().mockReturnValue(checkChain);
      
      const insertChain: Record<string, any> = {
        insert: () => insertChain,
        into: () => insertChain,
        returning: () => Promise.resolve([newHistory]),
      };
      
      mockGetConnection
        .mockReturnValueOnce(checkChain)
        .mockReturnValueOnce(insertChain);
      
      const context = makeContext();
      await createMaintenanceHistory(context, makeRequest({
        body: {
          id_mantainance: 1,
          details: { attachments: [] },
          price: 100,
        },
      }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data.details).toEqual({ attachments: [] });
    });

    it('handles string userId from auth', async () => {
      mockRequireAuth.mockReturnValue({ success: true, user: { userId: '1' } });
      
      const maintenanceData = { id: 1 };
      const newHistory = {
        id: 1,
        id_user: 1,
        details: '{"attachments":[]}',
        price: 100,
      };
      
      const checkChain: Record<string, any> = {
        select: () => checkChain,
        from: () => checkChain,
        first: () => Promise.resolve(maintenanceData),
      };
      checkChain.where = jest.fn().mockReturnValue(checkChain);
      
      const insertChain: Record<string, any> = {
        insert: () => insertChain,
        into: () => insertChain,
        returning: () => Promise.resolve([newHistory]),
      };
      
      mockGetConnection
        .mockReturnValueOnce(checkChain)
        .mockReturnValueOnce(insertChain);
      
      const context = makeContext();
      await createMaintenanceHistory(context, makeRequest({
        body: {
          id_mantainance: 1,
          details: { attachments: [] },
          price: 100,
        },
      }));
      expect(context.res!.status).toBe(201);
    });

    it('returns 500 on database error', async () => {
      mockRequireAuth.mockReturnValue({ success: true, user: { userId: 1 } });
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await createMaintenanceHistory(context, makeRequest({
        body: {
          id_mantainance: 1,
          details: { attachments: [] },
          price: 100,
        },
      }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('updateMaintenanceHistory', () => {
    it('returns 400 when historyId is invalid', async () => {
      const context = makeContext();
      await updateMaintenanceHistory(context, makeRequest(), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await updateMaintenanceHistory(context, makeRequest({
        body: { price: -10 },
      }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('updates maintenance history successfully', async () => {
      const updatedHistory = {
        id: 1,
        details: '{"attachments":[{"id":1,"content":"updated"}]}',
        price: 200,
      };
      
      const updateChain: Record<string, any> = {
        update: () => updateChain,
        into: () => updateChain,
        returning: () => Promise.resolve([updatedHistory]),
      };
      updateChain.where = jest.fn().mockReturnValue(updateChain);
      mockGetConnection.mockReturnValue(updateChain);
      
      const context = makeContext();
      await updateMaintenanceHistory(context, makeRequest({
        body: {
          details: { attachments: [{ id: 1, content: 'updated' }] },
          price: 200,
        },
      }), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data.details).toEqual({ attachments: [{ id: 1, content: 'updated' }] });
    });

    it('updates with partial data', async () => {
      const updatedHistory = {
        id: 1,
        price: 150,
      };
      
      const updateChain: Record<string, any> = {
        update: () => updateChain,
        into: () => updateChain,
        returning: () => Promise.resolve([updatedHistory]),
      };
      updateChain.where = jest.fn().mockReturnValue(updateChain);
      mockGetConnection.mockReturnValue(updateChain);
      
      const context = makeContext();
      await updateMaintenanceHistory(context, makeRequest({ body: { price: 150 } }), '1');
      expect(context.res!.status).toBe(200);
    });

    it('returns 404 when history not found', async () => {
      const updateChain: Record<string, any> = {
        update: () => updateChain,
        into: () => updateChain,
        returning: () => Promise.resolve([]),
      };
      updateChain.where = jest.fn().mockReturnValue(updateChain);
      mockGetConnection.mockReturnValue(updateChain);
      
      const context = makeContext();
      await updateMaintenanceHistory(context, makeRequest({ body: { price: 100 } }), '999');
      expect(context.res!.status).toBe(404);
    });

    it('handles invalid JSON in response', async () => {
      const updatedHistory = {
        id: 1,
        details: 'invalid json',
        price: 100,
      };
      
      const updateChain: Record<string, any> = {
        update: () => updateChain,
        into: () => updateChain,
        returning: () => Promise.resolve([updatedHistory]),
      };
      updateChain.where = jest.fn().mockReturnValue(updateChain);
      mockGetConnection.mockReturnValue(updateChain);
      
      const context = makeContext();
      await updateMaintenanceHistory(context, makeRequest({ body: { price: 100 } }), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.data.details).toEqual({ attachments: [] });
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await updateMaintenanceHistory(context, makeRequest({ body: { price: 100 } }), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('deleteMaintenanceHistory', () => {
    it('returns 400 when historyId is invalid', async () => {
      const context = makeContext();
      await deleteMaintenanceHistory(context, makeRequest(), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when history not found', async () => {
      const checkChain: Record<string, any> = {
        select: () => checkChain,
        from: () => checkChain,
        first: () => Promise.resolve(null),
      };
      checkChain.where = jest.fn().mockReturnValue(checkChain);
      mockGetConnection.mockReturnValue(checkChain);
      
      const context = makeContext();
      await deleteMaintenanceHistory(context, makeRequest(), '999');
      expect(context.res!.status).toBe(404);
    });

    it('deletes maintenance history successfully', async () => {
      const historyData = { id: 1 };
      
      const checkChain: Record<string, any> = {
        select: () => checkChain,
        from: () => checkChain,
        first: () => Promise.resolve(historyData),
      };
      checkChain.where = jest.fn().mockReturnValue(checkChain);
      
      const deleteChain: Record<string, any> = {
        from: () => Promise.resolve(),
      };
      deleteChain.where = jest.fn().mockReturnValue(deleteChain);
      deleteChain.delete = jest.fn().mockReturnValue(deleteChain);
      
      mockGetConnection
        .mockReturnValueOnce(checkChain)
        .mockReturnValueOnce(deleteChain);
      
      const context = makeContext();
      await deleteMaintenanceHistory(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await deleteMaintenanceHistory(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
    });
  });
});
