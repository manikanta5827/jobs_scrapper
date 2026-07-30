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
  fingerprint?:      string;
  jobTitle?:         string;
  extractedYoeText?: string | null;
  _source?:          'linkedin' | 'naukri' | 'apify';
  [key: string]:      unknown; // Still allow other fields but they won't be explicitly typed
}

// Structured facts extracted from a job description by the LLM
export interface JobFitFacts {
  job_domain:              string | null;
  min_required_yoe:        number | null;
  max_required_yoe:        number | null;
  required_skills:         string[];
  preferred_skills:        string[];
  candidate_matched_required_skills: string[];
  candidate_matched_preferred_skills: string[];
  candidate_missing_required_skills: string[];
  candidate_missing_preferred_skills: string[];
  domain_matches_candidate: boolean;
  job_location:            string | null;
  direct_apply:            string | null;
}

// Job after DeepSeek enrichment
export interface EnrichedJob extends Job {
  status:             'matched' | 'rejected' | 'binned';
  ai_category?:       string;
  ai_score?:          number;
  ai_reason?:         string;
  ai_matched_skills?: string[];
  ai_missing_skills?: string[];
  ai_job_location?:   string | null;
  ai_yoe?:            string;
  ai_direct_apply?:   string | null;
  ai_facts?:          JobFitFacts | null;
}

// LLM token usage, accumulated across all batch calls
export interface TokenUsage {
  promptCacheHitTokens:  number;
  promptCacheMissTokens: number;
  completionTokens:      number;
  /** Actual USD cost reported by the provider (e.g. OpenRouter), if available. */
  actualCostUsd?:        number;
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
