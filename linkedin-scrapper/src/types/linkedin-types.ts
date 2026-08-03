export type DateSincePostedOption = 'past month' | 'past week' | '24hr' | 'past 24 hours' | '' | `${number}hr` | `r${number}` | string;

export type ExperienceLevelOption =
  | 'internship'
  | 'entry level'
  | 'associate'
  | 'senior'
  | 'director'
  | 'executive'
  | '1' | '2' | '3' | '4' | '5' | '6';

export type JobTypeOption =
  | 'full time'
  | 'full-time'
  | 'part time'
  | 'part-time'
  | 'contract'
  | 'temporary'
  | 'volunteer'
  | 'internship'
  | 'F' | 'P' | 'C' | 'T' | 'V' | 'I';

export type RemoteFilterOption =
  | 'on-site'
  | 'on site'
  | 'remote'
  | 'hybrid'
  | '1' | '2' | '3';

export type SortByOption = 'recent' | 'relevant' | 'DD' | 'R' | '';

export interface JobQueryOptions {
  host?: string;
  keyword?: string;
  location?: string;
  geoId?: string;
  company?: string | string[];
  dateSincePosted?: DateSincePostedOption;
  experienceLevel?: ExperienceLevelOption | ExperienceLevelOption[] | '';
  jobType?: JobTypeOption | JobTypeOption[] | '';
  remoteFilter?: RemoteFilterOption | RemoteFilterOption[] | '';
  salary?: string | number;
  sortBy?: SortByOption;
  limit?: number;
  page?: number;
  easyApply?: boolean;
  has_verification?: boolean;
  under_10_applicants?: boolean;
  /** Optional proxy URL e.g. http://username:password@proxy-host:port */
  proxyUrl?: string;
}

export interface JobDetails {
  descriptionText?: string;
  seniorityLevel?: string;
  employmentType?: string;
  jobFunction?: string;
  industries?: string;
  numApplicants?: string;
}

export interface JobPosting {
  id?: string;
  position: string;
  company: string;
  location: string;
  date?: string;
  salary: string;
  jobUrl: string;
  companyLogo?: string;
  agoTime: string;
  /** Full job details (description, seniority, employment type, criteria) */
  details?: JobDetails;
  /** Source platform */
  source?: 'linkedin' | 'naukri' | 'simplyhired' | 'indeed';
}
