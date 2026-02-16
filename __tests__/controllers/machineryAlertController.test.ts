jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { listMachineryAlerts } from '../../src/controllers/machineryAlertController';
import { makeContext, makeRequest } from '../helpers/context';

describe('machineryAlertController', () => {
  it('listMachineryAlerts returns 200 with data', async () => {
    const context = makeContext();
    await listMachineryAlerts(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });
});
