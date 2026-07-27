export enum Tier {
  FREE = 'free',
  PREMIUM = 'premium',
}

export const TIER_CONFIG: Record<Tier, { emoji: string; label: string; alertsPerDay: number }> = {
  [Tier.FREE]:    { emoji: '🔹', label: 'Free',   alertsPerDay: 1 },
  [Tier.PREMIUM]: { emoji: '⭐', label: 'Premium', alertsPerDay: 4 },
};

export const HIGH_SCORE_THRESHOLD = 85;

export const PREMIUM_PRICE_MONTHLY_INR = 300;

export const APP_FALLBACK_URL = 'https://jobs-scrapper-gold.vercel.app';
