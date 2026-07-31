export interface NaukriJobQueryOptions {
  keyword: string;
  location?: string;
  experience?: number;
  jobAge?: number;
  sort?: 'relevance' | 'date';
  limit?: number;
  page?: number;
  wfhType?: ('office' | 'remote' | 'hybrid')[];
  proxyUrl?: string;
}
