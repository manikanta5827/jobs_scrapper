/**
 * telegram_webhook.ts
 * Webhook handler with Zod validation for Telegram Bot commands (/register, /start, /stop, /balance, /status)
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { 
  getUserByTelegramChatId, 
  getUserById, 
  updateUser, 
  setUserActiveStatus 
} from "./helper/db_helper";
import { sendTelegramMessage } from "./helper/telegram_helper";
import { TelegramWebhookMessageSchema } from "./helper/validation";
import { convertUsdToInr } from "./helper/currency_helper";

// Handle incoming Telegram webhook updates
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Parse raw body JSON
    const rawBody = event.body ? JSON.parse(event.body) : {};

    // Validate update payload structure using Zod schema
    const parseResult = TelegramWebhookMessageSchema.safeParse(rawBody);
    if (!parseResult.success || !parseResult.data.message || !parseResult.data.message.text) {
      return { statusCode: 200, body: JSON.stringify({ message: "Ignored non-text or invalid Telegram payload" }) };
    }

    const message = parseResult.data.message;
    const chatId = String(message.chat.id);
    const text = (message.text || '').trim();
    const botToken = process.env.TELEGRAM_MATCHED_JOBS_BOT_TOKEN!;

    // 1. Process candidate registration via /register <USER_UUID> or /start <USER_UUID>
    if (text.startsWith("/register") || (text.startsWith("/start") && text.split(/\s+/).length > 1)) {
      const parts = text.split(/\s+/);
      const rawId = parts[1]?.trim();
      const candidateId = rawId ? rawId.replace('#', '').trim() : '';

      if (!candidateId) {
        await sendTelegramMessage(
          botToken,
          chatId,
          "⚠️ <b>Missing Candidate ID</b>\nPlease send <code>/register &lt;YOUR_USER_ID&gt;</code> provided by your Admin."
        );
        return { statusCode: 200, body: JSON.stringify({ status: "missing_id" }) };
      }

      // Query database for user with matching UUID string
      const pendingUser = await getUserById(candidateId);
      if (!pendingUser) {
        console.warn(`Registration attempt with invalid user ID: ${candidateId} from chatId: ${chatId}`);
        await sendTelegramMessage(
          botToken,
          chatId,
          `❌ <b>Invalid Candidate ID</b>\nNo candidate account was found for ID <b>${escapeHtml(candidateId)}</b>. Please check with your Admin.`
        );
        return { statusCode: 200, body: JSON.stringify({ status: "user_not_found" }) };
      }

      // Link candidate's Telegram Chat ID to user record in database
      const updated = await updateUser(candidateId, { telegramChatId: chatId, isActive: true });
      const u = updated[0] || pendingUser;
      const balanceInr = convertUsdToInr(u.balanceUsd || 0);

      await sendTelegramMessage(
        botToken,
        chatId,
        `🎉 <b>Welcome ${escapeHtml(u.name || u.email)}!</b>\n\n` +
        `Your Telegram account has been linked successfully! ✅\n\n` +
        `👤 <b>Candidate ID:</b> ${u.id}\n` +
        `💳 <b>Wallet Balance:</b> $${(u.balanceUsd || 0).toFixed(2)} USD (~₹${balanceInr} INR)\n` +
        `✨ You will now receive automated matched job alerts twice daily.`
      );

      return { statusCode: 200, body: JSON.stringify({ status: "registered", userId: u.id }) };
    }

    // 2. Lookup existing registered user by Telegram chat ID
    const user = await getUserByTelegramChatId(chatId);
    if (!user) {
      console.warn(`Telegram message from unregistered chat ID: ${chatId}`);
      await sendTelegramMessage(
        botToken,
        chatId,
        "⚠️ <b>Account Not Linked</b>\nYour Telegram account is not linked yet. Please send <code>/register &lt;YOUR_USER_ID&gt;</code> provided by your Admin."
      );
      return { statusCode: 200, body: JSON.stringify({ status: "unregistered" }) };
    }

    // 3. Process /stop command to pause job alerts
    if (text.startsWith("/stop")) {
      await setUserActiveStatus(user.id, false);
      await sendTelegramMessage(
        botToken,
        chatId,
        "⏸️ <b>Job Notifications Paused</b>\nYour automated job searches have been paused. Send <code>/start</code> anytime to resume alerts."
      );
      return { statusCode: 200, body: JSON.stringify({ status: "paused" }) };
    }

    // 4. Process /start command to resume job alerts
    if (text.startsWith("/start")) {
      await setUserActiveStatus(user.id, true);
      const balanceInr = convertUsdToInr(user.balanceUsd);
      await sendTelegramMessage(
        botToken,
        chatId,
        `▶️ <b>Job Notifications Active</b>\nYou will receive fresh matched job alerts twice daily.\n\n💳 <b>Current Balance:</b> $${user.balanceUsd.toFixed(2)} USD (~₹${balanceInr} INR)`
      );
      return { statusCode: 200, body: JSON.stringify({ status: "resumed" }) };
    }

    // 5. Process /balance or /status command to check wallet balance and run statistics
    if (text.startsWith("/balance") || text.startsWith("/status")) {
      const statusText = user.isActive ? "Active ✅" : "Paused ⏸️";
      const balanceInr = convertUsdToInr(user.balanceUsd);
      const msg = `📊 <b>Account Status & Wallet Balance</b>\n\n` +
        `👤 <b>User:</b> ${escapeHtml(user.name || user.email)}\n` +
        `🆔 <b>ID:</b> ${user.id}\n` +
        `🔄 <b>Status:</b> ${statusText}\n` +
        `💳 <b>Wallet Balance:</b> $${user.balanceUsd.toFixed(2)} USD (~₹${balanceInr} INR)\n` +
        `🚀 <b>Total Runs Executed:</b> ${user.totalRunsCount}`;
      
      await sendTelegramMessage(botToken, chatId, msg);
      return { statusCode: 200, body: JSON.stringify({ status: "info_sent" }) };
    }

    // Fallback response for unhandled commands
    await sendTelegramMessage(
      botToken,
      chatId,
      "🤖 <b>Available Commands:</b>\n• <code>/start</code> — Resume job alerts\n• <code>/stop</code> — Pause job alerts\n• <code>/balance</code> — Check wallet balance"
    );

    return { statusCode: 200, body: JSON.stringify({ status: "ok" }) };

  } catch (err) {
    console.error("Telegram webhook handler failed:", err);
    throw err;
  }
};

// Helper function to escape HTML entities for Telegram HTML parse_mode
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
