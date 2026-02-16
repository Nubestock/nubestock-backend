/**
 * Configuración global de tests.
 *
 * REGLA CRÍTICA: Los tests NUNCA deben usar la conexión real a la base de datos.
 * - Se mockea Database globalmente aquí para que ningún import cree una conexión real.
 * - Cada test que necesite un comportamiento específico de DB debe mockear en su archivo.
 */

process.env.AZURE_FUNCTIONS_ENVIRONMENT = 'Test';

// Mock global de Database: evita que cualquier módulo cree una conexión real a la BDD.
// getConnection() devuelve un callable: connection('table') => queryBuilder fake.
const fakeQueryBuilder = () => ({
  where: () => ({ whereRaw: () => ({ first: () => Promise.resolve(null) }), first: () => Promise.resolve(null) }),
  whereRaw: () => ({ first: () => Promise.resolve(null) }),
  first: () => Promise.resolve(null),
  insert: () => ({ returning: () => Promise.resolve([]) }),
  returning: () => Promise.resolve([]),
});

jest.mock('../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => fakeQueryBuilder,
      testConnection: () => Promise.resolve(false),
      setSchema: () => Promise.resolve(),
    }),
  },
}));
