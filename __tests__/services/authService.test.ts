jest.mock('../../src/config/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../src/config/environment', () => ({
  config: {
    security: { 
      bcryptRounds: 10,
      passwordResetTokenExpiry: 3600000, // 1 hora
    },
    jwt: { secret: 'test-secret', expiresIn: '1h', refreshExpiresIn: '7d' },
  },
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn((password, rounds) => Promise.resolve(`hashed_${password}`)),
  compare: jest.fn((password, hash) => Promise.resolve(password === 'correct' || hash.includes(password))),
}));

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn((token, secret) => {
    if (token === 'valid-refresh-token') {
      return { userId: '1', type: 'refresh' };
    }
    if (token === 'invalid-type-token') {
      return { userId: '1', type: 'access' };
    }
    throw new Error('Invalid token');
  }),
  sign: jest.fn((payload, secret, options) => `token_${payload.userId}_${payload.type}`),
}));

const mockGetConnection = jest.fn();
const mockCreate = jest.fn();
const mockSetSchema = jest.fn();
const mockFindById = jest.fn();
const mockUpdate = jest.fn();
const mockTransaction = jest.fn();
jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => mockGetConnection(),
      create: mockCreate,
      setSchema: mockSetSchema,
      findById: mockFindById,
      update: mockUpdate,
      transaction: mockTransaction,
    }),
  },
}));

const mockSendWelcomeEmail = jest.fn();
const mockSendPasswordResetEmail = jest.fn();
jest.mock('../../src/services/emailService', () => ({
  emailService: { 
    sendWelcomeEmail: mockSendWelcomeEmail,
    sendPasswordResetEmail: mockSendPasswordResetEmail,
  },
}));

import { AuthService } from '../../src/services/authService';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetSchema.mockResolvedValue(undefined);
    mockGetConnection.mockReset();
    mockFindById.mockReset();
    mockUpdate.mockReset();
    mockTransaction.mockReset();
    mockCreate.mockReset();
    mockSendWelcomeEmail.mockReset();
    mockSendPasswordResetEmail.mockReset();
    service = new AuthService();
  });

  describe('login', () => {
    it('throws when user not found', async () => {
      mockGetConnection.mockReturnValue({
        select: () => ({
          from: () => ({
            where: () => ({ where: () => ({ first: () => Promise.resolve(null) }) }),
          }),
        }),
      });
      await expect(service.login({ email: 'a@b.com', password: 'pass' })).rejects.toThrow();
    });

    it('throws when password is incorrect', async () => {
      const bcrypt = require('bcryptjs');
      bcrypt.compare.mockResolvedValueOnce(false);
      
      // Mock para la búsqueda del usuario en login
      mockGetConnection.mockReturnValueOnce({
        select: () => ({
          from: () => ({
            where: () => ({ 
              where: () => ({ 
                first: () => Promise.resolve({ 
                  id: 1, 
                  email: 'test@test.com', 
                  pwd_hash: 'hashed_correct',
                  is_active: true,
                }) 
              }) 
            }),
          }),
        }),
      });
      
      await expect(service.login({ email: 'test@test.com', password: 'wrong' })).rejects.toThrow('Credenciales inválidas');
    });

    it('returns login response when credentials are valid', async () => {
      const bcrypt = require('bcryptjs');
      bcrypt.compare.mockResolvedValueOnce(true);
      
      // Mock para la búsqueda del usuario en login
      mockGetConnection.mockReturnValueOnce({
        select: () => ({
          from: () => ({
            where: () => ({ 
              where: () => ({ 
                first: () => Promise.resolve({ 
                  id: 1, 
                  email: 'test@test.com', 
                  pwd_hash: 'hashed_correct',
                  is_active: true,
                }) 
              }) 
            }),
          }),
        }),
      });
      
      // Mock para updateLastLogin
      mockUpdate.mockResolvedValueOnce({});
      
      // Mock para getUserRolesAndPermissions (roles)
      mockGetConnection.mockReturnValueOnce({
        select: () => ({
          from: () => ({
            join: () => ({
              where: () => ({
                where: () => ({
                  where: () => Promise.resolve([]),
                }),
              }),
            }),
          }),
        }),
      });
      
      // Mock para getUserRolesAndPermissions (permisos)
      mockGetConnection.mockReturnValueOnce({
        select: () => ({
          from: () => ({
            join: () => ({
              join: () => ({
                where: () => ({
                  where: () => ({
                    where: () => ({
                      where: () => ({
                        distinct: () => Promise.resolve([]),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      });
      
      const result = await service.login({ email: 'test@test.com', password: 'correct' });
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
      expect(result.user.email).toBe('test@test.com');
    });
  });

  describe('register', () => {
    it('throws when email already exists', async () => {
      mockGetConnection.mockReturnValue({
        select: () => ({
          from: () => ({
            where: () => ({ first: () => Promise.resolve({ id: 1 }) }),
          }),
        }),
      });
      await expect(
        service.register({
          name: 'Test',
          email: 'exists@b.com',
          password: 'pass123',
          phone: '',
        })
      ).rejects.toThrow('El email ya está registrado');
    });

    it('returns user when registration succeeds', async () => {
      // Mock para verificar si el email existe (no existe)
      mockGetConnection.mockReturnValueOnce({
        select: () => ({
          from: () => ({
            where: () => ({ first: () => Promise.resolve(null) }),
          }),
        }),
      });
      
      mockCreate.mockResolvedValue({
        id: 1,
        name: 'Test',
        email: 'new@b.com',
        pwd_hash: 'hash',
        phone: '',
      });
      mockSendWelcomeEmail.mockResolvedValue(true);
      const user = await service.register({
        name: 'Test',
        email: 'new@b.com',
        password: 'pass123',
        phone: '',
      });
      expect(user).toHaveProperty('id', 1);
      expect(user.email).toBe('new@b.com');
    });

    it('handles email service failure gracefully', async () => {
      // Mock para verificar si el email existe (no existe)
      mockGetConnection.mockReturnValueOnce({
        select: () => ({
          from: () => ({
            where: () => ({ first: () => Promise.resolve(null) }),
          }),
        }),
      });
      
      mockCreate.mockResolvedValue({
        id: 1,
        name: 'Test',
        email: 'new@b.com',
        pwd_hash: 'hash',
        phone: '',
      });
      mockSendWelcomeEmail.mockRejectedValue(new Error('Email service error'));
      const user = await service.register({
        name: 'Test',
        email: 'new@b.com',
        password: 'pass123',
        phone: '',
      });
      expect(user).toHaveProperty('id', 1);
    });

    it('handles email service returning false', async () => {
      // Mock para verificar si el email existe (no existe)
      mockGetConnection.mockReturnValueOnce({
        select: () => ({
          from: () => ({
            where: () => ({ first: () => Promise.resolve(null) }),
          }),
        }),
      });
      
      mockCreate.mockResolvedValue({
        id: 1,
        name: 'Test',
        email: 'new@b.com',
        pwd_hash: 'hash',
        phone: '',
      });
      mockSendWelcomeEmail.mockResolvedValue(false);
      const user = await service.register({
        name: 'Test',
        email: 'new@b.com',
        password: 'pass123',
        phone: '',
      });
      expect(user).toHaveProperty('id', 1);
    });
  });

  describe('refreshToken', () => {
    it('throws when token is invalid', async () => {
      await expect(service.refreshToken('invalid-token')).rejects.toThrow();
    });

    it('throws when token type is not refresh', async () => {
      await expect(service.refreshToken('invalid-type-token')).rejects.toThrow('Token de refresh inválido');
    });

    it('throws when user not found or inactive', async () => {
      mockFindById.mockResolvedValue(null);
      // El catch siempre convierte el error en "Token de refresh inválido"
      await expect(service.refreshToken('valid-refresh-token')).rejects.toThrow('Token de refresh inválido');
    });

    it('returns new token when refresh succeeds', async () => {
      mockFindById.mockResolvedValue({ id: 1, is_active: true });
      
      // Mock para getUserRolesAndPermissions (roles) - primera llamada
      mockGetConnection.mockReturnValueOnce({
        select: () => ({
          from: () => ({
            join: () => ({
              where: () => ({
                where: () => ({
                  where: () => Promise.resolve([]),
                }),
              }),
            }),
          }),
        }),
      });
      
      // Mock para getUserRolesAndPermissions (permisos) - segunda llamada
      mockGetConnection.mockReturnValueOnce({
        select: () => ({
          from: () => ({
            join: () => ({
              join: () => ({
                where: () => ({
                  where: () => ({
                    where: () => ({
                      where: () => ({
                        distinct: () => Promise.resolve([]),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      });
      
      const result = await service.refreshToken('valid-refresh-token');
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('expiresIn');
    });
  });

  describe('logout', () => {
    it('completes without throwing', async () => {
      await expect(service.logout('1')).resolves.not.toThrow();
    });
  });

  describe('changePassword', () => {
    it('throws when user not found', async () => {
      mockFindById.mockResolvedValue(null);
      await expect(service.changePassword('1', 'old', 'new')).rejects.toThrow('Usuario no encontrado');
    });

    it('throws when current password is incorrect', async () => {
      const bcrypt = require('bcryptjs');
      bcrypt.compare.mockResolvedValueOnce(false);
      
      mockFindById.mockResolvedValue({ id: 1, pwd_hash: 'hashed_old' });
      await expect(service.changePassword('1', 'wrong', 'new')).rejects.toThrow('Contraseña actual incorrecta');
    });

    it('updates password when current password is correct', async () => {
      const bcrypt = require('bcryptjs');
      bcrypt.compare.mockResolvedValueOnce(true);
      bcrypt.hash.mockResolvedValueOnce('hashed_new');
      
      mockFindById.mockResolvedValue({ id: 1, pwd_hash: 'hashed_old' });
      mockUpdate.mockResolvedValue({});
      
      await expect(service.changePassword('1', 'old', 'new')).resolves.not.toThrow();
      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe('requestPasswordReset', () => {
    it('returns silently when user not found', async () => {
      mockGetConnection.mockReturnValueOnce({
        select: () => ({
          from: () => ({
            where: () => ({ 
              where: () => ({ first: () => Promise.resolve(null) }) 
            }),
          }),
        }),
      });
      
      await expect(service.requestPasswordReset('notfound@test.com')).resolves.not.toThrow();
    });

    it('generates and stores reset token when user exists', async () => {
      // Mock para buscar usuario
      mockGetConnection.mockReturnValueOnce({
        select: () => ({
          from: () => ({
            where: () => ({ 
              where: () => ({ 
                first: () => Promise.resolve({ id: 1, name: 'Test', email: 'test@test.com' }) 
              }) 
            }),
          }),
        }),
      });
      
      // Mock para actualizar tokens existentes
      mockGetConnection.mockReturnValueOnce({
        from: () => ({
          where: () => ({
            where: () => ({
              update: () => Promise.resolve({}),
            }),
          }),
        }),
      });
      
      // Mock para insertar nuevo token
      mockGetConnection.mockReturnValueOnce({
        insert: () => ({
          into: () => Promise.resolve({}),
        }),
      });
      
      mockSendPasswordResetEmail.mockResolvedValue(true);
      
      await expect(service.requestPasswordReset('test@test.com')).resolves.not.toThrow();
    });
  });

  describe('requestPasswordResetByAdmin', () => {
    it('throws when user not found', async () => {
      mockGetConnection.mockReturnValueOnce({
        select: () => ({
          from: () => ({
            where: () => ({ 
              where: () => ({ first: () => Promise.resolve(null) }) 
            }),
          }),
        }),
      });
      
      await expect(service.requestPasswordResetByAdmin('notfound@test.com', 'admin')).rejects.toThrow('Usuario no encontrado');
    });

    it('returns user info when reset token generated', async () => {
      // Mock para buscar usuario
      mockGetConnection.mockReturnValueOnce({
        select: () => ({
          from: () => ({
            where: () => ({ 
              where: () => ({ 
                first: () => Promise.resolve({ id: 1, name: 'Test', email: 'test@test.com' }) 
              }) 
            }),
          }),
        }),
      });
      
      // Mock para actualizar tokens existentes
      mockGetConnection.mockReturnValueOnce({
        from: () => ({
          where: () => ({
            where: () => ({
              update: () => Promise.resolve({}),
            }),
          }),
        }),
      });
      
      // Mock para insertar nuevo token
      mockGetConnection.mockReturnValueOnce({
        insert: () => ({
          into: () => Promise.resolve({}),
        }),
      });
      
      mockSendPasswordResetEmail.mockResolvedValue(true);
      
      const result = await service.requestPasswordResetByAdmin('test@test.com', 'admin');
      expect(result).toHaveProperty('userId');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('name');
    });
  });

  describe('resetPassword', () => {
    it('throws when password is too short', async () => {
      await expect(service.resetPassword('token', 'short')).rejects.toThrow('La contraseña debe tener al menos 8 caracteres');
    });

    it('throws when token not found', async () => {
      mockGetConnection.mockReturnValueOnce({
        select: () => ({
          from: () => ({
            where: () => ({ 
              where: () => ({ first: () => Promise.resolve(null) }) 
            }),
          }),
        }),
      });
      
      await expect(service.resetPassword('invalid-token', 'newpassword123')).rejects.toThrow('Token de restablecimiento inválido');
    });

    it('throws when token expired', async () => {
      const expiredDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 horas atrás
      // Mock para buscar token (debe existir pero estar expirado)
      mockGetConnection.mockReturnValueOnce({
        select: () => ({
          from: () => ({
            where: () => ({ 
              where: () => ({ 
                first: () => Promise.resolve({ 
                  id: 1, 
                  id_user: '1', 
                  expires_at: expiredDate,
                  is_active: true,
                }) 
              }) 
            }),
          }),
        }),
      });
      
      // Mock para marcar token como inactivo (se ejecuta cuando detecta que está expirado)
      mockGetConnection.mockReturnValueOnce({
        from: () => ({
          where: () => ({
            update: () => Promise.resolve({}),
          }),
        }),
      });
      
      await expect(service.resetPassword('expired-token', 'newpassword123')).rejects.toThrow('Token de restablecimiento expirado');
    });

    it('resets password successfully with valid token', async () => {
      const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 horas en el futuro para asegurar que no expire
      const bcrypt = require('bcryptjs');
      bcrypt.hash.mockResolvedValueOnce('hashed_new');
      
      // Mock para buscar token
      mockGetConnection.mockReturnValueOnce({
        select: () => ({
          from: () => ({
            where: () => ({ 
              where: () => ({ 
                first: () => Promise.resolve({ 
                  id: 1, 
                  id_user: '1', 
                  expires_at: futureDate,
                  is_active: true,
                }) 
              }) 
            }),
          }),
        }),
      });
      
      // Mock para buscar usuario
      mockGetConnection.mockReturnValueOnce({
        select: () => ({
          from: () => ({
            where: () => ({ 
              where: () => ({ first: () => Promise.resolve({ id: 1, email: 'test@test.com' }) }) 
            }),
          }),
        }),
      });
      
      // Mock para transaction
      mockTransaction.mockImplementation(async (callback) => {
        const trx = jest.fn((table: string) => ({
          where: () => ({ update: () => Promise.resolve({}) }),
        }));
        return callback(trx);
      });
      
      await expect(service.resetPassword('valid-token', 'newpassword123')).resolves.not.toThrow();
    });
  });
});
