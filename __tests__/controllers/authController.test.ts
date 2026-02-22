jest.mock('../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const mockLogin = jest.fn();
const mockRegister = jest.fn();
const mockRefreshToken = jest.fn();
const mockLogout = jest.fn();
const mockChangePassword = jest.fn();
const mockRequestPasswordReset = jest.fn();
const mockResetPassword = jest.fn();
const mockRequestPasswordResetByAdmin = jest.fn();
jest.mock('../../src/services/authService', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    login: mockLogin,
    register: mockRegister,
    refreshToken: mockRefreshToken,
    logout: mockLogout,
    changePassword: mockChangePassword,
    requestPasswordReset: mockRequestPasswordReset,
    resetPassword: mockResetPassword,
    requestPasswordResetByAdmin: mockRequestPasswordResetByAdmin,
  })),
}));

const mockRequireAuth = jest.fn();
const mockRequireAdmin = jest.fn();
jest.mock('../../src/middleware/authMiddleware', () => ({
  requireAuth: (req: any) => mockRequireAuth(req),
  requireAdmin: (req: any) => mockRequireAdmin(req),
}));

import {
  login,
  register,
  refresh,
  logout,
  changePassword,
  resetPassword,
  adminResetPassword,
} from '../../src/controllers/authController';
import { makeContext, makeRequest } from '../helpers/context';

describe('authController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockReturnValue({ success: true, user: { userId: 1 } });
    mockRequireAdmin.mockReturnValue({ success: true, user: { userId: 1, userEmail: 'admin@test.com' } });
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
        body: { name: 'Test', email: 'a@b.com', password: 'pass1234' },
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
    it('returns 401 when user is not authenticated', async () => {
      mockRequireAuth.mockReturnValue({ success: false, error: 'Token inválido' });
      const context = makeContext();
      const req = makeRequest();
      await logout(context, req);
      expect(context.res!.status).toBe(401);
    });

    it('returns 200 when logout succeeds', async () => {
      mockLogout.mockResolvedValue(undefined);
      const context = makeContext();
      const req = makeRequest();
      await logout(context, req);
      expect(context.res!.status).toBe(200);
    });

    it('returns 500 on error', async () => {
      mockLogout.mockRejectedValue(new Error('Database error'));
      const context = makeContext();
      const req = makeRequest();
      await logout(context, req);
      expect(context.res!.status).toBe(500);
    });
  });

  describe('changePassword', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockRequireAuth.mockReturnValue({ success: false, error: 'Token inválido' });
      const context = makeContext();
      const req = makeRequest({ body: { currentPassword: 'old', newPassword: 'newpass123' } });
      await changePassword(context, req);
      expect(context.res!.status).toBe(401);
    });

    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      const req = makeRequest({ body: { currentPassword: 'old' } }); // missing newPassword
      await changePassword(context, req);
      expect(context.res!.status).toBe(400);
    });

    it('returns 400 when newPassword is too short', async () => {
      const context = makeContext();
      const req = makeRequest({ body: { currentPassword: 'old', newPassword: 'short' } });
      await changePassword(context, req);
      expect(context.res!.status).toBe(400);
    });

    it('returns 200 when password change succeeds', async () => {
      mockChangePassword.mockResolvedValue(undefined);
      const context = makeContext();
      const req = makeRequest({ body: { currentPassword: 'oldpass123', newPassword: 'newpass123' } });
      await changePassword(context, req);
      expect(context.res!.status).toBe(200);
      expect(mockChangePassword).toHaveBeenCalledWith(1, 'oldpass123', 'newpass123');
    });

    it('returns 400 when password change fails', async () => {
      mockChangePassword.mockRejectedValue(new Error('Contraseña actual incorrecta'));
      const context = makeContext();
      const req = makeRequest({ body: { currentPassword: 'wrong', newPassword: 'newpass123' } });
      await changePassword(context, req);
      expect(context.res!.status).toBe(400);
    });
  });

  describe('resetPassword', () => {
    it('returns 400 when email is missing (POST)', async () => {
      const context = makeContext();
      const req = makeRequest({ method: 'POST', body: {} });
      await resetPassword(context, req);
      expect(context.res!.status).toBe(400);
    });

    it('returns 200 when password reset request succeeds (POST)', async () => {
      mockRequestPasswordReset.mockResolvedValue(undefined);
      const context = makeContext();
      const req = makeRequest({ method: 'POST', body: { email: 'user@test.com' } });
      await resetPassword(context, req);
      expect(context.res!.status).toBe(200);
      expect(mockRequestPasswordReset).toHaveBeenCalledWith('user@test.com');
    });

    it('returns 400 when body is invalid (PUT)', async () => {
      const context = makeContext();
      const req = makeRequest({ method: 'PUT', body: { token: 'abc' } }); // missing newPassword
      await resetPassword(context, req);
      expect(context.res!.status).toBe(400);
    });

    it('returns 200 when password reset succeeds (PUT)', async () => {
      mockResetPassword.mockResolvedValue(undefined);
      const context = makeContext();
      const req = makeRequest({
        method: 'PUT',
        body: { token: 'reset-token', newPassword: 'newpass123' },
      });
      await resetPassword(context, req);
      expect(context.res!.status).toBe(200);
      expect(mockResetPassword).toHaveBeenCalledWith('reset-token', 'newpass123');
    });

    it('returns 405 when method is not POST or PUT', async () => {
      const context = makeContext();
      const req = makeRequest({ method: 'GET', body: {} });
      await resetPassword(context, req);
      expect(context.res!.status).toBe(405);
    });

    it('returns 400 when token is invalid (PUT)', async () => {
      mockResetPassword.mockRejectedValue(new Error('Token de restablecimiento inválido o ya utilizado'));
      const context = makeContext();
      const req = makeRequest({
        method: 'PUT',
        body: { token: 'invalid-token', newPassword: 'newpass123' },
      });
      await resetPassword(context, req);
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.message).toBe('Token de restablecimiento inválido o ya utilizado');
    });

    it('returns 400 when token is expired (PUT)', async () => {
      mockResetPassword.mockRejectedValue(new Error('Token de restablecimiento expirado'));
      const context = makeContext();
      const req = makeRequest({
        method: 'PUT',
        body: { token: 'expired-token', newPassword: 'newpass123' },
      });
      await resetPassword(context, req);
      expect(context.res!.status).toBe(400);
      expect(context.res!.body.message).toContain('expirado');
    });

    it('returns 400 when password is too short (PUT)', async () => {
      mockResetPassword.mockRejectedValue(new Error('La contraseña debe tener al menos 8 caracteres'));
      const context = makeContext();
      const req = makeRequest({
        method: 'PUT',
        body: { token: 'valid-token', newPassword: 'short' },
      });
      await resetPassword(context, req);
      expect(context.res!.status).toBe(400);
    });

    it('returns 500 on generic error (PUT)', async () => {
      mockResetPassword.mockRejectedValue(new Error('Database error'));
      const context = makeContext();
      const req = makeRequest({
        method: 'PUT',
        body: { token: 'token', newPassword: 'newpass123' },
      });
      await resetPassword(context, req);
      expect(context.res!.status).toBe(500);
    });

    it('returns 400 when error message includes Token (PUT)', async () => {
      mockResetPassword.mockRejectedValue(new Error('Token error occurred'));
      const context = makeContext();
      const req = makeRequest({
        method: 'PUT',
        body: { token: 'token', newPassword: 'newpass123' },
      });
      await resetPassword(context, req);
      expect(context.res!.status).toBe(400);
    });
  });

  describe('adminResetPassword', () => {
    it('returns 403 when user is not admin', async () => {
      mockRequireAdmin.mockReturnValue({ success: false, error: 'Se requieren permisos de administrador' });
      const context = makeContext();
      const req = makeRequest({ body: { email: 'user@test.com' } });
      await adminResetPassword(context, req);
      expect(context.res!.status).toBe(403);
    });

    it('returns 400 when body is invalid', async () => {
      const context = makeContext();
      const req = makeRequest({ body: { email: 'invalid-email' } });
      await adminResetPassword(context, req);
      expect(context.res!.status).toBe(400);
    });

    it('returns 200 when admin reset password request succeeds', async () => {
      mockRequestPasswordResetByAdmin.mockResolvedValue({
        userId: 2,
        email: 'user@test.com',
        name: 'Test User',
      });
      const context = makeContext();
      const req = makeRequest({ body: { email: 'user@test.com' } });
      await adminResetPassword(context, req);
      expect(context.res!.status).toBe(200);
      expect(mockRequestPasswordResetByAdmin).toHaveBeenCalledWith('user@test.com', 1);
      expect(context.res!.body.data).toBeDefined();
      expect(context.res!.body.requestedBy).toBeDefined();
    });

    it('returns 404 when user not found', async () => {
      mockRequestPasswordResetByAdmin.mockRejectedValue(new Error('Usuario no encontrado o inactivo'));
      const context = makeContext();
      const req = makeRequest({ body: { email: 'notfound@test.com' } });
      await adminResetPassword(context, req);
      expect(context.res!.status).toBe(404);
    });

    it('returns 500 on generic error', async () => {
      mockRequestPasswordResetByAdmin.mockRejectedValue(new Error('Database error'));
      const context = makeContext();
      const req = makeRequest({ body: { email: 'user@test.com' } });
      await adminResetPassword(context, req);
      expect(context.res!.status).toBe(500);
    });
  });
});
