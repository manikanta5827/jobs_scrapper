import type { Job } from './types';

export interface FilterResult {
  relevant: Job[];
  binned: Job[];
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

// Keyword pre-filtering using candidate's excludeKeywords fetched from user DB row across both title & description
export function keywordFilter(jobs: Job[], userExcludeTitleKeywords: string[] = []): FilterResult {
  const relevant: Job[] = [];
  const binned: Job[] = [];

  // Convert candidate's exclude keywords array to lowercase for case-insensitive matching
  const excludes = userExcludeTitleKeywords.map(kw => kw.toLowerCase().trim()).filter(Boolean);

  for (const job of jobs) {
    const title = (job.title ?? '').toLowerCase();
    const descriptionText = (job.descriptionText ?? '').toLowerCase();
    const combinedText = `${title} ${descriptionText}`;

    // Check candidate's exclude keywords against both job title and description text
    const matchedExcludes = excludes.filter(kw => combinedText.includes(kw));

    if (matchedExcludes.length > 0) {
      binned.push({ ...job, keyword_bin_reason: matchedExcludes.join(', ') });
    } else {
      relevant.push(job);
    }
  }

  return { relevant, binned };
}
