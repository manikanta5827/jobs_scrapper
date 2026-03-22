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
const JOBS_PER_URL = 200;

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
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  → Failed to scrape ${url}: ${message}`);

      // FATAL: If we are completely out of tokens or hit credential issues, 
      // stop everything and let the main handler notify the admin.
      const isFatal = 
        message.includes("No valid Apify tokens available (all exhausted or expired).") || 
        message.includes("Failed after trying all tokens") ||
        message.includes("401") || 
        message.includes("403");

      if (isFatal) {
        throw err; 
      }
      
      // For non-fatal errors (timeout, 500 on one URL), we continue to the next URL.
    }
  }

  return deduplicateByLink(allJobs);
}

/**
 * Retries scraping with different tokens if one is exhausted or invalid.
 */
async function scrapeUrlWithRotation(url: string): Promise<Job[]> {
  while (true) {
    const tokenData = await getValidApifyToken();
    
    console.log(`Fetched token ID ${tokenData?.id} for scraping.`);
    
    if (!tokenData) {
      throw new Error("No valid Apify tokens available (all exhausted or expired).");
    }

    try {
      const jobs = await scrapeUrl(url, tokenData.apiKey);
      // Update usage: $0.001 per job, rounded to 2 decimal places.
      await updateApifyTokenUsage(tokenData.id, jobs.length);
      return jobs;
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      
      // If error indicates monthly usage hard limit exceeded (403) or invalid token (401)
      const isInvalidOrExhausted = 
        message.includes("403") || 
        message.includes("401") ||
        message.toLowerCase().includes("monthly usage hard limit exceeded") ||
        message.toLowerCase().includes("unauthorized");
      
      if (isInvalidOrExhausted) {
        console.warn(`Token ID ${tokenData.id} is invalid or exhausted. Marking as expired and rotating...`);
        await markApifyTokenExpired(tokenData.id);
        // Continue loop to fetch the NEXT best token from the database
        continue;
      }
      
      // For network errors, timeouts, or 500s, don't rotate/expire the token, just fail this URL.
      throw err; 
    }
  }
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
    // We include the status code in the error message so scrapeUrlWithRotation can detect 401/403
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
