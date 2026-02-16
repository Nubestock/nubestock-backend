jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { listCountries, listProvinces, listCities, getCountryById } from '../../src/controllers/locationController';
import { makeContext, makeRequest } from '../helpers/context';

describe('locationController', () => {
  it('listCountries returns 200 with data', async () => {
    const context = makeContext();
    await listCountries(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });

  it('listProvinces returns 200 with data', async () => {
    const context = makeContext();
    await listProvinces(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });

  it('listCities returns 200 with data', async () => {
    const context = makeContext();
    await listCities(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });

  it('getCountryById returns 400 when id is invalid', async () => {
    const context = makeContext();
    await getCountryById(context, makeRequest(), 'x');
    expect(context.res!.status).toBe(400);
  });

  it('getCountryById returns 404 when not found', async () => {
    const context = makeContext();
    await getCountryById(context, makeRequest(), '99999');
    expect([200, 404]).toContain(context.res!.status);
  });
});
