jest.mock('../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const mockLogin = jest.fn();
const mockRegister = jest.fn();
const mockRefreshToken = jest.fn();
const mockLogout = jest.fn();
jest.mock('../../src/services/authService', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    login: mockLogin,
    register: mockRegister,
    refreshToken: mockRefreshToken,
    logout: mockLogout,
  })),
}));

jest.mock('../../src/middleware/authMiddleware', () => ({
  requireAuth: jest.fn().mockReturnValue({ success: true, user: { userId: 1 } }),
  requireAdmin: jest.fn(),
}));

import { login, register, refresh, logout } from '../../src/controllers/authController';
import { makeContext, makeRequest } from '../helpers/context';

describe('authController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      const req = makeRequest({ body: {} });
      await login(context, req);
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.success).toBe(false);
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('returns 200 and data when login succeeds', async () => {
      mockLogin.mockResolvedValue({ accessToken: 'token', refreshToken: 'ref', user: { id: 1 } });
      const context = makeContext();
      const req = makeRequest({
        body: { email: 'a@b.com', password: 'pass123' },
      });
      await login(context, req);
      expect(context.res!.status).toBe(200);
      expect(context.res!.body.success).toBe(true);
      expect(mockLogin).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pass123' });
    });

    it('returns 401 when login throws', async () => {
      mockLogin.mockRejectedValue(new Error('Credenciales inválidas'));
      const context = makeContext();
      const req = makeRequest({ body: { email: 'a@b.com', password: 'wrong' } });
      await login(context, req);
      expect(context.res!.status).toBe(401);
      expect(context.res!.body.success).toBe(false);
    });
  });

  describe('register', () => {
    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      const req = makeRequest({ body: {} });
      await register(context, req);
      expect(context.res!.status).toBe(400);
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('returns 201 and user when register succeeds', async () => {
      const user = { id: 1, name: 'Test', email: 'a@b.com', pwd_hash: 'hash', phone: '' };
      mockRegister.mockResolvedValue(user);
      const context = makeContext();
      const req = makeRequest({
        body: { name: 'Test', email: 'a@b.com', password: 'pass123', phone: '' },
      });
      await register(context, req);
      expect(context.res!.status).toBe(201);
      expect(context.res!.body.success).toBe(true);
      expect(context.res!.body.data).not.toHaveProperty('pwd_hash');
    });
  });

  describe('refresh', () => {
    it('returns 400 when refreshToken is missing', async () => {
      const context = makeContext();
      const req = makeRequest({ body: {} });
      await refresh(context, req);
      expect(context.res!.status).toBe(400);
    });

    it('returns 200 when refresh succeeds', async () => {
      mockRefreshToken.mockResolvedValue({ accessToken: 'new', refreshToken: 'newRef' });
      const context = makeContext();
      const req = makeRequest({ body: { refreshToken: 'oldRef' } });
      await refresh(context, req);
      expect(context.res!.status).toBe(200);
      expect(mockRefreshToken).toHaveBeenCalledWith('oldRef');
    });
  });

  describe('logout', () => {
    it('returns 200 when logout succeeds', async () => {
      mockLogout.mockResolvedValue(undefined);
      const context = makeContext();
      const req = makeRequest();
      await logout(context, req);
      expect(context.res!.status).toBe(200);
    });
  });
});
