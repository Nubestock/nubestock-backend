jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { bulkCreateProducts } from '../../src/controllers/bulkController';
import { makeContext, makeRequest } from '../helpers/context';

describe('bulkController', () => {
  it('bulkCreateProducts returns 400 when body is invalid', async () => {
    const context = makeContext();
    await bulkCreateProducts(context, makeRequest({ body: {} }));
    expect(context.res!.status).toBe(400);
  });
});
