jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { listOrigins, createOrigin, updateOrigin } from '../../src/controllers/originController';
import { makeContext, makeRequest } from '../helpers/context';

describe('originController', () => {
  it('listOrigins returns 200 with data', async () => {
    const context = makeContext();
    await listOrigins(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });

  it('listOrigins with id returns 200 or 404 for single origin', async () => {
    const context = makeContext();
    await listOrigins(context, makeRequest({ query: { id: '1' } }));
    expect([200, 404]).toContain(context.res!.status);
  });

  it('createOrigin returns 400 when body is invalid', async () => {
    const context = makeContext();
    await createOrigin(context, makeRequest({ body: {} }));
    expect(context.res!.status).toBe(400);
  });

  it('updateOrigin returns 400 when id missing or body invalid', async () => {
    const context = makeContext();
    await updateOrigin(context, makeRequest({ query: {}, body: {} }));
    expect([400, 404]).toContain(context.res!.status);
  });
});
