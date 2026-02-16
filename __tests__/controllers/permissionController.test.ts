jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { getPermissions } from '../../src/controllers/permissionController';
import { makeContext, makeRequest } from '../helpers/context';

describe('permissionController', () => {
  it('getPermissions returns 200 with data', async () => {
    const context = makeContext();
    await getPermissions(context, makeRequest());
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });
});
