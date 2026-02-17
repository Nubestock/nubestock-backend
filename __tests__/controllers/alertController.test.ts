jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

const mockCreateAlert = jest.fn();
jest.mock('../../src/utils/alertHelper', () => ({ createAlert: mockCreateAlert }));

const mockRequireAuth = jest.fn();
jest.mock('../../src/middleware/authMiddleware', () => ({ requireAuth: mockRequireAuth }));

const mockGetConnection = jest.fn();
const mockFindById = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => mockGetConnection(),
      findById: mockFindById,
      update: mockUpdate,
      delete: mockDelete,
    }),
  },
}));

import { 
  listAlerts, 
  createAlertHandler, 
  getAlert, 
  acknowledgeAlert,
  resolveAlert,
  dismissAlert,
  updateAlert,
  deleteAlert 
} from '../../src/controllers/alertController';
import { makeContext, makeRequest } from '../helpers/context';

describe('alertController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockReturnValue({ success: true, user: { userId: 1 } });
    mockCreateAlert.mockResolvedValue({ id: 1, alert_type: 'custom', alert_title: 'Test', alert_message: 'Test' });
    
    const chain: Record<string, any> = {
      select: () => chain,
      from: () => chain,
      orderBy: () => chain, // orderBy debe devolver chain, no promesa directamente
    };
    chain.where = jest.fn().mockReturnValue(chain); // where debe ser una función que devuelve chain
    // Cuando se ejecuta la query (sin más métodos), devolver la promesa
    (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
    mockGetConnection.mockReturnValue(chain);
  });

  describe('listAlerts', () => {
    it('returns 200 with data', async () => {
      const context = makeContext();
      await listAlerts(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('accepts is_active query', async () => {
      const context = makeContext();
      await listAlerts(context, makeRequest({ query: { is_active: 'true' } }));
      expect(context.res!.status).toBe(200);
    });

    it('accepts entity_type query', async () => {
      const context = makeContext();
      await listAlerts(context, makeRequest({ query: { entity_type: 'sale' } }));
      expect(context.res!.status).toBe(200);
    });

    it('accepts priority query', async () => {
      const context = makeContext();
      await listAlerts(context, makeRequest({ query: { priority: 'high' } }));
      expect(context.res!.status).toBe(200);
    });
  });

  describe('createAlertHandler', () => {
    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await createAlertHandler(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('creates alert successfully with valid data', async () => {
      const context = makeContext();
      await createAlertHandler(context, makeRequest({
        body: {
          alert_type: 'custom',
          alert_title: 'Test Alert',
          alert_message: 'Test message',
        },
      }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
      expect(mockCreateAlert).toHaveBeenCalled();
    });

    it('returns 500 when createAlert fails', async () => {
      mockCreateAlert.mockResolvedValueOnce(null);
      const context = makeContext();
      await createAlertHandler(context, makeRequest({
        body: {
          alert_type: 'custom',
          alert_title: 'Test Alert',
          alert_message: 'Test message',
        },
      }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('getAlert', () => {
    it('returns 400 when alertId is invalid', async () => {
      const context = makeContext();
      await getAlert(context, makeRequest(), 'abc');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when alert not found', async () => {
      mockFindById.mockResolvedValueOnce(null);
      const context = makeContext();
      await getAlert(context, makeRequest(), '999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 200 with alert data when found', async () => {
      mockFindById.mockResolvedValueOnce({
        id: 1,
        alert_type: 'custom',
        alert_title: 'Test',
        alert_message: 'Test',
      });
      const context = makeContext();
      await getAlert(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).toHaveProperty('id', 1);
    });
  });

  describe('acknowledgeAlert', () => {
    it('returns 400 when alertId is invalid', async () => {
      const context = makeContext();
      await acknowledgeAlert(context, makeRequest(), 'abc');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when alert not found', async () => {
      mockFindById.mockResolvedValueOnce(null);
      const context = makeContext();
      await acknowledgeAlert(context, makeRequest(), '999');
      expect(context.res!.status).toBe(404);
    });

    it('acknowledges alert successfully', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1 });
      mockUpdate.mockResolvedValueOnce({ id: 1 });
      const context = makeContext();
      await acknowledgeAlert(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 500 when update fails', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1 });
      mockUpdate.mockResolvedValueOnce(null);
      const context = makeContext();
      await acknowledgeAlert(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('resolveAlert', () => {
    it('returns 400 when alertId is invalid', async () => {
      const context = makeContext();
      await resolveAlert(context, makeRequest(), 'abc');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when alert not found', async () => {
      mockFindById.mockResolvedValueOnce(null);
      const context = makeContext();
      await resolveAlert(context, makeRequest(), '999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 401 when user not authenticated', async () => {
      mockRequireAuth.mockReturnValueOnce({ success: false });
      mockFindById.mockResolvedValueOnce({ id: 1 });
      const context = makeContext();
      await resolveAlert(context, makeRequest(), '1');
      expect(context.res!.status).toBe(401);
    });

    it('resolves alert successfully', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1 });
      mockUpdate.mockResolvedValueOnce({ id: 1 });
      const context = makeContext();
      await resolveAlert(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 500 when update fails', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1 });
      mockUpdate.mockResolvedValueOnce(null);
      const context = makeContext();
      await resolveAlert(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('dismissAlert', () => {
    it('returns 400 when alertId is invalid', async () => {
      const context = makeContext();
      await dismissAlert(context, makeRequest(), 'abc');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when alert not found', async () => {
      mockFindById.mockResolvedValueOnce(null);
      const context = makeContext();
      await dismissAlert(context, makeRequest(), '999');
      expect(context.res!.status).toBe(404);
    });

    it('dismisses alert successfully', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1 });
      mockUpdate.mockResolvedValueOnce({ id: 1 });
      const context = makeContext();
      await dismissAlert(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 500 when update fails', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1 });
      mockUpdate.mockResolvedValueOnce(null);
      const context = makeContext();
      await dismissAlert(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('updateAlert', () => {
    it('returns 400 when alertId is invalid', async () => {
      const context = makeContext();
      await updateAlert(context, makeRequest(), 'abc');
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await updateAlert(context, makeRequest({ body: { priority: 'invalid' } }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when alert not found', async () => {
      mockFindById.mockResolvedValueOnce(null);
      const context = makeContext();
      await updateAlert(context, makeRequest({ body: { priority: 'high' } }), '999');
      expect(context.res!.status).toBe(404);
    });

    it('updates alert successfully', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1 });
      mockUpdate.mockResolvedValueOnce({ id: 1, priority: 'high' });
      const context = makeContext();
      await updateAlert(context, makeRequest({ body: { priority: 'high' } }), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 500 when update fails', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1 });
      mockUpdate.mockResolvedValueOnce(null);
      const context = makeContext();
      await updateAlert(context, makeRequest({ body: { priority: 'high' } }), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('deleteAlert', () => {
    it('returns 400 when alertId is invalid', async () => {
      const context = makeContext();
      await deleteAlert(context, makeRequest(), 'invalid');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when alert not found', async () => {
      mockFindById.mockResolvedValueOnce(null);
      const context = makeContext();
      await deleteAlert(context, makeRequest(), '999');
      expect(context.res!.status).toBe(404);
    });

    it('deletes alert successfully', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1 });
      mockDelete.mockResolvedValueOnce(true);
      const context = makeContext();
      await deleteAlert(context, makeRequest(), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('returns 500 when delete fails', async () => {
      mockFindById.mockResolvedValueOnce({ id: 1 });
      mockDelete.mockResolvedValueOnce(false);
      const context = makeContext();
      await deleteAlert(context, makeRequest(), '1');
      expect(context.res!.status).toBe(500);
    });
  });
});
