/**
 * @type {import('jest').Config}
 * IMPORTANTE: Los tests NUNCA usan conexión real a la BDD (mock global en __tests__/setup.ts).
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/utils/**/*.ts',
    'src/config/environment.ts',
    'src/config/loadEnv.ts',
    'src/middleware/**/*.ts',
    'src/controllers/**/*.ts',
    'src/services/**/*.ts',
    '!src/**/*.d.ts',
    '!src/types/**',
    '!src/interfaces/**',
    // Excluir solo lo que no se testea en absoluto
    '!src/middleware/auth.ts',
    '!src/middleware/authMiddleware.ts',
    '!src/utils/httpLogger.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',        // Tabla en consola (Stmts, Branch, Funcs, Lines)
    'text-summary', // Resumen en consola
    'lcov',        // coverage/lcov.info para SonarQube/SonarCloud
    'html',        // coverage/index.html para inspección local
  ],
  // Reporte JUnit para Sonar (test results: pasan/fallan)
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'test-results',
        outputName: 'junit.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: true,
      },
    ],
  ],
  coverageThreshold: {
    global: {
      branches: 14,
      functions: 15,
      lines: 19,
      statements: 19,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/config/(.*)$': '<rootDir>/src/config/$1',
    '^@/middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@/services/(.*)$': '<rootDir>/src/services/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs' } }],
  },
};
