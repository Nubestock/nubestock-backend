jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
jest.mock('../../src/utils/alertHelper', () => ({ createAlert: jest.fn().mockResolvedValue({ id: 1 }) }));
jest.mock('../../src/middleware/authMiddleware', () => ({ requireAuth: jest.fn().mockReturnValue({ success: true, user: { userId: 1 } }) }));

import { listAlerts, createAlertHandler } from '../../src/controllers/alertController';
import { makeContext, makeRequest } from '../helpers/context';

describe('alertController', () => {
  it('listAlerts returns 200 with data', async () => {
    const context = makeContext();
    await listAlerts(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });

  it('createAlertHandler returns 400 when body is invalid', async () => {
    const context = makeContext();
    await createAlertHandler(context, makeRequest({ body: {} }));
    expect(context.res!.status).toBe(400);
  });
});
