jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { listSales } from '../../src/controllers/saleController';
import { makeContext, makeRequest } from '../helpers/context';

describe('saleController', () => {
  it('listSales returns 200 with data', async () => {
    const context = makeContext();
    await listSales(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });
});
