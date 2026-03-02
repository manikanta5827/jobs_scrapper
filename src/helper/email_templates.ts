import type { EnrichedJob } from './types';

/**
 * Generates the HTML body for the daily job match summary email.
 */
export function getSuccessEmailHtml(matchedJobs: EnrichedJob[], dateStr: string): string {
  // Sort matched jobs by AI score descending (highest score first)
  const sortedMatched = [...matchedJobs].sort((a, b) => (b.ai_score ?? 0) - (a.ai_score ?? 0));

  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; color: #333; line-height: 1.6;">
      <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; margin-bottom: 20px;">
        Daily Job Match Summary
      </h2>
      <p style="font-size: 1.1em;">
        We found <strong>${sortedMatched.length}</strong> new job opportunities matching your profile for today, <strong>${dateStr}</strong>.
      </p>

      ${sortedMatched.map(j => `
        <div style="margin-bottom: 25px; padding: 20px; border: 1px solid #e1e4e8; border-radius: 10px; background-color: #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
          <h3 style="margin-top: 0; margin-bottom: 12px;">
            <a href="${j.link}" style="color: #007bff; text-decoration: none; font-size: 1.2em;">${j.title}</a>
          </h3>
          <div style="margin-bottom: 8px; color: #555;">
            <span style="font-weight: 600;">Company:</span> ${j.companyName}
          </div>
          <div style="margin-bottom: 8px; color: #555;">
            <span style="font-weight: 600;">Match Score:</span>
            <span style="padding: 2px 10px; background: ${ (j.ai_score ?? 0) > 80 ? '#d4edda' : '#fff3cd'}; color: ${ (j.ai_score ?? 0) > 80 ? '#155724' : '#856404'}; border-radius: 12px; font-size: 0.9em; font-weight: 600;">
              ${j.ai_score}/100
            </span>
          </div>
          <div style="margin-bottom: 12px; color: #555;">
            <span style="font-weight: 600;">Match Reason:</span> ${j.ai_reason}
          </div>
          ${j.ai_matched_skills && j.ai_matched_skills.length > 0 ? `
            <div style="font-size: 0.95em; color: #666; background: #f8f9fa; padding: 10px; border-radius: 6px;">
              <span style="font-weight: 600;">Matched Skills:</span> ${j.ai_matched_skills.join(', ')}
            </div>
          ` : ''}
        </div>
      `).join('')}

      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 0.85em;">
        <p>This is an automated report from your Job Scraper Service.</p>
        <p>&copy; ${new Date().getFullYear()} Job Scraper Inc.</p>
      </div>
    </div>
  `;
}

/**
 * Generates the HTML body for the job scraper failure alert email.
 */
export function getFailureEmailHtml(errorMessage: string, dateStr: string): string {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; color: #333; line-height: 1.6;">
      <h2 style="color: #c0392b; border-bottom: 2px solid #e74c3c; padding-bottom: 10px; margin-bottom: 20px;">
        Job Scraper Failure Alert
      </h2>
      <p style="font-size: 1.1em;">
        An error occurred during the job scraping process on <strong>${dateStr}</strong>.
      </p>
      <div style="margin-top: 20px; padding: 15px; background: #f8d7da; color: #721c24; border-radius: 6px; border: 1px solid #f5c6cb;">
        <h3 style="margin-top: 0; margin-bottom: 10px;">Error Details:</h3>
        <pre style="white-space: pre-wrap; word-break: break-word;">${errorMessage}</pre>
      </div>
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 0.85em;">
        <p>This is an automated alert from your Job Scraper Service.</p>
        <p>&copy; ${new Date().getFullYear()} Job Scraper Inc.</p>
      </div>
    </div>
  `;
}
