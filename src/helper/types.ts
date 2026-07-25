/**
 * types.ts — Shared types across all modules
 */

// Raw job object returned by Apify LinkedIn scraper
export interface Job {
  id?:               string;
  link?:             string;
  title?:            string;
  companyName?:      string;
  companyDescription?: string;
  location?:         string;
  postedAt?:         string;
  salary?:           string;
  descriptionText?:  string;
  applicantsCount?:  string | number;
  applyUrl?:         string;
  seniorityLevel?:   string;
  employmentType?:   string;
  jobFunction?:      string;
  industries?:       string;
  benefits?:         string[];
  keyword_bin_reason?: string;
  [key: string]:      any; // Still allow other fields but they won't be explicitly typed
}

// DeepSeek relevance check result
export interface RelevanceResult {
  score:               number;
  reason:              string;
  matched_skills:      string[];
  missing_skills:      string[];
  job_location:        string | null;
  years_of_experience: string;
  direct_apply:        string | null;
}

// Job after DeepSeek enrichment
export interface EnrichedJob extends Job {
  status:             'matched' | 'rejected' | 'binned';
  ai_score?:          number;
  ai_reason?:         string;
  ai_matched_skills?: string[];
  ai_missing_skills?: string[];
  ai_job_location?:       string | null;
  ai_yoe?:            string;
  ai_direct_apply?:   string | null;
}

// DeepSeek token usage, accumulated across all batch calls
export interface TokenUsage {
  promptCacheHitTokens:  number;
  promptCacheMissTokens: number;
  completionTokens:      number;
}

// Result from checkRelevanceBatch
export interface BatchResult {
  matched:  EnrichedJob[];
  rejected: EnrichedJob[];
  usage:    TokenUsage;
}

export interface CandidateProfileData {
  primaryDomain?: string;
  candidateSummary?: string;
  knownSkills?: string[];
  education?: string[];
  projects?: Array<{ project_title: string; project_description: string }>;
  certifications?: string[];
  keyHighlights?: string[];
  suggestedJobTitles?: string[];
}

export interface UserPromptContext {
  resumeText: string;
  experienceYears?: number | null;
  targetRoles?: string | null;
  targetLocations?: string | null;
  employmentType?: string | null;
  primaryDomain?: string | null;
  candidateSummary?: string | null;
  knownSkills?: string[] | null;
  education?: string[] | null;
  projects?: Array<{ project_title: string; project_description: string }> | null;
  certifications?: string[] | null;
  keyHighlights?: string[] | null;
  suggestedJobTitles?: string[] | null;
}

export interface JobStats {
  scraped: number;
  duplicateRemoved: number;
  dbDeduplicated: number;
  keywordFiltered: number;
  aiRejected: number;
  matched: number;
}
