import type { Job } from './types';

// ─── Config ──────────────────────────────────────────────────────────────────
export const SEARCH_URLS: string[] = [
  'https://www.linkedin.com/jobs/search?keywords=Software%20Developer%20OR%20Software%20Engineer%20OR%20Backend%20Developer&location=Bengaluru&geoId=105214831&distance=25&f_TPR=r86400&f_E=2&position=1&pageNum=0',
  'https://www.linkedin.com/jobs/search?keywords=Software%20Developer%20OR%20Software%20Engineer%20OR%20Backend%20Developer&location=Hyderabad&geoId=105556991&distance=25&f_TPR=r86400&f_E=2&position=1&pageNum=0',
  'https://www.linkedin.com/jobs/search?keywords=Software%20Developer%20OR%20Software%20Engineer%20OR%20Backend%20Developer&location=Chennai&geoId=106888327&distance=25&f_TPR=r86400&f_E=2&position=1&pageNum=0',
  'https://www.linkedin.com/jobs/search?keywords=Software%20Developer%20OR%20Backend%20Developer%20OR%20Software%20Engineer%20OR%20Backend%20Engineer&location=Europe&geoId=100506914&f_E=1%2C2&f_TPR=r86400&f_WT=2&position=1&pageNum=0'
];

// Only skip 5+ YOE. 2-3 years is fine for a junior developer.
export const EXCLUDE_KEYWORDS: string[] = [
  '5+ years', '6+ years', '7+ years', '8+ years', '10+ years',
  '5 years', '6 years', '7 years', '8 years', '10 years',
  'senior architect', 'principal engineer', 'vp of engineering',
];

export const EXCLUDE_TITLE_KEYWORDS: string[] = [
  '2', '3', 'L3', 'L4', 'Test', 'Quality', 'QA', 'Support', 'Testing', 'Android', 'Mobile','React', 'React.js', 'React Js', 'React Native', 'Flutter', 'iOS','Rust', 'Dot net', "Bussiness", 'C#', 'Sales', '.NET', 'Kotline', 'Swift', 'Golang', 'Game' ,'Unity', 'Game', 'SRE', 'Data Engineer', 'Data Scientist', 'Machine Learning', 'ML Engineer', 'AI Engineer', 'Security', 'Network', 'Hardware', 'Embedded', 'Firmware', 'Front End', 'Frontend', 'UI/UX', 'Designer', 'Product Manager', 'Project Manager', 'Front End', 'Tester', 'Kubernetes'
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

    const allMatched = [...new Set([...matchedGeneral, ...matchedTitle])];

    if (allMatched.length > 0) {
      binned.push({ ...job });
    } else {
      relevant.push(job);
    }
  }

  return { relevant, binned };
}
