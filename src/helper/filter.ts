import type { Job } from './types';

export interface FilterResult {
  relevant: Job[];
  binned: Job[];
}

/** System-wide blocked companies — case-insensitive match on job.companyName */
const BLOCKED_COMPANIES: string[] = [
  'Scoutit',
];

/**
 * Filters out jobs from blocked companies.
 * Matches case-insensitively against job companyName.
 * Uses .includes() so "Scoutit Inc" and "Scoutit" both match.
 */
export function companyBlockFilter(jobs: Job[]): { relevant: Job[]; blocked: Job[] } {
  const blockedLower = BLOCKED_COMPANIES.map(c => c.toLowerCase().trim());
  const relevant: Job[] = [];
  const blocked: Job[] = [];

  for (const job of jobs) {
    const company = (job.companyName || '').toLowerCase().trim();
    if (company && blockedLower.some(b => company.includes(b))) {
      blocked.push(job);
    } else {
      relevant.push(job);
    }
  }

  return { relevant, blocked };
}

// Applies dynamic lookback seconds parameter to target search URLs array
export function prepareSearchUrls(urls: string[], lookbackSeconds: number): string[] {
  return urls.map(url => {
    if (url.includes('f_TPR=r')) {
      return url.replace(/f_TPR=r\d+/, `f_TPR=r${lookbackSeconds}`);
    }
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}f_TPR=r${lookbackSeconds}`;
  });
}

/**
 * Keyword pre-filtering using candidate's excludeTitleKeywords.
 * Strictly matches exclude keywords against the job Title and Seniority Level,
 * preventing false positives caused by words like "Senior" or "Lead" inside job description text.
 */
export function keywordFilter(jobs: Job[], userExcludeTitleKeywords: string[] = []): FilterResult {
  const relevant: Job[] = [];
  const binned: Job[] = [];

  // Convert candidate's exclude keywords array to lowercase for case-insensitive matching
  const excludes = userExcludeTitleKeywords.map(kw => kw.toLowerCase().trim()).filter(Boolean);

  for (const job of jobs) {
    const title = (job.title ?? '').toLowerCase();
    const seniorityLevel = (job.seniorityLevel ?? '').toLowerCase();
    
    // Check exclude keywords ONLY against job title and seniority level string
    const targetText = `${title} ${seniorityLevel}`;
    const matchedExcludes = excludes.filter(kw => targetText.includes(kw));

    if (matchedExcludes.length > 0) {
      binned.push({ ...job, keyword_bin_reason: matchedExcludes.join(', ') });
    } else {
      relevant.push(job);
    }
  }

  return { relevant, binned };
}
