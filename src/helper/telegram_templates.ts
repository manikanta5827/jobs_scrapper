import type { EnrichedJob, JobStats } from './types';

function getStatsSection(stats: JobStats): string {
  return `📊 <b>PROCESSING STATS:</b>\n` +
         `├ 📥 <b>Scraped:</b> <code>${stats.scraped}</code>\n` +
         `├ 🧹 <b>Dupes removed:</b> <code>${stats.duplicateRemoved}</code>\n` +
         `├ 🗄️ <b>DB Deduplicated:</b> <code>${stats.dbDeduplicated}</code>\n` +
         `├ 🔑 <b>Keyword Filtered:</b> <code>${stats.keywordFiltered}</code>\n` +
         `├ 🤖 <b>AI Rejected:</b> <code>${stats.aiRejected}</code>\n` +
         `└ 🎯 <b>Final Matches:</b> <b>${stats.matched}</b>`;
}

/**
 * Returns a message for when zero jobs matched the candidate's profile.
 */
export function getZeroMatchesMessage(dateStr: string, stats: JobStats): string {
  return `🔎 <b>NO JOB MATCHES FOUND</b> • <code>${dateStr}</code>\n` +
         `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
         `${getStatsSection(stats)}\n\n` +
         `😴 No new jobs met your criteria in this run.\n` +
         `☕️ <i>Check back later!</i>`;
}

/**
 * Returns a header message for successful job matches.
 */
export function getSuccessHeader(dateStr: string, stats: JobStats): string {
  return `✨ <b>JOB MATCH SUMMARY</b> • <code>${dateStr}</code>\n` +
         `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
         `${getStatsSection(stats)}\n\n` +
         `🎯 Found <b>${stats.matched}</b> matching opportunities!`;
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
  msg += `📍 <b>Location:</b> <code>${j.ai_job_location ?? 'Not specified'}</code>\n`;
  msg += `⏳ <b>Experience:</b> <code>${j.ai_yoe ?? 'Not specified'}</code>\n\n`;
  
  msg += `${scoreEmoji} <b>Match Score:</b> <code>${j.ai_score}/100</code>\n`;
  
  if (j.ai_direct_apply) {
    msg += `📩 <b>Direct Apply:</b> <i>${j.ai_direct_apply}</i>\n`;
  }

  if (j.ai_matched_skills && j.ai_matched_skills.length > 0) {
    msg += `✅ <b>Matched Skills:</b> <i>${j.ai_matched_skills.join(', ')}</i>\n`;
  }

  if (j.ai_missing_skills && j.ai_missing_skills.length > 0) {
    msg += `❌ <b>Missing Skills:</b> <i>${j.ai_missing_skills.join(', ')}</i>\n`;
  }

  if(j.ai_reason) {
    msg += `📝 <b>AI Reason:</b> <i>${j.ai_reason}</i>\n`;
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

/**
 * Formats fatal error alert for Telegram.
 */
export function getFatalErrorTelegramMessage(errorMessage: string, dateStr: string): string {
  let msg = `⚠️ <b>FATAL API ERROR</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📅 <b>Date:</b> <code>${dateStr}</code>\n`;
  msg += `❌ <b>Reason:</b> <code>${errorMessage}</code>\n\n`;
  msg += `🛑 <b>Processing stopped immediately.</b>\n`;
  msg += `🛠 <i>Please update your <code>OPENAI_API_KEY</code>.</i>`;
  return msg;
}
