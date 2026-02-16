/**
 * Configuración global de tests.
 *
 * REGLA CRÍTICA: Los tests NUNCA deben usar la conexión real a la base de datos.
 * - Se mockea Database globalmente aquí para que ningún import cree una conexión real.
 * - Cada test que necesite un comportamiento específico de DB debe mockear en su archivo.
 */

process.env.AZURE_FUNCTIONS_ENVIRONMENT = 'Test';

// Mock global de Database: evita que cualquier módulo cree una conexión real a la BDD.
// Soporta getConnection() (chain select/from/where/orderBy/leftJoin/count/offset/limit), findById, create, etc.
function createDefaultChain(): any {
  let isCountQuery = false;
  const chain: any = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    whereIn: () => chain,
    whereNull: () => chain,
    orderBy: () => chain,
    leftJoin: () => chain,
    join: () => chain,
    offset: () => chain,
    limit: () => chain,
    distinct: () => chain,
    groupBy: () => chain,
    count: () => {
      isCountQuery = true;
      return chain;
    },
    countDistinct: () => {
      isCountQuery = true;
      return chain;
    },
    clearSelect: () => chain,
    clearOrder: () => chain,
    clearGroup: () => chain,
    clone: () => createDefaultChain(),
    first: () => Promise.resolve(null),
    insert: () => ({ returning: () => Promise.resolve([]) }),
    update: () => ({ returning: () => Promise.resolve([]) }),
    del: () => Promise.resolve(1),
    raw: () => chain,
  };
  chain.then = (fn: (v: any) => any) =>
    Promise.resolve(isCountQuery ? [{ count: '0' }] : []).then(fn);
  return chain;
}

function getConnectionMock() {
  const chain = createDefaultChain();
  chain.raw = () => ''; // Para db.getConnection().raw('...') en select/where
  return chain;
}

jest.mock('../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => getConnectionMock(),
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
