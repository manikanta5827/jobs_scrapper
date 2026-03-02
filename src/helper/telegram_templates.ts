import type { EnrichedJob } from './types';

/**
 * Formats job matches for Telegram (HTML mode).
 */
export function getSuccessTelegramMessage(matchedJobs: EnrichedJob[], dateStr: string): string {
  const sortedMatched = [...matchedJobs].sort((a, b) => (b.ai_score ?? 0) - (a.ai_score ?? 0));

  let msg = `<b>🚀 Job Match Summary - ${dateStr}</b>
`;
  msg += `Found <b>${sortedMatched.length}</b> new opportunities!

`;

  sortedMatched.forEach((j, index) => {
    const scoreEmoji = (j.ai_score ?? 0) > 80 ? '✅' : '⚠️';
    msg += `${index + 1}. <b>${j.title}</b>
`;
    msg += `🏢 ${j.companyName}
`;
    msg += `${scoreEmoji} <b>Match Score:</b> ${j.ai_score}/100
`;
    msg += `📝 <b>Reason:</b> ${j.ai_reason}
`;
    msg += `🔗 <a href="${j.link}">View Job</a>

`;
  });

  msg += `<i>Sent by Job Scraper Service</i>`;
  return msg;
}

/**
 * Formats failure alert for Telegram.
 */
export function getFailureTelegramMessage(errorMessage: string, dateStr: string): string {
  let msg = `<b>❌ Job Scraper Failure - ${dateStr}</b>

`;
  msg += `<b>Error Details:</b>
`;
  msg += `<code>${errorMessage}</code>

`;
  msg += `Please check the AWS Lambda logs.`;
  return msg;
}
