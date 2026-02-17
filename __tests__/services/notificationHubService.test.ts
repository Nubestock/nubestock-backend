jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));

const mockCreateOrUpdateInstallation = jest.fn();
const mockSendNotification = jest.fn();

jest.mock('@azure/notification-hubs', () => ({
  NotificationHubsClient: jest.fn().mockImplementation(() => ({
    createOrUpdateInstallation: mockCreateOrUpdateInstallation,
    sendNotification: mockSendNotification,
  })),
  createAppleInstallation: jest.fn((params) => ({ ...params, platform: 'ios' })),
  createFcmV1Installation: jest.fn((params) => ({ ...params, platform: 'android' })),
  createAppleNotification: jest.fn((params) => ({ ...params, type: 'apple' })),
  createFcmV1Notification: jest.fn((params) => ({ ...params, type: 'fcm' })),
}));

const mockConfig = {
  notifications: {
    notificationHubEnabled: false,
    notificationHubConnectionString: '',
    notificationHubName: '',
  },
};

jest.mock('../../src/config/environment', () => ({
  config: mockConfig,
}));

import { sendAlertNotification, registerInstallation } from '../../src/services/notificationHubService';

describe('notificationHubService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.notifications.notificationHubEnabled = false;
    mockConfig.notifications.notificationHubConnectionString = '';
    mockConfig.notifications.notificationHubName = '';
  });

  describe('sendAlertNotification', () => {
    it('returns success false when hub disabled', async () => {
      const result = await sendAlertNotification({
        userIds: [1],
        title: 'Test',
        body: 'Body',
      });
      expect(result).toEqual({ success: false, sent: 0, failed: 0, errors: ['Notification Hub no configurado'] });
    });

    it('returns success false when no userIds provided', async () => {
      mockConfig.notifications.notificationHubEnabled = true;
      mockConfig.notifications.notificationHubConnectionString = 'endpoint=https://test.communication.azure.com/;accesskey=test';
      mockConfig.notifications.notificationHubName = 'test-hub';
      
      const result = await sendAlertNotification({
        userIds: [],
        title: 'Test',
        body: 'Body',
      });
      expect(result).toEqual({ success: false, sent: 0, failed: 0, errors: ['No hay usuarios destino para la notificación'] });
    });

    it('sends notification successfully when hub enabled', async () => {
      mockConfig.notifications.notificationHubEnabled = true;
      mockConfig.notifications.notificationHubConnectionString = 'endpoint=https://test.communication.azure.com/;accesskey=test';
      mockConfig.notifications.notificationHubName = 'test-hub';
      
      mockSendNotification.mockResolvedValue({});
      
      const result = await sendAlertNotification({
        userIds: [1, 2],
        title: 'Test',
        body: 'Body',
        platforms: ['ios', 'android'],
      });
      expect(result.success).toBe(true);
      expect(result.sent).toBeGreaterThan(0);
    });

    it('handles send errors gracefully', async () => {
      mockConfig.notifications.notificationHubEnabled = true;
      mockConfig.notifications.notificationHubConnectionString = 'endpoint=https://test.communication.azure.com/;accesskey=test';
      mockConfig.notifications.notificationHubName = 'test-hub';
      
      mockSendNotification.mockRejectedValue(new Error('Send failed'));
      
      const result = await sendAlertNotification({
        userIds: [1],
        title: 'Test',
        body: 'Body',
        platforms: ['ios'],
      });
      expect(result.success).toBe(false);
      expect(result.failed).toBeGreaterThan(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('registerInstallation', () => {
    it('returns early when hub disabled', async () => {
      await expect(registerInstallation({
        deviceToken: 'token123',
        platform: 'ios',
        userId: 1,
      })).resolves.not.toThrow();
    });

    it('returns early for web platform', async () => {
      mockConfig.notifications.notificationHubEnabled = true;
      mockConfig.notifications.notificationHubConnectionString = 'endpoint=https://test.communication.azure.com/;accesskey=test';
      mockConfig.notifications.notificationHubName = 'test-hub';
      
      await expect(registerInstallation({
        deviceToken: 'token123',
        platform: 'web',
        userId: 1,
      })).resolves.not.toThrow();
    });

    it('registers iOS installation successfully', async () => {
      mockConfig.notifications.notificationHubEnabled = true;
      mockConfig.notifications.notificationHubConnectionString = 'endpoint=https://test.communication.azure.com/;accesskey=test';
      mockConfig.notifications.notificationHubName = 'test-hub';
      
      mockCreateOrUpdateInstallation.mockResolvedValue({});
      
      await expect(registerInstallation({
        deviceToken: 'ios-token-123',
        platform: 'ios',
        userId: 1,
      })).resolves.not.toThrow();
      expect(mockCreateOrUpdateInstallation).toHaveBeenCalled();
    });

    it('registers Android installation successfully', async () => {
      mockConfig.notifications.notificationHubEnabled = true;
      mockConfig.notifications.notificationHubConnectionString = 'endpoint=https://test.communication.azure.com/;accesskey=test';
      mockConfig.notifications.notificationHubName = 'test-hub';
      
      mockCreateOrUpdateInstallation.mockResolvedValue({});
      
      await expect(registerInstallation({
        deviceToken: 'android-token-123',
        platform: 'android',
        userId: 1,
      })).resolves.not.toThrow();
      expect(mockCreateOrUpdateInstallation).toHaveBeenCalled();
    });

    it('handles registration errors gracefully', async () => {
      mockConfig.notifications.notificationHubEnabled = true;
      mockConfig.notifications.notificationHubConnectionString = 'endpoint=https://test.communication.azure.com/;accesskey=test';
      mockConfig.notifications.notificationHubName = 'test-hub';
      
      mockCreateOrUpdateInstallation.mockRejectedValue(new Error('Registration failed'));
      
      await expect(registerInstallation({
        deviceToken: 'token123',
        platform: 'ios',
        userId: 1,
      })).resolves.not.toThrow();
    });
  });
});
