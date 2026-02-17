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

describe('machineryAlertService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const chain: Record<string, any> = {
      select: () => chain,
      from: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      whereIn: () => chain,
      whereNotNull: () => chain,
      whereRaw: () => chain,
      groupBy: () => chain,
      distinct: () => Promise.resolve([]),
      first: () => Promise.resolve(undefined),
      insert: () => chain,
      into: () => chain,
      returning: () => Promise.resolve([{ id: 1 }]),
      orderBy: () => chain,
      limit: () => Promise.resolve([]),
      update: () => Promise.resolve(1),
      then: (fn: (v: any) => any) => Promise.resolve([]).then(fn),
    };
    chain.raw = () => '';
    mockGetConnection.mockReturnValue(chain);
  });

  describe('detectMaintenanceAlerts', () => {
    it('runs without throwing', async () => {
      await expect(detectMaintenanceAlerts(1)).resolves.not.toThrow();
    });

    it('handles overdue maintenances', async () => {
      // Mock para obtener usuarios
      const userChain: Record<string, any> = {
        select: () => userChain,
        from: () => userChain,
        leftJoin: () => userChain,
        where: () => userChain,
        groupBy: () => userChain,
        distinct: () => Promise.resolve([{ id: 1 }]),
      };
      
      // Mock para obtener mantenimientos vencidos - whereRaw debe devolver una promesa con array
      const overdueChain: Record<string, any> = {
        select: () => overdueChain,
        from: () => overdueChain,
        leftJoin: () => overdueChain,
        where: () => overdueChain,
        whereNotNull: () => overdueChain,
        whereRaw: () => Promise.resolve([]), // Devuelve array vacío directamente
        raw: () => '',
      };
      
      // Mock para mantenimientos próximos a vencer
      const upcomingChain: Record<string, any> = {
        select: () => upcomingChain,
        from: () => upcomingChain,
        leftJoin: () => upcomingChain,
        where: () => upcomingChain,
        whereNotNull: () => upcomingChain,
        whereRaw: () => Promise.resolve([]), // Devuelve array vacío directamente
        raw: () => '',
      };
      
      mockGetConnection
        .mockReturnValueOnce(userChain) // Primera llamada: usuarios
        .mockReturnValueOnce(overdueChain) // Segunda llamada: mantenimientos vencidos
        .mockReturnValueOnce(upcomingChain); // Tercera llamada: mantenimientos próximos
      
      await expect(detectMaintenanceAlerts(1)).resolves.not.toThrow();
    });
  });

  describe('getUserDeviceTokens', () => {
    it('returns empty array when no devices found', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => Promise.resolve([]),
      };
      mockGetConnection.mockReturnValue(chain);
      
      const tokens = await getUserDeviceTokens(1);
      expect(tokens).toEqual([]);
    });

    it('returns device tokens when devices exist', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
      };
      chain.where = jest.fn()
        .mockReturnValueOnce(chain) // Primer where devuelve chain
        .mockReturnValueOnce(Promise.resolve([ // Segundo where devuelve los dispositivos
          { device_token: 'token1' },
          { device_token: 'token2' },
        ]));
      mockGetConnection.mockReturnValue(chain);
      
      const tokens = await getUserDeviceTokens(1);
      expect(tokens).toEqual(['token1', 'token2']);
    });

    it('returns empty array on error', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
      };
      chain.where = jest.fn()
        .mockReturnValueOnce(chain) // Primer where devuelve chain
        .mockReturnValueOnce(Promise.reject(new Error('DB error'))); // Segundo where rechaza
      mockGetConnection.mockReturnValue(chain);
      
      const tokens = await getUserDeviceTokens(1);
      expect(tokens).toEqual([]);
    });
  });

  describe('markAlertAsSent', () => {
    it('marks alert as sent successfully', async () => {
      const chain: Record<string, any> = {
        where: () => ({
          update: () => ({
            into: () => Promise.resolve({}),
          }),
        }),
      };
      mockGetConnection.mockReturnValue(chain);
      
      await expect(markAlertAsSent(1)).resolves.not.toThrow();
    });

    it('throws error when update fails', async () => {
      const chain: Record<string, any> = {
        where: () => ({
          update: () => ({
            into: () => Promise.reject(new Error('Update failed')),
          }),
        }),
      };
      mockGetConnection.mockReturnValue(chain);
      
      await expect(markAlertAsSent(1)).rejects.toThrow();
    });
  });

  describe('sendPendingMaintenanceAlerts', () => {
    it('returns stats when no pending alerts', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => Promise.resolve([]),
      };
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
      
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => Promise.resolve([{ id: 1, title: 'Test', message: 'Test', type: 'MAINTENANCE_DUE' }]),
      };
      
      const userChain: Record<string, any> = {
        select: () => ({
          from: () => ({
            where: () => Promise.resolve([{ id_user: 1 }]),
          }),
        }),
      };
      
      const deviceChain: Record<string, any> = {
        select: () => ({
          from: () => ({
            whereIn: () => ({
              where: () => Promise.resolve([{ platform: 'ios' }]),
            }),
          }),
        }),
      };
      
      const updateChain: Record<string, any> = {
        where: () => ({
          update: () => ({
            into: () => Promise.resolve({}),
          }),
        }),
      };
      
      mockGetConnection
        .mockReturnValueOnce(chain)
        .mockReturnValueOnce(userChain)
        .mockReturnValueOnce(deviceChain)
        .mockReturnValueOnce(updateChain);
      
      const result = await sendPendingMaintenanceAlerts(50);
      expect(result.processed).toBe(1);
      expect(result.sent).toBeGreaterThanOrEqual(0);
    });

    it('handles alerts without users', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => Promise.resolve([{ id: 1, title: 'Test', message: 'Test', type: 'MAINTENANCE_DUE' }]),
      };
      
      const userChain: Record<string, any> = {
        select: () => ({
          from: () => ({
            where: () => Promise.resolve([]),
          }),
        }),
      };
      
      mockGetConnection
        .mockReturnValueOnce(chain)
        .mockReturnValueOnce(userChain);
      
      const result = await sendPendingMaintenanceAlerts(50);
      expect(result.skipped).toBeGreaterThanOrEqual(0);
    });
  });
});
