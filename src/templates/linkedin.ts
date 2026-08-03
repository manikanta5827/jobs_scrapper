import type { EnrichedJob } from '../types';

export function formatJobPost(
  job: EnrichedJob,
  customTemplate?: string | null,
  userPhone?: string | null
): string {
  if (customTemplate && customTemplate.trim().length > 0) {
    return formatCustomJobPost(job, customTemplate, userPhone);
  }
  return formatDefaultJobPost(job, userPhone);
}

function formatCustomJobPost(job: EnrichedJob, template: string, userPhone?: string | null): string {
  const phone = userPhone || '8309497947';
  const variables: Record<string, string> = {
    title: job.title || 'Software Engineer',
    companyName: job.companyName || 'a company',
    location: job.aiJobLocation || job.location || 'India',
    experience: job.aiYoe || '',
    employmentType: job.employmentType || '',
    seniorityLevel: job.seniorityLevel || '',
    salary: job.salary || '',
    applyLink: job.link || '',
    directApply: job.aiDirectApply || '',
    skills: (job.aiMatchedSkills || []).map(s => `- ${s}`).join('\n'),
    userPhone: phone,
  };

  // Replace {variableName} placeholders dynamically
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return key in variables ? variables[key] : match;
  });
}

function formatDefaultJobPost(job: EnrichedJob, userPhone?: string | null): string {
  const phone = userPhone || '8309497947';
  const title = job.title || 'Software Engineer';
  const company = job.companyName || 'a company';
  const location = job.aiJobLocation || job.location || 'India';
  const experience = job.aiYoe || '';
  const employmentType = job.employmentType || '';
  const seniorityLevel = job.seniorityLevel || '';
  const salary = job.salary || '';
  const directApply = job.aiDirectApply || '';
  const skills = job.aiMatchedSkills || [];
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

  post += `📩 Whatsapp me if intrested : ${phone} \n\n`;
  post += '\n#career #jobupdates #tech #job #opportunity #bangalore #hyderabad';
  return post;
}
