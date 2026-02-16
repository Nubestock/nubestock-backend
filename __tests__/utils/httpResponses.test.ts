jest.mock('../../src/config/environment', () => ({
  config: {
    cors: {
      origin: ['http://localhost:3000', 'https://app.example.com'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    },
    security: { appKey: 'secret-app-key' },
  },
}));

import {
  addCorsToResponse,
  optionsOk,
  badRequest,
  unauthorized,
  requireAppKey,
  methodNotAllowed,
} from '../../src/utils/httpResponses';
import { Context, HttpRequest } from '../../src/types/azure-functions';

function makeContext(): Context {
  return { res: undefined } as Context;
}

function makeRequest(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    method: 'GET',
    url: '/',
    query: {},
    headers: {},
    body: undefined,
    ...overrides,
  } as HttpRequest;
}

describe('httpResponses', () => {
  describe('addCorsToResponse', () => {
    it('does nothing when context.res is undefined', () => {
      const context = makeContext();
      context.res = undefined;
      addCorsToResponse(context, makeRequest());
      expect(context.res).toBeUndefined();
    });

    it('adds CORS headers to context.res', () => {
      const context = makeContext();
      context.res = { status: 200, body: {} };
      const req = makeRequest({ headers: { origin: 'https://app.example.com' } });
      addCorsToResponse(context, req);
      expect(context.res!.headers).toBeDefined();
      expect(context.res!.headers!['Access-Control-Allow-Origin']).toBe('https://app.example.com');
      expect(context.res!.headers!['Access-Control-Allow-Credentials']).toBe('true');
    });

    it('uses first allowed origin when request has no Origin', () => {
      const context = makeContext();
      context.res = { status: 200 };
      addCorsToResponse(context, makeRequest());
      expect(context.res!.headers!['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
    });
  });

  describe('optionsOk', () => {
    it('sets status 204 and CORS headers', () => {
      const context = makeContext();
      optionsOk(context, makeRequest({ headers: { Origin: 'https://app.example.com' } }));
      expect(context.res).toBeDefined();
      expect(context.res!.status).toBe(204);
      expect(context.res!.headers!['Access-Control-Allow-Origin']).toBe('https://app.example.com');
    });
  });

  describe('badRequest', () => {
    it('sets status 400 and message in body', () => {
      const context = makeContext();
      badRequest(context, 'Invalid input');
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.success).toBe(false);
      expect(context.res!.body.message).toBe('Invalid input');
      expect(context.res!.body.timestamp).toBeDefined();
    });

    it('includes errors when provided', () => {
      const context = makeContext();
      const errors = [{ field: 'email', message: 'invalid' }];
      badRequest(context, 'Validation failed', errors);
      expect(context.res!.body.errors).toEqual(errors);
    });
  });

  describe('unauthorized', () => {
    it('sets status 401 without CORS when req is not passed', () => {
      const context = makeContext();
      unauthorized(context);
      expect(context.res!.status).toBe(401);
      expect(context.res!.body.message).toBe('No autorizado.');
      expect(context.res!.headers).toBeUndefined();
    });

    it('adds CORS when req is passed', () => {
      const context = makeContext();
      const req = makeRequest({ headers: { origin: 'https://app.example.com' } });
      unauthorized(context, req);
      expect(context.res!.status).toBe(401);
      expect(context.res!.headers!['Access-Control-Allow-Origin']).toBe('https://app.example.com');
    });
  });

  describe('requireAppKey', () => {
    it('returns true when query code matches config appKey', () => {
      const context = makeContext();
      const req = makeRequest({ query: { code: 'secret-app-key' } });
      expect(requireAppKey(context, req)).toBe(true);
      expect(context.res).toBeUndefined();
    });

    it('returns false and sets 401 when code is missing', () => {
      const context = makeContext();
      const req = makeRequest({ query: {} });
      expect(requireAppKey(context, req)).toBe(false);
      expect(context.res!.status).toBe(401);
    });

    it('returns false when code does not match', () => {
      const context = makeContext();
      const req = makeRequest({ query: { code: 'wrong-key' } });
      expect(requireAppKey(context, req)).toBe(false);
      expect(context.res!.status).toBe(401);
    });

    it('accepts Code (capital C) as query param', () => {
      const context = makeContext();
      const req = makeRequest({ query: { Code: 'secret-app-key' } });
      expect(requireAppKey(context, req)).toBe(true);
    });
  });

  describe('methodNotAllowed', () => {
    it('sets status 405 and message', () => {
      const context = makeContext();
      methodNotAllowed(context);
      expect(context.res!.status).toBe(405);
      expect(context.res!.body.message).toBe('Método no permitido');
    });
  });
});
