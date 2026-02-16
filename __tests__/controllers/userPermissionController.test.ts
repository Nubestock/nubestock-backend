jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { getUserPermissions } from '../../src/controllers/userPermissionController';
import { makeContext, makeRequest } from '../helpers/context';

describe('userPermissionController', () => {
  it('getUserPermissions returns 200 or 404', async () => {
    const context = makeContext();
    await getUserPermissions(context, makeRequest(), '1');
    expect(context.res).toBeDefined();
    expect([200, 404]).toContain(context.res!.status);
  });
});
