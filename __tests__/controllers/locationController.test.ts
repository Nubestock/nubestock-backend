jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

const mockGetConnection = jest.fn();
const mockFindById = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();

jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => mockGetConnection(),
      findById: (table: string, id: number) => mockFindById(table, id),
      create: (table: string, data: any) => mockCreate(table, data),
      update: (table: string, id: number, data: any) => mockUpdate(table, id, data),
      delete: (table: string, id: number) => mockDelete(table, id),
    }),
  },
}));

import {
  listCountries,
  listProvinces,
  listCities,
  getCompleteLocations,
  getCountryById,
  getProvinceById,
  getCityById,
  createCountry,
  createProvince,
  createCity,
  updateCountry,
  updateProvince,
  updateCity,
  deleteCountry,
  deleteProvince,
  deleteCity,
} from '../../src/controllers/locationController';
import { makeContext, makeRequest } from '../helpers/context';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetConnection.mockReset();
  mockFindById.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
});

describe('locationController', () => {
  describe('listCountries', () => {
    it('returns 200 with data', async () => {
      const countries = [{ id: 1, name: 'Country 1' }];
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve(countries).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listCountries(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(countries);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await listCountries(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('listProvinces', () => {
    it('returns 200 with data', async () => {
      const provinces = [{ id: 1, name: 'Province 1' }];
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve(provinces).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listProvinces(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(provinces);
    });

    it('filters by id_country when provided', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listProvinces(context, makeRequest({ query: { id_country: '1' } }));
      expect(context.res!.status).toBe(200);
    });

    it('ignores invalid id_country', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listProvinces(context, makeRequest({ query: { id_country: 'invalid' } }));
      expect(context.res!.status).toBe(200);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await listProvinces(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('listCities', () => {
    it('returns 200 with data', async () => {
      const cities = [{ id: 1, name: 'City 1' }];
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve(cities).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listCities(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(cities);
    });

    it('filters by id_province when provided', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listCities(context, makeRequest({ query: { id_province: '1' } }));
      expect(context.res!.status).toBe(200);
    });

    it('ignores invalid id_province', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listCities(context, makeRequest({ query: { id_province: 'invalid' } }));
      expect(context.res!.status).toBe(200);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await listCities(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('getCompleteLocations', () => {
    it('returns 200 with hierarchical data', async () => {
      const locations = [
        {
          id_country: 1,
          country_name: 'Country 1',
          country_code: 'C1',
          id_province: 1,
          province_name: 'Province 1',
          province_code: 'P1',
          id_city: 1,
          city_name: 'City 1',
          city_code: 'CI1',
        },
      ];
      
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      chain.orWhereNull = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve(locations).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getCompleteLocations(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(Array.isArray(context.res!.body.data)).toBe(true);
    });

    it('filters by id_country when provided', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      chain.orWhereNull = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getCompleteLocations(context, makeRequest({ query: { id_country: '1' } }));
      expect(context.res!.status).toBe(200);
    });

    it('filters by id_province when provided', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      chain.orWhereNull = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getCompleteLocations(context, makeRequest({ query: { id_province: '1' } }));
      expect(context.res!.status).toBe(200);
    });

    it('filters by id_city when provided', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      chain.orWhereNull = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getCompleteLocations(context, makeRequest({ query: { id_city: '1' } }));
      expect(context.res!.status).toBe(200);
    });

    it('ignores invalid filter values', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
      };
      chain.where = jest.fn().mockReturnValue(chain);
      chain.orWhereNull = jest.fn().mockReturnValue(chain);
      (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getCompleteLocations(context, makeRequest({ query: { id_country: 'invalid' } }));
      expect(context.res!.status).toBe(200);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await getCompleteLocations(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('getCountryById', () => {
    it('returns 400 when id is invalid', async () => {
      const context = makeContext();
      await getCountryById(context, makeRequest(), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when not found', async () => {
      mockFindById.mockResolvedValue(null);
      
      const context = makeContext();
      await getCountryById(context, makeRequest(), '99999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 200 with country data when found', async () => {
      const country = { id: 1, name: 'Country 1' };
      mockFindById.mockResolvedValue(country);
      
      const context = makeContext();
      await getCountryById(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(country);
    });

    it('returns 500 on database error', async () => {
      mockFindById.mockRejectedValue(new Error('Database error'));
      
      const context = makeContext();
      await getCountryById(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('getProvinceById', () => {
    it('returns 400 when id is invalid', async () => {
      const context = makeContext();
      await getProvinceById(context, makeRequest(), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when not found', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        first: () => Promise.resolve(null),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getProvinceById(context, makeRequest(), '99999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 200 with province data when found', async () => {
      const province = { id: 1, name: 'Province 1' };
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        first: () => Promise.resolve(province),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getProvinceById(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(province);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await getProvinceById(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('getCityById', () => {
    it('returns 400 when id is invalid', async () => {
      const context = makeContext();
      await getCityById(context, makeRequest(), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when not found', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        first: () => Promise.resolve(null),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getCityById(context, makeRequest(), '99999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 200 with city data when found', async () => {
      const city = { id: 1, name: 'City 1' };
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        first: () => Promise.resolve(city),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getCityById(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(city);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await getCityById(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('createCountry', () => {
    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await createCountry(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when country code already exists', async () => {
      const existingCountry = { id: 1 };
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve(existingCountry),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await createCountry(context, makeRequest({
        body: {
          name: 'Country 1',
          is_code: 'C1',
        },
      }));
      expect(context.res!.status).toBe(400);
    });

    it('creates country successfully', async () => {
      const newCountry = { id: 1, name: 'Country 1', is_code: 'C1' };
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve(null),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      mockCreate.mockResolvedValue(newCountry);
      
      const context = makeContext();
      await createCountry(context, makeRequest({
        body: {
          name: 'Country 1',
          is_code: 'C1',
        },
      }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(newCountry);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('Database error');
      });
      
      const context = makeContext();
      await createCountry(context, makeRequest({
        body: {
          name: 'Country 1',
          is_code: 'C1',
        },
      }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('createProvince', () => {
    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await createProvince(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when country does not exist', async () => {
      mockFindById.mockResolvedValue(null);
      
      const context = makeContext();
      await createProvince(context, makeRequest({
        body: {
          name: 'Province 1',
          id_country: 999,
        },
      }));
      expect(context.res!.status).toBe(400);
    });

    it('creates province successfully', async () => {
      const newProvince = { id: 1, name: 'Province 1', id_country: 1 };
      mockFindById.mockResolvedValue({ id: 1 });
      mockCreate.mockResolvedValue(newProvince);
      
      const context = makeContext();
      await createProvince(context, makeRequest({
        body: {
          name: 'Province 1',
          id_country: 1,
        },
      }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(newProvince);
    });

    it('returns 500 on database error', async () => {
      mockFindById.mockRejectedValue(new Error('Database error'));
      
      const context = makeContext();
      await createProvince(context, makeRequest({
        body: {
          name: 'Province 1',
          id_country: 1,
        },
      }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('createCity', () => {
    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await createCity(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when province does not exist', async () => {
      mockFindById.mockResolvedValue(null);
      
      const context = makeContext();
      await createCity(context, makeRequest({
        body: {
          name: 'City 1',
          id_province: 999,
        },
      }));
      expect(context.res!.status).toBe(400);
    });

    it('creates city successfully', async () => {
      const newCity = { id: 1, name: 'City 1', id_province: 1 };
      mockFindById.mockResolvedValue({ id: 1 });
      mockCreate.mockResolvedValue(newCity);
      
      const context = makeContext();
      await createCity(context, makeRequest({
        body: {
          name: 'City 1',
          id_province: 1,
        },
      }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toEqual(newCity);
    });

    it('returns 500 on database error', async () => {
      mockFindById.mockRejectedValue(new Error('Database error'));
      
      const context = makeContext();
      await createCity(context, makeRequest({
        body: {
          name: 'City 1',
          id_province: 1,
        },
      }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('updateCountry', () => {
    it('returns 400 when id is invalid', async () => {
      const context = makeContext();
      await updateCountry(context, makeRequest(), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await updateCountry(context, makeRequest({
        body: { name: 'A' },
      }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when country not found', async () => {
      mockFindById.mockResolvedValue(null);
      
      const context = makeContext();
      await updateCountry(context, makeRequest({
        body: { name: 'Updated Country' },
      }), '999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 400 when country code already exists', async () => {
      const existingCountry = { id: 1, is_code: 'C1' };
      const codeExists = { id: 2 };
      mockFindById.mockResolvedValue(existingCountry);
      
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve(codeExists),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await updateCountry(context, makeRequest({
        body: { is_code: 'C2' },
      }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('updates country successfully', async () => {
      const existingCountry = { id: 1, name: 'Country 1', is_code: 'C1' };
      const updatedCountry = { ...existingCountry, name: 'Updated Country' };
      mockFindById.mockResolvedValue(existingCountry);
      
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve(null),
      };
      chain.where = jest.fn().mockReturnValue(chain);
      mockGetConnection.mockReturnValue(chain);
      mockUpdate.mockResolvedValue(updatedCountry);
      
      const context = makeContext();
      await updateCountry(context, makeRequest({
        body: { name: 'Updated Country' },
      }), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 500 on database error', async () => {
      mockFindById.mockRejectedValue(new Error('Database error'));
      
      const context = makeContext();
      await updateCountry(context, makeRequest({
        body: { name: 'Updated Country' },
      }), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('updateProvince', () => {
    it('returns 400 when id is invalid', async () => {
      const context = makeContext();
      await updateProvince(context, makeRequest(), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await updateProvince(context, makeRequest({
        body: { name: 'A' },
      }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when province not found', async () => {
      mockFindById.mockResolvedValue(null);
      
      const context = makeContext();
      await updateProvince(context, makeRequest({
        body: { name: 'Updated Province' },
      }), '999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 400 when country does not exist', async () => {
      mockFindById
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce(null);
      
      const context = makeContext();
      await updateProvince(context, makeRequest({
        body: { id_country: 999 },
      }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('updates province successfully', async () => {
      const existingProvince = { id: 1, name: 'Province 1' };
      const updatedProvince = { ...existingProvince, name: 'Updated Province' };
      mockFindById.mockResolvedValue(existingProvince);
      mockUpdate.mockResolvedValue(updatedProvince);
      
      const context = makeContext();
      await updateProvince(context, makeRequest({
        body: { name: 'Updated Province' },
      }), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 500 on database error', async () => {
      mockFindById.mockRejectedValue(new Error('Database error'));
      
      const context = makeContext();
      await updateProvince(context, makeRequest({
        body: { name: 'Updated Province' },
      }), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('updateCity', () => {
    it('returns 400 when id is invalid', async () => {
      const context = makeContext();
      await updateCity(context, makeRequest(), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await updateCity(context, makeRequest({
        body: { name: 'A' },
      }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when city not found', async () => {
      mockFindById.mockResolvedValue(null);
      
      const context = makeContext();
      await updateCity(context, makeRequest({
        body: { name: 'Updated City' },
      }), '999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 400 when province does not exist', async () => {
      mockFindById
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce(null);
      
      const context = makeContext();
      await updateCity(context, makeRequest({
        body: { id_province: 999 },
      }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('updates city successfully', async () => {
      const existingCity = { id: 1, name: 'City 1' };
      const updatedCity = { ...existingCity, name: 'Updated City' };
      mockFindById.mockResolvedValue(existingCity);
      mockUpdate.mockResolvedValue(updatedCity);
      
      const context = makeContext();
      await updateCity(context, makeRequest({
        body: { name: 'Updated City' },
      }), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 500 on database error', async () => {
      mockFindById.mockRejectedValue(new Error('Database error'));
      
      const context = makeContext();
      await updateCity(context, makeRequest({
        body: { name: 'Updated City' },
      }), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('deleteCountry', () => {
    it('returns 400 when id is invalid', async () => {
      const context = makeContext();
      await deleteCountry(context, makeRequest(), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when country not found', async () => {
      mockFindById.mockResolvedValue(null);
      
      const context = makeContext();
      await deleteCountry(context, makeRequest(), '999');
      expect(context.res!.status).toBe(404);
    });

    it('deletes country successfully', async () => {
      mockFindById.mockResolvedValue({ id: 1 });
      mockDelete.mockResolvedValue(true);
      
      const context = makeContext();
      await deleteCountry(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 500 on database error', async () => {
      mockFindById.mockRejectedValue(new Error('Database error'));
      
      const context = makeContext();
      await deleteCountry(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('deleteProvince', () => {
    it('returns 400 when id is invalid', async () => {
      const context = makeContext();
      await deleteProvince(context, makeRequest(), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when province not found', async () => {
      mockFindById.mockResolvedValue(null);
      
      const context = makeContext();
      await deleteProvince(context, makeRequest(), '999');
      expect(context.res!.status).toBe(404);
    });

    it('deletes province successfully', async () => {
      mockFindById.mockResolvedValue({ id: 1 });
      mockDelete.mockResolvedValue(true);
      
      const context = makeContext();
      await deleteProvince(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 500 on database error', async () => {
      mockFindById.mockRejectedValue(new Error('Database error'));
      
      const context = makeContext();
      await deleteProvince(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('deleteCity', () => {
    it('returns 400 when id is invalid', async () => {
      const context = makeContext();
      await deleteCity(context, makeRequest(), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when city not found', async () => {
      mockFindById.mockResolvedValue(null);
      
      const context = makeContext();
      await deleteCity(context, makeRequest(), '999');
      expect(context.res!.status).toBe(404);
    });

    it('deletes city successfully', async () => {
      mockFindById.mockResolvedValue({ id: 1 });
      mockDelete.mockResolvedValue(true);
      
      const context = makeContext();
      await deleteCity(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 500 on database error', async () => {
      mockFindById.mockRejectedValue(new Error('Database error'));
      
      const context = makeContext();
      await deleteCity(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
    });
  });
});
