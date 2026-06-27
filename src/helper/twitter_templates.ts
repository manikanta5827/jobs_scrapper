import type { EnrichedJob } from './types';

export function formatTwitterPost(job: EnrichedJob): string {
  const title = job.title || 'Software Engineer';
  const company = job.companyName || 'a company';
  const location = job.ai_job_location || job.location || 'India';
  const skills = job.ai_matched_skills || [];
  const applyLink = job.link || '';

  let post = `${company} is hiring ${title}\n`;
  if (location) post += `📍 ${location}\n`;
  if (skills.length > 0) post += `✅ ${skills.slice(0, 5).join(', ')}\n`;
  if (applyLink) post += `\n🔗 ${applyLink}\n`;
  post += '\n#hiring #jobs #career #freshers';

  // Twitter has 280 char limit — truncate if needed
  if (post.length > 270) {
    const truncation = '\n...';
    const limit = 270 - truncation.length;
    return post.substring(0, limit) + truncation;
  }

  return post;
}
