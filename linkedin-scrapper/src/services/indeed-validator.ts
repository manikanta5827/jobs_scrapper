import { IndeedJobQueryOptions, IndeedJobTypeOption, IndeedSortOption } from '../types/indeed-types';

const VALID_JOB_TYPES: IndeedJobTypeOption[] = ['fulltime', 'parttime', 'contract', 'internship', 'temporary'];
const VALID_SORT: IndeedSortOption[] = ['relevance', 'date'];

export interface IndeedValidationResult {
  valid: boolean;
  error?: string;
  sanitizedOptions?: IndeedJobQueryOptions;
}

export function validateIndeedJobQueryOptions(rawInput: any): IndeedValidationResult {
  if (!rawInput || typeof rawInput !== 'object') {
    return { valid: false, error: 'Request parameters must be an object.' };
  }

  const keyword = rawInput.keyword ? String(rawInput.keyword).trim() : undefined;
  const location = rawInput.location ? String(rawInput.location).trim() : undefined;

  if (!keyword && !location) {
    return { valid: false, error: 'Validation Error: Either "keyword" or "location" parameter must be provided.' };
  }

  let fromage: number | undefined = undefined;
  if (rawInput.fromage !== undefined && rawInput.fromage !== null && rawInput.fromage !== '') {
    fromage = Number(rawInput.fromage);
    if (isNaN(fromage) || !Number.isInteger(fromage) || fromage <= 0) {
      return { valid: false, error: `Validation Error: Invalid fromage "${rawInput.fromage}". Fromage must be a positive integer.` };
    }
  }

  let jobType: IndeedJobTypeOption | IndeedJobTypeOption[] | undefined = undefined;
  if (rawInput.jobType) {
    const items = Array.isArray(rawInput.jobType)
      ? rawInput.jobType
      : String(rawInput.jobType).split(',').map((s: string) => s.trim());

    const validatedItems: IndeedJobTypeOption[] = [];
    for (const item of items) {
      if (!item) continue;
      const matched = VALID_JOB_TYPES.find((jt) => jt.toLowerCase() === String(item).toLowerCase());
      if (!matched) {
        return { valid: false, error: `Validation Error: Invalid jobType "${item}". Allowed values: ${VALID_JOB_TYPES.join(', ')}` };
      }
      validatedItems.push(matched);
    }
    jobType = Array.isArray(rawInput.jobType) ? validatedItems : (validatedItems.length === 1 ? validatedItems[0] : validatedItems);
  }

  let sort: IndeedSortOption | undefined = undefined;
  if (rawInput.sort) {
    const val = String(rawInput.sort).toLowerCase().trim() as IndeedSortOption;
    if (!VALID_SORT.includes(val)) {
      return { valid: false, error: `Validation Error: Invalid sort "${rawInput.sort}". Allowed values: relevance, date` };
    }
    sort = val;
  }

  let salary: number | string | undefined = undefined;
  if (rawInput.salary !== undefined && rawInput.salary !== null && rawInput.salary !== '') {
    salary = rawInput.salary;
  }

  let limit: number | undefined;
  if (rawInput.limit !== undefined && rawInput.limit !== null && rawInput.limit !== '') {
    limit = Number(rawInput.limit);
    if (isNaN(limit) || !Number.isInteger(limit) || limit <= 0 || limit > 100) {
      return { valid: false, error: `Validation Error: Invalid limit "${rawInput.limit}". Limit must be an integer between 1 and 100.` };
    }
  }

  let page: number | undefined;
  if (rawInput.page !== undefined && rawInput.page !== null && rawInput.page !== '') {
    page = Number(rawInput.page);
    if (isNaN(page) || !Number.isInteger(page) || page < 0) {
      return { valid: false, error: `Validation Error: Invalid page "${rawInput.page}". Page must be a non-negative integer.` };
    }
  }

  const proxyUrl = rawInput.proxyUrl ? String(rawInput.proxyUrl).trim() : undefined;

  const sanitizedOptions: IndeedJobQueryOptions = {
    keyword,
    location,
    fromage,
    jobType,
    sort,
    salary,
    limit: limit || 25,
    page: page || 0,
    proxyUrl,
  };

  return { valid: true, sanitizedOptions };
}
