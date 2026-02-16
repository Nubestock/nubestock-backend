jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { getDailyProduction } from '../../src/controllers/productionController';
import { makeContext, makeRequest } from '../helpers/context';

describe('productionController', () => {
  it('getDailyProduction returns 200 with data', async () => {
    const context = makeContext();
    await getDailyProduction(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });
});
