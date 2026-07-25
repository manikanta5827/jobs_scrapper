import type { EnrichedJob, JobStats } from './types';

// Candidate User info structure for failure alerts sent to Admin
export interface CandidateUserInfo {
  id?: number;
  name?: string | null;
  email?: string;
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