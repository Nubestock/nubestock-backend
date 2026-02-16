/**
 * Tests for config/environment. Mock logger to avoid circular dependency
 * (environment -> loadEnv -> logger -> environment).
 */
jest.mock('../../src/config/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { config, validateConfig } from '../../src/config/environment';

describe('environment config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('config object', () => {
    it('has server defaults', () => {
      expect(config.server.port).toBeDefined();
      expect(config.server.host).toBeDefined();
      expect(config.server.environment).toBeDefined();
    });

    it('has database defaults', () => {
      expect(config.database.host).toBeDefined();
      expect(config.database.port).toBe(5432);
      expect(config.database.schema).toBe('nubestock');
    });

    it('has cors with methods and allowedHeaders', () => {
      expect(Array.isArray(config.cors.origin)).toBe(true);
      expect(config.cors.methods).toContain('GET');
      expect(config.cors.allowedHeaders).toContain('Content-Type');
    });

    it('has security with appKey', () => {
      expect(config.security).toBeDefined();
      expect(typeof config.security.appKey).toBe('string');
    });

    it('has jwt secret getter', () => {
      expect(config.jwt.secret).toBeDefined();
      expect(config.jwt.expiresIn).toBeDefined();
    });
  });

  describe('validateConfig', () => {
    const required = ['DATABASE_HOSTNAME', 'DATABASE_USERNAME', 'DATABASE_PASSWORD', 'DATABASE_NAME', 'JWT_SECRET'];

    it('throws when required env vars are missing', () => {
      const saved: Record<string, string | undefined> = {};
      required.forEach((k) => {
        saved[k] = process.env[k];
        delete process.env[k];
      });
      try {
        expect(() => validateConfig()).toThrow(/Missing required environment variables/);
      } finally {
        required.forEach((k) => {
          if (saved[k] !== undefined) process.env[k] = saved[k];
        });
      }
    });

    it('does not throw when all required vars are set', () => {
      const saved: Record<string, string | undefined> = {};
      required.forEach((k) => {
        saved[k] = process.env[k];
        process.env[k] = process.env[k] || 'test-value';
      });
      try {
        expect(() => validateConfig()).not.toThrow();
      } finally {
        required.forEach((k) => {
          if (saved[k] !== undefined) process.env[k] = saved[k];
          else delete process.env[k];
        });
      }
    });

    it('includes missing var names in error', () => {
      const saved: Record<string, string | undefined> = {};
      required.forEach((k) => {
        saved[k] = process.env[k];
      });
      delete process.env.DATABASE_USERNAME;
      try {
        validateConfig();
      } catch (e: any) {
        expect(e.message).toContain('DATABASE_USERNAME');
      } finally {
        required.forEach((k) => {
          if (saved[k] !== undefined) process.env[k] = saved[k];
        });
      }
    });
  });
});
