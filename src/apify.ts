/**
 * apify.ts
 * Scrapes LinkedIn jobs using the curious_coder/linkedin-jobs-scraper actor.
 * Uses run-sync-get-dataset-items — blocks until done, returns items directly.
 * Apify takes ~2 min max. No async complexity needed.
 */

import type { Job } from '../types';

const APIFY_TOKEN = process.env.APIFY_TOKEN!;
const ACTOR_ID = 'hKByXkMQaC5Qt9UMN'; // curious_coder/linkedin-jobs-scraper
const JOBS_PER_URL = 100;

/**
 * Scrape all provided LinkedIn search URLs sequentially.
 * Sequential (not parallel) to avoid Apify concurrent run limits.
 */
export async function scrapeJobs(urls: string[]): Promise<Job[]> {
  const allJobs: Job[] = [];

  for (const url of urls) {
    console.log(`Scraping: ${url}`);
    try {
      const jobs = await scrapeUrl(url);
      console.log(`  → ${jobs.length} jobs`);
      allJobs.push(...jobs);
    } catch (err) {
      // Don't fail entire Lambda if one city fails
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  → Failed: ${message}`);
    }
  }

  return deduplicateByLink(allJobs);
}

async function scrapeUrl(url: string): Promise<Job[]> {
  const endpoint =
    `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items` +
    `?token=${APIFY_TOKEN}&format=json&clean=true`;

  const body = JSON.stringify({
    urls: [url],
    scrapeCompany: true,
    count: JOBS_PER_URL,
    splitByLocation: false,
  });

  const res = await fetchWithTimeout(
    endpoint,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
    300_000 // 5 min — Apify takes ~2 min in practice
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify HTTP ${res.status}: ${text}`);
  }

  const items: unknown = await res.json();

  if (!Array.isArray(items)) {
    throw new Error(`Apify returned non-array: ${JSON.stringify(items).slice(0, 200)}`);
  }

  return items as Job[];
}

function deduplicateByLink(jobs: Job[]): Job[] {
  const seen = new Set<string>();
  return jobs.filter(job => {
    if (!job.link || seen.has(job.link)) return false;
    seen.add(job.link);
    return true;
  });
}

function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}
