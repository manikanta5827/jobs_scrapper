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

const YOE_PATTERNS: RegExp[] = [
  // Universal: any <number> year(s) pattern — catches ranges (2-4), X+, and simple mentions.
  // Normalized possessive forms handled before matching (year's → year).
  /(\d+)(?:\s*\+|\s*[\–\-]\s*(\d+))?\s*years?\b/gi,
];

export function extractMinYoe(descriptionText: string): { min: number | null; fullText: string | null } {
  // Normalize possessive: "year's", "years'" → "year" so year boundary works
  const text = (descriptionText || '').replace(/\byear'?s\b/gi, 'year');

  let overallMin: number | null = null;
  let bestMatchText: string | null = null;

  for (const pattern of YOE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      // "up to X years" is an upper bound, not a minimum requirement — skip
      const preContext = text.substring(Math.max(0, match.index - 15), match.index);
      if (/\bup\s+to\b\s*$/.test(preContext)) continue;

      const num1 = parseInt(match[1], 10);
      const num2 = match[2] ? parseInt(match[2], 10) : null;
      const effectiveMin = num2 ? Math.min(num1, num2) : num1;

      if (overallMin === null || effectiveMin > overallMin) {
        overallMin = effectiveMin;
        bestMatchText = match[0];
      }
    }
  }

  return { min: overallMin, fullText: bestMatchText };
}

const FRESHER_SIGNAL = /\b(?:freshers?|fresh[ -]?graduat(?:es?|ion))\b/i;

export function yoePreFilter(
  jobs: Job[],
  candidateYoe: number
): { passToLLM: Job[]; yoeRejected: Job[] } {
  const passToLLM: Job[] = [];
  const yoeRejected: Job[] = [];

  for (const job of jobs) {
    const text = (job.descriptionText ?? '') + ' ' + (job.seniorityLevel ?? '');
    const { min: minRequired, fullText: yoeText } = extractMinYoe(text);

    // Fresher-friendly listings — let LLM decide, don't YOE-reject
    const isFresherFriendly = FRESHER_SIGNAL.test(text);

    if (minRequired === null || isFresherFriendly) {
      passToLLM.push(job);
      continue;
    }

    if (minRequired > candidateYoe) {
      yoeRejected.push({
        ...job,
        keyword_bin_reason: `YOE: requires ${minRequired}+ yr, candidate has ${candidateYoe} yr`,
      });
    } else {
      passToLLM.push({ ...job, extractedYoeText: yoeText });
    }
  }

  return { passToLLM, yoeRejected };
}
