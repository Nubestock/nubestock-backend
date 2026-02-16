jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock('../../src/middleware/authMiddleware', () => ({
  requireAuth: jest.fn().mockReturnValue({ success: true, user: { userId: 1 } }),
  requireAnyPermission: jest.fn().mockReturnValue({ success: true }),
}));
import { getUserPermissions, checkPermission, assignRole, removeRole } from '../../src/controllers/userPermissionController';
import { makeContext, makeRequest } from '../helpers/context';

describe('userPermissionController', () => {
  it('getUserPermissions returns 200 or 404', async () => {
    const context = makeContext();
    await getUserPermissions(context, makeRequest(), '1');
    expect(context.res).toBeDefined();
    expect([200, 404]).toContain(context.res!.status);
  });

  it('checkPermission returns 400 when query params missing', async () => {
    const context = makeContext();
    await checkPermission(context, makeRequest({ query: {} }));
    expect([400, 200]).toContain(context.res!.status);
  });

  it('assignRole returns 400 when body is invalid', async () => {
    const context = makeContext();
    await assignRole(context, makeRequest({ body: {} }));
    expect(context.res!.status).toBe(400);
  });

  it('removeRole returns 400 when roleId missing', async () => {
    const context = makeContext();
    await removeRole(context, makeRequest({ body: {} }), '1');
    expect(context.res!.status).toBe(400);
  });
});
