jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));

const mockSendAlertNotification = jest.fn();
jest.mock('../../src/services/notificationHubService', () => ({ 
  sendAlertNotification: mockSendAlertNotification,
}));

const mockGetConnection = jest.fn();
jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => mockGetConnection(),
    }),
  },
}));

import { detectMaintenanceAlerts, getUserDeviceTokens, markAlertAsSent, sendPendingMaintenanceAlerts } from '../../src/services/machineryAlertService';

function createChain(resolveValue: any = []) {
  const chain: Record<string, any> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.from = jest.fn().mockReturnValue(chain);
  chain.leftJoin = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.whereIn = jest.fn().mockReturnValue(chain);
  chain.whereNotNull = jest.fn().mockReturnValue(chain);
  chain.whereRaw = jest.fn().mockReturnValue(chain);
  chain.groupBy = jest.fn().mockReturnValue(chain);
  chain.distinct = jest.fn().mockReturnValue(chain);
  chain.orderBy = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockResolvedValue(resolveValue);
  chain.first = jest.fn().mockResolvedValue(resolveValue);
  chain.insert = jest.fn().mockReturnValue(chain);
  chain.into = jest.fn().mockResolvedValue(undefined);
  chain.returning = jest.fn().mockResolvedValue(Array.isArray(resolveValue) ? resolveValue : [resolveValue]);
  chain.update = jest.fn().mockReturnValue(chain);
  chain.raw = jest.fn().mockReturnValue('');
  chain.then = (fn: any) => Promise.resolve(resolveValue).then(fn);
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSendAlertNotification.mockReset();
});

describe('machineryAlertService', () => {
  describe('detectMaintenanceAlerts', () => {
    it('runs without throwing when no maintenances found', async () => {
      // All queries return empty arrays
      mockGetConnection.mockReturnValue(createChain([]));
      await expect(detectMaintenanceAlerts(1)).resolves.not.toThrow();
    });

    it('throws error when database fails', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('DB connection failed');
      });
      
      await expect(detectMaintenanceAlerts(1)).rejects.toThrow('DB connection failed');
    });
  });

  describe('getUserDeviceTokens', () => {
    it('returns empty array when no devices found', async () => {
      const chain = createChain([]);
      chain.where = jest.fn()
        .mockReturnValueOnce(chain)
        .mockResolvedValueOnce([]);
      mockGetConnection.mockReturnValue(chain);
      
      const tokens = await getUserDeviceTokens(1);
      expect(tokens).toEqual([]);
    });

    it('returns device tokens when devices exist', async () => {
      const devices = [{ device_token: 'token1' }, { device_token: 'token2' }];
      const chain = createChain(devices);
      chain.where = jest.fn()
        .mockReturnValueOnce(chain)
        .mockResolvedValueOnce(devices);
      mockGetConnection.mockReturnValue(chain);
      
      const tokens = await getUserDeviceTokens(1);
      expect(tokens).toEqual(['token1', 'token2']);
    });

    it('returns empty array on error', async () => {
      const chain = createChain([]);
      chain.where = jest.fn()
        .mockReturnValueOnce(chain)
        .mockRejectedValueOnce(new Error('DB error'));
      mockGetConnection.mockReturnValue(chain);
      
      const tokens = await getUserDeviceTokens(1);
      expect(tokens).toEqual([]);
    });
  });

  describe('markAlertAsSent', () => {
    it('marks alert as sent successfully', async () => {
      const chain = createChain(1);
      chain.where = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnValue({
          into: jest.fn().mockResolvedValue(1),
        }),
      });
      mockGetConnection.mockReturnValue(chain);
      
      await expect(markAlertAsSent(1)).resolves.not.toThrow();
    });

    it('throws error when update fails', async () => {
      const chain = createChain(null);
      chain.where = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnValue({
          into: jest.fn().mockRejectedValue(new Error('Update failed')),
        }),
      });
      mockGetConnection.mockReturnValue(chain);
      
      await expect(markAlertAsSent(1)).rejects.toThrow('Update failed');
    });
  });

  describe('sendPendingMaintenanceAlerts', () => {
    it('returns stats when no pending alerts', async () => {
      const chain = createChain([]);
      chain.limit = jest.fn().mockResolvedValue([]);
      mockGetConnection.mockReturnValue(chain);
      
      const result = await sendPendingMaintenanceAlerts(50);
      expect(result).toEqual({
        processed: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
      });
    });

    it('processes alerts and marks as sent when successful', async () => {
      mockSendAlertNotification.mockResolvedValue({ success: true });
      
      let callCount = 0;
      mockGetConnection.mockImplementation(() => {
        callCount++;
        
        if (callCount === 1) {
          const chain = createChain([]);
          chain.limit = jest.fn().mockResolvedValue([{ id: 1, title: 'Test', message: 'Test msg', type: 'MAINTENANCE_DUE' }]);
          return chain;
        }
        if (callCount === 2) {
          const chain = createChain([{ id_user: 1 }]);
          chain.where = jest.fn().mockResolvedValue([{ id_user: 1 }]);
          return chain;
        }
        if (callCount === 3) {
          const chain = createChain([{ platform: 'ios' }]);
          chain.where = jest.fn().mockResolvedValue([{ platform: 'ios' }]);
          return chain;
        }
        const chain = createChain(1);
        chain.where = jest.fn().mockReturnValue({
          update: jest.fn().mockReturnValue({
            into: jest.fn().mockResolvedValue(1),
          }),
        });
        return chain;
      });
      
      const result = await sendPendingMaintenanceAlerts(50);
      expect(result.processed).toBe(1);
      expect(result.sent).toBe(1);
      expect(mockSendAlertNotification).toHaveBeenCalled();
    });

    it('skips alerts without users', async () => {
      let callCount = 0;
      mockGetConnection.mockImplementation(() => {
        callCount++;
        
        if (callCount === 1) {
          const chain = createChain([]);
          chain.limit = jest.fn().mockResolvedValue([{ id: 1, title: 'Test', message: 'Test', type: 'MAINTENANCE_DUE' }]);
          return chain;
        }
        const chain = createChain([]);
        chain.where = jest.fn().mockResolvedValue([]);
        return chain;
      });
      
      const result = await sendPendingMaintenanceAlerts(50);
      expect(result.skipped).toBe(1);
    });

    it('skips alerts without devices with valid platforms', async () => {
      let callCount = 0;
      mockGetConnection.mockImplementation(() => {
        callCount++;
        
        if (callCount === 1) {
          const chain = createChain([]);
          chain.limit = jest.fn().mockResolvedValue([{ id: 1, title: 'Test', message: 'Test', type: 'MAINTENANCE_DUE' }]);
          return chain;
        }
        if (callCount === 2) {
          const chain = createChain([{ id_user: 1 }]);
          chain.where = jest.fn().mockResolvedValue([{ id_user: 1 }]);
          return chain;
        }
        const chain = createChain([]);
        chain.where = jest.fn().mockResolvedValue([]);
        return chain;
      });
      
      const result = await sendPendingMaintenanceAlerts(50);
      expect(result.skipped).toBe(1);
    });

    it('counts failed when sendAlertNotification returns failure', async () => {
      mockSendAlertNotification.mockResolvedValue({ success: false, errors: ['Push failed'] });
      
      let callCount = 0;
      mockGetConnection.mockImplementation(() => {
        callCount++;
        
        if (callCount === 1) {
          const chain = createChain([]);
          chain.limit = jest.fn().mockResolvedValue([{ id: 1, title: 'Test', message: 'Test', type: 'MAINTENANCE_DUE' }]);
          return chain;
        }
        if (callCount === 2) {
          const chain = createChain([{ id_user: 1 }]);
          chain.where = jest.fn().mockResolvedValue([{ id_user: 1 }]);
          return chain;
        }
        const chain = createChain([{ platform: 'android' }]);
        chain.where = jest.fn().mockResolvedValue([{ platform: 'android' }]);
        return chain;
      });
      
      const result = await sendPendingMaintenanceAlerts(50);
      expect(result.failed).toBe(1);
    });

    it('counts failed when exception is thrown during processing', async () => {
      let callCount = 0;
      mockGetConnection.mockImplementation(() => {
        callCount++;
        
        if (callCount === 1) {
          const chain = createChain([]);
          chain.limit = jest.fn().mockResolvedValue([{ id: 1, title: 'Test', message: 'Test', type: 'MAINTENANCE_DUE' }]);
          return chain;
        }
        throw new Error('DB error during processing');
      });
      
      const result = await sendPendingMaintenanceAlerts(50);
      expect(result.failed).toBe(1);
    });

    it('filters out invalid platforms', async () => {
      mockSendAlertNotification.mockResolvedValue({ success: true });
      
      let callCount = 0;
      mockGetConnection.mockImplementation(() => {
        callCount++;
        
        if (callCount === 1) {
          const chain = createChain([]);
          chain.limit = jest.fn().mockResolvedValue([{ id: 1, title: 'Test', message: 'Test', type: 'MAINTENANCE_DUE' }]);
          return chain;
        }
        if (callCount === 2) {
          const chain = createChain([{ id_user: 1 }]);
          chain.where = jest.fn().mockResolvedValue([{ id_user: 1 }]);
          return chain;
        }
        if (callCount === 3) {
          const chain = createChain([{ platform: 'web' }, { platform: 'ios' }]);
          chain.where = jest.fn().mockResolvedValue([{ platform: 'web' }, { platform: 'ios' }]);
          return chain;
        }
        const chain = createChain(1);
        chain.where = jest.fn().mockReturnValue({
          update: jest.fn().mockReturnValue({
            into: jest.fn().mockResolvedValue(1),
          }),
        });
        return chain;
      });
      
      const result = await sendPendingMaintenanceAlerts(50);
      expect(result.sent).toBe(1);
      expect(mockSendAlertNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          platforms: ['ios'],
        })
      );
    });
  });
});
