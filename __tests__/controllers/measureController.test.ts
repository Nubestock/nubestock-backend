jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { listMeasures, createMeasure, updateMeasure } from '../../src/controllers/measureController';
import { makeContext, makeRequest } from '../helpers/context';

describe('measureController', () => {
  it('listMeasures returns 200 with data', async () => {
    const context = makeContext();
    await listMeasures(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });

  it('createMeasure returns 400 when body is invalid', async () => {
    const context = makeContext();
    await createMeasure(context, makeRequest({ body: {} }));
    expect(context.res!.status).toBe(400);
  });

  it('updateMeasure returns 400 when id missing or body invalid', async () => {
    const context = makeContext();
    await updateMeasure(context, makeRequest({ query: {}, body: {} }));
    expect([400, 404]).toContain(context.res!.status);
  });
});
