/**
 * types.ts — Shared types across all modules
 */

// Raw job object returned by Apify LinkedIn scraper
export interface Job {
  link?:             string;
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
  matched:        boolean;
  score:          number;
  reason:         string;
  matched_skills: string[];
  missing_skills: string[];
}

// Job after OpenAI enrichment
export interface EnrichedJob extends Job {
  status:            'matched' | 'rejected' | 'binned';
  ai_score?:         number;
  ai_reason?:        string;
  ai_matched_skills?: string[];
  ai_missing_skills?: string[];
}

// Result from checkRelevanceBatch
export interface BatchResult {
  matched:  EnrichedJob[];
  rejected: EnrichedJob[];
}
