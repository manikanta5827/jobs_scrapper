import axios from 'axios';
import * as cheerio from 'cheerio';
import randomUseragent from 'random-useragent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import {
  JobQueryOptions,
  JobPosting,
  JobDetails,
  DateSincePostedOption,
  ExperienceLevelOption,
  JobTypeOption,
  RemoteFilterOption,
} from './types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ponytail: tune these if you add proxy rotation or see persistent 429s
const DETAIL_FETCH_RETRIES = 3;
const DETAIL_FETCH_CONCURRENCY = 5;

/**
 * Fetches full job details (description text, seniority level, employment type, criteria) for a specific LinkedIn job ID
 */
export async function fetchJobDetails(jobId: string, proxyUrl?: string): Promise<JobDetails | null> {
  const cleanId = String(jobId).replace(/[^0-9]/g, '');
  if (!cleanId) {
    return null;
  }

  const url = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${cleanId}`;
  const headers = {
    'User-Agent': randomUseragent.getRandom(),
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const config: any = {
    headers,
    timeout: 10000,
    validateStatus: (status: number) => status === 200,
  };

  const effectiveProxy = proxyUrl || process.env.PROXY_URL;
  if (effectiveProxy) {
    config.httpsAgent = new HttpsProxyAgent(effectiveProxy);
  }

  for (let attempt = 1; attempt <= DETAIL_FETCH_RETRIES; attempt++) {
    try {
      // Rotate user-agent per attempt to reduce fingerprinting
      config.headers['User-Agent'] = randomUseragent.getRandom();
      const response = await axios.get(url, config);
      const $ = cheerio.load(response.data);

      const descriptionContainer = $('.show-more-less-html__markup');
      const descriptionText = descriptionContainer.text().trim();

      const criteria: Record<string, string> = {};
      $('.description__job-criteria-item').each((_, el) => {
        const key = $(el).find('.description__job-criteria-subheader').text().trim();
        const val = $(el).find('.description__job-criteria-text').text().trim();
        if (key && val) criteria[key] = val;
      });

      const numApplicants = $('.num-applicants__caption').text().trim() ||
                            $('.sub-nav-cta__sub-title').text().trim();

      return {
        descriptionText,
        seniorityLevel: criteria['Seniority level'] || '',
        employmentType: criteria['Employment type'] || '',
        jobFunction: criteria['Job function'] || '',
        industries: criteria['Industries'] || '',
        numApplicants: numApplicants || '',
      };
    } catch (err: any) {
      const status = err?.response?.status;
      const isRetryable = !status || status === 429 || status === 403 || status >= 500;
      if (isRetryable && attempt < DETAIL_FETCH_RETRIES) {
        // ponytail: exponential backoff + jitter; ceiling ~8s on attempt 3
        await delay(Math.pow(2, attempt) * 1000 + Math.random() * 500);
        continue;
      }
      // Non-retryable error or exhausted retries
      return null;
    }
  }

  // ponytail: unreachable — loop always returns; satisfies TS
  return null;
}

export class LinkedInJobsQuery {
  public options: JobQueryOptions;

  constructor(options: JobQueryOptions) {
    this.options = options;
  }

  private parseDateSincePosted(val?: DateSincePostedOption): string {
    if (!val) return '';
    const dateRangeMap: Record<string, string> = {
      'past month': 'r2592000',
      'past week': 'r604800',
      '24hr': 'r86400',
      'past 24 hours': 'r86400',
    };
    return dateRangeMap[val.toLowerCase()] || '';
  }

  private parseExperienceLevel(val?: ExperienceLevelOption | ExperienceLevelOption[] | ''): string {
    if (!val) return '';
    const map: Record<string, string> = {
      internship: '1',
      'entry level': '2',
      associate: '3',
      senior: '4',
      director: '5',
      executive: '6',
    };
    const items = Array.isArray(val) ? val : [val];
    const codes = items
      .map((item) => map[String(item).toLowerCase()] || String(item))
      .filter((code) => ['1', '2', '3', '4', '5', '6'].includes(code));
    return codes.join(',');
  }

  private parseJobType(val?: JobTypeOption | JobTypeOption[] | ''): string {
    if (!val) return '';
    const map: Record<string, string> = {
      'full time': 'F',
      'full-time': 'F',
      'part time': 'P',
      'part-time': 'P',
      contract: 'C',
      temporary: 'T',
      volunteer: 'V',
      internship: 'I',
    };
    const items = Array.isArray(val) ? val : [val];
    const codes = items
      .map((item) => map[String(item).toLowerCase()] || String(item).toUpperCase())
      .filter((code) => ['F', 'P', 'C', 'T', 'V', 'I'].includes(code));
    return codes.join(',');
  }

  private parseRemoteFilter(val?: RemoteFilterOption | RemoteFilterOption[] | ''): string {
    if (!val) return '';
    const map: Record<string, string> = {
      'on-site': '1',
      'on site': '1',
      remote: '2',
      hybrid: '3',
    };
    const items = Array.isArray(val) ? val : [val];
    const codes = items
      .map((item) => map[String(item).toLowerCase()] || String(item))
      .filter((code) => ['1', '2', '3'].includes(code));
    return codes.join(',');
  }

  private parseSalary(val?: string | number): string {
    if (!val) return '';
    const map: Record<string, string> = {
      '40000': '1',
      '60000': '2',
      '80000': '3',
      '100000': '4',
      '120000': '5',
    };
    return map[String(val)] || String(val) || '';
  }

  public buildUrl(startOffset: number = 0): string {
    const host = this.options.host || 'www.linkedin.com';
    const query = `https://${host}/jobs-guest/jobs/api/seeMoreJobPostings/search?`;
    const params = new URLSearchParams();

    if (this.options.keyword) params.append('keywords', this.options.keyword);
    if (this.options.location) params.append('location', this.options.location);
    if (this.options.geoId) params.append('geoId', String(this.options.geoId));

    if (this.options.company) {
      const companies = Array.isArray(this.options.company)
        ? this.options.company.join(',')
        : String(this.options.company);
      params.append('f_C', companies);
    }

    const dateCode = this.parseDateSincePosted(this.options.dateSincePosted);
    if (dateCode) params.append('f_TPR', dateCode);

    const expCode = this.parseExperienceLevel(this.options.experienceLevel);
    if (expCode) params.append('f_E', expCode);

    const jobTypeCode = this.parseJobType(this.options.jobType);
    if (jobTypeCode) params.append('f_JT', jobTypeCode);

    const remoteCode = this.parseRemoteFilter(this.options.remoteFilter);
    if (remoteCode) params.append('f_WT', remoteCode);

    const salaryCode = this.parseSalary(this.options.salary);
    if (salaryCode) params.append('f_SB2', salaryCode);

    if (this.options.easyApply) params.append('f_AL', 'true');
    if (this.options.has_verification) params.append('f_VJ', 'true');
    if (this.options.under_10_applicants) params.append('f_EA', 'true');

    const pageOffset = (this.options.page || 0) * 25;
    const totalStart = startOffset + pageOffset;
    params.append('start', String(totalStart));

    if (this.options.sortBy === 'recent' || this.options.sortBy === 'DD') {
      params.append('sortBy', 'DD');
    } else if (this.options.sortBy === 'relevant' || this.options.sortBy === 'R') {
      params.append('sortBy', 'R');
    }

    return query + params.toString();
  }

  public async getJobs(): Promise<JobPosting[]> {
    let allJobs: JobPosting[] = [];
    let start = 0;
    const BATCH_SIZE = 25;
    let hasMore = true;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;
    const maxLimit = this.options.limit || 25;

    while (hasMore) {
      try {
        const jobs = await this.fetchBatch(start);

        if (!jobs || jobs.length === 0) {
          hasMore = false;
          break;
        }

        allJobs.push(...jobs);

        if (allJobs.length >= maxLimit) {
          allJobs = allJobs.slice(0, maxLimit);
          break;
        }

        consecutiveErrors = 0;
        start += BATCH_SIZE;

        await delay(1500 + Math.random() * 1000);
      } catch (error: any) {
        consecutiveErrors++;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          break;
        }
        await delay(Math.pow(2, consecutiveErrors) * 1000);
      }
    }

    // Fetch job details with concurrency limit to avoid LinkedIn rate-limiting
    // ponytail: simple chunked approach; upgrade to p-limit if you need finer control
    const jobsNeedingDetails = allJobs.filter(job => job.id);
    for (let i = 0; i < jobsNeedingDetails.length; i += DETAIL_FETCH_CONCURRENCY) {
      const chunk = jobsNeedingDetails.slice(i, i + DETAIL_FETCH_CONCURRENCY);
      await Promise.all(
        chunk.map(async (job) => {
          const details = await fetchJobDetails(job.id!, this.options.proxyUrl);
          if (details) job.details = details;
        })
      );
      if (i + DETAIL_FETCH_CONCURRENCY < jobsNeedingDetails.length) {
        await delay(800 + Math.random() * 400);
      }
    }

    // Drop jobs whose detail fetch failed — no description = no value to consumer
    return allJobs.filter(job => !!job.details).map(job => ({ ...job, source: 'linkedin' as const }));
  }

  private async fetchBatch(start: number): Promise<JobPosting[]> {
    const headers = {
      'User-Agent': randomUseragent.getRandom(),
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      Referer: 'https://www.linkedin.com/jobs',
      'X-Requested-With': 'XMLHttpRequest',
      Connection: 'keep-alive',
    };

    const targetUrl = this.buildUrl(start);
    const config: any = {
      headers,
      timeout: 10000,
      validateStatus: (status: number) => status === 200,
    };

    const effectiveProxy = this.options.proxyUrl || process.env.PROXY_URL;
    if (effectiveProxy) {
      config.httpsAgent = new HttpsProxyAgent(effectiveProxy);
    }

    const response = await axios.get(targetUrl, config);
    return this.parseHtml(response.data);
  }

  private parseHtml(htmlContent: string): JobPosting[] {
    const $ = cheerio.load(htmlContent);
    const jobElements = $('li');
    const results: JobPosting[] = [];

    jobElements.each((_, element) => {
      try {
        const card = $(element);
        const position = card.find('.base-search-card__title').text().trim();
        const company = card.find('.base-search-card__subtitle').text().trim();
        const location = card.find('.job-search-card__location').text().trim();
        const dateElement = card.find('time');
        const date = dateElement.attr('datetime') || '';
        const agoTime = card.find('.job-search-card__listdate').text().trim();
        const salary = card
          .find('.job-search-card__salary-info')
          .text()
          .trim()
          .replace(/\s+/g, ' ');
        const jobUrl = card.find('.base-card__full-link').attr('href') || '';
        let id = card.attr('data-entity-urn') || '';
        if (!id && jobUrl) {
          const match = jobUrl.match(/view\/([0-9]+)/) || jobUrl.match(/([0-9]{9,12})/);
          if (match) id = match[1];
        }

        if (position && company) {
          results.push({
            id,
            position,
            company,
            location,
            date,
            salary: salary || 'Not specified',
            jobUrl,
            agoTime,
          });
        }
      } catch (e) {
        // Ignore single parse error
      }
    });

    return results;
  }
}

export function queryJobs(options: JobQueryOptions): Promise<JobPosting[]> {
  const query = new LinkedInJobsQuery(options);
  return query.getJobs();
}
