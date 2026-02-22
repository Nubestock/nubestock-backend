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

function createChain(resolveValue: any = []) {
  const chain: Record<string, any> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.from = jest.fn().mockReturnValue(chain);
  chain.leftJoin = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.orWhere = jest.fn().mockReturnValue(chain);
  chain.orderBy = jest.fn().mockResolvedValue(resolveValue);
  chain.first = jest.fn().mockResolvedValue(Array.isArray(resolveValue) ? resolveValue[0] : resolveValue);
  chain.raw = jest.fn().mockReturnValue('');
  return chain;
}

describe('clientController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConnection.mockReturnValue(createChain([]));
  });

  describe('listClients', () => {
    it('returns 200 with data', async () => {
      const context = makeContext();
      await listClients(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('filters by is_active when provided', async () => {
      const chain = createChain([]);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listClients(context, makeRequest({ query: { is_active: 'true' } }));
      expect(context.res!.status).toBe(200);
      expect(chain.where).toHaveBeenCalled();
    });

    it('filters by search when provided', async () => {
      const chain = createChain([]);
      chain.where = jest.fn().mockImplementation(function(this: any, arg: any) {
        if (typeof arg === 'function') {
          arg.call({ where: jest.fn().mockReturnThis(), orWhere: jest.fn().mockReturnThis() });
        }
        return chain;
      });
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await listClients(context, makeRequest({ query: { search: 'test' } }));
      expect(context.res!.status).toBe(200);
    });

    it('handles database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('DB error');
      });
      
      const context = makeContext();
      await listClients(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('getClient', () => {
    it('returns 400 when clientId is invalid', async () => {
      const context = makeContext();
      await getClient(context, makeRequest(), 'invalid');
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.message).toBe('ID de cliente inválido');
    });

    it('returns 404 when client not found', async () => {
      const chain = createChain(null);
      chain.first = jest.fn().mockResolvedValue(null);
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getClient(context, makeRequest(), '99999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 200 when client found', async () => {
      const chain = createChain({ id: 1, name: 'Test Client' });
      chain.first = jest.fn().mockResolvedValue({ id: 1, name: 'Test Client' });
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await getClient(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('handles database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('DB error');
      });
      
      const context = makeContext();
      await getClient(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('createClient', () => {
    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await createClient(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.message).toBe('Datos de entrada inválidos');
    });

    it('returns 400 when identification already exists', async () => {
      const chain = createChain({ id: 99 });
      chain.first = jest.fn().mockResolvedValue({ id: 99 });
      mockGetConnection.mockReturnValue(chain);
      
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
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.message).toBe('La identificación ya está registrada');
    });

    it('creates client successfully', async () => {
      const chain = createChain(null);
      chain.first = jest.fn().mockResolvedValue(null);
      mockGetConnection.mockReturnValue(chain);
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

    it('creates client with optional credit fields', async () => {
      const chain = createChain(null);
      chain.first = jest.fn().mockResolvedValue(null);
      mockGetConnection.mockReturnValue(chain);
      mockCreate.mockResolvedValue({ id: 1, name: 'Test Client', requires_credit: true });
      
      const context = makeContext();
      await createClient(context, makeRequest({
        body: {
          name: 'Test Client',
          identification: '1234567890123',
          identification_type: 'RUC',
          email: 'test@test.com',
          phone: '1234567890',
          address: 'Test Address',
          id_city: 1,
          id_province: 1,
          requires_credit: true,
          credit_limit: 5000,
          credit_days: 30,
        },
      }));
      expect(context.res!.status).toBe(201);
    });

    it('handles database error', async () => {
      mockGetConnection.mockImplementation(() => {
        throw new Error('DB error');
      });
      
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
      expect(context.res!.status).toBe(500);
    });
  });

  describe('updateClient', () => {
    it('returns 400 when clientId is invalid', async () => {
      const context = makeContext();
      await updateClient(context, makeRequest(), 'abc');
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when validation fails', async () => {
      const context = makeContext();
      await updateClient(context, makeRequest({ body: { email: 'invalid-email' } }), '1');
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.message).toBe('Datos de entrada inválidos');
    });

    it('returns 404 when client not found', async () => {
      mockFindById.mockResolvedValue(null);
      
      const context = makeContext();
      await updateClient(context, makeRequest({ body: { name: 'Updated' } }), '999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 400 when changing identification to existing one', async () => {
      mockFindById.mockResolvedValue({ id: 1, identification: '1234567890' });
      
      const chain = createChain({ id: 99 });
      chain.first = jest.fn().mockResolvedValue({ id: 99 });
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await updateClient(context, makeRequest({ 
        body: { identification: '0987654321' } 
      }), '1');
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.message).toBe('La identificación ya está registrada');
    });

    it('updates client successfully', async () => {
      mockFindById.mockResolvedValue({ id: 1, identification: '1234567890' });
      mockUpdate.mockResolvedValue({ id: 1, name: 'Updated' });
      
      const context = makeContext();
      await updateClient(context, makeRequest({ body: { name: 'Updated' } }), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('updates client with new identification successfully', async () => {
      mockFindById.mockResolvedValue({ id: 1, identification: '1234567890' });
      
      const chain = createChain(null);
      chain.first = jest.fn().mockResolvedValue(null);
      mockGetConnection.mockReturnValue(chain);
      mockUpdate.mockResolvedValue({ id: 1, identification: '0987654321' });
      
      const context = makeContext();
      await updateClient(context, makeRequest({ 
        body: { identification: '0987654321' } 
      }), '1');
      expect(context.res!.status).toBe(200);
    });

    it('returns 500 when update fails', async () => {
      mockFindById.mockResolvedValue({ id: 1, identification: '1234567890' });
      mockUpdate.mockResolvedValue(null);
      
      const context = makeContext();
      await updateClient(context, makeRequest({ body: { name: 'Updated' } }), '1');
      expect(context.res!.status).toBe(500);
    });

    it('handles database error', async () => {
      mockFindById.mockImplementation(() => {
        throw new Error('DB error');
      });
      
      const context = makeContext();
      await updateClient(context, makeRequest({ body: { name: 'Updated' } }), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('deleteClient', () => {
    it('returns 400 when clientId is invalid', async () => {
      const context = makeContext();
      await deleteClient(context, makeRequest(), 'abc');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when client not found', async () => {
      mockFindById.mockResolvedValue(null);
      
      const context = makeContext();
      await deleteClient(context, makeRequest(), '999');
      expect(context.res!.status).toBe(404);
    });

    it('deletes client successfully', async () => {
      mockFindById.mockResolvedValue({ id: 1 });
      mockUpdate.mockResolvedValue({ id: 1, is_active: false });
      
      const context = makeContext();
      await deleteClient(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 500 when delete fails', async () => {
      mockFindById.mockResolvedValue({ id: 1 });
      mockUpdate.mockResolvedValue(null);
      
      const context = makeContext();
      await deleteClient(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
    });

    it('handles database error', async () => {
      mockFindById.mockImplementation(() => {
        throw new Error('DB error');
      });
      
      const context = makeContext();
      await deleteClient(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
    });
  });
});
