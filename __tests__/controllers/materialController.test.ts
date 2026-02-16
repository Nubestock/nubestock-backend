jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { listMaterials } from '../../src/controllers/materialController';
import { makeContext, makeRequest } from '../helpers/context';

describe('materialController', () => {
  it('listMaterials returns 200 with data', async () => {
    const context = makeContext();
    await listMaterials(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });
});
