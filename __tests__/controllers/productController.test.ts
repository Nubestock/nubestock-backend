jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock('../../src/utils/alertHelper', () => ({
  createStockLowAlert: jest.fn().mockResolvedValue(undefined),
}));

const mockGetConnection = jest.fn();
const mockFindById = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => mockGetConnection(),
      findById: (table: string, id: number) => mockFindById(table, id),
      create: (table: string, data: any) => mockCreate(table, data),
      update: (table: string, id: number, data: any) => mockUpdate(table, id, data),
    }),
  },
}));

import { listProducts, getProduct, createProduct, updateProduct, deleteProduct, checkStockAlerts, stockOperation } from '../../src/controllers/productController';
import { makeContext, makeRequest } from '../helpers/context';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetConnection.mockReset();
  mockFindById.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
});

describe('productController', () => {
  describe('listProducts', () => {
    it('returns 200 with products list', async () => {
      const products = [{ id: 1, name: 'Product 1', sku: 'SKU001' }];
      
      // Main query chain
      const mainChain: Record<string, any> = {
        select: () => mainChain,
        from: () => mainChain,
        leftJoin: () => mainChain,
        orderBy: () => mainChain,
        offset: () => mainChain,
        limit: () => mainChain,
      };
      mainChain.where = jest.fn().mockReturnValue(mainChain);
      (mainChain as any).then = (resolve: any) => Promise.resolve(products).then(resolve);
      
      // Count query chain
      const countChain: Record<string, any> = {
        count: () => countChain,
        from: () => countChain,
      };
      countChain.where = jest.fn().mockReturnValue(countChain);
      (countChain as any).then = (resolve: any) => Promise.resolve([{ count: '1' }]).then(resolve);
      
      let callCount = 0;
      mockGetConnection.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return mainChain;
        return countChain;
      });

      const context = makeContext();
      await listProducts(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
    });

    it('applies filters correctly', async () => {
      const products = [{ id: 1, name: 'Product 1', sku: 'SKU001' }];
      
      const mainChain: Record<string, any> = {
        select: () => mainChain,
        from: () => mainChain,
        leftJoin: () => mainChain,
        orderBy: () => mainChain,
        offset: () => mainChain,
        limit: () => mainChain,
      };
      mainChain.where = jest.fn().mockReturnValue(mainChain);
      (mainChain as any).then = (resolve: any) => Promise.resolve(products).then(resolve);
      
      const countChain: Record<string, any> = {
        count: () => countChain,
        from: () => countChain,
      };
      countChain.where = jest.fn().mockReturnValue(countChain);
      (countChain as any).then = (resolve: any) => Promise.resolve([{ count: '1' }]).then(resolve);
      
      let callCount = 0;
      mockGetConnection.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return mainChain;
        return countChain;
      });

      const context = makeContext();
      await listProducts(context, makeRequest({ 
        query: { search: 'test', id_category: '1', id_origin: '2', type: 'MP' } 
      }));
      expect(context.res!.status).toBe(200);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => { throw new Error('DB error'); });

      const context = makeContext();
      await listProducts(context, makeRequest({ query: {} }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('getProduct', () => {
    it('returns 400 for invalid productId', async () => {
      const context = makeContext();
      await getProduct(context, makeRequest({}), 'invalid');
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.message).toBe('ID de producto inválido');
    });

    it('returns 404 when product not found', async () => {
      const baseChain: Record<string, any> = {
        select: () => baseChain,
        from: () => baseChain,
        leftJoin: () => baseChain,
      };
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      baseChain.first = jest.fn().mockResolvedValue(null);
      mockGetConnection.mockReturnValue(baseChain);

      const context = makeContext();
      await getProduct(context, makeRequest({}), '999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 200 with product data for MP type', async () => {
      const product = { id: 1, name: 'Product 1', sku: 'SKU001', type: 'MP' };
      const baseChain: Record<string, any> = {
        select: () => baseChain,
        from: () => baseChain,
        leftJoin: () => baseChain,
        join: () => baseChain,
      };
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      baseChain.first = jest.fn().mockResolvedValue(product);
      mockGetConnection.mockReturnValue(baseChain);

      const context = makeContext();
      await getProduct(context, makeRequest({}), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.data.name).toBe('Product 1');
    });

    it('returns 200 with recipe for PF product', async () => {
      const product = { id: 1, name: 'Product 1', sku: 'SKU001', type: 'PF' };
      const recipe = { receipe_id: 1, receipe_name: 'Recipe 1', receipe_description: 'Desc' };
      const materials = [{ material_id: 2, material_name: 'Material 1' }];
      
      let callCount = 0;
      const baseChain: Record<string, any> = {
        select: () => baseChain,
        from: () => baseChain,
        leftJoin: () => baseChain,
        join: () => baseChain,
      };
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      baseChain.first = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(product);
        if (callCount === 2) return Promise.resolve(recipe);
        return Promise.resolve(null);
      });
      (baseChain as any).then = (resolve: any) => Promise.resolve(materials).then(resolve);
      mockGetConnection.mockReturnValue(baseChain);

      const context = makeContext();
      await getProduct(context, makeRequest({}), '1');
      expect(context.res!.status).toBe(200);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => { throw new Error('DB error'); });

      const context = makeContext();
      await getProduct(context, makeRequest({}), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('createProduct', () => {
    it('returns 400 for invalid input', async () => {
      const context = makeContext();
      await createProduct(context, makeRequest({ body: { name: 'A' } }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when SKU already exists', async () => {
      const baseChain: Record<string, any> = {
        select: () => baseChain,
        from: () => baseChain,
        where: () => baseChain,
      };
      baseChain.first = jest.fn().mockResolvedValue({ id: 1 });
      mockGetConnection.mockReturnValue(baseChain);

      const context = makeContext();
      await createProduct(context, makeRequest({
        body: {
          name: 'Test Product',
          sku: 'EXISTING',
          id_origin: 1,
          id_measure: 1,
          price: 10,
        },
      }));
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.message).toBe('El SKU ya está registrado');
    });

    it('returns 201 when product created successfully', async () => {
      const baseChain: Record<string, any> = {
        select: () => baseChain,
        from: () => baseChain,
        where: () => baseChain,
      };
      baseChain.first = jest.fn().mockResolvedValue(null);
      mockGetConnection.mockReturnValue(baseChain);
      mockCreate.mockResolvedValue({ id: 1, name: 'Test Product', sku: 'SKU001', quantity: 10, min_stock: 5 });

      const context = makeContext();
      await createProduct(context, makeRequest({
        body: {
          name: 'Test Product',
          sku: 'SKU001',
          id_origin: 1,
          id_measure: 1,
          price: 10,
        },
      }));
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.message).toBe('Producto creado exitosamente');
    });

    it('generates stock alert when stock is low', async () => {
      const baseChain: Record<string, any> = {
        select: () => baseChain,
        from: () => baseChain,
        where: () => baseChain,
      };
      baseChain.first = jest.fn().mockResolvedValue(null);
      mockGetConnection.mockReturnValue(baseChain);
      mockCreate.mockResolvedValue({ id: 1, name: 'Test', sku: 'SKU', quantity: 0, min_stock: 5 });

      const context = makeContext();
      await createProduct(context, makeRequest({
        body: {
          name: 'Test Product',
          sku: 'SKU001',
          id_origin: 1,
          id_measure: 1,
          price: 10,
          quantity: 0,
          min_stock: 5,
        },
      }));
      expect(context.res!.status).toBe(201);
    });

    it('returns 500 on database error', async () => {
      const baseChain: Record<string, any> = {
        select: () => baseChain,
        from: () => baseChain,
        where: () => baseChain,
      };
      baseChain.first = jest.fn().mockResolvedValue(null);
      mockGetConnection.mockReturnValue(baseChain);
      mockCreate.mockRejectedValue(new Error('DB error'));

      const context = makeContext();
      await createProduct(context, makeRequest({
        body: {
          name: 'Test Product',
          sku: 'SKU001',
          id_origin: 1,
          id_measure: 1,
          price: 10,
        },
      }));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('updateProduct', () => {
    it('returns 400 for invalid productId', async () => {
      const context = makeContext();
      await updateProduct(context, makeRequest({ body: { price: 10 } }), 'invalid');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when product not found', async () => {
      mockFindById.mockResolvedValue(null);

      const context = makeContext();
      await updateProduct(context, makeRequest({ body: { price: 10 } }), '999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 400 for invalid input', async () => {
      mockFindById.mockResolvedValue({ id: 1, type: 'PF' });

      const context = makeContext();
      await updateProduct(context, makeRequest({ body: { name: 'A' } }), '1');
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when SKU already exists', async () => {
      mockFindById.mockResolvedValue({ id: 1, sku: 'OLD', type: 'PF' });
      
      const baseChain: Record<string, any> = {
        select: () => baseChain,
        from: () => baseChain,
      };
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      baseChain.first = jest.fn().mockResolvedValue({ id: 2 });
      mockGetConnection.mockReturnValue(baseChain);

      const context = makeContext();
      await updateProduct(context, makeRequest({ body: { sku: 'EXISTING', price: 10 } }), '1');
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.message).toBe('El SKU ya está registrado en otro producto');
    });

    it('returns 200 when product updated successfully', async () => {
      mockFindById.mockResolvedValue({ id: 1, sku: 'SKU001', type: 'PF' });
      mockUpdate.mockResolvedValue({ id: 1, name: 'Updated', quantity: 20, min_stock: 5 });
      
      const baseChain: Record<string, any> = {
        select: () => baseChain,
        from: () => baseChain,
        whereRaw: () => baseChain,
        update: jest.fn().mockResolvedValue(1),
      };
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      baseChain.first = jest.fn().mockResolvedValue(null);
      mockGetConnection.mockReturnValue(baseChain);

      const context = makeContext();
      await updateProduct(context, makeRequest({ body: { name: 'Updated', price: 10 } }), '1');
      expect(context.res!.status).toBe(200);
    });

    it('returns 500 when update fails', async () => {
      mockFindById.mockResolvedValue({ id: 1, sku: 'SKU001', type: 'PF' });
      mockUpdate.mockResolvedValue(null);

      const context = makeContext();
      await updateProduct(context, makeRequest({ body: { name: 'Updated', price: 10 } }), '1');
      expect(context.res!.status).toBe(500);
    });

    it('returns 500 on database error', async () => {
      mockFindById.mockRejectedValue(new Error('DB error'));

      const context = makeContext();
      await updateProduct(context, makeRequest({ body: { price: 10 } }), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('deleteProduct', () => {
    it('returns 400 for invalid productId', async () => {
      const context = makeContext();
      await deleteProduct(context, makeRequest({}), 'invalid');
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when product not found', async () => {
      mockFindById.mockResolvedValue(null);

      const context = makeContext();
      await deleteProduct(context, makeRequest({}), '999');
      expect(context.res!.status).toBe(404);
    });

    it('returns 200 when product deleted successfully', async () => {
      mockFindById.mockResolvedValue({ id: 1 });
      mockUpdate.mockResolvedValue({ id: 1, is_active: false });

      const context = makeContext();
      await deleteProduct(context, makeRequest({}), '1');
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.message).toBe('Producto eliminado exitosamente');
    });

    it('returns 500 on database error', async () => {
      mockFindById.mockRejectedValue(new Error('DB error'));

      const context = makeContext();
      await deleteProduct(context, makeRequest({}), '1');
      expect(context.res!.status).toBe(500);
    });
  });

  describe('checkStockAlerts', () => {
    it('returns 200 with low stock products', async () => {
      const products = [{ id: 1, name: 'Low Stock', quantity: 2, min_stock: 5 }];
      const baseChain: Record<string, any> = {
        select: () => baseChain,
        from: () => baseChain,
        leftJoin: () => baseChain,
      };
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      baseChain.whereRaw = jest.fn().mockReturnValue(baseChain);
      (baseChain as any).then = (resolve: any) => Promise.resolve(products).then(resolve);
      mockGetConnection.mockReturnValue(baseChain);

      const context = makeContext();
      await checkStockAlerts(context, makeRequest({}));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.data.lowStockProducts).toBe(1);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => { throw new Error('DB error'); });

      const context = makeContext();
      await checkStockAlerts(context, makeRequest({}));
      expect(context.res!.status).toBe(500);
    });
  });

  describe('stockOperation', () => {
    it('returns 400 for invalid input', async () => {
      const context = makeContext();
      await stockOperation(context, makeRequest({ body: {} }));
      expect(context.res!.status).toBe(400);
    });

    it('returns 404 when product not found', async () => {
      const baseChain: Record<string, any> = {
        select: () => baseChain,
        from: () => baseChain,
      };
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      baseChain.first = jest.fn().mockResolvedValue(null);
      mockGetConnection.mockReturnValue(baseChain);

      const context = makeContext();
      await stockOperation(context, makeRequest({
        body: { id_product: 999, operation_type: 'in', quantity: 10 },
      }));
      expect(context.res!.status).toBe(404);
    });

    it('returns 400 when insufficient stock for out operation', async () => {
      const product = { id: 1, name: 'Product', quantity: 5, min_stock: 2 };
      const baseChain: Record<string, any> = {
        select: () => baseChain,
        from: () => baseChain,
      };
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      baseChain.first = jest.fn().mockResolvedValue(product);
      mockGetConnection.mockReturnValue(baseChain);

      const context = makeContext();
      await stockOperation(context, makeRequest({
        body: { id_product: 1, operation_type: 'out', quantity: 10 },
      }));
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.message).toBe('No hay suficiente stock para realizar esta operación');
    });

    it('returns 200 for successful in operation', async () => {
      const product = { id: 1, name: 'Product', sku: 'SKU', quantity: 5, min_stock: 2 };
      const baseChain: Record<string, any> = {
        select: () => baseChain,
        from: () => baseChain,
      };
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      baseChain.first = jest.fn().mockResolvedValue(product);
      mockGetConnection.mockReturnValue(baseChain);
      mockUpdate.mockResolvedValue({ ...product, quantity: 15 });
      mockCreate.mockResolvedValue({ id: 1 });

      const context = makeContext();
      await stockOperation(context, makeRequest({
        body: { id_product: 1, operation_type: 'in', quantity: 10 },
      }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.data.product.newStock).toBe(15);
    });

    it('returns 200 for successful out operation', async () => {
      const product = { id: 1, name: 'Product', sku: 'SKU', quantity: 15, min_stock: 2 };
      const baseChain: Record<string, any> = {
        select: () => baseChain,
        from: () => baseChain,
      };
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      baseChain.first = jest.fn().mockResolvedValue(product);
      mockGetConnection.mockReturnValue(baseChain);
      mockUpdate.mockResolvedValue({ ...product, quantity: 5 });
      mockCreate.mockResolvedValue({ id: 1 });

      const context = makeContext();
      await stockOperation(context, makeRequest({
        body: { id_product: 1, operation_type: 'out', quantity: 10 },
      }));
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.data.product.newStock).toBe(5);
    });

    it('generates alert when stock goes low after operation', async () => {
      const product = { id: 1, name: 'Product', sku: 'SKU', quantity: 10, min_stock: 8 };
      const baseChain: Record<string, any> = {
        select: () => baseChain,
        from: () => baseChain,
      };
      baseChain.where = jest.fn().mockReturnValue(baseChain);
      baseChain.first = jest.fn().mockResolvedValue(product);
      mockGetConnection.mockReturnValue(baseChain);
      mockUpdate.mockResolvedValue({ ...product, quantity: 5 });
      mockCreate.mockResolvedValue({ id: 1 });

      const context = makeContext();
      await stockOperation(context, makeRequest({
        body: { id_product: 1, operation_type: 'out', quantity: 5 },
      }));
      expect(context.res!.status).toBe(200);
    });

    it('returns 500 on database error', async () => {
      mockGetConnection.mockImplementation(() => { throw new Error('DB error'); });

      const context = makeContext();
      await stockOperation(context, makeRequest({
        body: { id_product: 1, operation_type: 'in', quantity: 10 },
      }));
      expect(context.res!.status).toBe(500);
    });
  });
});
