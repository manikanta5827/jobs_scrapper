import { IndeedJobQueryOptions, IndeedJobTypeOption } from './indeed-types';
import { JobPosting, JobDetails } from './types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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

  const extraArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
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

  if (options.keyword) params.append('q', options.keyword);
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
    const { browser, proxyAuth } = await launchBrowser(this.options.proxyUrl);
    const baseUrl = getBaseUrl(this.options);
    const jobPostings: JobPosting[] = [];

    try {
      const page = await browser.newPage();
      if (proxyAuth) {
        await page.authenticate(proxyAuth);
      }
      await page.setUserAgent(UA);

      const allRawCards: Array<{
        jobKey: string;
        title: string;
        company: string;
        location: string;
        salary: string;
        agoTime: string;
      }> = [];
      const seenKeys = new Set<string>();
      let pageIndex = this.options.page || 0;

      while (allRawCards.length < maxLimit) {
        const searchUrl = buildSearchUrl({ ...this.options, page: pageIndex });
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(2500);

        // Extract basic job metadata from search page DOM
        const pageCards = await page.evaluate(() => {
          const results: Array<{
            jobKey: string;
            title: string;
            company: string;
            location: string;
            salary: string;
            agoTime: string;
          }> = [];

          const cardElements = document.querySelectorAll(
            'div.cardOutline, div.job_seen_beacon, td.resultContent, div.jobsearch-ResultsList > li'
          );

          cardElements.forEach((card) => {
            const jkAnchor =
              card.querySelector('a[data-jk]') ||
              card.querySelector('h2.jobTitle a') ||
              card.closest('[data-jk]');
            const jk = jkAnchor?.getAttribute('data-jk') || card.getAttribute('data-jk');
            const titleEl = card.querySelector('h2.jobTitle') || card.querySelector('a[id^="job_"]');
            const compEl = card.querySelector('[data-testid="company-name"]') || card.querySelector('.companyName');
            const locEl = card.querySelector('[data-testid="text-location"]') || card.querySelector('.companyLocation');
            const salaryEl =
              card.querySelector('[data-testid="attribute_snippet"]') ||
              card.querySelector('.salary-snippet-container') ||
              card.querySelector('.estimated-salary');
            const dateEl = card.querySelector('.date') || card.querySelector('[data-testid="myJobsStateDate"]');

            if (jk && !results.some((r) => r.jobKey === jk)) {
              results.push({
                jobKey: jk,
                title: titleEl ? titleEl.textContent.trim().replace(/^new\s*/i, '') : '',
                company: compEl ? compEl.textContent.trim() : '',
                location: locEl ? locEl.textContent.trim() : '',
                salary: salaryEl ? salaryEl.textContent.trim() : 'Not specified',
                agoTime: dateEl ? dateEl.textContent.trim() : '',
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
          await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await delay(1500);

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
              descriptionText: descEl ? descEl.textContent.trim() : '',
              company: compEl ? compEl.textContent.trim() : '',
              location: locEl ? locEl.textContent.trim() : '',
              salary: salEl ? salEl.textContent.trim() : '',
            };
          });

          if (detailData.descriptionText) fullDescription = detailData.descriptionText;
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
          companyLogo: '',
          agoTime: cardJob.agoTime,
          details,
          source: 'indeed',
        });
      }
    } finally {
      try { await browser.close(); } catch {}
    }

    return jobPostings;
  }
}

export function queryIndeedJobs(options: IndeedJobQueryOptions): Promise<JobPosting[]> {
  const query = new IndeedJobsQuery(options);
  return query.getJobs();
}
