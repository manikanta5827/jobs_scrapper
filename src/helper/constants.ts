export enum Tier {
  FREE = 'free',
  PREMIUM = 'premium',
}

export const TIER_CONFIG: Record<Tier, { emoji: string; label: string; alertsPerDay: number }> = {
  [Tier.FREE]:    { emoji: '🔹', label: 'Free',   alertsPerDay: 1 },
  [Tier.PREMIUM]: { emoji: '⭐', label: 'Premium', alertsPerDay: 3 },
};

export const MIN_MATCH_SCORE = parseInt(process.env.MIN_MATCH_SCORE ?? "7", 10);
export const HIGH_SCORE_THRESHOLD = 8;

export const MATCHED_CATEGORIES = ['strong_match', 'minor_gaps'] as const;
export const MATCHED_CATEGORY_SET = new Set<string>(MATCHED_CATEGORIES);
export type MatchCategory = typeof MATCHED_CATEGORIES[number] | 'experience_mismatch' | 'skills_mismatch' | 'no_match';

export const CATEGORY_SCORES: Record<string, number> = {
  strong_match: 10,
  minor_gaps: 7,
  experience_mismatch: 2,
  skills_mismatch: 1,
  no_match: 0,
};

export const PREMIUM_PRICE_MONTHLY_INR = 500;

export const APP_FALLBACK_URL = 'https://jobs-scrapper-gold.vercel.app';
