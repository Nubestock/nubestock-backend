jest.mock('../../src/config/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../src/config/environment', () => ({
  config: {
    security: { bcryptRounds: 10 },
    jwt: { secret: 'test-secret', expiresIn: '1h', refreshExpiresIn: '7d' },
  },
}));

const mockGetConnection = jest.fn();
const mockCreate = jest.fn();
const mockSetSchema = jest.fn();
jest.mock('../../src/config/database', () => ({
  Database: {
    getInstance: () => ({
      getConnection: () => mockGetConnection(),
      create: mockCreate,
      setSchema: mockSetSchema,
    }),
  },
}));

const mockSendWelcomeEmail = jest.fn();
jest.mock('../../src/services/emailService', () => ({
  emailService: { sendWelcomeEmail: mockSendWelcomeEmail },
}));

import { AuthService } from '../../src/services/authService';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetSchema.mockResolvedValue(undefined);
    mockGetConnection.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({ first: () => Promise.resolve(null) }),
        }),
      }),
    });
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
  });

  describe('refreshToken', () => {
    it('throws when token is invalid', async () => {
      await expect(service.refreshToken('invalid-token')).rejects.toThrow();
    });
  });

  describe('logout', () => {
    it('completes without throwing', async () => {
      await expect(service.logout('1')).resolves.not.toThrow();
    });
  });
});
