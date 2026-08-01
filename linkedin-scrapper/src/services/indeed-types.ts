export type IndeedJobTypeOption = 'fulltime' | 'parttime' | 'contract' | 'internship' | 'temporary';

export type IndeedSortOption = 'relevance' | 'date';

export interface IndeedJobQueryOptions {
  keyword?: string;
  location?: string;
  fromage?: number;
  jobType?: IndeedJobTypeOption | IndeedJobTypeOption[];
  sort?: IndeedSortOption;
  salary?: number | string;
  limit?: number;
  page?: number;
  proxyUrl?: string;
}
