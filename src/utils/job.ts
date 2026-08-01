import { createHash } from 'crypto';
import type { Job } from '../types';

/**
 * Normalizes different scraper output formats (e.g. custom JobPosting or Apify Job)
 * into a standard Job interface with link, title, companyName, etc.
 * ponytail: one-pass coalescing to support all scraper formats without extra dependencies.
 */
export function normalizeJob(job: any): Job {
  if (!job || typeof job !== 'object') return {} as Job;
  return {
    ...job,
    title: job.title || job.position || '',
    companyName: job.companyName || job.company || '',
    link: job.link || job.jobUrl || '',
    descriptionText: job.descriptionText || job.details?.descriptionText || '',
    seniorityLevel: job.seniorityLevel || job.details?.seniorityLevel || '',
    employmentType: job.employmentType || job.details?.employmentType || '',
    jobFunction: job.jobFunction || job.details?.jobFunction || '',
    industries: job.industries || job.details?.industries || '',
    postedAt: job.postedAt || job.date || '',
  };
}

/**
 * Calculates a unique fingerprint for a job based on its title, company, and description.
 * Normalizes text by collapsing all whitespace to handle minor formatting differences.
 */
export const calculateFingerprint = (job: Job): string => {
  const normalize = (text: unknown) => 
    (typeof text === 'string' ? text : String(text || '')).toLowerCase().replace(/\s+/g, ' ').trim();

  const details = job.details as Record<string, unknown> | undefined;
  const title = normalize(job.title || job.position || '');
  const company = normalize(job.companyName || job.company || '');
  const description = normalize(job.descriptionText || details?.descriptionText || '');
  
  return createHash('sha256')
    .update(`${title}|${company}|${description}`)
    .digest('hex');
};

/**
 * Normalizes LinkedIn links to a standard format by extracting the Job ID.
 */
export const normalizeLink = (link: string): string => {
  try {
    const url = new URL(link);
    // Extract ID from /jobs/view/12345 or ?currentJobId=12345
    const jobIdMatch = url.pathname.match(/\/view\/(\d+)/) || url.searchParams.get('currentJobId');
    if (jobIdMatch) {
      const id = Array.isArray(jobIdMatch) ? jobIdMatch[1] : jobIdMatch;
      return `https://www.linkedin.com/jobs/view/${id}`;
    }
    // Fallback: remove query params
    return `${url.origin}${url.pathname}`;
  } catch {
    return link;
  }
};

/**
 * Processes scraped jobs: cleans links, calculates fingerprints, and deduplicates within the batch.
 */
export function getUniqueJobsFromBatch(rawJobs: Job[]): Job[] {
  const uniqueJobsMap = new Map<string, Job>();
  
  for (const job of rawJobs) {
    // Drop jobs missing basic fields or descriptionText (without arbitrary length check)
    if (!job.link || !job.title || !job.companyName || !job.descriptionText || !job.descriptionText.trim()) continue;
    
    const normalizedLink = normalizeLink(job.link);
    const fingerprint = calculateFingerprint(job);
    
    if (!uniqueJobsMap.has(fingerprint)) {
      uniqueJobsMap.set(fingerprint, { 
        ...job, 
        link: normalizedLink,
        fingerprint 
      });
    }
  }
  
  return Array.from(uniqueJobsMap.values());
}
