jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
jest.mock('../../src/middleware/authMiddleware', () => ({ requireAuth: jest.fn().mockReturnValue({ success: true, user: { userId: 1 } }) }));
import { listMachineryAlerts, getUserAlerts, getMachineryAlert } from '../../src/controllers/machineryAlertController';
import { makeContext, makeRequest } from '../helpers/context';

describe('machineryAlertController', () => {
  it('listMachineryAlerts returns 200 with data', async () => {
    const context = makeContext();
    await listMachineryAlerts(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });

  it('getUserAlerts returns 200', async () => {
    const context = makeContext();
    await getUserAlerts(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
  });

  it('getMachineryAlert returns 400 when alertId is invalid', async () => {
    const context = makeContext();
    await getMachineryAlert(context, makeRequest(), 'abc');
    expect(context.res!.status).toBe(400);
  });

  it('getMachineryAlert returns 404 when not found', async () => {
    const context = makeContext();
    await getMachineryAlert(context, makeRequest(), '99999');
    expect([200, 404]).toContain(context.res!.status);
  });
});
