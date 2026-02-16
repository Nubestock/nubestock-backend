jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { listMachinery } from '../../src/controllers/machineryController';
import { makeContext, makeRequest } from '../helpers/context';

describe('machineryController', () => {
  it('listMachinery returns 200 with data', async () => {
    const context = makeContext();
    await listMachinery(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });
});
