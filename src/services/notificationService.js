import axios from 'axios';

export async function sendNotification(provider, config, message) {
  try {
    if (provider === 'telegram') {
      const url = `https://api.telegram.org/bot${config.token}/sendMessage`;
      await axios.post(url, {
        chat_id: config.chatId,
        text: message,
        parse_mode: 'HTML'
      });
    } else if (provider === 'slack') {
      const url = config.webhookUrl;
      await axios.post(url, { text: message });
    }
    return { success: true };
  } catch (error) {
    console.error(`[NotificationService] Error sending ${provider} notification:`, error.message);
    return { success: false, error: error.message };
  }
}
