import { SimplyHiredJobQueryOptions, SimplyHiredDateOption, SimplyHiredJobTypeOption } from './simplyhired-types';

const VALID_DATES: SimplyHiredDateOption[] = ['24hr', '3days', '7days', '14days', '30days', '1', '3', '7', '14', '30'];
const VALID_JOB_TYPES: SimplyHiredJobTypeOption[] = [
  'fulltime',
  'parttime',
  'contract',
  'internship',
  'temporary',
  'permanent',
  'freelance',
  'temp-to-hire',
  'CF3CP',
  'NJXCK',
  '75GKK',
  '5QWDV',
  'ZG59D',
  '7SBAT',
  '4HKF7',
  'VDTG7',
];
const VALID_SORT: string[] = ['relevance', 'date'];

export interface SimplyHiredValidationResult {
  valid: boolean;
  error?: string;
  sanitizedOptions?: SimplyHiredJobQueryOptions;
}

export function validateSimplyHiredJobQueryOptions(rawInput: any): SimplyHiredValidationResult {
  if (!rawInput || typeof rawInput !== 'object') {
    return { valid: false, error: 'Request parameters must be an object.' };
  }

  const keyword = rawInput.keyword ? String(rawInput.keyword).trim() : undefined;
  const location = rawInput.location ? String(rawInput.location).trim() : undefined;

  if (!keyword && !location) {
    return { valid: false, error: 'Validation Error: Either "keyword" or "location" parameter must be provided.' };
  }

  let datePosted: SimplyHiredDateOption | undefined = undefined;
  if (rawInput.datePosted) {
    const val = String(rawInput.datePosted).toLowerCase().trim();
    const matched = VALID_DATES.find((d) => d.toLowerCase() === val);
    if (!matched) {
      return { valid: false, error: `Validation Error: Invalid datePosted "${rawInput.datePosted}". Allowed values: ${VALID_DATES.join(', ')}` };
    }
    datePosted = matched;
  }

  let jobType: SimplyHiredJobTypeOption | SimplyHiredJobTypeOption[] | undefined = undefined;
  if (rawInput.jobType) {
    const items = Array.isArray(rawInput.jobType)
      ? rawInput.jobType
      : String(rawInput.jobType).split(',').map((s: string) => s.trim());

    const validatedItems: SimplyHiredJobTypeOption[] = [];
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

  let sort: any = undefined;
  if (rawInput.sort) {
    const val = String(rawInput.sort).toLowerCase().trim();
    if (!VALID_SORT.includes(val)) {
      return { valid: false, error: `Validation Error: Invalid sort "${rawInput.sort}". Allowed values: relevance, date` };
    }
    sort = val;
  }

  let distance: number | undefined = undefined;
  if (rawInput.distance !== undefined && rawInput.distance !== null && rawInput.distance !== '') {
    distance = Number(rawInput.distance);
    if (isNaN(distance) || !Number.isInteger(distance) || distance < 0) {
      return { valid: false, error: `Validation Error: Invalid distance "${rawInput.distance}". Distance must be a non-negative integer.` };
    }
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

  const domain = rawInput.domain ? String(rawInput.domain).trim() : undefined;

  const sanitizedOptions: SimplyHiredJobQueryOptions = {
    keyword,
    location,
    datePosted,
    jobType,
    remote: rawInput.remote === 'true' || rawInput.remote === true ? true : undefined,
    sort,
    distance,
    domain,
    limit: limit || 25,
    page: page || 1,
  };

  return { valid: true, sanitizedOptions };
}
