jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { listMachinery, getMachinery, createMachinery } from '../../src/controllers/machineryController';
import { makeContext, makeRequest } from '../helpers/context';

describe('machineryController', () => {
  it('listMachinery returns 200 with data', async () => {
    const context = makeContext();
    await listMachinery(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });

  it('getMachinery returns 400 when machineryId is invalid', async () => {
    const context = makeContext();
    await getMachinery(context, makeRequest(), 'x');
    expect(context.res!.status).toBe(400);
  });

  it('getMachinery returns 404 when not found', async () => {
    const context = makeContext();
    await getMachinery(context, makeRequest(), '99999');
    expect(context.res!.status).toBe(404);
  });

  it('createMachinery returns 400 when body is invalid', async () => {
    const context = makeContext();
    await createMachinery(context, makeRequest({ body: {} }));
    expect(context.res!.status).toBe(400);
  });
});
