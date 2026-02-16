/**
 * Test requireAppKey when config.security.appKey is empty (no key required).
 */
jest.mock('../../src/config/environment', () => ({
  config: {
    cors: {
      origin: ['http://localhost:3000'],
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type'],
    },
    security: { appKey: '' },
  },
}));

import { requireAppKey } from '../../src/utils/httpResponses';
import { Context, HttpRequest } from '../../src/types/azure-functions';

function makeContext(): Context {
  return { res: undefined } as Context;
}

function makeRequest(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return { method: 'GET', url: '/', query: {}, headers: {}, body: undefined, ...overrides } as HttpRequest;
}

describe('requireAppKey when appKey is empty', () => {
  it('returns true even when query code is missing', () => {
    const context = makeContext();
    const req = makeRequest({ query: {} });
    expect(requireAppKey(context, req)).toBe(true);
    expect(context.res).toBeUndefined();
  });

  it('returns true when query code is anything', () => {
    const context = makeContext();
    const req = makeRequest({ query: { code: 'any-value' } });
    expect(requireAppKey(context, req)).toBe(true);
    expect(context.res).toBeUndefined();
  });
});
