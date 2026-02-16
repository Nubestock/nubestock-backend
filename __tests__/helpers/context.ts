import { Context, HttpRequest } from '../../src/types/azure-functions';

export function makeContext(): Context {
  return { res: undefined } as Context;
}

export function makeRequest(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    method: 'GET',
    url: '/',
    query: {},
    headers: {},
    body: undefined,
    ...overrides,
  } as HttpRequest;
}
