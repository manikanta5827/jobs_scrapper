/**
 * types.ts — Shared types across all modules
 */

// Raw job object returned by Apify LinkedIn scraper
export interface Job {
  link?:             string;
  fingerprint?:      string;
  title?:            string;
  companyName?:      string;
  companyWebsite?:   string;
  postedAt?:         string;
  salary?:           string;
  descriptionText?:  string;
  applicantsCount?:  string | number;
  applyUrl?:         string;
  keyword_bin_reason?: string;
}

// OpenAI relevance check result
export interface RelevanceResult {
  score:               number;
  reason:              string;
  matched_skills:      string[];
  missing_skills:      string[];
  location:            string;
  years_of_experience: string;
  direct_apply:        string | null;
}

// Job after OpenAI enrichment
export interface EnrichedJob extends Job {
  status:             'matched' | 'rejected' | 'binned';
  ai_score?:          number;
  ai_reason?:         string;
  ai_matched_skills?: string[];
  ai_missing_skills?: string[];
  ai_location?:       string;
  ai_yoe?:            string;
  ai_direct_apply?:   string | null;
}

// Result from checkRelevanceBatch
export interface BatchResult {
  matched:  EnrichedJob[];
  rejected: EnrichedJob[];
}
