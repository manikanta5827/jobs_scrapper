/**
 * apify.ts
 * Scrapes LinkedIn jobs using the curious_coder/linkedin-jobs-scraper actor.
 * Uses run-sync-get-dataset-items — blocks until done, returns items directly.
 * Apify takes ~2 min max. No async complexity needed.
 */

import type { Job } from './types';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getValidApifyToken, updateApifyTokenUsage, markApifyTokenExpired } from './db_helper';

const ACTOR_ID = 'hKByXkMQaC5Qt9UMN'; // curious_coder/linkedin-jobs-scraper
const JOBS_PER_URL = 100;

/**
 * Scrape all provided LinkedIn search URLs sequentially.
 * Sequential (not parallel) to avoid Apify concurrent run limits.
 */
export async function scrapeJobs(urls: string[]): Promise<Job[]> {
  // --- MOCK MODE ---
  if (process.env.APP_ENV === 'dev') {
    console.log('--- [DEV MODE] Using mock data from mock_jobs.json ---');
    try {
      const mockFilePath = path.join(process.cwd(), 'mock_jobs.json');
      const data = await fs.readFile(mockFilePath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      console.warn('Failed to read mock_jobs.json, falling back to real scrape...', err);
    }
  }

  const allJobs: Job[] = [];

  for (const url of urls) {
    console.log(`Scraping: ${url}`);
    try {
      const jobs = await scrapeUrlWithRotation(url);
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

/**
 * Retries scraping with different tokens if one is exhausted.
 */
async function scrapeUrlWithRotation(url: string, retries: number = 3): Promise<Job[]> {
  for (let i = 0; i < retries; i++) {
    const tokenData = await getValidApifyToken();
    
    if (!tokenData) {
      throw new Error("No valid Apify tokens available (all exhausted or expired).");
    }

    try {
      const jobs = await scrapeUrl(url, tokenData.apiKey);
      // Update usage: $0.001 per job, rounded to 2 decimal places.
      await updateApifyTokenUsage(tokenData.id, jobs.length);
      return jobs;
    } catch (err: any) {
      // If error indicates monthly usage hard limit exceeded (status 403 or specific error message)
      const isExhausted = err.message?.toLowerCase().includes("monthly usage hard limit exceeded") || 
                          err.message?.includes("403");
      
      if (isExhausted) {
        console.warn(`Token ID ${tokenData.id} exhausted. Marking as expired.`);
        await markApifyTokenExpired(tokenData.id);
        // Continue loop to try next token
        continue;
      }
      
      throw err; // Re-throw other errors
    }
  }
  
  throw new Error("Failed to scrape after trying all available tokens.");
}

async function scrapeUrl(url: string, apiKey: string): Promise<Job[]> {
  const endpoint =
    `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${apiKey}&format=json&clean=true&memory=1024`;

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
    console.error('Apify status :', res.status);
    console.error(JSON.parse(text));

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
