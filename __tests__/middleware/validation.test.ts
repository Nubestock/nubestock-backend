jest.mock('../../src/config/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import Joi from 'joi';
import {
  validateRequest,
  validateQuery,
  validateParams,
  commonSchemas,
} from '../../src/middleware/validation';

function mockReq(body: any = {}, query: any = {}, params: any = {}) {
  return { body, query, params } as any;
}

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('validation middleware', () => {
  describe('validateRequest', () => {
    it('calls next() when body is valid', () => {
      const schema = Joi.object({ name: Joi.string().required() });
      const middleware = validateRequest(schema);
      const req = mockReq({ name: 'test' });
      const res = mockRes();
      const next = jest.fn();
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.body.name).toBe('test');
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 400 and errors when body is invalid', () => {
      const schema = Joi.object({ name: Joi.string().required() });
      const middleware = validateRequest(schema);
      const req = mockReq({});
      const res = mockRes();
      const next = jest.fn();
      middleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Error de validación',
          errors: expect.any(Array),
        })
      );
    });

    it('strips unknown keys when valid', () => {
      const schema = Joi.object({ name: Joi.string().required() });
      const middleware = validateRequest(schema);
      const req = mockReq({ name: 'a', extra: 'b' });
      const res = mockRes();
      const next = jest.fn();
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.body).toEqual({ name: 'a' });
    });
  });

  describe('validateQuery', () => {
    it('calls next() when query is valid', () => {
      const schema = Joi.object({ page: Joi.number().default(1) });
      const middleware = validateQuery(schema);
      const req = mockReq({}, { page: '1' });
      const res = mockRes();
      const next = jest.fn();
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 400 when query is invalid', () => {
      const schema = Joi.object({ page: Joi.number().min(1).required() });
      const middleware = validateQuery(schema);
      const req = mockReq({}, {});
      const res = mockRes();
      const next = jest.fn();
      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Error de validación de parámetros' })
      );
    });
  });

  describe('validateParams', () => {
    it('calls next() when params are valid', () => {
      const schema = Joi.object({ id: Joi.string().uuid().required() });
      const middleware = validateParams(schema);
      const req = mockReq({}, {}, { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' });
      const res = mockRes();
      const next = jest.fn();
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('returns 400 when params are invalid', () => {
      const schema = Joi.object({ id: Joi.string().uuid().required() });
      const middleware = validateParams(schema);
      const req = mockReq({}, {}, { id: 'not-a-uuid' });
      const res = mockRes();
      const next = jest.fn();
      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Error de validación de parámetros' })
      );
    });
  });

  describe('commonSchemas', () => {
    it('uuid validates correct uuid', () => {
      const { error } = commonSchemas.uuid.validate('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(error).toBeUndefined();
    });

    it('uuid rejects invalid', () => {
      const { error } = commonSchemas.uuid.validate('not-uuid');
      expect(error).toBeDefined();
    });

    it('pagination has defaults', () => {
      const { value } = commonSchemas.pagination.validate({});
      expect(value.page).toBe(1);
      expect(value.limit).toBe(10);
      expect(value.sortOrder).toBe('desc');
    });

    it('login requires email and password', () => {
      const { error } = commonSchemas.login.validate({});
      expect(error).toBeDefined();
      const { error: e2 } = commonSchemas.login.validate({
        email: 'a@b.com',
        password: '12345678',
      });
      expect(e2).toBeUndefined();
    });
  });
});
