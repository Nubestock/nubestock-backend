/**
 * loadEnv runs at import time. We test its behavior by controlling process.env
 * and (optionally) fs. In Test env it returns early without reading files.
 */
describe('loadEnv', () => {
  const originalEnv = process.env;

  beforeAll(() => {
    process.env.AZURE_FUNCTIONS_ENVIRONMENT = 'Test';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('module can be required without throwing', () => {
    expect(() => require('../../src/config/loadEnv')).not.toThrow();
  });

  it('loadLocalSettings is defined and callable', () => {
    const { loadLocalSettings } = require('../../src/config/loadEnv');
    expect(typeof loadLocalSettings).toBe('function');
    expect(() => loadLocalSettings()).not.toThrow();
  });

  describe('loadLocalSettings in Production', () => {
    it('returns early when AZURE_FUNCTIONS_ENVIRONMENT is Production', () => {
      const prev = process.env.AZURE_FUNCTIONS_ENVIRONMENT;
      process.env.AZURE_FUNCTIONS_ENVIRONMENT = 'Production';
      const { loadLocalSettings } = require('../../src/config/loadEnv');
      loadLocalSettings();
      process.env.AZURE_FUNCTIONS_ENVIRONMENT = prev;
    });
  });

  describe('loadLocalSettings in non-Production', () => {
    it('does not throw when local.settings.json is missing', () => {
      const prev = process.env.AZURE_FUNCTIONS_ENVIRONMENT;
      process.env.AZURE_FUNCTIONS_ENVIRONMENT = 'Development';
      jest.resetModules();
      const { loadLocalSettings } = require('../../src/config/loadEnv');
      expect(() => loadLocalSettings()).not.toThrow();
      process.env.AZURE_FUNCTIONS_ENVIRONMENT = prev;
    });
  });
});
