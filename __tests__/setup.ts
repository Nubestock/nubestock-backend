/**
 * Configuración global de tests.
 *
 * REGLA CRÍTICA: Los tests NUNCA deben usar la conexión real a la base de datos.
 * - Se mockea Database globalmente aquí para que ningún import cree una conexión real.
 * - Cada test que necesite un comportamiento específico de DB debe mockear en su archivo.
 */

process.env.AZURE_FUNCTIONS_ENVIRONMENT = 'Test';

// Mock global de Database: evita que cualquier módulo cree una conexión real a la BDD.
// Soporta getConnection() (chain select/from/where/orderBy), findById, create, update, etc.
const chainResolve = (value: any = []) => {
  const chain: any = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    whereIn: () => chain,
    orderBy: () => chain,
    first: () => Promise.resolve(Array.isArray(value) ? (value[0] ?? null) : value),
    insert: () => ({ returning: () => Promise.resolve(value) }),
    update: () => ({ returning: () => Promise.resolve(value) }),
    del: () => Promise.resolve(1),
  };
  chain.then = (fn: (v: any) => any) => Promise.resolve(value).then(fn);
  return chain;
};

const defaultChain = chainResolve([]);

jest.mock('../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => defaultChain,
      findById: () => Promise.resolve(null),
      findAll: () => Promise.resolve([]),
      create: () => Promise.resolve({ id: 1 }),
      update: () => Promise.resolve(null),
      delete: () => Promise.resolve(true),
      softDelete: () => Promise.resolve(true),
      transaction: (cb: (trx: any) => Promise<any>) => cb({}),
      testConnection: () => Promise.resolve(false),
      setSchema: () => Promise.resolve(),
    }),
  },
}));
