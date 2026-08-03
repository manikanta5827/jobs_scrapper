import type { Job } from '../types';

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
      binned.push({ ...job, keywordBinReason: matchedExcludes.join(', ') });
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

    // Attach regex-extracted YOE directly to job object for database persistence even if rejected before LLM
    const enrichedJob: Job = {
      ...job,
      minRequiredYoe: minRequired,
      maxRequiredYoe: maxRequired,
      extractedYoeText: yoeText,
    };

    // Fresher-friendly listings — let LLM decide, don't YOE-reject
    const isFresherFriendly = FRESHER_SIGNAL.test(text);

    if (minRequired === null && maxRequired === null) {
      passToLLM.push(enrichedJob);
      continue;
    }

    if (minRequired !== null && minRequired > candidateYoe) {
      yoeRejected.push({
        ...enrichedJob,
        keywordBinReason: `YOE: requires ${minRequired}+ yr, candidate has ${candidateYoe} yr`,
      });
      continue;
    }

    // Overqualified: job's max YOE is below candidate's YOE
    if (maxRequired !== null && maxRequired < candidateYoe && !isFresherFriendly) {
      yoeRejected.push({
        ...enrichedJob,
        keywordBinReason: `YOE: requires ${maxRequired}- yr max, candidate has ${candidateYoe} yr`,
      });
      continue;
    }

    passToLLM.push(enrichedJob);
  }

  return { passToLLM, yoeRejected };
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

const JUNIOR_TITLE_KEYWORDS = [
  'fresher', 'intern ', 'internship', 'junior', 'jr.', 'jr ',
  'graduate trainee', 'trainee', 'apprentice', 'entry level', 'entry-level',
  'sde1', 'sde 1', 'sde i',
];

/**
 * Auto-filters jobs whose titles imply seniority beyond the candidate's level or junior roles for senior devs.
 * - Candidates with ≤3 YOE: exclude senior/lead/manager/director roles
 * - Candidates with ≤5 YOE: exclude director/VP/architect/staff roles only
 * - Candidates with >5 YOE: exclude junior/entry-level/intern/trainee roles
 */
export function seniorityKeywordFilter(
  jobs: Job[],
  candidateYoe: number,
): { relevant: Job[]; filtered: Job[] } {
  const relevant: Job[] = [];
  const filtered: Job[] = [];
  const isSeniorCandidate = candidateYoe > 5;
  const keywords = isSeniorCandidate ? JUNIOR_TITLE_KEYWORDS : SENIOR_TITLE_KEYWORDS;

  for (const job of jobs) {
    const title = (job.title ?? '').toLowerCase();
    const matched = keywords.find(kw => title.includes(kw));
    if (matched) {
      filtered.push({
        ...job,
        keywordBinReason: `Seniority: "${matched}"${isSeniorCandidate ? ' (junior role)' : ''} in title, candidate has ${candidateYoe} YOE`,
      });
    } else {
      relevant.push(job);
    }
  }

  return { relevant, filtered };
}
