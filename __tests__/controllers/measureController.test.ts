jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
import { listMeasures } from '../../src/controllers/measureController';
import { makeContext, makeRequest } from '../helpers/context';

describe('measureController', () => {
  it('listMeasures returns 200 with data', async () => {
    const context = makeContext();
    await listMeasures(context, makeRequest({ query: {} }));
    expect(context.res!.status).toBe(200);
    expect(context.res!.body.success).toBe(true);
  });
});
