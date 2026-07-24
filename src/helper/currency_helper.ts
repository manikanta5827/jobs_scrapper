/**
 * currency_helper.ts — Centralized Exchange Rate & Conversion Helper
 * Provides a single source of truth for USD <-> INR currency conversions.
 */

// Global exchange rate constant (1 USD = 85.0 INR)
export const INR_PER_USD = 100;

/**
 * Converts a USD amount to rounded INR amount.
 * Example: $5.88 USD -> ₹500 INR
 */
export function convertUsdToInr(usdAmount: number, rate: number = INR_PER_USD): number {
  return Math.round((usdAmount || 0) * rate);
}

/**
 * Converts an INR amount to USD rounded to 2 decimal places.
 * Example: ₹500 INR -> $5.88 USD
 */
export function convertInrToUsd(inrAmount: number, rate: number = INR_PER_USD): number {
  if (!inrAmount || inrAmount <= 0) return 0;
  return Number((inrAmount / rate).toFixed(2));
}
