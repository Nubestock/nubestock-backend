jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

const mockGetConnection = jest.fn();
const mockFindById = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => mockGetConnection(),
      findById: mockFindById,
      create: mockCreate,
      update: mockUpdate,
    }),
  },
}));

import { 
  listClients, 
  getClient, 
  createClient, 
  updateClient, 
  deleteClient 
} from '../../src/controllers/clientController';
import { makeContext, makeRequest } from '../helpers/context';

describe('clientController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const chain: Record<string, any> = {
      select: () => chain,
      from: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      orderBy: () => Promise.resolve([]),
      first: () => Promise.resolve(null),
      raw: () => '',
    };
    mockGetConnection.mockReturnValue(chain);
  });

  describe('listClients', () => {
    it('returns 200 with data', async () => {
      const context = makeContext();
      await listClients(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('filters by is_active when provided', async () => {
      const context = makeContext();
      await listClients(context, makeRequest({ query: { is_active: 'true' } }));
      expect(context.res!.status).toBe(200);
    });

    it('filters by search when provided', async () => {
      const context = makeContext();
      await listClients(context, makeRequest({ query: { search: 'test' } }));
      expect(context.res!.status).toBe(200);
    });
  });

  describe('getClient', () => {
    it('returns 400 when clientId is invalid', async () => {
      const context = makeContext();
      await getClient(context, makeRequest(), 'x');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when client not found', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        first: () => Promise.resolve(null),
        raw: () => '',
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getClient(context, makeRequest(), '99999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 200 when client found', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        first: () => Promise.resolve({ id: 1, name: 'Test Client' }),
        raw: () => '',
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getClient(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('createClient', () => {
    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await createClient(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('creates client successfully', async () => {
      const checkChain: Record<string, any> = {
        select: () => checkChain,
        from: () => checkChain,
        where: () => checkChain,
        first: () => Promise.resolve(null), // No duplicate identification
      };
      mockGetConnection.mockReturnValueOnce(checkChain);
      mockCreate.mockResolvedValue({ id: 1, name: 'Test Client' });
      
      const context = makeContext();
      await createClient(context, makeRequest({
        body: {
          name: 'Test Client',
          identification: '1234567890',
          identification_type: 'CED',
          email: 'test@test.com',
          phone: '1234567890',
          address: 'Test Address',
          id_city: 1,
          id_province: 1,
        },
      }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('updateClient', () => {
    it('returns 400 when clientId is invalid', async () => {
      const context = makeContext();
      await updateClient(context, makeRequest(), 'abc');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when client not found', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        first: () => Promise.resolve(null),
        raw: () => '',
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await updateClient(context, makeRequest({ body: { name: 'Updated' } }), '999');
      expect(context.res!.status).toBe(404);
    });

    it('updates client successfully', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1, identification: '1234567890' });
      mockUpdate.mockResolvedValue({ id: 1, name: 'Updated' });
      
      const context = makeContext();
      await updateClient(context, makeRequest({ body: { name: 'Updated' } }), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('deleteClient', () => {
    it('returns 400 when clientId is invalid', async () => {
      const context = makeContext();
      await deleteClient(context, makeRequest(), 'abc');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when client not found', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        first: () => Promise.resolve(null),
        raw: () => '',
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await deleteClient(context, makeRequest(), '999');
      expect(context.res!.status).toBe(404);
    });

    it('deletes client successfully', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1 });
      mockUpdate.mockResolvedValue({ id: 1, is_active: false });
      
      const context = makeContext();
      await deleteClient(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });
});
