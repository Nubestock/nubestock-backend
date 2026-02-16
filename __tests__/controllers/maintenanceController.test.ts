jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { listMaintenances } from '../../src/controllers/maintenanceController';
import { makeContext, makeRequest } from '../helpers/context';

describe('maintenanceController', () => {
  it('listMaintenances returns 200 with data', async () => {
    const context = makeContext();
    await listMaintenances(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });
});
