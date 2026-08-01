import { NaukriJobQueryOptions } from '../types/naukri-types';

const VALID_JOB_AGE = [1, 3, 7, 15, 30];
const VALID_SORT = ['relevance', 'date', 'r', 'f'];
const VALID_WFH_TYPE = ['office', 'remote', 'hybrid', '0', '2', '3'];

export interface NaukriValidationResult {
  valid: boolean;
  error?: string;
  sanitizedOptions?: NaukriJobQueryOptions;
}

export function validateNaukriJobQueryOptions(rawInput: any): NaukriValidationResult {
  if (!rawInput || typeof rawInput !== 'object') {
    return { valid: false, error: 'Request parameters must be an object.' };
  }

  const keyword = rawInput.keyword ? String(rawInput.keyword).trim() : undefined;
  if (!keyword) {
    return { valid: false, error: 'Validation Error: "keyword" parameter is required.' };
  }

  // Experience: integer 0-30
  let experience: number | undefined;
  if (rawInput.experience !== undefined && rawInput.experience !== null && rawInput.experience !== '') {
    experience = Number(rawInput.experience);
    if (isNaN(experience) || !Number.isInteger(experience) || experience < 0 || experience > 30) {
      return {
        valid: false,
        error: `Validation Error: Invalid experience "${rawInput.experience}". Must be an integer between 0 and 30.`,
      };
    }
  }

  // Job Age
  if (rawInput.jobAge !== undefined && rawInput.jobAge !== null && rawInput.jobAge !== '') {
    const age = Number(rawInput.jobAge);
    if (!VALID_JOB_AGE.includes(age)) {
      return {
        valid: false,
        error: `Validation Error: Invalid jobAge "${rawInput.jobAge}". Allowed values: ${VALID_JOB_AGE.join(', ')}`,
      };
    }
  }

  // Sort
  if (rawInput.sort) {
    const val = String(rawInput.sort).toLowerCase().trim();
    if (!VALID_SORT.includes(val)) {
      return {
        valid: false,
        error: `Validation Error: Invalid sort "${rawInput.sort}". Allowed values: relevance, date`,
      };
    }
  }

  // WFH Type (array or comma-separated string)
  let wfhType: Array<'office' | 'remote' | 'hybrid'> | undefined;
  if (rawInput.wfhType) {
    const items = Array.isArray(rawInput.wfhType)
      ? rawInput.wfhType
      : String(rawInput.wfhType).split(',').map((s: string) => s.trim());

    for (const item of items) {
      const normalized = String(item).toLowerCase();
      if (!VALID_WFH_TYPE.includes(normalized)) {
        return {
          valid: false,
          error: `Validation Error: Invalid wfhType "${item}". Allowed values: office, remote, hybrid`,
        };
      }
    }
    wfhType = items.map((i: string) => String(i).toLowerCase()) as any;
  }

  // Limit
  let limit: number | undefined;
  if (rawInput.limit !== undefined && rawInput.limit !== null && rawInput.limit !== '') {
    limit = Number(rawInput.limit);
    if (isNaN(limit) || !Number.isInteger(limit) || limit <= 0 || limit > 100) {
      return {
        valid: false,
        error: `Validation Error: Invalid limit "${rawInput.limit}". Limit must be an integer between 1 and 100.`,
      };
    }
  }

  // Page
  let page: number | undefined;
  if (rawInput.page !== undefined && rawInput.page !== null && rawInput.page !== '') {
    page = Number(rawInput.page);
    if (isNaN(page) || !Number.isInteger(page) || page < 0) {
      return {
        valid: false,
        error: `Validation Error: Invalid page "${rawInput.page}". Page must be a non-negative integer.`,
      };
    }
  }

  const sanitizedOptions: NaukriJobQueryOptions = {
    keyword,
    location: rawInput.location ? String(rawInput.location).trim() : undefined,
    experience: experience,
    jobAge: rawInput.jobAge ? Number(rawInput.jobAge) : undefined,
    sort: rawInput.sort ? (String(rawInput.sort).toLowerCase() === 'date' || String(rawInput.sort).toLowerCase() === 'f' ? 'date' : 'relevance') : undefined,
    wfhType,
    limit: limit || 25,
    page: page || 0,
    proxyUrl: rawInput.proxyUrl || process.env.PROXY_URL || '',
  };

  return { valid: true, sanitizedOptions };
}
