jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

const mockGetConnection = jest.fn();
const mockTransaction = jest.fn();
jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => mockGetConnection(),
      transaction: (cb: any) => mockTransaction(cb),
    }),
  },
}));

const mockRequireAuth = jest.fn();
jest.mock('../../src/middleware/authMiddleware', () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
}));

import {
  listMachineryAlerts,
  getUserAlerts,
  getMachineryAlert,
  createMachineryAlert,
  markAlertAsRead,
  assignAlertToUsers,
  registerUserDevice,
  getUserDevices,
  unregisterUserDevice,
} from '../../src/controllers/machineryAlertController';
import { makeContext, makeRequest } from '../helpers/context';
import { Database } from '../../src/config/database';

const db = Database.getInstance();

beforeEach(() => {
  jest.clearAllMocks();
  mockGetConnection.mockReset();
  mockRequireAuth.mockReset();
  mockTransaction.mockReset();
  mockRequireAuth.mockReturnValue({ success: true, user: { userId: 1 } });
});

describe('machineryAlertController', () => {
  describe('listMachineryAlerts', () => {
    it('returns 200 with data', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      chain.join = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listMachineryAlerts(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(Array.isArray(context.res!.body.data)).toBe(true);
    });

    it('filters by id_mantainance when provided', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      chain.join = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listMachineryAlerts(context, makeRequest({ query: { id_mantainance: '1' } }));
      expect(context.res!.status).toBe(200);
    });

    it('filters by type when provided', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      chain.join = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listMachineryAlerts(context, makeRequest({ query: { type: 'maintenance' } }));
      expect(context.res!.status).toBe(200);
    });

    it('filters by is_sent when provided', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      chain.join = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listMachineryAlerts(context, makeRequest({ query: { is_sent: 'true' } }));
      expect(context.res!.status).toBe(200);
    });

    it('filters by user_id when provided', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      chain.join = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listMachineryAlerts(context, makeRequest({ query: { user_id: '1' } }));
      expect(context.res!.status).toBe(200);
    });

    it('ignores invalid id_mantainance', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      chain.join = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listMachineryAlerts(context, makeRequest({ query: { id_mantainance: 'invalid' } }));
      expect(context.res!.status).toBe(200);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await listMachineryAlerts(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('getUserAlerts', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockRequireAuth.mockReturnValue({ success: false, error: 'Not authenticated' });
      
      const context = makeContext();
      await getUserAlerts(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(401);
    });

    it('returns 200 with data', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        join: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getUserAlerts(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('filters by is_read when provided', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        join: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getUserAlerts(context, makeRequest({ query: { is_read: 'true' } }));
      expect(context.res!.status).toBe(200);
    });

    it('handles string userId from auth', async () => {
      mockRequireAuth.mockReturnValue({ success: true, user: { userId: '1' } });
      
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        join: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getUserAlerts(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await getUserAlerts(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('getMachineryAlert', () => {
    it('returns 400 when alertId is invalid', async () => {
      const context = makeContext();
      await getMachineryAlert(context, makeRequest(), 'abc');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when alert not found', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        first: () => Promise.resolve(null),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getMachineryAlert(context, makeRequest(), '99999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 200 with alert data when found', async () => {
      const alertData = {
        id: 1,
        id_mantainance: 1,
        type: 'maintenance',
        title: 'Test Alert',
        message: 'Test message',
      };
      
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        first: () => Promise.resolve(alertData),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getMachineryAlert(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(alertData);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await getMachineryAlert(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('createMachineryAlert', () => {
    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await createMachineryAlert(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when maintenance does not exist', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve(null),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      mockTransaction.mockImplementation(async (callback: any) => {
        const trx = {
          insert: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ id: 1 }]),
          }),
        };
        (trx as any)['nubestock.tb_ope_machinery_alert'] = trx.insert;
        (trx as any)['nubestock.tb_ope_alert_user'] = trx.insert;
        return callback(trx);
      });
      
      const context = makeContext();
      await createMachineryAlert(context, makeRequest({
        body: {
          id_mantainance: 999,
          type: 'maintenance',
          date: new Date(),
          title: 'Test',
          message: 'Test message',
        },
      }));
      expect(context.res!.status).toBe(404);
    });

    it('creates alert successfully without user_ids', async () => {
      const maintenanceData = { id: 1 };
      const newAlert = {
        id: 1,
        id_mantainance: 1,
        type: 'maintenance',
        title: 'Test',
        message: 'Test message',
      };
      
      const checkChain: Record<string, any> = {
        select: () => checkChain,
        from: () => checkChain,
        first: () => Promise.resolve(maintenanceData),
      };
      checkChain.where = jest.fn().mockReturnValue(checkChain);
      
      mockTransaction.mockImplementation(async (callback: any) => {
        const insertChain = {
          returning: jest.fn().mockResolvedValue([newAlert]),
        };
        const trx = jest.fn().mockReturnValue({
          insert: jest.fn().mockReturnValue(insertChain),
        });
        return callback(trx);
      });
      
      mockGetConnection.mockReturnValue(checkChain);
      
      const context = makeContext();
      await createMachineryAlert(context, makeRequest({
        body: {
          id_mantainance: 1,
          type: 'maintenance',
          date: new Date(),
          title: 'Test',
          message: 'Test message',
        },
      }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(newAlert);
    });

    it('creates alert successfully with user_ids', async () => {
      const maintenanceData = { id: 1 };
      const newAlert = {
        id: 1,
        id_mantainance: 1,
        type: 'maintenance',
        title: 'Test',
        message: 'Test message',
      };
      
      const checkChain: Record<string, any> = {
        select: () => checkChain,
        from: () => checkChain,
        first: () => Promise.resolve(maintenanceData),
      };
      checkChain.where = jest.fn().mockReturnValue(checkChain);
      
      mockTransaction.mockImplementation(async (callback: any) => {
        const insertChain = {
          returning: jest.fn().mockResolvedValue([newAlert]),
        };
        const trx = jest.fn().mockReturnValue({
          insert: jest.fn().mockReturnValue(insertChain),
        });
        return callback(trx);
      });
      
      mockGetConnection.mockReturnValue(checkChain);
      
      const context = makeContext();
      await createMachineryAlert(context, makeRequest({
        body: {
          id_mantainance: 1,
          type: 'maintenance',
          date: new Date(),
          title: 'Test',
          message: 'Test message',
          user_ids: [1, 2],
        },
      }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await createMachineryAlert(context, makeRequest({
        body: {
          id_mantainance: 1,
          type: 'maintenance',
          date: new Date(),
          title: 'Test',
          message: 'Test message',
        },
      }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('markAlertAsRead', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockRequireAuth.mockReturnValue({ success: false, error: 'Not authenticated' });
      
      const context = makeContext();
      await markAlertAsRead(context, makeRequest(), '1');
      expect(context.res!.status).toBe(401);
    });

    it('returns 400 when alertId is invalid', async () => {
      const context = makeContext();
      await markAlertAsRead(context, makeRequest(), 'abc');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when alert not found or not assigned', async () => {
      const updateChain: Record<string, any> = {
        into: () => updateChain,
        returning: () => Promise.resolve([]),
      };
      updateChain.where = jest.fn().mockReturnValue(updateChain);
      updateChain.update = jest.fn().mockReturnValue(updateChain);
      mockGetConnection.mockReturnValue(updateChain);
      
      const context = makeContext();
      await markAlertAsRead(context, makeRequest(), '999');
      expect(context.res!.status).toBe(404);
    });

    it('marks alert as read successfully', async () => {
      const updated = {
        id: 1,
        id_machinery_alert: 1,
        id_user: 1,
        is_read: true,
      };
      
      const updateChain: Record<string, any> = {
        into: () => updateChain,
        returning: () => Promise.resolve([updated]),
      };
      updateChain.where = jest.fn().mockReturnValue(updateChain);
      updateChain.update = jest.fn().mockReturnValue(updateChain);
      mockGetConnection.mockReturnValue(updateChain);
      
      const context = makeContext();
      await markAlertAsRead(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(updated);
    });

    it('handles string userId from auth', async () => {
      mockRequireAuth.mockReturnValue({ success: true, user: { userId: '1' } });
      
      const updated = {
        id: 1,
        id_machinery_alert: 1,
        id_user: 1,
        is_read: true,
      };
      
      const updateChain: Record<string, any> = {
        into: () => updateChain,
        returning: () => Promise.resolve([updated]),
      };
      updateChain.where = jest.fn().mockReturnValue(updateChain);
      updateChain.update = jest.fn().mockReturnValue(updateChain);
      mockGetConnection.mockReturnValue(updateChain);
      
      const context = makeContext();
      await markAlertAsRead(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await markAlertAsRead(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('assignAlertToUsers', () => {
    it('returns 400 when alertId is invalid', async () => {
      const context = makeContext();
      await assignAlertToUsers(context, makeRequest(), 'abc');
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await assignAlertToUsers(context, makeRequest({ body: {} }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when alert does not exist', async () => {
      const checkChain: Record<string, any> = {
        select: () => checkChain,
        from: () => checkChain,
        first: () => Promise.resolve(null),
      };
      checkChain.where = jest.fn().mockReturnValue(checkChain);
      mockGetConnection.mockReturnValue(checkChain);
      
      const context = makeContext();
      await assignAlertToUsers(context, makeRequest({
        body: { user_ids: [1, 2] },
      }), '999');
      expect(context.res!.status).toBe(404);
    });

    it('assigns alert to users successfully', async () => {
      const alertData = { id: 1 };
      const checkChain: Record<string, any> = {
        select: () => checkChain,
        from: () => checkChain,
        first: () => Promise.resolve(alertData),
      };
      checkChain.where = jest.fn().mockReturnValue(checkChain);
      
      const existsChain: Record<string, any> = {
        select: () => existsChain,
        from: () => existsChain,
        first: () => Promise.resolve(null),
      };
      existsChain.where = jest.fn().mockReturnValue(existsChain);
      
      const insertChain: Record<string, any> = {
        insert: () => insertChain,
        into: () => Promise.resolve(),
      };
      
      // 1 call to check alert exists
      // 2 users: each needs 1 check + 1 insert = 4 more calls
      mockGetConnection
        .mockReturnValueOnce(checkChain)
        .mockReturnValueOnce(existsChain) // check user 1
        .mockReturnValueOnce(insertChain) // insert user 1
        .mockReturnValueOnce(existsChain) // check user 2
        .mockReturnValueOnce(insertChain); // insert user 2
      
      const context = makeContext();
      await assignAlertToUsers(context, makeRequest({
        body: { user_ids: [1, 2] },
      }), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('skips existing assignments', async () => {
      const alertData = { id: 1 };
      const checkChain: Record<string, any> = {
        select: () => checkChain,
        from: () => checkChain,
        first: () => Promise.resolve(alertData),
      };
      checkChain.where = jest.fn().mockReturnValue(checkChain);
      
      const existsChain: Record<string, any> = {
        select: () => existsChain,
        from: () => existsChain,
        first: () => Promise.resolve({ id: 1 }),
      };
      existsChain.where = jest.fn().mockReturnValue(existsChain);
      
      mockGetConnection
        .mockReturnValueOnce(checkChain)
        .mockReturnValueOnce(existsChain);
      
      const context = makeContext();
      await assignAlertToUsers(context, makeRequest({
        body: { user_ids: [1] },
      }), '1');
      expect(context.res!.status).toBe(200);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await assignAlertToUsers(context, makeRequest({
        body: { user_ids: [1] },
      }), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('registerUserDevice', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockRequireAuth.mockReturnValue({ success: false, error: 'Not authenticated' });
      
      const context = makeContext();
      await registerUserDevice(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(401);
    });

    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await registerUserDevice(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('updates existing device', async () => {
      const existingDevice = {
        id: 1,
        id_user: 1,
        device_token: 'token123',
        platform: 'ios',
      };
      
      const checkChain: Record<string, any> = {
        select: () => checkChain,
        from: () => checkChain,
        first: () => Promise.resolve(existingDevice),
      };
      checkChain.where = jest.fn().mockReturnValue(checkChain);
      
      const updatedDevice = { ...existingDevice, platform: 'android' };
      const updateChain: Record<string, any> = {
        into: () => updateChain,
        returning: () => Promise.resolve([updatedDevice]),
      };
      updateChain.where = jest.fn().mockReturnValue(updateChain);
      updateChain.update = jest.fn().mockReturnValue(updateChain);
      
      mockGetConnection
        .mockReturnValueOnce(checkChain)
        .mockReturnValueOnce(updateChain);
      
      const context = makeContext();
      await registerUserDevice(context, makeRequest({
        body: {
          device_token: 'token123',
          platform: 'android',
        },
      }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('creates new device', async () => {
      const newDevice = {
        id: 1,
        id_user: 1,
        device_token: 'token123',
        platform: 'ios',
      };
      
      const checkChain: Record<string, any> = {
        select: () => checkChain,
        from: () => checkChain,
        first: () => Promise.resolve(null),
      };
      checkChain.where = jest.fn().mockReturnValue(checkChain);
      
      const insertChain: Record<string, any> = {
        insert: () => insertChain,
        into: () => insertChain,
        returning: () => Promise.resolve([newDevice]),
      };
      
      mockGetConnection
        .mockReturnValueOnce(checkChain)
        .mockReturnValueOnce(insertChain);
      
      const context = makeContext();
      await registerUserDevice(context, makeRequest({
        body: {
          device_token: 'token123',
          platform: 'ios',
        },
      }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
    });

    it('handles string userId from auth', async () => {
      mockRequireAuth.mockReturnValue({ success: true, user: { userId: '1' } });
      
      const checkChain: Record<string, any> = {
        select: () => checkChain,
        from: () => checkChain,
        first: () => Promise.resolve(null),
      };
      checkChain.where = jest.fn().mockReturnValue(checkChain);
      
      const newDevice = {
        id: 1,
        id_user: 1,
        device_token: 'token123',
        platform: 'ios',
      };
      
      const insertChain: Record<string, any> = {
        insert: () => insertChain,
        into: () => insertChain,
        returning: () => Promise.resolve([newDevice]),
      };
      
      mockGetConnection
        .mockReturnValueOnce(checkChain)
        .mockReturnValueOnce(insertChain);
      
      const context = makeContext();
      await registerUserDevice(context, makeRequest({
        body: {
          device_token: 'token123',
          platform: 'ios',
        },
      }));
      expect(context.res!.status).toBe(201);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await registerUserDevice(context, makeRequest({
        body: {
          device_token: 'token123',
          platform: 'ios',
        },
      }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('getUserDevices', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockRequireAuth.mockReturnValue({ success: false, error: 'Not authenticated' });
      
      const context = makeContext();
      await getUserDevices(context, makeRequest());
      expect(context.res!.status).toBe(401);
    });

    it('returns 200 with devices', async () => {
      const devices = [
        { id: 1, device_token: 'token1', platform: 'ios' },
        { id: 2, device_token: 'token2', platform: 'android' },
      ];
      
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve(devices).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getUserDevices(context, makeRequest());
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(devices);
    });

    it('handles string userId from auth', async () => {
      mockRequireAuth.mockReturnValue({ success: true, user: { userId: '1' } });
      
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getUserDevices(context, makeRequest());
      expect(context.res!.status).toBe(200);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await getUserDevices(context, makeRequest());
      expect(context.res!.status).toBe(500);
    });
  });

  describe('unregisterUserDevice', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockRequireAuth.mockReturnValue({ success: false, error: 'Not authenticated' });
      
      const context = makeContext();
      await unregisterUserDevice(context, makeRequest(), '1');
      expect(context.res!.status).toBe(401);
    });

    it('returns 400 when deviceId is invalid', async () => {
      const context = makeContext();
      await unregisterUserDevice(context, makeRequest(), 'abc');
      expect(context.res!.status).toBe(400);
    });

    it('unregisters device successfully', async () => {
      const updateChain: Record<string, any> = {
        into: () => Promise.resolve(),
      };
      updateChain.where = jest.fn().mockReturnValue(updateChain);
      updateChain.update = jest.fn().mockReturnValue(updateChain);
      mockGetConnection.mockReturnValue(updateChain);
      
      const context = makeContext();
      await unregisterUserDevice(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('handles string userId from auth', async () => {
      mockRequireAuth.mockReturnValue({ success: true, user: { userId: '1' } });
      
      const updateChain: Record<string, any> = {
        into: () => Promise.resolve(),
      };
      updateChain.where = jest.fn().mockReturnValue(updateChain);
      updateChain.update = jest.fn().mockReturnValue(updateChain);
      mockGetConnection.mockReturnValue(updateChain);
      
      const context = makeContext();
      await unregisterUserDevice(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await unregisterUserDevice(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
    });
  });
});
