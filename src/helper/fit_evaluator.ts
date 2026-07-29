/**
 * fit_evaluator.ts
 * Deterministic job-fit evaluator based on facts extracted by the LLM.
 * No AI-based judgment here — only the business rules.
 */

import type { JobFitFacts, UserPromptContext } from "./types";
import { CATEGORY_SCORES, MINOR_GAPS_THRESHOLD, STRONG_MATCH_THRESHOLD } from "./constants";

export interface FitEvaluation {
  category: string;
  reason: string;
  score: number;
  matched_skills: string[];
  missing_skills: string[];
  job_location: string | null;
  years_of_experience: string;
  direct_apply: string | null;
}

export function evaluateJobFit(
  facts: JobFitFacts,
  candidateContext: UserPromptContext,
): FitEvaluation {
  const candidateYoe = Math.ceil(candidateContext.experienceYears ?? 0);
  const required = facts.required_skills ?? [];
  const rawMatched = facts.candidate_matched_skills ?? [];

  // Guard against LLM returning preferred skills in matched list: only count required skills.
  const matched = rawMatched.filter(m => required.some(r => normalizeSkill(r) === normalizeSkill(m)));
  const missing = required.filter(r => !matched.some(m => normalizeSkill(m) === normalizeSkill(r)));

  // 1. Experience gate
  const yoeReason = formatYoeRange(facts.min_required_yoe, facts.max_required_yoe);
  if (facts.min_required_yoe != null && candidateYoe < facts.min_required_yoe) {
    return {
      category: "experience_mismatch",
      reason: `Candidate has ${candidateYoe} YOE; job requires ${yoeReason}.`,
      score: CATEGORY_SCORES.experience_mismatch,
      matched_skills: matched,
      missing_skills: missing,
      job_location: facts.job_location ?? null,
      years_of_experience: yoeReason,
      direct_apply: facts.direct_apply ?? null,
    };
  }
  if (facts.max_required_yoe != null && candidateYoe > facts.max_required_yoe) {
    return {
      category: "experience_mismatch",
      reason: `Candidate has ${candidateYoe} YOE; job requires ${yoeReason}.`,
      score: CATEGORY_SCORES.experience_mismatch,
      matched_skills: matched,
      missing_skills: missing,
      job_location: facts.job_location ?? null,
      years_of_experience: yoeReason,
      direct_apply: facts.direct_apply ?? null,
    };
  }

  // 2. Skills + domain gate
  if (facts.job_has_no_explicit_skills || required.length === 0) {
    if (facts.domain_matches_candidate) {
      return {
        category: "minor_gaps",
        reason: "No explicit skills listed; domain matches candidate.",
        score: CATEGORY_SCORES.minor_gaps,
        matched_skills: matched,
        missing_skills: missing,
        job_location: facts.job_location ?? null,
        years_of_experience: yoeReason,
        direct_apply: facts.direct_apply ?? null,
      };
    }
    return {
      category: "no_match",
      reason: "No explicit skills listed and domain does not match candidate.",
      score: CATEGORY_SCORES.no_match,
      matched_skills: matched,
      missing_skills: missing,
      job_location: facts.job_location ?? null,
      years_of_experience: yoeReason,
      direct_apply: facts.direct_apply ?? null,
    };
  }

  const coverage = matched.length / required.length;
  if (coverage >= STRONG_MATCH_THRESHOLD) {
    return {
      category: "strong_match",
      reason: buildSkillsReason(matched, missing, required.length, true),
      score: CATEGORY_SCORES.strong_match,
      matched_skills: matched,
      missing_skills: missing,
      job_location: facts.job_location ?? null,
      years_of_experience: yoeReason,
      direct_apply: facts.direct_apply ?? null,
    };
  }

  if (coverage >= MINOR_GAPS_THRESHOLD) {
    return {
      category: "minor_gaps",
      reason: buildSkillsReason(matched, missing, required.length, false),
      score: CATEGORY_SCORES.minor_gaps,
      matched_skills: matched,
      missing_skills: missing,
      job_location: facts.job_location ?? null,
      years_of_experience: yoeReason,
      direct_apply: facts.direct_apply ?? null,
    };
  }

  return {
    category: "skills_mismatch",
    reason: buildSkillsReason(matched, missing, required.length, false),
    score: CATEGORY_SCORES.skills_mismatch,
    matched_skills: matched,
    missing_skills: missing,
    job_location: facts.job_location ?? null,
    years_of_experience: yoeReason,
    direct_apply: facts.direct_apply ?? null,
  };
}

function normalizeSkill(skill: string): string {
  return skill.toLowerCase().trim().replace(/\s+/g, ' ');
}

function formatYoeRange(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${min}-${max} years`;
  if (min != null) return `${min}+ years`;
  if (max != null) return `0-${max} years`;
  return "Not specified";
}

function buildSkillsReason(
  matched: string[],
  missing: string[],
  total: number,
  isFullMatch: boolean,
): string {
  const missingSlice = missing.slice(0, 5);
  const matchText = `${matched.length}/${total} required skills matched`;
  if (isFullMatch) {
    return `${matchText}.`;
  }
  if (missingSlice.length > 0) {
    return `${matchText}; missing: ${missingSlice.join(", ")}.`;
  }
  return `${matchText}.`;
}
