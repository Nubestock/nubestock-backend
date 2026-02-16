jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock('../../src/services/notificationHubService', () => ({ sendAlertNotification: jest.fn().mockResolvedValue(undefined) }));

const mockGetConnection = jest.fn();
jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => mockGetConnection(),
    }),
  },
}));

import { detectMaintenanceAlerts } from '../../src/services/machineryAlertService';

describe('machineryAlertService', () => {
  beforeEach(() => {
    const chain: Record<string, any> = {
      select: () => chain,
      from: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      whereNotNull: () => chain,
      whereRaw: () => chain,
      groupBy: () => chain,
      distinct: () => Promise.resolve([]),
      first: () => Promise.resolve(undefined),
      insert: () => chain,
      into: () => chain,
      returning: () => Promise.resolve([{ id: 1 }]),
      then: (fn: (v: any) => any) => Promise.resolve([]).then(fn),
    };
    chain.raw = () => '';
    mockGetConnection.mockReturnValue(chain);
  });

  it('detectMaintenanceAlerts runs without throwing', async () => {
    await expect(detectMaintenanceAlerts(1)).resolves.not.toThrow();
  });
});
