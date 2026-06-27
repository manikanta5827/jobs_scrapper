import type { EnrichedJob } from './types';

export function formatJobPost(job: EnrichedJob): string {
  const title = job.title || 'Software Engineer';
  const company = job.companyName || 'a company';
  const location = job.ai_job_location || job.location || 'India';
  const experience = job.ai_yoe || '';
  const skills = job.ai_matched_skills || [];
  const applyLink = job.link || '';

  let post = '#hiring #sde #freshers #jobs\n\n';
  post += `${company} is hiring for the role of ${title}\n`;

  if (location) {
    post += `📍 Location : ${location}\n`;
  }

  if (experience) {
    post += `⏳ Experience : ${experience}\n`;
  }

  if (skills.length > 0) {
    post += '\nRequirements :\n';
    for (const skill of skills) {
      post += `- ${skill}\n`;
    }
  }

  if (applyLink) {
    post += `\nApply link : ${applyLink}\n`;
  }

  post += '\n#career #jobupdates #tech #job #opportunity #bangalore #hyderabad';
  return post;
}
