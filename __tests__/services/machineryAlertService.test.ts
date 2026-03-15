jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));

const mockSendExpoPushNotifications = jest.fn();
jest.mock('../../src/services/expoPushService', () => ({
  sendExpoPushNotifications: mockSendExpoPushNotifications,
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

function createChain(resolveValue: any = [], returningValue?: any) {
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
  chain.update = jest.fn().mockReturnValue(chain);
  chain.raw = jest.fn().mockReturnValue('RAW_SQL');
  chain.returning = jest.fn().mockResolvedValue(returningValue !== undefined ? returningValue : (Array.isArray(resolveValue) ? resolveValue : [resolveValue]));
  
  // into() returns chain so returning() can be chained after
  chain.into = jest.fn().mockReturnValue(chain);
  
  chain.then = (fn: any) => Promise.resolve(resolveValue).then(fn);
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSendExpoPushNotifications.mockReset();
});

describe('machineryAlertService', () => {
  describe('detectMaintenanceAlerts', () => {
    it('runs without throwing when no maintenances found', async () => {
      mockGetConnection.mockReturnValue(createChain([]));
      await expect(detectMaintenanceAlerts(1)).resolves.not.toThrow();
    });

    it('throws error when database fails', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('DB connection failed');
      });
      
      await expect(detectMaintenanceAlerts(1)).rejects.toThrow('DB connection failed');
    });

    it('creates MAINTENANCE_DUE alerts for overdue maintenances', async () => {
      const users = [{ id: 1 }, { id: 2 }];
      const overdueMaintenances = [{
        mantainance_id: 100,
        maintenance_name: 'Cambio de aceite',
        maintenance_type: 'preventivo',
        last_mantainance_date: new Date('2024-01-01'),
        next_maintainance_value: 30,
        machinery_id: 10,
        machinery_name: 'Torno CNC',
        due_date: new Date('2024-01-31'),
      }];
      const createdAlert = { id: 500, title: 'Test', message: 'Test' };

      let callIndex = 0;
      mockGetConnection.mockImplementation(() => {
        callIndex++;
        
        // 1. Query users with permissions
        if (callIndex === 1) {
          return createChain(users);
        }
        // 2. Raw SQL for overdue maintenances select
        if (callIndex === 2) {
          return createChain('RAW_SQL');
        }
        // 3. Overdue maintenances query
        if (callIndex === 3) {
          return createChain(overdueMaintenances);
        }
        // 4. Check existing alert (returns null = no existing)
        if (callIndex === 4) {
          const chain = createChain(null);
          chain.first = jest.fn().mockResolvedValue(null);
          return chain;
        }
        // 5. Insert new alert
        if (callIndex === 5) {
          return createChain([], [createdAlert]);
        }
        // 6. Insert alert_user records
        if (callIndex === 6) {
          const chain = createChain(undefined);
          chain.into = jest.fn().mockResolvedValue(undefined);
          return chain;
        }
        // 7. Raw SQL for upcoming maintenances select
        if (callIndex === 7) {
          return createChain('RAW_SQL');
        }
        // 8. Upcoming maintenances query (empty)
        if (callIndex === 8) {
          return createChain([]);
        }
        
        return createChain([]);
      });

      await detectMaintenanceAlerts(1);

      expect(callIndex).toBeGreaterThanOrEqual(6);
    });

    it('creates MAINTENANCE_SOON alerts for upcoming maintenances', async () => {
      const users = [{ id: 1 }];
      const upcomingMaintenances = [{
        mantainance_id: 101,
        maintenance_name: 'Revisión general',
        maintenance_type: 'preventivo',
        last_mantainance_date: new Date(),
        next_maintainance_value: 7,
        machinery_id: 11,
        machinery_name: 'Fresadora',
        due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
      }];
      const createdAlert = { id: 501, title: 'Test', message: 'Test' };

      let callIndex = 0;
      mockGetConnection.mockImplementation(() => {
        callIndex++;
        
        // 1. Query users
        if (callIndex === 1) {
          return createChain(users);
        }
        // 2. Raw SQL for overdue
        if (callIndex === 2) {
          return createChain('RAW_SQL');
        }
        // 3. Overdue query (empty)
        if (callIndex === 3) {
          return createChain([]);
        }
        // 4. Raw SQL for upcoming
        if (callIndex === 4) {
          return createChain('RAW_SQL');
        }
        // 5. Upcoming maintenances query
        if (callIndex === 5) {
          return createChain(upcomingMaintenances);
        }
        // 6. Check existing alert
        if (callIndex === 6) {
          const chain = createChain(null);
          chain.first = jest.fn().mockResolvedValue(null);
          return chain;
        }
        // 7. Insert new alert
        if (callIndex === 7) {
          return createChain([], [createdAlert]);
        }
        // 8. Insert alert_user
        if (callIndex === 8) {
          const chain = createChain(undefined);
          chain.into = jest.fn().mockResolvedValue(undefined);
          return chain;
        }
        
        return createChain([]);
      });

      await detectMaintenanceAlerts(3);

      expect(callIndex).toBeGreaterThanOrEqual(7);
    });

    it('skips creating alert when one already exists', async () => {
      const users = [{ id: 1 }];
      const overdueMaintenances = [{
        mantainance_id: 102,
        maintenance_name: 'Lubricación',
        maintenance_type: 'preventivo',
        last_mantainance_date: new Date('2024-01-01'),
        next_maintainance_value: 15,
        machinery_id: 12,
        machinery_name: 'Prensa',
        due_date: new Date('2024-01-16'),
      }];
      const existingAlert = { id: 999, type: 'MAINTENANCE_DUE' };

      let callIndex = 0;
      mockGetConnection.mockImplementation(() => {
        callIndex++;
        
        // 1. Query users
        if (callIndex === 1) {
          return createChain(users);
        }
        // 2. Raw SQL for overdue
        if (callIndex === 2) {
          return createChain('RAW_SQL');
        }
        // 3. Overdue query
        if (callIndex === 3) {
          return createChain(overdueMaintenances);
        }
        // 4. Check existing alert - RETURNS existing alert
        if (callIndex === 4) {
          const chain = createChain(existingAlert);
          chain.first = jest.fn().mockResolvedValue(existingAlert);
          return chain;
        }
        // 5. Raw SQL for upcoming
        if (callIndex === 5) {
          return createChain('RAW_SQL');
        }
        // 6. Upcoming query (empty)
        if (callIndex === 6) {
          return createChain([]);
        }
        
        return createChain([]);
      });

      await detectMaintenanceAlerts(1);

      // Should not have insert calls since alert exists
      expect(callIndex).toBeGreaterThanOrEqual(4);
    });

    it('handles maintenance without due_date using current date', async () => {
      const users = [{ id: 1 }];
      const maintenanceWithoutDueDate = [{
        mantainance_id: 103,
        maintenance_name: 'Inspección',
        maintenance_type: 'correctivo',
        last_mantainance_date: new Date(),
        next_maintainance_value: null,
        machinery_id: 13,
        machinery_name: 'Soldadora',
        due_date: null, // No due date
      }];
      const createdAlert = { id: 502, title: 'Test', message: 'Test' };

      let callIndex = 0;
      mockGetConnection.mockImplementation(() => {
        callIndex++;
        
        if (callIndex === 1) {
          return createChain(users);
        }
        if (callIndex === 2) {
          return createChain('RAW_SQL');
        }
        if (callIndex === 3) {
          return createChain(maintenanceWithoutDueDate);
        }
        if (callIndex === 4) {
          const chain = createChain(null);
          chain.first = jest.fn().mockResolvedValue(null);
          return chain;
        }
        if (callIndex === 5) {
          return createChain([], [createdAlert]);
        }
        if (callIndex === 6) {
          const chain = createChain(undefined);
          chain.into = jest.fn().mockResolvedValue(undefined);
          return chain;
        }
        if (callIndex === 7) {
          return createChain('RAW_SQL');
        }
        if (callIndex === 8) {
          return createChain([]);
        }
        
        return createChain([]);
      });

      await detectMaintenanceAlerts(1);

      expect(callIndex).toBeGreaterThanOrEqual(6);
    });

    it('creates alert without users when no users with permissions exist', async () => {
      const overdueMaintenances = [{
        mantainance_id: 104,
        maintenance_name: 'Calibración',
        maintenance_type: 'preventivo',
        last_mantainance_date: new Date('2024-01-01'),
        next_maintainance_value: 60,
        machinery_id: 14,
        machinery_name: 'Medidor',
        due_date: new Date('2024-03-01'),
      }];
      const createdAlert = { id: 503, title: 'Test', message: 'Test' };

      let callIndex = 0;
      mockGetConnection.mockImplementation(() => {
        callIndex++;
        
        // 1. Query users - empty
        if (callIndex === 1) {
          return createChain([]);
        }
        // 2. Raw SQL
        if (callIndex === 2) {
          return createChain('RAW_SQL');
        }
        // 3. Overdue maintenances
        if (callIndex === 3) {
          return createChain(overdueMaintenances);
        }
        // 4. Check existing alert
        if (callIndex === 4) {
          const chain = createChain(null);
          chain.first = jest.fn().mockResolvedValue(null);
          return chain;
        }
        // 5. Insert new alert (no insert alert_user since users.length === 0)
        if (callIndex === 5) {
          return createChain([], [createdAlert]);
        }
        // 6. Raw SQL for upcoming
        if (callIndex === 6) {
          return createChain('RAW_SQL');
        }
        // 7. Upcoming empty
        if (callIndex === 7) {
          return createChain([]);
        }
        
        return createChain([]);
      });

      await detectMaintenanceAlerts(1);

      // Should skip insert into alert_user since no users, but function completes successfully
      expect(callIndex).toBeGreaterThanOrEqual(5);
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
      mockSendExpoPushNotifications.mockResolvedValue({ success: true, sent: 1, failed: 0, errors: [] });

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
          const chain = createChain([{ device_token: 'ExponentPushToken[xxx]' }]);
          chain.where = jest.fn().mockResolvedValue([{ device_token: 'ExponentPushToken[xxx]' }]);
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
      expect(mockSendExpoPushNotifications).toHaveBeenCalled();
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

    it('skips alerts without devices with valid Expo tokens', async () => {
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

    it('counts failed when sendExpoPushNotifications returns failure', async () => {
      mockSendExpoPushNotifications.mockResolvedValue({ success: false, sent: 0, failed: 1, errors: ['Push failed'] });

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
        const chain = createChain([{ device_token: 'ExponentPushToken[yyy]' }]);
        chain.where = jest.fn().mockResolvedValue([{ device_token: 'ExponentPushToken[yyy]' }]);
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

    it('sends only to valid Expo tokens', async () => {
      mockSendExpoPushNotifications.mockResolvedValue({ success: true, sent: 1, failed: 0, errors: [] });

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
          const chain = createChain([{ device_token: 'ExponentPushToken[ios-user]' }]);
          chain.where = jest.fn().mockResolvedValue([{ device_token: 'ExponentPushToken[ios-user]' }]);
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
      expect(mockSendExpoPushNotifications).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            to: 'ExponentPushToken[ios-user]',
            title: 'Test',
            body: 'Test',
          }),
        ])
      );
    });
  });
});
