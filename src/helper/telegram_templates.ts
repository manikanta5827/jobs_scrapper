import type { EnrichedJob } from './types';

/**
 * Returns a header message for successful job matches.
 */
export function getSuccessHeader(count: number, dateStr: string): string {
  return `✨ <b>JOB MATCH SUMMARY</b> • <code>${dateStr}</code>\n` +
         `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
         `🎯 Found <b>${count}</b> matching opportunities!`;
}

/**
 * Returns a header message for dropped jobs (debugging).
 */
export function getDroppedHeader(count: number, dateStr: string): string {
  return `🗑️ <b>FILTERED JOBS REPORT</b> • <code>${dateStr}</code>\n` +
         `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
         `🔎 <b>${count}</b> jobs were filtered out during processing.`;
}

/**
 * Formats a SINGLE job match message for Telegram (HTML mode).
 */
export function getMatchedJobMessage(j: EnrichedJob, index: number): string {
  const scoreEmoji = (j.ai_score ?? 0) >= 85 ? '✅' : '⚠️';
  
  let msg = `<b>[ #${index} ] — ${j.title}</b>\n`;
  msg += `────────────────────\n`;
  msg += `🏢 <b>Company:</b>  <code>${j.companyName}</code>\n`;
  msg += `📍 <b>Location:</b> <code>${j.ai_location ?? 'Not specified'}</code>\n`;
  msg += `⏳ <b>Experience:</b> <code>${j.ai_yoe ?? 'Not specified'}</code>\n\n`;
  
  msg += `${scoreEmoji} <b>Match Score:</b> <code>${j.ai_score}/100</code>\n`;
  
  if (j.ai_missing_skills && j.ai_missing_skills.length > 0) {
    msg += `❌ <b>Missing Skills:</b> <i>${j.ai_missing_skills.join(', ')}</i>\n`;
  }
  
  msg += `\n🚀 <a href="${j.link}"><b>APPLY ON LINKEDIN</b></a>`;
  return msg;
}

/**
 * Formats a SINGLE dropped job message for Telegram (HTML mode).
 */
export function getDroppedJobMessage(j: EnrichedJob | any, reason: string): string {
  let msg = `🚫 <b>DROPPED:</b> ${j.title ?? 'Unknown Title'}\n`;
  msg += `────────────────────\n`;
  msg += `🏢 <b>Company:</b> ${j.companyName ?? 'Unknown'}\n`;
  msg += `🚩 <b>Reason:</b>  <code>${reason}</code>\n`;
  
  if (j.ai_score !== undefined && j.ai_score > 0) {
    msg += `📊 <b>AI Score:</b> <code>${j.ai_score}/100</code>\n`;
  }
  
  msg += `🔗 <a href="${j.link}">View Original Listing</a>`;
  return msg;
}

/**
 * Formats failure alert for Telegram.
 */
export function getFailureTelegramMessage(errorMessage: string, dateStr: string): string {
  let msg = `🚨 <b>CRITICAL SYSTEM FAILURE</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📅 <b>Date:</b> <code>${dateStr}</code>\n`;
  msg += `❌ <b>Error:</b>\n<code>${errorMessage.substring(0, 3000)}</code>\n\n`;
  msg += `🛠 <i>Please check the AWS Lambda logs for details.</i>`;
  return msg;
}
