jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { listClients, getClient, createClient } from '../../src/controllers/clientController';
import { makeContext, makeRequest } from '../helpers/context';

describe('clientController', () => {
  it('listClients returns 200 with data', async () => {
    const context = makeContext();
    await listClients(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });

  it('getClient returns 400 when clientId is invalid', async () => {
    const context = makeContext();
    await getClient(context, makeRequest(), 'x');
    expect(context.res!.status).toBe(400);
  });

  it('getClient returns 404 when client not found', async () => {
    const context = makeContext();
    await getClient(context, makeRequest(), '99999');
    expect(context.res!.status).toBe(404);
  });

  it('createClient returns 400 when body is invalid', async () => {
    const context = makeContext();
    await createClient(context, makeRequest({ body: {} }));
    expect(context.res!.status).toBe(400);
  });
});
