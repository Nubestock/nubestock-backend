jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { listRecipes } from '../../src/controllers/recipeController';
import { makeContext, makeRequest } from '../helpers/context';

describe('recipeController', () => {
  it('listRecipes returns 200 with data', async () => {
    const context = makeContext();
    await listRecipes(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });
});
