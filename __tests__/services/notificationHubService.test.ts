jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock('../../src/config/environment', () => ({
  config: {
    notifications: {
      notificationHubEnabled: false,
      notificationHubConnectionString: '',
      notificationHubName: '',
    },
  },
}));

import { sendAlertNotification } from '../../src/services/notificationHubService';

describe('notificationHubService', () => {
  it('sendAlertNotification returns success false when hub disabled', async () => {
    const result = await sendAlertNotification({
      userIds: [1],
      title: 'Test',
      body: 'Body',
    });
    expect(result).toEqual({ success: false, sent: 0, failed: 0, errors: ['Notification Hub no configurado'] });
  });
});
