jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { listClients } from '../../src/controllers/clientController';
import { makeContext, makeRequest } from '../helpers/context';

describe('clientController', () => {
  it('listClients returns 200 with data', async () => {
    const context = makeContext();
    await listClients(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });
});
