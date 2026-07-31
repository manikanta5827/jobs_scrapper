import { NaukriJobQueryOptions } from './naukri-types';
import { JobPosting, JobDetails } from './types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

interface ProxyConfig {
  server?: string;
  auth?: { username: string; password: string };
}

function parseProxy(proxyUrl?: string): ProxyConfig {
  if (!proxyUrl) return {};
  try {
    const url = new URL(proxyUrl);
    if (!['http:', 'https:', 'socks4:', 'socks5:'].includes(url.protocol)) {
      return {};
    }
    const server = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
    const auth = (url.username || url.password)
      ? { username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) }
      : undefined;
    return { server, auth };
  } catch {
    return {};
  }
}

async function launchBrowser(proxyUrl?: string): Promise<{ browser: any; proxyAuth?: { username: string; password: string } }> {
  const pup = await getPuppeteer();
  const effectiveProxy = proxyUrl || process.env.PROXY_URL;
  const { server: proxyServer, auth: proxyAuth } = parseProxy(effectiveProxy);

  const extraArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
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
      // v149+ uses inflate() to set up then headless shell
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

  public buildSearchUrl(): string {
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

    return `https://www.naukri.com/${slug}-jobs?${params.toString()}`;
  }

  public async getJobs(): Promise<JobPosting[]> {
    let browserInstance: any = null;
    try {
      const { browser, proxyAuth } = await launchBrowser(this.options.proxyUrl);
      browserInstance = browser;
      const maxLimit = this.options.limit || 25;

      const searchUrl = this.buildSearchUrl();
      const browserPage = await browserInstance.newPage();
      if (proxyAuth) {
        await browserPage.authenticate(proxyAuth);
      }
      let allJobs: JobPosting[] = [];

      try {
        await browserPage.setDefaultNavigationTimeout(30000);
        await browserPage.goto(searchUrl, { waitUntil: 'networkidle2' });
        allJobs = await this.extractJobCards(browserPage);
      } finally {
        await browserPage.close();
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
              if (details) job.details = details;
            } catch {
              // Keep the short description from search results
            }
          })
        );
        if (i + 3 < jobsNeedingDetails.length) {
          await delay(1000 + Math.random() * 500);
        }
      }

      return allJobs;
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
        let companyLogo = '';
        const companyLink = card.querySelector('.comp-dtls-wrap a, a.comp-name') as HTMLAnchorElement;
        if (companyLink) {
          company = companyLink.title || companyLink.textContent?.trim() || '';
        }
        const logoImg = card.querySelector('.logo img, img.logo') as HTMLImageElement;
        if (logoImg) {
          companyLogo = logoImg.src || '';
        }

        const location = card.querySelector('.locWdth')?.textContent?.trim() || '';
        const experience = card.querySelector('.expwdth')?.textContent?.trim() || '';
        const salary = card.querySelector('.sal-wrap span, .sal')?.textContent?.trim() || 'Not specified';
        const agoTime = card.querySelector('.job-post-day')?.textContent?.trim() || '';

        const description = card.querySelector('.job-desc')?.textContent?.trim() || '';

        return {
          id: '',
          position: titleEl?.textContent?.trim() || '',
          company,
          location,
          date: '',
          salary,
          jobUrl: jobUrl.startsWith('https://') ? jobUrl : 'https://www.naukri.com' + jobUrl,
          companyLogo,
          agoTime,
          details: {
            descriptionText: description,
            employmentType: '',
            seniorityLevel: '',
            jobFunction: '',
            industries: '',
            numApplicants: '',
          },
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
      await page.setDefaultNavigationTimeout(20000);
      await page.goto(jobUrl, { waitUntil: 'networkidle2' });

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
  return query.getJobs();
}
