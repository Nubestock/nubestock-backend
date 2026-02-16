jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock('../../src/config/environment', () => ({
  config: {
    email: {
      enabled: false,
      connectionString: '',
      from: '',
    },
  },
}));

import { EmailService } from '../../src/services/emailService';

describe('emailService', () => {
  it('sendEmail returns false when service is disabled', async () => {
    const service = new EmailService();
    const result = await service.sendEmail({
      to: 'test@test.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });
    expect(result).toBe(false);
  });
});
