import type { Job } from './types';

// ─── Config ──────────────────────────────────────────────────────────────────
export const SEARCH_URLS: string[] = [
  'https://www.linkedin.com/jobs/search?keywords=Software%20Developer%20OR%20Software%20Engineer%20OR%20Backend%20Developer%20OR%20DevOps%20Engineer%20OR%20Cloud%20Engineer%20OR%20Associate%20Software%20Engineer%20OR%20Agentic%20AI%20OR%20AI%20Agent%20Engineer&location=Bengaluru&geoId=105214831&distance=25&f_TPR=r86400&f_E=2&position=1&pageNum=0',
  'https://www.linkedin.com/jobs/search?keywords=Software%20Developer%20OR%20Software%20Engineer%20OR%20Backend%20Developer%20OR%20DevOps%20Engineer%20OR%20Cloud%20Engineer%20OR%20Associate%20Software%20Engineer%20OR%20Agentic%20AI%20OR%20AI%20Agent%20Engineer&location=Hyderabad&geoId=105556991&distance=25&f_TPR=r86400&f_E=2&position=1&pageNum=0',
  'https://www.linkedin.com/jobs/search?keywords=Backend%20Developer%20OR%20Software%20Engineer%20OR%20DevOps%20Engineer%20OR%20Cloud%20Engineer%20OR%20Associate%20Software%20Engineer%20OR%20Agentic%20AI%20OR%20AI%20Agent%20Engineer%20OR%20LLM%20Engineer&location=India&geoId=102713980&f_TPR=r86400&f_E=2&position=1&pageNum=0',
  'https://www.linkedin.com/jobs/search?keywords=Backend%20Developer%20OR%20Software%20Engineer%20OR%20DevOps%20Engineer%20OR%20Cloud%20Engineer%20OR%20Associate%20Software%20Engineer%20OR%20Agentic%20AI%20OR%20AI%20Agent%20Engineer%20OR%20LLM%20Engineer&location=India&geoId=102713980&f_TPR=r86400&f_E=2&f_WT=2&position=1&pageNum=0'
];

// Only skip 5+ YOE. 2-3 years is fine for a junior developer.
export const EXCLUDE_KEYWORDS: string[] = [
  '5+ years', '6+ years', '7+ years', '8+ years', '10+ years',
  '5 years', '6 years', '7 years', '8 years', '10 years',
  'senior architect', 'principal engineer', 'vp of engineering',
];

export const EXCLUDE_TITLE_KEYWORDS: string[] = [
  'Test', 'Quality', 'QA', 'Technical Support', 'Customer Support', 'IT Support', 'Help Desk', 'Helpdesk', 'Testing', 'Android', 'Mobile','React', 'React.js', 'React Js', 'React Native', 'Flutter', 'iOS','Rust', 'Dot net', "Bussiness", 'C#', 'Sales', '.NET', 'Kotline', 'Swift', 'Golang', 'Game' ,'Unity', 'Game', 'Data Engineer', 'Data Scientist', 'Machine Learning', 'ML Engineer', 'Security', 'Network', 'Hardware', 'Embedded', 'Firmware', 'Front End', 'Frontend', 'UI/UX', 'Designer', 'Product Manager', 'Project Manager', 'Front End', 'Tester', 'senior', 'lead', 'manager', 'director', 'principal', 'staff', 'architect', 'vp', 'vice president', 'head of', 'founder', 'co-founder', 'Java', 'PHP', 'Salesforce', 'SAP', 'Oracle', 'Mainframe', 'Cobol', 'Hadoop', 'Spark', 'Data Warehouse', 'ETL', 'Informatica', 'Tableau', 'Power BI', 'Intern', 'Laravel', 'C#'
];

// Level indicators that signal a non-fresher role (SDE2, L3, Engineer III, etc).
// Regex-based to avoid bare-digit false positives like "2025 Hiring" or "Node.js v2".
export const EXCLUDE_TITLE_PATTERNS: RegExp[] = [
  /\b[2-9]\b/,                       // standalone level number: "Engineer 2", "L 4", "SDE-3"
  /\b(l|ic|sde|swe|se|p|m)[2-9]\b/i, // glued level codes: "SDE2", "L4", "P2"
  /\b(ii|iii|iv)\b/i,                // roman numeral levels: Engineer II/III/IV
];

export const EXCLUDE_COMPANY_KEYWORDS: string[] = [
  'Apple', 'Google', 'Microsoft', 'Amazon', 'Meta', 'Facebook', 'Netflix', 'Tesla', 'Nvidia', 'Adobe', 'Salesforce', 'Oracle', 'IBM', 'Intel', 'Uber', 'Airbnb', 'Twitter', 'LinkedIn', 'Cisco', 'Notion', 'Spotify', 'Snap', 'Stripe', 'Square', 'PayPal', 'Shopify', 'Zoom', 'Slack', 'Dropbox', 'Asana', 'Atlassian', 'GitHub', 'Reddit', 'Pinterest', 'Quora', 'Twilio', 'Cloudflare'
];

export interface FilterResult {
  relevant: Job[];
  binned: Job[];
}

/**
 * Prepares search URLs by applying the dynamic lookback period.
 */
export function prepareSearchUrls(lookbackSeconds: number): string[] {
  return SEARCH_URLS.map(url => 
    url.replace(/f_TPR=r\d+/, `f_TPR=r${lookbackSeconds}`)
  );
}

/**
 * Keyword-based pre-filtering to remove clearly irrelevant jobs.
 */
export function keywordFilter(jobs: Job[]): FilterResult {
  const relevant: Job[] = [];
  const binned: Job[] = [];

  for (const job of jobs) {
    const title = (job.title ?? '').toLowerCase();
    const text = `${title} ${job.descriptionText ?? ''}`.toLowerCase();

    // Check general exclude keywords in full text
    const matchedGeneral = EXCLUDE_KEYWORDS.filter(kw => text.includes(kw.toLowerCase()));

    // Check specific title keywords in title only
    const matchedTitle = EXCLUDE_TITLE_KEYWORDS.filter(kw => title.includes(kw.toLowerCase()));

    // Check level-indicator patterns (SDE2, L3, Engineer III, etc.) in title only
    const matchedPatterns = EXCLUDE_TITLE_PATTERNS
      .filter(re => re.test(title))
      .map(re => re.source);

    const allMatched = [...new Set([...matchedGeneral, ...matchedTitle, ...matchedPatterns])];

    if (allMatched.length > 0) {
      binned.push({ ...job, keyword_bin_reason: allMatched.join(', ') });
    } else {
      relevant.push(job);
    }
  }

  return { relevant, binned };
}
