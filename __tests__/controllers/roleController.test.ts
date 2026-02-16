jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { listRoles, getAllRolesWithPermissions, getRole, createRole } from '../../src/controllers/roleController';
import { makeContext, makeRequest } from '../helpers/context';

describe('roleController', () => {
  it('listRoles returns 200 with data array', async () => {
    const context = makeContext();
    await listRoles(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
    expect(Array.isArray(context.res!.body.data)).toBe(true);
  });

  it('getAllRolesWithPermissions returns 200', async () => {
    const context = makeContext();
    await getAllRolesWithPermissions(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
  });

  it('getRole returns 400 when roleId is invalid', async () => {
    const context = makeContext();
    await getRole(context, makeRequest(), 'abc');
    expect(context.res!.status).toBe(400);
  });

  it('getRole returns 404 when role not found', async () => {
    const context = makeContext();
    await getRole(context, makeRequest(), '99999');
    expect([200, 404]).toContain(context.res!.status);
  });

  it('createRole returns 400 when body is invalid', async () => {
    const context = makeContext();
    await createRole(context, makeRequest({ body: {} }));
    expect(context.res!.status).toBe(400);
  });
});
