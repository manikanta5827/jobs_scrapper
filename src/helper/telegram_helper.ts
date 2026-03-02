/**
 * telegram_helper.ts
 * Sends notifications via Telegram Bot API.
 */

export async function sendTelegramMessage(token: string, chatId:string, message: string): Promise<void> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telegram API Error: ${response.status} - ${errorText}`);
    }

    console.log('Telegram message sent successfully');
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    throw error;
  }
}
