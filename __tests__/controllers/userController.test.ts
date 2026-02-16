jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { listUsers } from '../../src/controllers/userController';
import { makeContext, makeRequest } from '../helpers/context';

describe('userController', () => {
  it('listUsers returns 200 with data', async () => {
    const context = makeContext();
    await listUsers(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });
});
