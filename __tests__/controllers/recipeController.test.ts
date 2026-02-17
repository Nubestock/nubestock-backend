jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

const mockGetConnection = jest.fn();
const mockUpdate = jest.fn();
const mockTransaction = jest.fn();
jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => mockGetConnection(),
      update: mockUpdate,
      transaction: mockTransaction,
    }),
  },
}));

import { 
  listRecipes, 
  createRecipe, 
  updateRecipe, 
  updateProductRecipe, 
  deleteRecipe 
} from '../../src/controllers/recipeController';
import { makeContext, makeRequest } from '../helpers/context';

describe('recipeController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const chain: Record<string, any> = {
      select: () => chain,
      from: () => chain,
      join: () => chain,
      leftJoin: () => chain,
      whereIn: () => chain,
      orderBy: () => chain, // orderBy debe devolver chain, no promesa directamente
      first: () => Promise.resolve(null),
      raw: () => '',
    };
    chain.where = jest.fn().mockReturnValue(chain); // where debe ser una función que devuelve chain
    // Cuando se ejecuta la query (sin más métodos), devolver la promesa
    (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
    mockGetConnection.mockReturnValue(chain);
  });

  describe('listRecipes', () => {
    it('returns 200 with data', async () => {
      const context = makeContext();
      await listRecipes(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('filters by productId when provided', async () => {
      const context = makeContext();
      await listRecipes(context, makeRequest({ query: { productId: '1' } }));
      expect(context.res!.status).toBe(200);
    });

    it('filters by id_product when provided', async () => {
      const context = makeContext();
      await listRecipes(context, makeRequest({ query: { id_product: '1' } }));
      expect(context.res!.status).toBe(200);
    });

    it('handles invalid productId gracefully', async () => {
      const context = makeContext();
      await listRecipes(context, makeRequest({ query: { productId: 'invalid' } }));
      expect(context.res!.status).toBe(200);
    });
  });

  describe('createRecipe', () => {
    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await createRecipe(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when product not found', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        first: () => Promise.resolve(null), // Product not found
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await createRecipe(context, makeRequest({
        body: {
          id_product: 1,
          materials: [{ id_product: 1 }],
        },
      }));
      expect(context.res!.status).toBe(404);
    });

    it('returns 400 when materials not found', async () => {
      const productChain: Record<string, any> = {
        select: () => productChain,
        from: () => productChain,
        first: () => Promise.resolve({ id: 1 }), // Product exists
      };
      productChain.where = jest.fn().mockReturnValue(productChain);
      
      const materialsChain: Record<string, any> = {
        select: () => materialsChain,
        from: () => materialsChain,
        whereIn: () => materialsChain,
        where: () => materialsChain, // where debe devolver chain
      };
      (materialsChain as any).then = (resolve: any) => Promise.resolve([]).then(resolve); // Materials not found (empty array)
      
      mockGetConnection
        .mockReturnValueOnce(productChain)
        .mockReturnValueOnce(materialsChain);
      
      const context = makeContext();
      await createRecipe(context, makeRequest({
        body: {
          id_product: 1,
          materials: [{ id_product: 999 }],
        },
      }));
      expect(context.res!.status).toBe(400);
    });

    it('creates recipe successfully', async () => {
      const productChain: Record<string, any> = {
        select: () => productChain,
        from: () => productChain,
        first: () => Promise.resolve({ id: 1 }),
      };
      productChain.where = jest.fn().mockReturnValue(productChain);
      
      const materialsChain: Record<string, any> = {
        select: () => materialsChain,
        from: () => materialsChain,
        whereIn: () => materialsChain,
        where: () => materialsChain, // where debe devolver chain
      };
      (materialsChain as any).then = (resolve: any) => Promise.resolve([{ id: 1 }]).then(resolve); // Materials exist
      
      mockGetConnection
        .mockReturnValueOnce(productChain)
        .mockReturnValueOnce(materialsChain);
      
      mockTransaction.mockImplementation(async (callback) => {
        const trx = jest.fn((table: string) => {
          if (table === 'nubestock.tb_mae_receipe') {
            const receipeChain: Record<string, any> = {
              select: () => receipeChain,
              insert: () => ({
                returning: () => Promise.resolve([{ id: 1 }]),
              }),
            };
            receipeChain.where = jest.fn().mockReturnValue(receipeChain);
            receipeChain.first = jest.fn().mockResolvedValue(null); // No existing recipe
            return receipeChain;
          }
          if (table === 'nubestock.tb_mae_product_receipe') {
            const productReceipeChain: Record<string, any> = {
              insert: () => ({
                returning: () => Promise.resolve([{ id: 1, id_product: 1 }]),
              }),
              update: () => Promise.resolve({}),
            };
            productReceipeChain.where = jest.fn().mockReturnValue(productReceipeChain);
            return productReceipeChain;
          }
          return {};
        });
        return callback(trx);
      });
      
      const context = makeContext();
      await createRecipe(context, makeRequest({
        body: {
          id_product: 1,
          materials: [{ id_product: 1 }],
        },
      }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('updateRecipe', () => {
    it('returns 400 when id is missing', async () => {
      const context = makeContext();
      await updateRecipe(context, makeRequest({ query: {}, body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when id is invalid', async () => {
      const context = makeContext();
      await updateRecipe(context, makeRequest({ query: { id: 'abc' }, body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when recipe not found', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve(null), // Recipe not found
      };
      chain.where = jest.fn().mockReturnValue(chain); // where debe ser una función que devuelve chain
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await updateRecipe(context, makeRequest({ query: { id: '999' }, body: { is_active: false } }));
      expect(context.res!.status).toBe(404);
    });

    it('updates recipe successfully', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve({ id: 1 }), // Recipe exists
      };
      chain.where = jest.fn().mockReturnValue(chain); // where debe ser una función que devuelve chain
      mockGetConnection.mockReturnValue(chain);
      mockUpdate.mockResolvedValue({ id: 1, is_active: false });
      
      const context = makeContext();
      await updateRecipe(context, makeRequest({ query: { id: '1' }, body: { is_active: false } }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('updateProductRecipe', () => {
    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await updateProductRecipe(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when product not found', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        first: () => Promise.resolve(null),
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await updateProductRecipe(context, makeRequest({
        body: {
          id_product: 999,
          materials: [],
        },
      }));
      expect(context.res!.status).toBe(404);
    });

    it('updates product recipe successfully', async () => {
      const productChain: Record<string, any> = {
        select: () => productChain,
        from: () => productChain,
        first: () => Promise.resolve({ id: 1 }),
      };
      productChain.where = jest.fn().mockReturnValue(productChain);
      
      const receipeChain: Record<string, any> = {
        select: () => receipeChain,
        from: () => receipeChain,
        first: () => Promise.resolve({ id: 1 }),
      };
      receipeChain.where = jest.fn().mockReturnValue(receipeChain);
      
      const materialsChain: Record<string, any> = {
        select: () => materialsChain,
        from: () => materialsChain,
        whereIn: () => materialsChain,
        where: () => materialsChain,
      };
      (materialsChain as any).then = (resolve: any) => Promise.resolve([{ id: 1 }]).then(resolve);
      
      const finalChain: Record<string, any> = {
        select: () => finalChain,
        from: () => finalChain,
        join: () => finalChain,
        orderBy: () => finalChain, // orderBy debe devolver chain
      };
      finalChain.where = jest.fn().mockReturnValue(finalChain);
      (finalChain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
      
      mockGetConnection
        .mockReturnValueOnce(productChain) // Verificar producto existe
        .mockReturnValueOnce(materialsChain) // Verificar materiales existen
        .mockReturnValueOnce(receipeChain) // Obtener o crear receta
        .mockReturnValueOnce(finalChain); // Obtener receta actualizada
      
      mockTransaction.mockImplementation(async (callback) => {
        const trx = jest.fn((table: string) => {
          if (table === 'nubestock.tb_mae_receipe') {
            const receipeChain: Record<string, any> = {
              insert: () => ({
                returning: () => Promise.resolve([{ id: 1 }]),
              }),
            };
            return receipeChain;
          }
          if (table === 'nubestock.tb_mae_product_receipe') {
            const productReceipeChain: Record<string, any> = {
              select: () => productReceipeChain,
              insert: () => ({
                returning: () => Promise.resolve([{ id: 1, id_product: 1 }]),
              }),
              update: () => ({
                returning: () => Promise.resolve([{ id: 1 }]),
              }),
            };
            productReceipeChain.where = jest.fn().mockReturnValue(productReceipeChain);
            // Cuando se ejecuta select().where().where(), devolver array vacío (no hay relaciones existentes)
            (productReceipeChain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
            return productReceipeChain;
          }
          return {};
        });
        return callback(trx);
      });
      
      const context = makeContext();
      await updateProductRecipe(context, makeRequest({
        body: {
          id_product: 1,
          materials: [{ id_product: 1 }],
        },
      }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('deleteRecipe', () => {
    it('returns 400 when id is missing', async () => {
      const context = makeContext();
      await deleteRecipe(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when id is invalid', async () => {
      const context = makeContext();
      await deleteRecipe(context, makeRequest({ query: { id: 'abc' } }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when recipe not found', async () => {
      mockGetConnection.mockReset();
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve(null), // Recipe not found
      };
      chain.where = jest.fn().mockReturnValue(chain); // where debe ser una función que devuelve chain
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await deleteRecipe(context, makeRequest({ query: { id: '999' } }));
      expect(context.res!.status).toBe(404);
    });

    it('deletes recipe successfully', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        first: () => Promise.resolve({ id: 1 }), // Recipe exists
      };
      chain.where = jest.fn().mockReturnValue(chain); // where debe ser una función que devuelve chain
      mockGetConnection.mockReturnValue(chain);
      
      mockTransaction.mockImplementation(async (callback) => {
        const trx = jest.fn((table: string) => {
          const tableChain: Record<string, any> = {
            update: () => Promise.resolve({}),
          };
          tableChain.where = jest.fn().mockReturnValue(tableChain); // where debe ser una función que devuelve chain
          return tableChain;
        });
        return callback(trx);
      });
      
      const context = makeContext();
      await deleteRecipe(context, makeRequest({ query: { id: '1' } }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });
});
