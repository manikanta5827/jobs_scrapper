import { IndeedJobQueryOptions } from '../types/indeed-types';
import { JobPosting, JobDetails } from '../types/linkedin-types';
import { parseProxy } from '../helpers/proxy-utils';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const BLOCKED_DOMAINS = [
  'google.com',
  'googletagmanager.com',
  'googlesyndication.com',
  'doubleclick.net',
  'facebook.net',
  'facebook.com',
  'accounts.google.com',
  'analytics',
  'hotjar.com',
  'clarity.ms',
  'criteo.com',
  'criteo.net',
  'adsrvr.org',
  'adservice.google.com',
  'google-analytics.com',
  'newrelic.com',
  'nr-data.net',
  'sentry.io',
  'segment.com',
  'segment.io',
  'amplitude.com',
  'mixpanel.com',
  'bat.bing.com',
  'taboola.com',
  'outbrain.com',
  'scorecardresearch.com',
  'amazon-adsystem.com',
  'intercom.io',
  'intercomcdn.com',
  'driftt.com',
  'hubspot.com',
  'hs-scripts.com',
];

export async function isBotBlocked(page: any): Promise<boolean> {
  try {
    const title = (await page.title()).toLowerCase();
    const blockedKeywords = [
      'just a moment...',
      'cloudflare',
      'attention required',
      'access denied',
      'security check',
      'captcha',
      'pardon our interruption',
      'are you a human',
      'validate your request',
      'unusual traffic',
    ];
    return blockedKeywords.some((kw) => title.includes(kw));
  } catch {
    return false;
  }
}

let puppeteer: any;
let StealthPlugin: any;

async function getPuppeteer() {
  if (!puppeteer) {
    puppeteer = require('puppeteer-extra');
    StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());
  }
  return puppeteer;
}

async function launchBrowser(proxyUrl?: string): Promise<{ browser: any; proxyAuth?: { username: string; password: string } }> {
  const pup = await getPuppeteer();

  const extraArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1920,1080',
    '--disable-dev-shm-usage',
  ];

  const effectiveProxy = proxyUrl || process.env.PROXY_URL;
  const { server: proxyServer, auth: proxyAuth } = parseProxy(effectiveProxy);

  if (proxyServer) {
    extraArgs.push(`--proxy-server=${proxyServer}`);
  }

  let browser: any;
  // AWS Lambda environment check
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (() => {
      try {
        return require('@sparticuz/chromium');
      } catch {
        return null;
      }
    })();

    if (chromium) {
      if (typeof chromium.inflate === 'function') {
        await chromium.inflate();
      }
      browser = await puppeteer.launch({
        args: chromium.args ? [...chromium.args, ...extraArgs] : extraArgs,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless ?? true,
      });
    }
  }

  if (!browser) {
    // Local environment fallback
    const execPath =
      process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : 'google-chrome';

    browser = await pup.launch({
      headless: 'new',
      executablePath: execPath,
      args: extraArgs,
    });
  }

  return { browser, proxyAuth };
}

function getBaseUrl(options: IndeedJobQueryOptions): string {
  if (options.location && /india/i.test(options.location)) {
    return 'https://in.indeed.com';
  }
  return 'https://www.indeed.com';
}

function buildSearchUrl(options: IndeedJobQueryOptions): string {
  const baseUrl = getBaseUrl(options);
  const params = new URLSearchParams();

  let queryText = options.keyword || '';
  if (options.salary) {
    const salStr = String(options.salary);
    if (!queryText.includes(salStr)) {
      queryText = queryText ? `${queryText} $${salStr.replace(/[^0-9]/g, '')}` : `$${salStr.replace(/[^0-9]/g, '')}`;
    }
  }
  if (queryText) params.append('q', queryText);

  if (options.location) params.append('l', options.location);
  if (options.fromage) params.append('fromage', String(options.fromage));

  if (options.jobType) {
    const items = Array.isArray(options.jobType) ? options.jobType : [options.jobType];
    items.forEach((jt) => params.append('jt', jt));
  }

  if (options.sort === 'date') {
    params.append('sort', 'date');
  }

  const page = options.page || 0;
  if (page > 0) {
    params.append('start', String(page * 10));
  }

  return `${baseUrl}/jobs?${params.toString()}`;
}

export class IndeedJobsQuery {
  public options: IndeedJobQueryOptions;

  constructor(options: IndeedJobQueryOptions) {
    this.options = options;
  }

  public async getJobs(): Promise<JobPosting[]> {
    const maxLimit = this.options.limit || 25;
    const scrapePromise = this._scrapeJobs(maxLimit);
    const timeoutPromise = new Promise<JobPosting[]>((resolve) =>
      setTimeout(() => {
        console.warn('[Indeed Scraper] Hard per-query timeout reached (90s). Returning results collected so far.');
        resolve([]);
      }, 90000)
    );
    return Promise.race([scrapePromise, timeoutPromise]);
  }

  private async _scrapeJobs(maxLimit: number): Promise<JobPosting[]> {
    const { browser, proxyAuth } = await launchBrowser(this.options.proxyUrl);
    const baseUrl = getBaseUrl(this.options);
    const jobPostings: JobPosting[] = [];

    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      if (proxyAuth) {
        await page.authenticate(proxyAuth);
      }
      await page.setRequestInterception(true);
      page.on('request', (req: any) => {
        const resourceType = req.resourceType();
        const url = req.url();
        const isBlockedDomain = BLOCKED_DOMAINS.some((domain) => url.includes(domain));
        if (['image', 'media', 'font'].includes(resourceType) || isBlockedDomain) {
          req.abort();
        } else {
          req.continue();
        }
      });

      const allRawCards: Array<{
        jobKey: string;
        title: string;
        company: string;
        location: string;
        salary: string;
        agoTime: string;
        snippet: string;
      }> = [];
      const seenKeys = new Set<string>();
      let pageIndex = this.options.page || 0;
      const maxPages = pageIndex + 3;

      while (allRawCards.length < maxLimit && pageIndex < maxPages) {
        const searchUrl = buildSearchUrl({ ...this.options, page: pageIndex });
        try {
          await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
          if (await isBotBlocked(page)) {
            console.warn(`[Indeed Scraper] Anti-bot / Cloudflare challenge detected on page ${pageIndex}. Aborting search early.`);
            break;
          }
          await page.waitForSelector('div.job_seen_beacon, div.cardOutline, td.resultContent, div.jobsearch-ResultsList > li, li.css-5lfssm', { timeout: 4000 }).catch(() => {});
          await delay(1000);
        } catch {
          // If search navigation fails or challenges, break and return cards found so far
          break;
        }

        // Extract basic job metadata from search page DOM
        const pageCards = await page.evaluate(() => {
          const results: Array<{
            jobKey: string;
            title: string;
            company: string;
            location: string;
            salary: string;
            agoTime: string;
            snippet: string;
          }> = [];

          const cardElements = document.querySelectorAll(
            'div.cardOutline, div.job_seen_beacon, td.resultContent, div.jobsearch-ResultsList > li, li.css-5lfssm'
          );

          cardElements.forEach((card) => {
            const jkAnchor =
              card.querySelector('a[data-jk]') ||
              card.querySelector('a.jcs-JobTitle');

            if (jkAnchor) {
              const jobKey =
                jkAnchor.getAttribute('data-jk') ||
                jkAnchor.id?.replace(/^job_/, '') ||
                '';

              const titleEl = card.querySelector('h2.jobTitle, a.jcs-JobTitle');
              const companyEl = card.querySelector(
                '[data-testid="company-name"], span.companyName'
              );
              const locationEl = card.querySelector(
                '[data-testid="text-location"], div.companyLocation'
              );
              const salaryEl = card.querySelector(
                'div.metadata.salary-snippet-container, div.salary-snippet-container'
              );
              const dateEl = card.querySelector(
                'span.date, span[data-testid="myJobsStateDate"]'
              );
              const snippetEl = card.querySelector(
                'div.job-snippet, div[data-testid="jobs-snippet"]'
              );

              const getCleanText = (el: Element | null): string => {
                if (!el) return '';
                const clone = el.cloneNode(true) as HTMLElement;
                const srOnly = clone.querySelectorAll('.visually-hidden, .sr-only');
                srOnly.forEach((node) => node.remove());
                return clone.textContent?.trim() || '';
              };

              results.push({
                jobKey,
                title: getCleanText(titleEl),
                company: getCleanText(companyEl),
                location: getCleanText(locationEl),
                salary: getCleanText(salaryEl) || 'Not specified',
                agoTime: getCleanText(dateEl),
                snippet: getCleanText(snippetEl),
              });
            }
          });

          return results;
        });

        if (!pageCards || pageCards.length === 0) break;

        let addedInPage = 0;
        for (const card of pageCards) {
          if (card.jobKey && !seenKeys.has(card.jobKey)) {
            seenKeys.add(card.jobKey);
            allRawCards.push(card);
            addedInPage++;
          }
        }

        if (addedInPage === 0) break;
        pageIndex++;
      }

      const jobsToFetch = allRawCards.slice(0, maxLimit);

      // Fetch full details for each job
      for (const cardJob of jobsToFetch) {
        const detailUrl = `${baseUrl}/viewjob?jk=${cardJob.jobKey}`;
        let fullDescription = '';
        let companyName = cardJob.company;
        let formattedLocation = cardJob.location;
        let salaryText = cardJob.salary;

        try {
          await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
          await page.waitForSelector('#jobDescriptionText, .jobsearch-JobComponent-description', { timeout: 3000 }).catch(() => {});
          await delay(800);

          const detailData = await page.evaluate(() => {
            const descEl =
              document.querySelector('#jobDescriptionText') ||
              document.querySelector('.jobsearch-JobComponent-description');
            const compEl =
              document.querySelector('[data-testid="inlineHeader-companyName"]') ||
              document.querySelector('.jobsearch-CompanyReview--heading');
            const locEl =
              document.querySelector('[data-testid="inlineHeader-companyLocation"]') ||
              document.querySelector('.jobsearch-JobInfoHeader-companyLocation');
            const salEl =
              document.querySelector('#salaryInfoAndJobType') ||
              document.querySelector('.jobsearch-JobMetadataHeader-item');

            return {
              descriptionText: descEl?.textContent?.trim() || '',
              company: compEl?.textContent?.trim() || '',
              location: locEl?.textContent?.trim() || '',
              salary: salEl?.textContent?.trim() || '',
            };
          });

          if (detailData.descriptionText && detailData.descriptionText.trim().length > 0) {
            fullDescription = detailData.descriptionText;
          }
          if (!companyName && detailData.company) companyName = detailData.company;
          if (!formattedLocation && detailData.location) formattedLocation = detailData.location;
          if (salaryText === 'Not specified' && detailData.salary) salaryText = detailData.salary;
        } catch {
          // Fallback if individual detail page fails
        }

        const details: JobDetails = {
          descriptionText: fullDescription,
        };

        jobPostings.push({
          id: cardJob.jobKey,
          position: cardJob.title,
          company: companyName,
          location: formattedLocation,
          date: '',
          salary: salaryText,
          jobUrl: detailUrl,
          agoTime: cardJob.agoTime,
          details,
          source: 'indeed',
        });
      }
    } finally {
      try {
        await Promise.race([
          browser.close(),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      } catch {}
      if (browser && browser.process() != null) {
        try {
          browser.process().kill('SIGKILL');
        } catch {}
      }
    }

    // Drop jobs whose full detail description fetch failed — no arbitrary length check
    return jobPostings.filter((job) => !!job.details && !!job.details.descriptionText && !!job.details.descriptionText.trim());
  }
}

export function queryIndeedJobs(options: IndeedJobQueryOptions): Promise<JobPosting[]> {
  const query = new IndeedJobsQuery(options);
  return query.getJobs();
}
