jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { listMaintenances, getMaintenance, createMaintenance, listMaintenanceHistory } from '../../src/controllers/maintenanceController';
import { makeContext, makeRequest } from '../helpers/context';

describe('maintenanceController', () => {
  it('listMaintenances returns 200 with data', async () => {
    const context = makeContext();
    await listMaintenances(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });

  it('getMaintenance returns 400 when maintenanceId is invalid', async () => {
    const context = makeContext();
    await getMaintenance(context, makeRequest(), 'x');
    expect(context.res!.status).toBe(400);
  });

  it('getMaintenance returns 404 when not found', async () => {
    const context = makeContext();
    await getMaintenance(context, makeRequest(), '99999');
    expect(context.res!.status).toBe(404);
  });

  it('createMaintenance returns 400 when body is invalid', async () => {
    const context = makeContext();
    await createMaintenance(context, makeRequest({ body: {} }));
    expect(context.res!.status).toBe(400);
  });

  it('listMaintenanceHistory returns 200', async () => {
    const context = makeContext();
    await listMaintenanceHistory(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
  });
});
