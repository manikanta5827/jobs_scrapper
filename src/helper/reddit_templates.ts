import type { EnrichedJob } from './types';

export function formatRedditPost(job: EnrichedJob): { title: string; text: string } {
  const jobTitle = job.title || 'Software Engineer';
  const company = job.companyName || 'a company';
  const location = job.ai_job_location || job.location || 'India';
  const experience = job.ai_yoe || '';
  const skills = job.ai_matched_skills || [];
  const applyLink = job.link || '';

  const title = `[Hiring] ${jobTitle} at ${company} — ${location}`;

  let text = `**${company}** is hiring **${jobTitle}**\n\n`;
  text += `| Detail | Value |\n|:--|:--|\n`;
  text += `| 📍 Location | ${location} |\n`;
  if (experience) text += `| ⏳ Experience | ${experience} |\n`;
  if (skills.length > 0) text += `| ✅ Skills | ${skills.join(', ')} |\n`;
  if (applyLink) text += `| 🔗 Apply | [Click here](${applyLink}) |\n`;
  text += '\n---\n*Posted by JobScraperBot*';

  return { title, text };
}
