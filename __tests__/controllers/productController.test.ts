jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { listProducts } from '../../src/controllers/productController';
import { makeContext, makeRequest } from '../helpers/context';

describe('productController', () => {
  it('listProducts returns 200 with data', async () => {
    const context = makeContext();
    await listProducts(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });
});
