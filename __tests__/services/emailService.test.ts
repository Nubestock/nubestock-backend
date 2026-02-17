jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));

const mockBeginSend = jest.fn();
const mockPoller = {
  pollUntilDone: jest.fn(),
};

jest.mock('@azure/communication-email', () => ({
  EmailClient: jest.fn().mockImplementation(() => ({
    beginSend: mockBeginSend,
  })),
}));

const mockConfig = {
  email: {
    enabled: false,
    connectionString: '',
    from: '',
  },
  app: {
    frontendUrl: 'http://localhost:3000',
    resetPasswordPath: '/reset-password',
  },
};

jest.mock('../../src/config/environment', () => ({
  config: mockConfig,
}));

import { EmailService } from '../../src/services/emailService';

describe('emailService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.email.enabled = false;
    mockConfig.email.connectionString = '';
    mockConfig.email.from = '';
  });

  describe('sendEmail', () => {
    it('returns false when service is disabled', async () => {
      const service = new EmailService();
      const result = await service.sendEmail({
        to: 'test@test.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });
      expect(result).toBe(false);
    });

    it('returns false when connection string is missing', async () => {
      mockConfig.email.enabled = true;
      mockConfig.email.connectionString = '';
      const service = new EmailService();
      const result = await service.sendEmail({
        to: 'test@test.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });
      expect(result).toBe(false);
    });

    it('sends email successfully when service is enabled', async () => {
      mockConfig.email.enabled = true;
      mockConfig.email.connectionString = 'endpoint=https://test.communication.azure.com/;accesskey=test';
      mockConfig.email.from = 'test@test.com';
      
      mockBeginSend.mockResolvedValue(mockPoller);
      mockPoller.pollUntilDone.mockResolvedValue({ id: 'message-id-123' });
      
      const service = new EmailService();
      const result = await service.sendEmail({
        to: 'test@test.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });
      expect(result).toBe(true);
      expect(mockBeginSend).toHaveBeenCalled();
    });

    it('throws error when email sending fails', async () => {
      mockConfig.email.enabled = true;
      mockConfig.email.connectionString = 'endpoint=https://test.communication.azure.com/;accesskey=test';
      mockConfig.email.from = 'test@test.com';
      
      mockBeginSend.mockRejectedValue(new Error('Send failed'));
      
      const service = new EmailService();
      await expect(service.sendEmail({
        to: 'test@test.com',
        subject: 'Test',
        html: '<p>Test</p>',
      })).rejects.toThrow();
    });
  });

  describe('sendWelcomeEmail', () => {
    it('calls sendEmail with correct parameters', async () => {
      mockConfig.email.enabled = true;
      mockConfig.email.connectionString = 'endpoint=https://test.communication.azure.com/;accesskey=test';
      mockConfig.email.from = 'test@test.com';
      
      mockBeginSend.mockResolvedValue(mockPoller);
      mockPoller.pollUntilDone.mockResolvedValue({ id: 'message-id-123' });
      
      const service = new EmailService();
      const result = await service.sendWelcomeEmail('user@test.com', 'Test User', 'temp123');
      expect(result).toBe(true);
      expect(mockBeginSend).toHaveBeenCalled();
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('calls sendEmail with reset token', async () => {
      mockConfig.email.enabled = true;
      mockConfig.email.connectionString = 'endpoint=https://test.communication.azure.com/;accesskey=test';
      mockConfig.email.from = 'test@test.com';
      
      mockBeginSend.mockResolvedValue(mockPoller);
      mockPoller.pollUntilDone.mockResolvedValue({ id: 'message-id-123' });
      
      const service = new EmailService();
      const result = await service.sendPasswordResetEmail('user@test.com', 'Test User', 'reset-token-123');
      expect(result).toBe(true);
      expect(mockBeginSend).toHaveBeenCalled();
    });
  });
});
