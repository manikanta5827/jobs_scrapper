import type { EnrichedJob } from './types';

/**
 * Formats job matches for Telegram (HTML mode).
 * Returns an array of message strings, each within Telegram's character limit.
 */
export function getSuccessTelegramMessages(matchedJobs: EnrichedJob[], dateStr: string): string[] {
  const TELEGRAM_LIMIT = 4000;
  const sortedMatched = [...matchedJobs].sort((a, b) => (b.ai_score ?? 0) - (a.ai_score ?? 0));

  const messages: string[] = [];
  let currentMsg = `<b>🚀 Job Match Summary - ${dateStr}</b>\n`;
  currentMsg += `Found <b>${sortedMatched.length}</b> new opportunities!\n\n`;

  sortedMatched.forEach((j, index) => {
    const scoreEmoji = (j.ai_score ?? 0) > 80 ? '✅' : '⚠️';
    let jobEntry = `${index + 1}. <b>${j.title}</b>\n`;
    jobEntry += `🏢 ${j.companyName}\n`;
    jobEntry += `${scoreEmoji} <b>Match Score:</b> ${j.ai_score}/100\n`;
    jobEntry += `📝 <b>Reason:</b> ${j.ai_reason}\n`;
    jobEntry += `🔗 <a href="${j.link}">View Job</a>\n\n`;

    // If adding this job exceeds the limit, push current message and start a new one
    if (currentMsg.length + jobEntry.length + 50 > TELEGRAM_LIMIT) {
      messages.push(currentMsg);
      currentMsg = `<i>(Continued...)</i>\n\n` + jobEntry;
    } else {
      currentMsg += jobEntry;
    }
  });

  currentMsg += `<i>Sent by Job Scraper Service</i>`;
  messages.push(currentMsg);

  return messages;
}

/**
 * Formats failure alert for Telegram.
 */
export function getFailureTelegramMessage(errorMessage: string, dateStr: string): string {
  const TELEGRAM_LIMIT = 4000;
  let msg = `<b>❌ Job Scraper Failure - ${dateStr}</b>\n\n`;
  msg += `<b>Error Details:</b>\n`;

  // Truncate error message if it's too long
  const truncatedError = errorMessage.length > 3500 
    ? errorMessage.substring(0, 3500) + '... (truncated)'
    : errorMessage;

  msg += `<code>${truncatedError}</code>\n\n`;
  msg += `Please check the AWS Lambda logs.`;
  
  if (msg.length > TELEGRAM_LIMIT) {
    return msg.substring(0, TELEGRAM_LIMIT - 50) + '... (truncated)';
  }

  return msg;
}
