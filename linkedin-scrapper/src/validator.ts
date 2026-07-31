import { JobQueryOptions } from './types';

const VALID_DATE_POSTED = ['past month', 'past week', '24hr', 'past 24 hours'];

const VALID_JOB_TYPES = [
  'full time', 'full-time', 'part time', 'part-time',
  'contract', 'temporary', 'volunteer', 'internship',
  'f', 'p', 'c', 't', 'v', 'i'
];

const VALID_EXPERIENCE_LEVELS = [
  'internship', 'entry level', 'associate', 'senior',
  'director', 'executive', '1', '2', '3', '4', '5', '6'
];

const VALID_REMOTE_FILTERS = [
  'on-site', 'on site', 'remote', 'hybrid', '1', '2', '3'
];

const VALID_SORT_BY = ['recent', 'relevant', 'dd', 'r'];

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitizedOptions?: JobQueryOptions;
}

export function validateJobQueryOptions(rawInput: any): ValidationResult {
  if (!rawInput || typeof rawInput !== 'object') {
    return { valid: false, error: 'Request parameters must be an object.' };
  }

  const keyword = rawInput.keyword ? String(rawInput.keyword).trim() : undefined;
  const location = rawInput.location ? String(rawInput.location).trim() : undefined;

  // Validation Rule 1: At least keyword or location must be provided
  if (!keyword && !location) {
    return {
      valid: false,
      error: 'Validation Error: Either "keyword" or "location" parameter must be provided.',
    };
  }

  // Validation Rule 2: Date Since Posted
  if (rawInput.dateSincePosted) {
    const val = String(rawInput.dateSincePosted).toLowerCase().trim();
    if (!VALID_DATE_POSTED.includes(val)) {
      return {
        valid: false,
        error: `Validation Error: Invalid dateSincePosted "${rawInput.dateSincePosted}". Allowed values: ${VALID_DATE_POSTED.join(', ')}`,
      };
    }
  }

  // Validation Rule 3: Job Type (string or array)
  let jobType: any = undefined;
  if (rawInput.jobType) {
    const items = Array.isArray(rawInput.jobType)
      ? rawInput.jobType
      : String(rawInput.jobType).split(',').map((s) => s.trim());

    for (const item of items) {
      if (!item || !VALID_JOB_TYPES.includes(String(item).toLowerCase())) {
        return {
          valid: false,
          error: `Validation Error: Invalid jobType "${item}". Allowed values: full time, part time, contract, temporary, volunteer, internship`,
        };
      }
    }
    jobType = Array.isArray(rawInput.jobType) ? rawInput.jobType : items;
  }

  // Validation Rule 4: Experience Level (string or array)
  let experienceLevel: any = undefined;
  if (rawInput.experienceLevel) {
    const items = Array.isArray(rawInput.experienceLevel)
      ? rawInput.experienceLevel
      : String(rawInput.experienceLevel).split(',').map((s) => s.trim());

    for (const item of items) {
      if (!item || !VALID_EXPERIENCE_LEVELS.includes(String(item).toLowerCase())) {
        return {
          valid: false,
          error: `Validation Error: Invalid experienceLevel "${item}". Allowed values: internship, entry level, associate, senior, director, executive`,
        };
      }
    }
    experienceLevel = Array.isArray(rawInput.experienceLevel) ? rawInput.experienceLevel : items;
  }

  // Validation Rule 5: Remote Filter (string or array)
  let remoteFilter: any = undefined;
  if (rawInput.remoteFilter) {
    const items = Array.isArray(rawInput.remoteFilter)
      ? rawInput.remoteFilter
      : String(rawInput.remoteFilter).split(',').map((s) => s.trim());

    for (const item of items) {
      if (!item || !VALID_REMOTE_FILTERS.includes(String(item).toLowerCase())) {
        return {
          valid: false,
          error: `Validation Error: Invalid remoteFilter "${item}". Allowed values: on-site, remote, hybrid`,
        };
      }
    }
    remoteFilter = Array.isArray(rawInput.remoteFilter) ? rawInput.remoteFilter : items;
  }

  // Validation Rule 6: Sort By
  if (rawInput.sortBy) {
    const val = String(rawInput.sortBy).toLowerCase().trim();
    if (!VALID_SORT_BY.includes(val)) {
      return {
        valid: false,
        error: `Validation Error: Invalid sortBy "${rawInput.sortBy}". Allowed values: recent, relevant`,
      };
    }
  }

  // Validation Rule 7: Limit
  let limit: number | undefined = undefined;
  if (rawInput.limit !== undefined && rawInput.limit !== null && rawInput.limit !== '') {
    limit = Number(rawInput.limit);
    if (isNaN(limit) || !Number.isInteger(limit) || limit <= 0 || limit > 100) {
      return {
        valid: false,
        error: `Validation Error: Invalid limit "${rawInput.limit}". Limit must be an integer between 1 and 100.`,
      };
    }
  }

  // Validation Rule 8: Page
  let page: number | undefined = undefined;
  if (rawInput.page !== undefined && rawInput.page !== null && rawInput.page !== '') {
    page = Number(rawInput.page);
    if (isNaN(page) || !Number.isInteger(page) || page < 0) {
      return {
        valid: false,
        error: `Validation Error: Invalid page "${rawInput.page}". Page must be a non-negative integer >= 0.`,
      };
    }
  }

  const sanitizedOptions: JobQueryOptions = {
    keyword,
    location,
    geoId: rawInput.geoId ? String(rawInput.geoId).trim() : undefined,
    company: rawInput.company,
    easyApply: Boolean(rawInput.easyApply === 'true' || rawInput.easyApply === true),
    dateSincePosted: rawInput.dateSincePosted,
    jobType,
    experienceLevel,
    remoteFilter,
    salary: rawInput.salary,
    sortBy: rawInput.sortBy,
    limit: limit || 25,
    page: page || 0,
    has_verification: Boolean(rawInput.has_verification === 'true' || rawInput.has_verification === true),
    under_10_applicants: Boolean(rawInput.under_10_applicants === 'true' || rawInput.under_10_applicants === true),
    proxyUrl: rawInput.proxyUrl || process.env.PROXY_URL || '',
  };

  return {
    valid: true,
    sanitizedOptions,
  };
}
