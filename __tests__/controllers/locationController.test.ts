jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { listCountries } from '../../src/controllers/locationController';
import { makeContext, makeRequest } from '../helpers/context';

describe('locationController', () => {
  it('listCountries returns 200 with data', async () => {
    const context = makeContext();
    await listCountries(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });
});
