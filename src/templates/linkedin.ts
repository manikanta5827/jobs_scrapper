import type { EnrichedJob } from '../types';

export function formatJobPost(job: EnrichedJob): string {
  const title = job.title || 'Software Engineer';
  const company = job.companyName || 'a company';
  const location = job.ai_job_location || job.location || 'India';
  const experience = job.ai_yoe || '';
  const employmentType = job.employmentType || '';
  const seniorityLevel = job.seniorityLevel || '';
  const salary = job.salary || '';
  const directApply = job.ai_direct_apply || '';
  const skills = job.ai_matched_skills || [];
  const applyLink = job.link || '';

  let post = '#hiring #sde #freshers #jobs\n\n';
  post += `${company} is hiring for the role of ${title}\n`;

  if (location) {
    post += `📍 Location : ${location}\n`;
  }

  if (employmentType || seniorityLevel) {
    const label = [employmentType, seniorityLevel && `(${seniorityLevel})`].filter(Boolean).join(' ');
    post += `💼 Employment : ${label}\n`;
  }

  if (experience) {
    post += `⏳ Experience : ${experience}\n`;
  }

  if (salary) {
    post += `💰 Salary : ${salary}\n`;
  }

  if (skills.length > 0) {
    post += '\nRequirements :\n';
    for (const skill of skills) {
      post += `- ${skill}\n`;
    }
  }

  if (applyLink) {
    post += `\n\n🔗 Apply link : ${applyLink}\n\n`;
  }

  if (directApply) {
    post += `📧 Direct Apply : ${directApply}\n\n`;
  }

  post += 'Disclaimer: We are not affiliated to any company. Please check the job posting twice before applying.\n\n';
  post += '💬 Found this helpful? Like Comment & share to help others!\n\n';
  post += '---\n\n';
  post += '🎯 Tired of scrolling through job boards & Telegram channels that don\'t match your profile?\n\n';
  post += 'I set up a system that sends you jobs 100% matched to your resume — straight to you.\n';
  post += 'No more reading descriptions wondering "is this even for me?" Just apply.\n\n';
  post += '✅ Perfectly matched to your resume\n';
  post += '✅ No searching. No filtering. Jobs come to you.\n';
  post += '📩 Whatsapp me if intrested : 8309497947 \n\n';
  post += '\n#career #jobupdates #tech #job #opportunity #bangalore #hyderabad';
  return post;
}
