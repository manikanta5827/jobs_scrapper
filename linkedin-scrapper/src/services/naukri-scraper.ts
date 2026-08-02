import { NaukriJobQueryOptions } from '../types/naukri-types';
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
  'csp.withgoogle.com',
  'logs.naukri.com',
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

// Dynamic imports to keep puppeteer optional at module load time
// (only loaded when Naukri source is selected)
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
  const effectiveProxy = proxyUrl || process.env.PROXY_URL;
  const { server: proxyServer, auth: proxyAuth } = parseProxy(effectiveProxy);

  const extraArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1920,1080',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-zygote',
    '--single-process',
    '--disable-background-networking',
  ];

  if (proxyServer) {
    extraArgs.push(`--proxy-server=${proxyServer}`);
  }

  let browser: any;
  // Lambda: use @sparticuz/chromium (detected by Lambda env vars)
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (() => {
      try { return require('@sparticuz/chromium'); } catch { return null; }
    })();

    if (chromium) {
      try {
        const execPath = await chromium.executablePath('https://github.com/Sparticuz/chromium/releases/download/v133.0.0/chromium-v133.0.0-pack.tar');
        browser = await puppeteer.launch({
          args: chromium.args ? [...chromium.args, ...extraArgs] : extraArgs,
          defaultViewport: chromium.defaultViewport,
          executablePath: execPath,
          headless: chromium.headless ?? true,
        });
      } catch (e) {
        console.warn('[Naukri Scraper] Lambda chromium launch failed:', e instanceof Error ? e.message : String(e));
        browser = null;
      }
    }
  }

  if (!browser) {
    // Local: use system Chrome
    const execPath = process.platform === 'darwin'
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

export class NaukriJobsQuery {
  public options: NaukriJobQueryOptions;

  constructor(options: NaukriJobQueryOptions) {
    this.options = options;
  }

  public buildSearchUrl(pageNumber: number = 1): string {
    const slug = this.options.keyword.toLowerCase().replace(/\s+/g, '-');
    const params = new URLSearchParams();

    params.append('k', this.options.keyword);
    params.append('nignbevent_src', 'jobsearchDeskGNB');

    if (this.options.experience !== undefined) {
      params.append('experience', String(this.options.experience));
    }
    if (this.options.jobAge !== undefined) {
      params.append('jobAge', String(this.options.jobAge));
    }
    if (this.options.location) {
      params.append('location', this.options.location);
    }

    if (this.options.sort === 'date') {
      params.append('sort', 'f');
    }

    if (this.options.wfhType && this.options.wfhType.length > 0) {
      const wfhMap: Record<string, string> = { office: '0', remote: '2', hybrid: '3', '0': '0', '2': '2', '3': '3' };
      const items = Array.isArray(this.options.wfhType) ? this.options.wfhType : [this.options.wfhType];
      const codes = items.map((w) => wfhMap[String(w).toLowerCase()] || String(w)).filter(Boolean);
      if (codes.length > 0) {
        params.append('wfhType', codes.join(','));
      }
    }

    const pagePath = pageNumber > 1 ? `${slug}-jobs-${pageNumber}` : `${slug}-jobs`;
    return `https://www.naukri.com/${pagePath}?${params.toString()}`;
  }

  public async getJobs(): Promise<JobPosting[]> {
    let browserInstance: any = null;
    try {
      const { browser, proxyAuth } = await launchBrowser(this.options.proxyUrl);
      browserInstance = browser;
      const maxLimit = this.options.limit || 25;
      let allJobs: JobPosting[] = [];
      const seenJobUrls = new Set<string>();
      let currentPage = this.options.page || 1;

      while (allJobs.length < maxLimit) {
        const searchUrl = this.buildSearchUrl(currentPage);
        const browserPage = await browserInstance.newPage();
        if (proxyAuth) {
          await browserPage.authenticate(proxyAuth);
        }

        try {
          await browserPage.setRequestInterception(true);
          browserPage.on('request', (req: any) => {
            const resourceType = req.resourceType();
            const url = req.url();
            const isBlockedDomain = BLOCKED_DOMAINS.some((domain) => url.includes(domain));
            if (['image', 'media', 'font'].includes(resourceType) || isBlockedDomain) {
              req.abort();
            } else {
              req.continue();
            }
          });

          await browserPage.setDefaultNavigationTimeout(10000);
          await browserPage.goto(searchUrl, { waitUntil: 'domcontentloaded' });

          if (await isBotBlocked(browserPage)) {
            console.warn(`[Naukri Scraper] Bot protection / Cloudflare detected on page ${currentPage}. Aborting search early.`);
            break;
          }

          const pageJobs = await this.extractJobCards(browserPage);

          if (!pageJobs || pageJobs.length === 0) break;

          let addedInPage = 0;
          for (const job of pageJobs) {
            if (job.jobUrl && !seenJobUrls.has(job.jobUrl)) {
              seenJobUrls.add(job.jobUrl);
              allJobs.push(job);
              addedInPage++;
            }
          }

          if (addedInPage === 0) break;
        } finally {
          try { await browserPage.close(); } catch {}
        }

        currentPage++;
        await delay(1000);
      }

      // Cap at limit, enrich with details
      allJobs = allJobs.slice(0, maxLimit);
      const jobsNeedingDetails = allJobs.filter((j) => j.jobUrl);

      for (let i = 0; i < jobsNeedingDetails.length; i += 3) {
        const chunk = jobsNeedingDetails.slice(i, i + 3);
        await Promise.all(
          chunk.map(async (job) => {
            try {
              const details = await this.fetchJobDetails(browserInstance, job.jobUrl, proxyAuth);
              if (details && details.descriptionText && details.descriptionText.trim().length > 0) {
                job.details = { ...job.details, ...details };
              }
            } catch {
              // Keep the short description from search results
            }
          })
        );
        if (i + 3 < jobsNeedingDetails.length) {
          await delay(1000 + Math.random() * 500);
        }
      }

      // Drop jobs whose full detail description fetch failed — no arbitrary length check
      return allJobs.filter((job) => !!job.details && !!job.details.descriptionText && !!job.details.descriptionText.trim());
    } finally {
      if (browserInstance) {
        try { await browserInstance.close(); } catch {}
      }
    }
  }

  private async extractJobCards(page: any): Promise<JobPosting[]> {
    // Wait for job cards to appear
    try {
      await page.waitForSelector('.srp-jobtuple-wrapper', { timeout: 10000 });
    } catch {
      // Fallback: page might not have any job cards
    }

    await delay(1000);

    // Scroll to trigger lazy loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.5));
    await delay(500);

    return page.evaluate(() => {
      const cards = document.querySelectorAll('.srp-jobtuple-wrapper');
      return Array.from(cards).map((card) => {
        const titleEl = card.querySelector('.title, a.row1') as HTMLElement;
        const linkEl = card.querySelector('.title') as HTMLAnchorElement;
        const jobUrl = linkEl ? linkEl.getAttribute('href') || '' : '';

        let company = '';
        const companyLink = card.querySelector('.comp-dtls-wrap a, a.comp-name') as HTMLAnchorElement;
        if (companyLink) {
          company = companyLink.title || companyLink.textContent?.trim() || '';
        }

        const location = card.querySelector('.locWdth')?.textContent?.trim() || '';
        const experience = card.querySelector('.expwdth')?.textContent?.trim() || '';
        const salary = card.querySelector('.sal-wrap span, .sal')?.textContent?.trim() || 'Not specified';
        const agoTime = card.querySelector('.job-post-day')?.textContent?.trim() || '';

        const descriptionEl = card.querySelector('span.job-desc, .row4, .job-description, .job-desc');
        const description = descriptionEl?.textContent?.trim() || '';

        return {
          id: '',
          position: titleEl?.textContent?.trim() || '',
          company,
          location,
          date: '',
          salary,
          jobUrl: jobUrl.startsWith('https://') ? jobUrl : 'https://www.naukri.com' + jobUrl,
          agoTime,
          details: undefined,
          source: 'naukri' as const,
        };
      }).filter((j) => j.position && j.company);
    });
  }

  private async fetchJobDetails(
    browser: any,
    jobUrl: string,
    proxyAuth?: { username: string; password: string }
  ): Promise<JobDetails | null> {
    const page = await browser.newPage();
    if (proxyAuth) {
      await page.authenticate(proxyAuth);
    }
    try {
      await page.setRequestInterception(true);
      page.on('request', (req: any) => {
        const resourceType = req.resourceType();
        const url = req.url();
        const isBlockedDomain = BLOCKED_DOMAINS.some((domain) => url.includes(domain));
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType) || isBlockedDomain) {
          req.abort();
        } else {
          req.continue();
        }
      });

      await page.setDefaultNavigationTimeout(10000);
      await page.goto(jobUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.styles_job-desc-container__txpYf, [class*="job-desc-container"], [class*="jd-desc"]', { timeout: 4000 }).catch(() => null);

      return page.evaluate(() => {
        const descEl = document.querySelector('.styles_job-desc-container__txpYf, [class*=job-desc-container], [class*=jd-desc]');
        const descriptionText = descEl?.textContent?.trim() || '';

        // Extract criteria like employment type, role, industry
        const criteria: Record<string, string> = {};
        const criteriaItems = document.querySelectorAll('.styles_details__Y424J .styles_row__fqPd3');
        criteriaItems.forEach((item) => {
          const label = item.querySelector('.styles_label__kZUh0, [class*=label]')?.textContent?.trim();
          const value = item.querySelector('.styles_value__dGmIH, [class*=value]')?.textContent?.trim();
          if (label && value) criteria[label.replace(/:$/, '')] = value;
        });

        return {
          descriptionText,
          seniorityLevel: '',
          employmentType: criteria['Employment type'] || criteria['Employment Type'] || '',
          jobFunction: criteria['Role category'] || criteria['Department'] || '',
          industries: criteria['Industry'] || '',
          numApplicants: '',
        };
      });
    } catch {
      return null;
    } finally {
      try { await page.close(); } catch {}
    }
  }
}

export function queryNaukriJobs(options: NaukriJobQueryOptions): Promise<JobPosting[]> {
  const query = new NaukriJobsQuery(options);
  const scrapePromise = query.getJobs();
  const timeoutPromise = new Promise<JobPosting[]>((resolve) =>
    setTimeout(() => {
      console.warn('[Naukri Scraper] Hard per-query timeout reached (90s). Returning results collected so far.');
      resolve([]);
    }, 90000)
  );
  return Promise.race([scrapePromise, timeoutPromise]);
}
