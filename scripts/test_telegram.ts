import { sendTelegramMessage } from '../src/helper/telegram_helper';

/**
 * Simple script to test Telegram integration.
 * Usage: bun scripts/test_telegram.ts
 */
async function test() {
  console.log('Testing Telegram integration...');
  
  try {
    const token = process.env.TELEGRAM_MATCHED_JOBS_BOT_TOKEN!;
    const chatId = process.env.TELEGRAM_MATCHED_JOBS_CHAT_ID!; // Replace with your actual Chat ID

    console.log(`Using Chat ID: ${chatId}`);

    const testMessage = `
<b>🤖 Telegram Bot Test</b>
Status: <i>Success</i>
Time: <code>${new Date().toLocaleString('en-IN')}</code>

If you see this, your Telegram integration is working! 
<b>Remember:</b> You must have clicked /start on the bot first.
    `;

    await sendTelegramMessage(token, chatId, testMessage);
    console.log('✅ Test message sent successfully!');
  } catch (error) {
    console.error('❌ Telegram test failed:');
    console.error(error);
  }
}

test();
