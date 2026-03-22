import { createHash } from 'crypto';
import type { Job } from './types';

/**
 * Calculates a unique fingerprint for a job based on its title, company, and description.
 * Normalizes text by collapsing all whitespace to handle minor formatting differences.
 */
export const calculateFingerprint = (job: Job): string => {
  const normalize = (text: string) => 
    (text || '').toLowerCase().replace(/\s+/g, ' ').trim();

  const title = normalize(job.title || '');
  const company = normalize(job.companyName || '');
  const description = normalize(job.descriptionText || '');
  
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
    if (!job.link || !job.title || !job.companyName) continue;
    
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
