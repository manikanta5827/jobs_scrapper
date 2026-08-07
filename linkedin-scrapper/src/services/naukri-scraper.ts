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
    const url = (await page.url()).toLowerCase();

    const blockedTitleKeywords = [
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

    const blockedUrlPatterns = [
      'cloudflare',
      'challenge',
      'captcha',
      'blocked',
      'access-denied',
      'robot',
      'verify',
    ];

    const titleBlocked = blockedTitleKeywords.some((kw) => title.includes(kw));
    const urlBlocked = blockedUrlPatterns.some((pat) => url.includes(pat));
    const blocked = titleBlocked || urlBlocked;

    if (blocked) {
      console.warn(`[Naukri Scraper] Bot detection — title: "${title.substring(0, 80)}", url: "${url.substring(0, 120)}"`);
    }

    return blocked;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Naukri Scraper] isBotBlocked check failed (page unstable): ${msg}. Treating as blocked.`);
    return true;
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
    '--disable-background-networking',
  ];

  // single-process reduces memory but causes net::ERR_FAILED with multiple pages
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    extraArgs.push('--single-process');
  }

  if (proxyServer) {
    extraArgs.push(`--proxy-server=${proxyServer}`);
  }

  let browser: any;
  // Lambda: use @sparticuz/chromium (detected by Lambda env vars)
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    console.log('[Naukri Scraper] Lambda environment detected, using @sparticuz/chromium');
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

  console.log(`[Naukri Scraper] Browser launched${proxyServer ? ` with proxy ${proxyServer}` : ' (no proxy)'}. AWS Lambda: ${!!process.env.AWS_LAMBDA_FUNCTION_NAME}`);
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
    const startedAt = Date.now();
    console.log(`[Naukri Scraper] getJobs started — keyword: "${this.options.keyword}", location: "${this.options.location || 'any'}", limit: ${this.options.limit || 25}`);
    let browserInstance: any = null;
    try {
      const { browser, proxyAuth } = await launchBrowser(this.options.proxyUrl);
      browserInstance = browser;
      const maxLimit = this.options.limit || 25;
      let allJobs: JobPosting[] = [];
      const seenJobUrls = new Set<string>();
      let currentPage = this.options.page || 1;
      let detailSuccess = 0;
      let detailFailed = 0;

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

          console.log(`[Naukri Scraper] Navigating to page ${currentPage}: ${searchUrl}`);
          await browserPage.setDefaultNavigationTimeout(10000);

          let pageLoaded = false;
          try {
            await browserPage.goto(searchUrl, { waitUntil: 'domcontentloaded' });
            pageLoaded = true;
          } catch (navErr: unknown) {
            const navMsg = navErr instanceof Error ? navErr.message : String(navErr);
            console.warn(`[Naukri Scraper] Navigation failed page ${currentPage}: ${navMsg}`);
            try {
              const currentUrl = await browserPage.url();
              console.warn(`[Naukri Scraper] Landed at URL after nav error: ${currentUrl}`);
            } catch {}
          }

          if (!pageLoaded) {
            break;
          }

          // Check if we landed on a bot-protection redirect URL
          try {
            const landedUrl = await browserPage.url();
            if (landedUrl.includes('cloudflare') || landedUrl.includes('challenge') ||
                landedUrl.includes('captcha') || landedUrl.includes('blocked') ||
                landedUrl.includes('access-denied')) {
              console.warn(`[Naukri Scraper] Bot-protection redirect on page ${currentPage}: ${landedUrl}. Aborting.`);
              break;
            }
          } catch {}

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
          console.log(`[Naukri Scraper] Page ${currentPage}: extracted ${addedInPage} new jobs (total: ${allJobs.length})`);
        } finally {
          try { await browserPage.close(); } catch {}
        }

        currentPage++;
        await delay(1000);
      }

      // Cap at limit, enrich with details
      allJobs = allJobs.slice(0, maxLimit);
      const jobsNeedingDetails = allJobs.filter((j) => j.jobUrl);
      console.log(`[Naukri Scraper] Enriching ${jobsNeedingDetails.length} jobs with full descriptions...`);

      for (let i = 0; i < jobsNeedingDetails.length; i += 3) {
        const chunk = jobsNeedingDetails.slice(i, i + 3);
        await Promise.all(
          chunk.map(async (job) => {
            let retries = 2;
            while (retries >= 0) {
              try {
                const details = await this.fetchJobDetails(browserInstance, job.jobUrl, proxyAuth);
                if (details && details.descriptionText && details.descriptionText.trim().length > 0) {
                  job.details = { ...job.details, ...details };
                  detailSuccess++;
                  return;
                }
                // Null or empty description — treat as transient failure, retry
                throw new Error('Empty detail response');
              } catch (err: unknown) {
                if (retries > 0) {
                  const retryMsg = err instanceof Error ? err.message : String(err);
                  if (retries === 2) console.warn(`[Naukri Scraper] Detail fetch retry ${3 - retries}/2 for ${job.jobUrl?.substring(0, 60)}: ${retryMsg}`);
                  await delay(2000 + Math.random() * 3000);
                  retries--;
                } else {
                  detailFailed++;
                  return;
                }
              }
            }
          })
        );
        if (i + 3 < jobsNeedingDetails.length) {
          await delay(1000 + Math.random() * 500);
        }
      }

      console.log(`[Naukri Scraper] Detail fetch complete — ${detailSuccess} succeeded, ${detailFailed} failed (of ${jobsNeedingDetails.length})`);

      if (detailFailed === jobsNeedingDetails.length && jobsNeedingDetails.length > 0) {
        console.warn(`[Naukri Scraper] ALL ${jobsNeedingDetails.length} detail fetches failed. Naukri likely rate-limiting/blocking. Consider using a residential proxy or rotating IPs.`);
      }

      // Drop jobs whose full detail description fetch failed — LLMs need complete descriptions
      const finalJobs = allJobs.filter((job) => !!job.details && !!job.details.descriptionText && !!job.details.descriptionText.trim());
      const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`[Naukri Scraper] getJobs finished — ${finalJobs.length} jobs after filtering (${elapsedSec}s elapsed)`);
      return finalJobs;
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
      console.warn('[Naukri Scraper] extractJobCards: .srp-jobtuple-wrapper not found within 10s (page may be blocked or empty)');
    }

    await delay(1000);

    // Scroll to trigger lazy loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.5));
    await delay(500);

    const extracted = await page.evaluate(() => {
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

    console.log(`[Naukri Scraper] extractJobCards: ${extracted.length} job cards extracted`);
    return extracted;
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
      try {
        await page.goto(jobUrl, { waitUntil: 'domcontentloaded' });
      } catch (navErr: unknown) {
        console.warn(`[Naukri Scraper] fetchJobDetails navigation failed: ${navErr instanceof Error ? navErr.message : String(navErr)}`);
        return null;
      }
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
    } catch (err: unknown) {
      console.warn(`[Naukri Scraper] fetchJobDetails failed for ${jobUrl.substring(0, 80)}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    } finally {
      try { await page.close(); } catch {}
    }
  }
}

export function queryNaukriJobs(options: NaukriJobQueryOptions): Promise<JobPosting[]> {
  const query = new NaukriJobsQuery(options);
  const TIMEOUT_MS = 90000;

  return new Promise<JobPosting[]>((resolve) => {
    const timer = setTimeout(() => {
      console.warn('[Naukri Scraper] Hard per-query timeout reached (90s). Results collected after this point are discarded.');
      resolve([]);
    }, TIMEOUT_MS);

    query.getJobs()
      .then((jobs) => {
        clearTimeout(timer);
        console.log(`[Naukri Scraper] Query completed — ${jobs.length} jobs fetched (before timeout).`);
        resolve(jobs);
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        console.error('[Naukri Scraper] Query failed:', err instanceof Error ? err.message : String(err));
        resolve([]);
      });
  });
}
