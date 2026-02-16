jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { listOrigins } from '../../src/controllers/originController';
import { makeContext, makeRequest } from '../helpers/context';

describe('originController', () => {
  it('listOrigins returns 200 with data', async () => {
    const context = makeContext();
    await listOrigins(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });
});
