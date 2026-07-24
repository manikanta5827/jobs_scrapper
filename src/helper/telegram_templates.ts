import type { EnrichedJob, JobStats } from './types';

// Candidate User info structure for failure alerts sent to Admin
export interface CandidateUserInfo {
  id?: number;
  name?: string | null;
  email?: string;
}

// Helper function to format candidate user details header for admin alerts
function formatUserInfoHeader(user?: CandidateUserInfo): string {
  if (!user || (!user.id && !user.email)) return '';
  const idStr = user.id ? `#${user.id}` : '';
  const nameStr = user.name ? ` — ${user.name}` : '';
  const emailStr = user.email ? ` (${user.email})` : '';
  return `👤 <b>Candidate User:</b> <code>${idStr}${nameStr}${emailStr}</code>\n`;
}

/**
 * Returns a clean header message for when zero jobs matched the candidate's profile.
 */
export function getZeroMatchesMessage(dateTimeStr: string, stats: JobStats): string {
  return `🔎 <b>JOB MATCH SUMMARY</b> • <code>${dateTimeStr}</code>\n` +
         `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
         `📥 <b>Total Jobs Scraped:</b> <code>${stats.scraped}</code>\n` +
         `🎯 <b>Final Matches Found:</b> <code>0</code>\n\n` +
         `☕️ <i>No matching jobs found in this run. Check back later!</i>`;
}

/**
 * Returns a clean header message for successful job matches.
 */
export function getSuccessHeader(dateTimeStr: string, stats: JobStats): string {
  return `✨ <b>JOB MATCH SUMMARY</b> • <code>${dateTimeStr}</code>\n` +
         `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
         `📥 <b>Total Jobs Scraped:</b> <code>${stats.scraped}</code>\n` +
         `🎯 <b>Final Matches Found:</b> <b>${stats.matched}</b>`;
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
  msg += `📅 <b>Posted:</b> <code>${j.postedAt ?? 'Unknown'}</code>\n`;
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

  if (j.ai_reason) {
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
 * Formats failure alert for Admin Telegram channel including candidate User ID and Name.
 */
export function getFailureTelegramMessage(errorMessage: string, dateStr: string, userInfo?: CandidateUserInfo): string {
  let msg = `🚨 <b>CRITICAL SYSTEM FAILURE</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📅 <b>Date:</b> <code>${dateStr}</code>\n`;
  if (userInfo) {
    msg += formatUserInfoHeader(userInfo);
  }
  msg += `❌ <b>Error:</b>\n<code>${errorMessage.substring(0, 3000)}</code>\n\n`;
  msg += `🛠 <i>Please check the AWS Lambda logs for details.</i>`;
  return msg;
}

/**
 * Formats fatal error alert for Admin Telegram channel including candidate User ID and Name.
 */
export function getFatalErrorTelegramMessage(errorMessage: string, dateStr: string, userInfo?: CandidateUserInfo): string {
  let msg = `⚠️ <b>FATAL API ERROR</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📅 <b>Date:</b> <code>${dateStr}</code>\n`;
  if (userInfo) {
    msg += formatUserInfoHeader(userInfo);
  }
  msg += `❌ <b>Reason:</b> <code>${errorMessage}</code>\n\n`;
  msg += `🛑 <b>Processing stopped immediately.</b>\n`;
  msg += `🛠 <i>Please update system configuration or API key.</i>`;
  return msg;
}

/**
 * Formats LinkedIn posting failure alert for Admin Telegram including candidate User ID and Name.
 */
export function getPlatformPostFailedMessage(platform: string, jobTitle: string, status: number, errorDetail: string, userInfo?: CandidateUserInfo): string {
  let msg = `🔴 <b>${platform} POST FAILED</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (userInfo) {
    msg += formatUserInfoHeader(userInfo);
  }
  msg += `📋 <b>Job:</b> <code>${jobTitle}</code>\n`;
  msg += `📡 <b>Status:</b> <code>${status}</code>\n`;
  if (errorDetail) {
    msg += `❌ <b>Error:</b> <code>${errorDetail.substring(0, 500)}</code>\n`;
  }
  msg += `\n🛠 <i>Check CloudWatch logs for details.</i>`;
  return msg;
}

/**
 * Formats LinkedIn token expired alert for Admin Telegram including candidate User ID and Name.
 */
export function getPlatformTokenExpiredMessage(platform: string, setupCmd: string, ssmParam: string, userInfo?: CandidateUserInfo): string {
  let msg = `⏰ <b>${platform.toUpperCase()} TOKEN EXPIRED</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (userInfo) {
    msg += formatUserInfoHeader(userInfo);
  }
  msg += `🔑 The ${platform} access token has expired.\n\n`;
  msg += `🛠 <i>Run </i><code>${setupCmd}</code><i> and update </i><code>${ssmParam}</code><i>.</i>`;
  return msg;
}
