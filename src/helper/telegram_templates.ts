import type { EnrichedJob } from './types';

/**
 * Returns a header message for successful job matches.
 */
export function getSuccessHeader(count: number, dateStr: string): string {
  return `<b>🚀 Job Match Summary - ${dateStr}</b>\nFound <b>${count}</b> new matching opportunities!`;
}

/**
 * Returns a header message for dropped jobs (debugging).
 */
export function getDroppedHeader(count: number, dateStr: string): string {
  return `<b>🗑️ Dropped Jobs - ${dateStr}</b>\nProcessing summary: <b>${count}</b> jobs filtered out at various stages.`;
}

/**
 * Formats a SINGLE job match message for Telegram (HTML mode).
 */
export function getMatchedJobMessage(j: EnrichedJob, index: number): string {
  const scoreEmoji = (j.ai_score ?? 0) > 80 ? '✅' : '⚠️';
  let msg = `<b>${index}. ${j.title}</b>\n`;
  msg += `🏢 <b>Company:</b> ${j.companyName}\n`;
  msg += `📍 <b>Location:</b> ${j.ai_location ?? 'Not specified'}\n`;
  msg += `⏳ <b>Exp needed:</b> ${j.ai_yoe ?? 'Not specified'}\n`;
  msg += `${scoreEmoji} <b>Score:</b> ${j.ai_score}/100\n`;
  
  if (j.ai_missing_skills && j.ai_missing_skills.length > 0) {
    msg += `❌ <b>Missing Skills:</b> ${j.ai_missing_skills.join(', ')}\n`;
  }
  
  msg += `🔗 <a href="${j.link}">View Job</a>`;
  return msg;
}

/**
 * Formats a SINGLE dropped job message for Telegram (HTML mode).
 */
export function getDroppedJobMessage(j: EnrichedJob | any, reason: string): string {
  let msg = `<b>🗑️ Dropped: ${j.title ?? 'Unknown Title'}</b>\n`;
  msg += `🏢 <b>Company:</b> ${j.companyName ?? 'Unknown'}\n`;
  msg += `🚩 <b>Reason:</b> ${reason}\n`;
  if (j.ai_score !== undefined) {
    msg += `📊 <b>AI Score:</b> ${j.ai_score}/100\n`;
  }
  msg += `🔗 <a href="${j.link}">View Job</a>`;
  return msg;
}

/**
 * Formats failure alert for Telegram.
 */
export function getFailureTelegramMessage(errorMessage: string, dateStr: string): string {
  const TELEGRAM_LIMIT = 4000;
  let msg = `<b>❌ Job Scraper Failure - ${dateStr}</b>\n\n`;
  msg += `<b>Error Details:</b>\n`;

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
