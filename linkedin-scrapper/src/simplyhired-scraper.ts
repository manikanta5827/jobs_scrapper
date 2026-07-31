import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SimplyHiredJobQueryOptions } from './simplyhired-types';
import { JobPosting, JobDetails } from './types';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const dateMap: Record<string, string> = {
  '24hr': '1',
  '1': '1',
  '3days': '3',
  '3': '3',
  '7days': '7',
  '7': '7',
  '14days': '14',
  '14': '14',
  '30days': '30',
  '30': '30',
};

const jobTypeMap: Record<string, string> = {
  fulltime: 'CF3CP',
  contract: 'NJXCK',
  parttime: '75GKK',
  permanent: '5QWDV',
  freelance: 'ZG59D',
  'temp-to-hire': '7SBAT',
  temporary: '4HKF7',
  internship: 'VDTG7',
  cf3cp: 'CF3CP',
  njxck: 'NJXCK',
  '75gkk': '75GKK',
  '5qwdv': '5QWDV',
  zg59d: 'ZG59D',
  '7sbat': '7SBAT',
  '4hkf7': '4HKF7',
  vdtg7: 'VDTG7',
};

function getBaseUrl(options: SimplyHiredJobQueryOptions): string {
  if (options.domain) {
    if (options.domain.startsWith('http://') || options.domain.startsWith('https://')) {
      return options.domain.replace(/\/+$/, '');
    }
    return `https://www.${options.domain.replace(/^www\./, '')}`;
  }
  if (options.location && /bengaluru|bangalore|hyderabad|mumbai|pune|chennai|delhi|gurugram|noida|kolkata|ahmedabad|india/i.test(options.location)) {
    return 'https://www.simplyhired.co.in';
  }
  return 'https://www.simplyhired.com';
}

function buildSearchUrl(options: SimplyHiredJobQueryOptions): string {
  const baseUrl = getBaseUrl(options);
  const params = new URLSearchParams();

  if (options.keyword) params.append('q', options.keyword);
  if (options.location) params.append('l', options.location);

  if (options.page && options.page > 1) {
    params.append('pn', String(options.page));
  }

  if (options.datePosted) {
    const dayVal = dateMap[String(options.datePosted).toLowerCase()];
    if (dayVal) params.append('t', dayVal);
  }

  if (options.jobType) {
    const items = Array.isArray(options.jobType) ? options.jobType : [options.jobType];
    items.forEach((jt) => {
      const code = jobTypeMap[String(jt).toLowerCase()] || jt;
      params.append('jt', code);
    });
  }

  if (options.sort === 'date') {
    params.append('s', 'd');
  }

  if (options.distance) {
    params.append('sr', String(options.distance));
  }

  return `${baseUrl}/search?${params.toString()}`;
}

interface RawJob {
  jobKey: string;
  title: string;
  snippet: string;
  company?: string;
  location?: string;
  salaryInfo?: { raw?: string; min?: number; max?: number; type?: string };
  companyRating?: number;
  benefits?: string[];
  jobTypes?: string[];
  dateOnIndeed?: string;
  encodedUrl?: string;
  botUrl?: string;
}

interface RawViewJob {
  jobDescriptionHtml?: string;
  compensation?: { raw?: string };
  qualifications?: string[];
  datePublished?: string;
  employerName?: string;
  formattedLocation?: string;
  employerOverallRating?: number;
  employerSquareLogoUrl?: string;
  workSettings?: string[];
  jobTypes?: string[];
}

function parseNextData(html: string): { jobs: RawJob[]; viewJob: RawViewJob | null } {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/);
  if (!match) return { jobs: [], viewJob: null };

  try {
    const data = JSON.parse(match[1]);
    const pageProps = data?.props?.pageProps || {};
    const jobs: RawJob[] = pageProps.jobs || [];
    const viewJob: RawViewJob | null = pageProps.viewJobData || null;
    return { jobs, viewJob };
  } catch {
    return { jobs: [], viewJob: null };
  }
}

function extractSalary(job: RawJob, viewJob: RawViewJob | null): string {
  if (typeof job.salaryInfo === 'string') return job.salaryInfo;
  if (job.salaryInfo?.raw) return job.salaryInfo.raw;
  if (viewJob?.compensation?.raw) return viewJob.compensation.raw;
  return 'Not specified';
}

function mapToJobPosting(job: RawJob, viewJob: RawViewJob | null, index: number, baseUrl: string): JobPosting {
  const jobUrl = job.encodedUrl
    ? `${baseUrl}${decodeURIComponent(job.encodedUrl)}`
    : '';

  const details: JobDetails = {};

  if (viewJob && index === 0) {
    details.descriptionText = viewJob.jobDescriptionHtml || '';
    details.employmentType = (viewJob.jobTypes || []).join(', ');
  }

  if (!details.descriptionText && job.snippet) {
    details.descriptionText = job.snippet;
  }

  return {
    id: job.jobKey,
    position: job.title,
    company: viewJob?.employerName || job.company || '',
    location: viewJob?.formattedLocation || job.location || '',
    date: viewJob?.datePublished || job.dateOnIndeed || '',
    salary: extractSalary(job, viewJob),
    jobUrl,
    companyLogo: viewJob?.employerSquareLogoUrl || '',
    agoTime: job.dateOnIndeed || '',
    details,
  };
}

export class SimplyHiredJobsQuery {
  public options: SimplyHiredJobQueryOptions;

  constructor(options: SimplyHiredJobQueryOptions) {
    this.options = options;
  }

  public async getJobs(): Promise<JobPosting[]> {
    const maxLimit = this.options.limit || 25;
    let allJobs: JobPosting[] = [];
    let currentPage = this.options.page || 1;
    let totalCount = 0;
    const baseUrl = getBaseUrl(this.options);

    while (allJobs.length < maxLimit) {
      const url = buildSearchUrl({ ...this.options, page: currentPage });

      const headers: Record<string, string> = {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      };

      const proxyUrl = process.env.PROXY_URL;
      const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

      const response = await axios.get(url, {
        headers,
        httpsAgent: agent,
        httpAgent: agent,
        timeout: 10000,
        validateStatus: (status: number) => status === 200,
      });

      const { jobs, viewJob } = parseNextData(response.data);

      if (!jobs || jobs.length === 0) break;

      if (totalCount === 0) {
        const resultMatch = response.data.match(/"resultCount":(\d+)/);
        totalCount = resultMatch ? parseInt(resultMatch[1], 10) : jobs.length;
      }

      const mapped = jobs.map((job, i) => mapToJobPosting(job, i === 0 ? viewJob : null, i, baseUrl));
      allJobs.push(...mapped);

      if (jobs.length < 20 || allJobs.length >= totalCount) break;

      currentPage++;
      await delay(500 + Math.random() * 300);
    }

    return allJobs.slice(0, maxLimit).map((job) => ({ ...job, source: 'simplyhired' as const }));
  }
}

export function querySimplyHiredJobs(options: SimplyHiredJobQueryOptions): Promise<JobPosting[]> {
  const query = new SimplyHiredJobsQuery(options);
  return query.getJobs();
}
