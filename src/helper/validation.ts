/**
 * validation.ts — Zod Input Schemas & Parser Helper
 * Provides strict request body, path parameter, and payload validation across all API endpoints.
 */

import { z } from 'zod';

// UUID parameter validation schema
export const UuidParamSchema = z.string().uuid({ message: "Invalid candidate UUID format" });

// Numeric ID parameter validation schema
export const NumericIdParamSchema = z.coerce.number().int().positive({ message: "ID must be a positive integer" });

// ─── Admin API Schemas ────────────────────────────────────────────────────────

// POST /run request body schema
export const TriggerRunSchema = z.object({
  lookbackHours: z.number().min(1, { message: "Lookback must be at least 1 hour" }).max(168, { message: "Lookback cannot exceed 168 hours (7 days)" }).optional().default(12),
  targetUserId: z.string().uuid({ message: "targetUserId must be a valid UUID" }).optional(),
});

// POST /admin/analyze-resume request body schema
export const AnalyzeResumeSchema = z.object({
  resumeText: z.string()
    .min(50, { message: "Resume text must be at least 50 characters long" })
    .max(15000, { message: "Resume text cannot exceed 15,000 characters" }),
});

// POST /users request body schema
export const CreateUserSchema = z.object({
  email: z.string().email({ message: "Must be a valid email address" }).max(255, { message: "Email cannot exceed 255 characters" }),
  name: z.string().trim().max(100, { message: "Name cannot exceed 100 characters" }).optional(),
  resumeText: z.string()
    .min(50, { message: "Resume plain text must be at least 50 characters long" })
    .max(15000, { message: "Resume plain text cannot exceed 15,000 characters" }),
  telegramChatId: z.string().trim().max(50, { message: "Telegram Chat ID cannot exceed 50 characters" }).optional(),
  linkedinCredentials: z.object({
    accessToken: z.string().trim().max(1000, { message: "Access token too long" }).optional(),
    refreshToken: z.string().trim().max(1000, { message: "Refresh token too long" }).optional(),
    personUrn: z.string().trim().max(100, { message: "Person URN cannot exceed 100 characters" }).optional()
  }).optional(),
  initialInr: z.number()
    .min(100, { message: "Initial recharge must be at least ₹100 INR" })
    .max(100000, { message: "Initial recharge cannot exceed ₹100,000 INR" })
    .optional().default(500),
  customRunCostUsd: z.number()
    .min(0.01, { message: "Custom rate must be at least $0.01 USD" })
    .max(10.0, { message: "Custom rate cannot exceed $10.00 USD" })
    .nullable().optional(),
  experienceYears: z.number().min(0, { message: "Experience years must be 0 or greater" }).max(50).optional().default(0),
  targetLocations: z.string().trim().max(500).optional(),
  employmentType: z.string().trim().max(100).optional(),
  primaryDomain: z.string().trim().max(255).optional(),
  candidateSummary: z.string().trim().max(2000).optional(),
  knownSkills: z.array(z.string().trim()).optional(),
  education: z.array(z.string().trim()).optional(),
  projects: z.array(z.object({
    project_title: z.string().trim(),
    project_description: z.string().trim()
  })).optional(),
  certifications: z.array(z.string().trim()).optional(),
  keyHighlights: z.array(z.string().trim()).optional(),
  suggestedJobTitles: z.array(z.string().trim()).optional(),
  excludeTitleKeywords: z.array(
    z.string().trim().min(1).max(50)
  ).max(100, { message: "Maximum 100 exclude keywords allowed" }).optional(),
  source: z.enum(['linkedin', 'whatsapp', 'other'], { message: "Source must be one of: linkedin, whatsapp, other" }).optional()
});

// PUT /users/{id} request body schema
export const UpdateUserSchema = z.object({
  email: z.string().email().max(255).optional(),
  name: z.string().trim().max(100).optional(),
  resumeText: z.string()
    .min(50, { message: "Resume plain text must be at least 50 characters long" })
    .max(15000, { message: "Resume plain text cannot exceed 15,000 characters" })
    .optional(),
  telegramChatId: z.string().trim().max(50).optional(),
  linkedinCredentials: z.object({
    accessToken: z.string().trim().max(1000).optional(),
    refreshToken: z.string().trim().max(1000).optional(),
    personUrn: z.string().trim().max(100).optional()
  }).optional(),
  amountInr: z.number().min(10).max(100000).optional(),
  balanceUsd: z.number().min(0).max(10000).optional(),
  customRunCostUsd: z.number().min(0.01).max(10.0).nullable().optional(),
  experienceYears: z.number().min(0).max(50).optional(),
  targetLocations: z.string().trim().max(500).optional(),
  employmentType: z.string().trim().max(100).optional(),
  primaryDomain: z.string().trim().max(255).optional(),
  candidateSummary: z.string().trim().max(2000).optional(),
  knownSkills: z.array(z.string().trim()).optional(),
  education: z.array(z.string().trim()).optional(),
  projects: z.array(z.object({
    project_title: z.string().trim(),
    project_description: z.string().trim()
  })).optional(),
  certifications: z.array(z.string().trim()).optional(),
  keyHighlights: z.array(z.string().trim()).optional(),
  suggestedJobTitles: z.array(z.string().trim()).optional(),
  excludeTitleKeywords: z.array(z.string().trim().min(1).max(50)).max(100).optional(),
  isActive: z.boolean().optional(),
  source: z.enum(['linkedin', 'whatsapp', 'other']).optional()
});

// POST /users/{id}/topup request body schema
export const TopupWalletSchema = z.object({
  amountInr: z.number()
    .min(10, { message: "Recharge amount must be at least ₹10 INR" })
    .max(100000, { message: "Recharge amount cannot exceed ₹100,000 INR" })
});

// POST /apify-keys request body schema
export const CreateApifyKeySchema = z.object({
  apiKey: z.string().trim().min(5, { message: "API key must be at least 5 characters" }).max(255),
  subscriptionStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Date must be in YYYY-MM-DD format" }),
  name: z.string().trim().max(100).optional()
});

// PUT /apify-keys/{id} request body schema
export const UpdateApifyKeySchema = z.object({
  apiKey: z.string().trim().min(5).max(255).optional(),
  subscriptionStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  name: z.string().trim().max(100).optional(),
  usageCost: z.number().min(0).max(100).optional()
});

// ─── Telegram Webhook Payload Schema ──────────────────────────────────────────

export const TelegramWebhookMessageSchema = z.object({
  message: z.object({
    message_id: z.number(),
    from: z.object({
      id: z.number(),
      first_name: z.string().optional(),
      username: z.string().optional()
    }).optional(),
    chat: z.object({
      id: z.number().or(z.string())
    }),
    date: z.number(),
    text: z.string().optional()
  }).optional()
});

// Helper function to format Zod error issues into a clean error message
export function formatZodError(error: z.ZodError): string {
  return error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}
