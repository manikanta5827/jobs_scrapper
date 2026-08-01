/**
 * telegram_webhook.ts
 * Webhook handler with Zod validation for Telegram Bot commands (/register, /start, /stop, /status)
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { 
  getUserByTelegramChatId, 
  getUserById, 
  updateUser, 
  setUserActiveStatus 
} from "./services/db";
import { sendTelegramMessage } from "./services/telegram";
import { TelegramWebhookMessageSchema } from "./utils/validation";
import { Tier, TIER_CONFIG, PREMIUM_PRICE_MONTHLY_INR } from "./constants";

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

      const cfg = TIER_CONFIG[u.tier as Tier];
      const tierText = `${cfg.emoji} ${cfg.label} (${cfg.alertsPerDay} alert/day)`;
      const expiryText = u.subscriptionExpiresAt
        ? `\n📅 <b>Expires:</b> ${new Date(u.subscriptionExpiresAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`
        : '';

      await sendTelegramMessage(
        botToken,
        chatId,
        `🎉 <b>Welcome ${escapeHtml(u.name || u.email)}!</b>\n\n` +
        `Your Telegram account has been linked successfully! ✅\n\n` +
        `👤 <b>Candidate ID:</b> ${u.id}\n` +
        `🏷️ <b>Tier:</b> ${tierText}${expiryText}\n` +
        `✨ You will now receive automated matched job alerts.`
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
      const tierText = `${TIER_CONFIG[user.tier as Tier].emoji} ${TIER_CONFIG[user.tier as Tier].label} (${TIER_CONFIG[user.tier as Tier].alertsPerDay} alerts/day)`;
      await sendTelegramMessage(
        botToken,
        chatId,
        `▶️ <b>Job Notifications Active</b>\nYou will receive fresh matched job alerts.\n\n🏷️ <b>Tier:</b> ${tierText}`
      );
      return { statusCode: 200, body: JSON.stringify({ status: "resumed" }) };
    }

    // 5. Process /status or /balance command to check tier, subscription, and run statistics
    if (text.startsWith("/status") || text.startsWith("/balance")) {
      const statusText = user.isActive ? "Active ✅" : "Paused ⏸️";
      const tierCfg = TIER_CONFIG[user.tier as Tier];
      const tierEmoji = tierCfg.emoji;
      const tierLabel = `${tierCfg.label} (${tierCfg.alertsPerDay} alert${tierCfg.alertsPerDay > 1 ? 's' : ''}/day)`;

      let subInfo = '';
      if (user.subscriptionExpiresAt) {
        const expDate = new Date(user.subscriptionExpiresAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
        const amountText = user.subscriptionAmount && user.subscriptionAmount > 0
          ? ` (₹${user.subscriptionAmount}/month)`
          : ' (Trial)';
        subInfo = `📅 <b>Expires:</b> ${expDate}${amountText}\n`;
      }

      if (user.tier === Tier.FREE) {
        subInfo = `💡 <b>Upgrade:</b> Contact admin for Premium at ₹${PREMIUM_PRICE_MONTHLY_INR}/month\n`;
      }

      const msg = `📊 <b>Account Status</b>\n\n` +
        `👤 <b>User:</b> ${escapeHtml(user.name || user.email)}\n` +
        `🆔 <b>ID:</b> ${user.id}\n` +
        `🔄 <b>Status:</b> ${statusText}\n` +
        `${tierEmoji} <b>Tier:</b> ${tierLabel}\n` +
        subInfo +
        `🚀 <b>Total Runs:</b> ${user.totalRunsCount}`;
      
      await sendTelegramMessage(botToken, chatId, msg);
      return { statusCode: 200, body: JSON.stringify({ status: "info_sent" }) };
    }

    // Fallback response for unhandled commands
    await sendTelegramMessage(
      botToken,
      chatId,
      "🤖 <b>Available Commands:</b>\n• <code>/start</code> — Resume job alerts\n• <code>/stop</code> — Pause job alerts\n• <code>/status</code> — Check account status & tier"
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
