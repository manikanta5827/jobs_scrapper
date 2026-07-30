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

export interface YoeRange {
  min: number | null;
  max: number | null;
  fullText: string | null;
}

export function extractYoeRange(descriptionText: string): YoeRange {
  // Normalize possessive: "year's", "years'" → "year" so year boundary works
  const text = (descriptionText || '').replace(/\byear'?s\b/gi, 'year');

  let overallMin: number | null = null;
  let overallMax: number | null = null;
  let bestMatchText: string | null = null;

  for (const pattern of YOE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      // "up to X years" is an upper bound only, not a range — skip min side
      const preContext = text.substring(Math.max(0, match.index - 15), match.index);
      if (/\bup\s+to\b\s*$/.test(preContext)) {
        // Only capture the upper bound
        const num = parseInt(match[1], 10);
        if (overallMax === null || num > overallMax) {
          overallMax = num;
          bestMatchText = match[0];
        }
        continue;
      }

      const num1 = parseInt(match[1], 10);
      const num2 = match[2] ? parseInt(match[2], 10) : null;
      const hasPlus = match[0].replace(/\s/g, '').includes(`${num1}+`);

      const min = num2 ? Math.min(num1, num2) : num1;
      const max = num2 ? Math.max(num1, num2) : (hasPlus ? null : null);
      // For a plain "X years" treat it as a minimum (exact requirement) unless context says otherwise.
      // We do not infer a max from plain mentions.

      if (overallMin === null || min > overallMin) {
        overallMin = min;
      }
      if (max !== null && (overallMax === null || max > overallMax)) {
        overallMax = max;
      }
      bestMatchText = match[0];
    }
  }

  return { min: overallMin, max: overallMax, fullText: bestMatchText };
}

/** @deprecated Use extractYoeRange instead */
export function extractMinYoe(descriptionText: string): { min: number | null; fullText: string | null } {
  const { min, fullText } = extractYoeRange(descriptionText);
  return { min, fullText };
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
    const { min: minRequired, max: maxRequired, fullText: yoeText } = extractYoeRange(text);

    // Fresher-friendly listings — let LLM decide, don't YOE-reject
    const isFresherFriendly = FRESHER_SIGNAL.test(text);

    if (minRequired === null && maxRequired === null) {
      passToLLM.push(job);
      continue;
    }

    if (minRequired !== null && minRequired > candidateYoe) {
      yoeRejected.push({
        ...job,
        keyword_bin_reason: `YOE: requires ${minRequired}+ yr, candidate has ${candidateYoe} yr`,
      });
      continue;
    }

    // Overqualified: job's max YOE is below candidate's YOE
    if (maxRequired !== null && maxRequired < candidateYoe && !isFresherFriendly) {
      yoeRejected.push({
        ...job,
        keyword_bin_reason: `YOE: requires ${maxRequired}- yr max, candidate has ${candidateYoe} yr`,
      });
      continue;
    }

    passToLLM.push({ ...job, extractedYoeText: yoeText });
  }

  return { passToLLM, yoeRejected };
}

// ─── TITLE RELEVANCE PRE-FILTER ────────────────────────────────────────────

/**
 * Scores jobs by title similarity to target job titles using Jaro-Winkler.
 * Keeps only the top percentage, discarding clearly irrelevant titles
 * before they hit the LLM pipeline. Reduces LLM cost and improves match rate.
 */
export function titleRelevanceFilter(
  jobs: Job[],
  targetTitles: string[],
  keepPercentage: number = 0.60,
): Job[] {
  if (targetTitles.length === 0 || jobs.length === 0) return jobs;

  const keepCount = Math.max(1, Math.ceil(jobs.length * keepPercentage));
  if (jobs.length <= keepCount) return jobs;

  const scored = jobs.map(job => {
    const title = (job.title ?? '').toLowerCase().trim();
    const bestScore = targetTitles.reduce((best, t) => {
      const sim = jaroWinklerSimilarity(title, t.toLowerCase().trim());
      return Math.max(best, sim);
    }, 0);
    return { job, score: bestScore };
  });

  scored.sort((a, b) => b.score - a.score);

  const kept = scored.slice(0, keepCount);
  const removed = scored.slice(keepCount);

  if (removed.length > 0) {
    console.log(
      `[titleRelevanceFilter] Kept ${kept.length}/${jobs.length} (${keepPercentage * 100}%), removed:\n` +
      removed.map(s => `  ✗ "${s.job.title}" (score=${s.score.toFixed(3)})`).join('\n')
    );
  }

  return kept.map(s => s.job);
}

function jaroWinklerSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matchDistance = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  const aMatches: boolean[] = new Array(a.length).fill(false);
  const bMatches: boolean[] = new Array(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, b.length);
    for (let j = start; j < end; j++) {
      if (!bMatches[j] && a[i] === b[j]) {
        aMatches[i] = true;
        bMatches[j] = true;
        matches++;
        break;
      }
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions = Math.floor(transpositions / 2);

  const jaro =
    (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

// ─── AUTO-DERIVED SENIORITY KEYWORD FILTER ─────────────────────────────────

const SENIOR_TITLE_KEYWORDS = [
  'director', 'vp ', 'vice president', 'principal engineer', 'staff engineer',
  'architect', 'head of', 'lead', 'manager', 'chief', 'cto',
  'sde4', 'sde 4', 'sde iv',
  'senior manager', 'senior director', 'senior lead',
  'staff software engineer', 'distinguished engineer',
  'engineering manager', 'tech lead',
];

/**
 * Auto-filters jobs whose titles imply seniority beyond the candidate's level.
 * - Candidates with ≤3 YOE: exclude senior/lead/manager/director roles
 * - Candidates with ≤5 YOE: exclude director/VP/architect/staff roles only
 * - Candidates with >5 YOE: no auto-filtering (they can self-select)
 */
export function seniorityKeywordFilter(
  jobs: Job[],
  candidateYoe: number,
): { relevant: Job[]; filtered: Job[] } {
  const relevant: Job[] = [];
  const filtered: Job[] = [];

  if (candidateYoe > 5) return { relevant: jobs, filtered };

  for (const job of jobs) {
    const title = (job.title ?? '').toLowerCase();
    const matched = SENIOR_TITLE_KEYWORDS.find(kw => title.includes(kw));

    if (matched) {
      filtered.push({
        ...job,
        keyword_bin_reason: `Seniority: "${matched}" in title, candidate has ${candidateYoe} YOE`,
      });
    } else {
      relevant.push(job);
    }
  }

  return { relevant, filtered };
}
