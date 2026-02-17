jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

const mockGetConnection = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => mockGetConnection(),
      create: mockCreate,
      update: mockUpdate,
    }),
  },
}));

import { listMaterials, createMaterial, updateMaterial, deleteMaterial } from '../../src/controllers/materialController';
import { makeContext, makeRequest } from '../helpers/context';

describe('materialController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const chain: Record<string, any> = {
      select: () => chain,
      from: () => chain,
      leftJoin: () => chain,
      orderBy: () => chain, // orderBy debe devolver chain, no promesa directamente
      first: () => Promise.resolve(null),
    };
    chain.where = jest.fn().mockReturnValue(chain); // where debe ser una función que devuelve chain
    // Cuando se ejecuta la query (sin más métodos), devolver la promesa
    (chain as any).then = (resolve: any) => Promise.resolve([]).then(resolve);
    mockGetConnection.mockReturnValue(chain);
  });

  describe('listMaterials', () => {
    it('returns 200 with data', async () => {
      const context = makeContext();
      await listMaterials(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('filters by id_origin when provided', async () => {
      const context = makeContext();
      await listMaterials(context, makeRequest({ query: { id_origin: '1' } }));
      expect(context.res!.status).toBe(200);
    });

    it('handles invalid id_origin gracefully', async () => {
      const context = makeContext();
      await listMaterials(context, makeRequest({ query: { id_origin: 'invalid' } }));
      expect(context.res!.status).toBe(200);
    });
  });

  describe('createMaterial', () => {
    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      await createMaterial(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when SKU already exists', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        first: () => Promise.resolve({ id: 1 }), // Material exists
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await createMaterial(context, makeRequest({
        body: {
          name: 'Test Material',
          sku: 'MAT-001',
          id_origin: 1,
          id_measure: 1,
        },
      }));
      expect(context.res!.status).toBe(400);
    });

    it('creates material successfully', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        first: () => Promise.resolve(null), // No duplicate
      };
      mockGetConnection.mockReturnValue(chain);
      mockCreate.mockResolvedValue({ id: 1, name: 'Test Material', sku: 'MAT-001' });
      
      const context = makeContext();
      await createMaterial(context, makeRequest({
        body: {
          name: 'Test Material',
          sku: 'MAT-001',
          id_origin: 1,
          id_measure: 1,
        },
      }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('updateMaterial', () => {
    it('returns 400 when id is missing', async () => {
      const context = makeContext();
      await updateMaterial(context, makeRequest({ query: {}, body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when id is invalid', async () => {
      const context = makeContext();
      await updateMaterial(context, makeRequest({ query: { id: 'abc' }, body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when material not found', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        first: () => Promise.resolve(null), // Material not found
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await updateMaterial(context, makeRequest({ query: { id: '999' }, body: { name: 'Updated' } }));
      expect(context.res!.status).toBe(404);
    });

    it('returns 400 when SKU already exists', async () => {
      const findChain: Record<string, any> = {
        select: () => findChain,
        from: () => findChain,
        where: () => findChain,
        first: () => Promise.resolve({ id: 1, sku: 'MAT-001' }), // Material exists
      };
      
      const duplicateChain: Record<string, any> = {
        select: () => duplicateChain,
        from: () => duplicateChain,
        where: () => duplicateChain,
        first: () => Promise.resolve({ id: 2 }), // Duplicate SKU exists
      };
      
      mockGetConnection
        .mockReturnValueOnce(findChain)
        .mockReturnValueOnce(duplicateChain);
      
      const context = makeContext();
      await updateMaterial(context, makeRequest({ 
        query: { id: '1' }, 
        body: { sku: 'MAT-002' } 
      }));
      expect(context.res!.status).toBe(400);
    });

    it('updates material successfully', async () => {
      const findChain: Record<string, any> = {
        select: () => findChain,
        from: () => findChain,
        where: () => findChain,
        first: () => Promise.resolve({ id: 1, sku: 'MAT-001' }),
      };
      
      mockGetConnection.mockReturnValue(findChain);
      mockUpdate.mockResolvedValue({ id: 1, name: 'Updated Material' });
      
      const context = makeContext();
      await updateMaterial(context, makeRequest({ 
        query: { id: '1' }, 
        body: { name: 'Updated Material' } 
      }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });
  });

  describe('deleteMaterial', () => {
    it('returns 400 when id is missing', async () => {
      const context = makeContext();
      await deleteMaterial(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when id is invalid', async () => {
      const context = makeContext();
      await deleteMaterial(context, makeRequest({ query: { id: 'abc' } }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when material not found', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        first: () => Promise.resolve(null),
      };
      mockGetConnection.mockReturnValue(chain);
      
      const context = makeContext();
      await deleteMaterial(context, makeRequest({ query: { id: '999' } }));
      expect(context.res!.status).toBe(404);
    });

    it('deletes material successfully (soft delete)', async () => {
      const chain: Record<string, any> = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        first: () => Promise.resolve({ id: 1 }),
      };
      mockGetConnection.mockReturnValue(chain);
      mockUpdate.mockResolvedValue({ id: 1, is_active: false });
      
      const context = makeContext();
      await deleteMaterial(context, makeRequest({ query: { id: '1' } }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        'nubestock.tb_ope_product',
        1,
        expect.objectContaining({ is_active: false })
      );
    });
  });
});
