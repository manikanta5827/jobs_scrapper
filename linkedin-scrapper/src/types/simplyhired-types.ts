export type SimplyHiredDateOption = '24hr' | '3days' | '7days' | '14days' | '30days' | '1' | '3' | '7' | '14' | '30';

export type SimplyHiredJobTypeOption =
  | 'fulltime'
  | 'parttime'
  | 'contract'
  | 'internship'
  | 'temporary'
  | 'permanent'
  | 'freelance'
  | 'temp-to-hire'
  | 'CF3CP'
  | 'NJXCK'
  | '75GKK'
  | '5QWDV'
  | 'ZG59D'
  | '7SBAT'
  | '4HKF7'
  | 'VDTG7';

export type SimplyHiredSortOption = 'relevance' | 'date';

export interface SimplyHiredJobQueryOptions {
  keyword?: string;
  location?: string;
  datePosted?: SimplyHiredDateOption;
  jobType?: SimplyHiredJobTypeOption | SimplyHiredJobTypeOption[];
  remote?: boolean;
  sort?: SimplyHiredSortOption;
  distance?: number;
  domain?: string;
  limit?: number;
  page?: number;
  cursor?: string;
}

