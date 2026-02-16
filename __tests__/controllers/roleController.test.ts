jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { listRoles } from '../../src/controllers/roleController';
import { makeContext, makeRequest } from '../helpers/context';

describe('roleController', () => {
  it('listRoles returns 200 with data array', async () => {
    const context = makeContext();
    await listRoles(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
    expect(Array.isArray(context.res!.body.data)).toBe(true);
  });
});
