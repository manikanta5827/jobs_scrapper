/**
 * fit_evaluator.ts
 * Deterministic job-fit evaluator based on facts extracted by the LLM.
 * No AI-based judgment here — only the business rules.
 */

import type { JobFitFacts, UserPromptContext } from "../types";
import {
  CATEGORY_SCORES,
  MINOR_GAPS_THRESHOLD,
  STRONG_MATCH_THRESHOLD,
  PREFERRED_BONUS_THRESHOLD,
} from "../constants";

export interface FitEvaluation {
  category: string;
  reason: string;
  score: number;
  matched_skills: string[];
  missing_skills: string[];
  candidate_matched_required: string[];
  candidate_matched_preferred: string[];
  candidate_missing_required: string[];
  candidate_missing_preferred: string[];
  job_location: string | null;
  years_of_experience: string;
  direct_apply: string | null;
}

type EvaluationCase =
  | "experience_mismatch"
  | "no_skills_domain_match"
  | "no_skills_domain_mismatch"
  | "required_skills_strong_match"
  | "required_skills_bonus_upgrade"
  | "required_skills_minor_gaps"
  | "required_skills_mismatch"
  | "preferred_skills_strong_match"
  | "preferred_skills_minor_gaps"
  | "preferred_skills_no_match";

export function evaluateJobFit(
  facts: JobFitFacts,
  candidateContext: UserPromptContext,
): FitEvaluation {
  const candidateYoe = Math.ceil(candidateContext.experienceYears ?? 0);
  const yoeReason = formatYoeRange(facts.min_required_yoe, facts.max_required_yoe);

  const required = facts.required_skills ?? [];
  const preferred = facts.preferred_skills ?? [];

  const matchedRequired = facts.candidate_matched_required_skills ?? [];
  const matchedPreferred = facts.candidate_matched_preferred_skills ?? [];

  const missingRequired = skillDiff(required, matchedRequired);
  const missingPreferred = skillDiff(preferred, matchedPreferred);

  // +-1 year tolerance so near-miss YOE doesn't auto-reject
  const YOE_TOLERANCE = 0;

  // --- Experience gate: reject if candidate YOE (±1) outside job range ---
  if (facts.min_required_yoe != null && candidateYoe + YOE_TOLERANCE < facts.min_required_yoe) {
    return buildEvaluation("experience_mismatch", facts, yoeReason, candidateYoe, {
      candidate_matched_required: matchedRequired,
      candidate_matched_preferred: matchedPreferred,
      candidate_missing_required: missingRequired,
      candidate_missing_preferred: missingPreferred,
    });
  }
  if (facts.max_required_yoe != null && candidateYoe - YOE_TOLERANCE > facts.max_required_yoe) {
    return buildEvaluation("experience_mismatch", facts, yoeReason, candidateYoe, {
      candidate_matched_required: matchedRequired,
      candidate_matched_preferred: matchedPreferred,
      candidate_missing_required: missingRequired,
      candidate_missing_preferred: missingPreferred,
    });
  }

  // --- No explicit skills in listing: fall back to domain match ---
  const hasNoSkills = required.length === 0 && preferred.length === 0;
  if (hasNoSkills) {
    const caseKey: EvaluationCase = facts.domain_matches_candidate
      ? "no_skills_domain_match"
      : "no_skills_domain_mismatch";
    return buildEvaluation(caseKey, facts, yoeReason, candidateYoe, {
      candidate_matched_required: [],
      candidate_matched_preferred: [],
      candidate_missing_required: [],
      candidate_missing_preferred: [],
    });
  }

  // --- Required skills exist: gate on required, bonus on preferred ---
  if (required.length > 0) {
    const requiredCoverage = matchedRequired.length / required.length;
    const preferredCoverage =
      preferred.length > 0 ? matchedPreferred.length / preferred.length : null;

    let caseKey: EvaluationCase;
    if (requiredCoverage >= STRONG_MATCH_THRESHOLD) {
      caseKey = "required_skills_strong_match";
    } else if (requiredCoverage < MINOR_GAPS_THRESHOLD) {
      caseKey = "required_skills_mismatch";
    } else if (
      preferredCoverage != null &&
      preferredCoverage >= PREFERRED_BONUS_THRESHOLD
    ) {
      caseKey = "required_skills_bonus_upgrade";
    } else {
      caseKey = "required_skills_minor_gaps";
    }

    return buildEvaluation(caseKey, facts, yoeReason, candidateYoe, {
      candidate_matched_required: matchedRequired,
      candidate_matched_preferred: matchedPreferred,
      candidate_missing_required: missingRequired,
      candidate_missing_preferred: missingPreferred,
      totalRequired: required.length,
      totalPreferred: preferred.length,
    });
  }

  // --- Only preferred skills: treat them as the target ---
  if (preferred.length > 0) {
    const preferredCoverage = matchedPreferred.length / preferred.length;

    let caseKey: EvaluationCase;
    if (preferredCoverage >= STRONG_MATCH_THRESHOLD) {
      caseKey = "preferred_skills_strong_match";
    } else if (preferredCoverage >= MINOR_GAPS_THRESHOLD) {
      caseKey = "preferred_skills_minor_gaps";
    } else {
      caseKey = "preferred_skills_no_match";
    }

    return buildEvaluation(caseKey, facts, yoeReason, candidateYoe, {
      candidate_matched_required: [],
      candidate_matched_preferred: matchedPreferred,
      candidate_missing_required: [],
      candidate_missing_preferred: missingPreferred,
      totalPreferred: preferred.length,
    });
  }

  // Unreachable: fallback no-match
  return buildEvaluation("no_skills_domain_mismatch", facts, yoeReason, candidateYoe, {
    candidate_matched_required: [],
    candidate_matched_preferred: [],
    candidate_missing_required: [],
    candidate_missing_preferred: [],
  });
}

/** Build the final FitEvaluation for a given decision case. */
function buildEvaluation(
  caseKey: EvaluationCase,
  facts: JobFitFacts,
  yoeReason: string,
  candidateYoe: number,
  ctx: {
    candidate_matched_required: string[];
    candidate_matched_preferred: string[];
    candidate_missing_required: string[];
    candidate_missing_preferred: string[];
    totalRequired?: number;
    totalPreferred?: number;
  },
): FitEvaluation {
  const base = {
    matched_skills: [...ctx.candidate_matched_required, ...ctx.candidate_matched_preferred],
    missing_skills: [...ctx.candidate_missing_required, ...ctx.candidate_missing_preferred],
    candidate_matched_required: ctx.candidate_matched_required,
    candidate_matched_preferred: ctx.candidate_matched_preferred,
    candidate_missing_required: ctx.candidate_missing_required,
    candidate_missing_preferred: ctx.candidate_missing_preferred,
    job_location: facts.job_location ?? null,
    years_of_experience: yoeReason,
    direct_apply: facts.direct_apply ?? null,
  };

  switch (caseKey) {
    case "experience_mismatch":
      return {
        ...base,
        category: "experience_mismatch",
        reason: `Candidate has ${candidateYoe} YOE; job requires ${yoeReason}.`,
        score: CATEGORY_SCORES.experience_mismatch,
      };

    case "no_skills_domain_match":
      return {
        ...base,
        category: "no_match",
        reason: "No explicit skills listed; domain matches but skill extraction unavailable — not sent.",
        score: CATEGORY_SCORES.no_match,
      };

    case "no_skills_domain_mismatch":
      return {
        ...base,
        category: "no_match",
        reason: "No explicit skills listed and domain does not match candidate.",
        score: CATEGORY_SCORES.no_match,
      };

    case "required_skills_strong_match":
      return {
        ...base,
        category: "strong_match",
        reason: buildSkillsReason(
          ctx.candidate_matched_required,
          ctx.candidate_missing_required,
          ctx.totalRequired ?? 1,
          true,
          "required",
        ),
        score: CATEGORY_SCORES.strong_match,
      };

    case "required_skills_bonus_upgrade":
      return {
        ...base,
        category: "strong_match",
        reason: `${buildSkillsReason(
          ctx.candidate_matched_required,
          ctx.candidate_missing_required,
          ctx.totalRequired ?? 1,
          false,
          "required")} Preferred skills also strongly matched (${ctx.candidate_matched_preferred?.length ?? 0}/${
          ctx.totalPreferred ?? 0
        }).`,
        score: CATEGORY_SCORES.strong_match,
      };

    case "required_skills_minor_gaps":
      return {
        ...base,
        category: "minor_gaps",
        reason: buildSkillsReason(
          ctx.candidate_matched_required,
          ctx.candidate_missing_required,
          ctx.totalRequired ?? 1,
          false,
          "required",
        ),
        score: CATEGORY_SCORES.minor_gaps,
      };

    case "required_skills_mismatch":
      return {
        ...base,
        category: "skills_mismatch",
        reason: buildSkillsReason(
          ctx.candidate_matched_required,
          ctx.candidate_missing_required,
          ctx.totalRequired ?? 1,
          false,
          "required",
        ),
        score: CATEGORY_SCORES.skills_mismatch,
      };

    case "preferred_skills_strong_match":
      return {
        ...base,
        category: "strong_match",
        reason: buildSkillsReason(
          ctx.candidate_matched_required,
          ctx.candidate_missing_required,
          ctx.totalPreferred ?? 1,
          true,
          "preferred",
        ),
        score: CATEGORY_SCORES.strong_match,
      };

    case "preferred_skills_minor_gaps":
      return {
        ...base,
        category: "minor_gaps",
        reason: buildSkillsReason(
          ctx.candidate_matched_required,
          ctx.candidate_missing_required,
          ctx.totalPreferred ?? 1,
          false,
          "preferred",
        ),
        score: CATEGORY_SCORES.minor_gaps,
      };

    case "preferred_skills_no_match":
      return {
        ...base,
        category: "no_match",
        reason: buildSkillsReason(
          ctx.candidate_matched_required,
          ctx.candidate_missing_required,
          ctx.totalPreferred ?? 1,
          false,
          "preferred",
        ),
        score: CATEGORY_SCORES.no_match,
      };

    default:
      const _exhaustive: never = caseKey;
      throw new Error(`Unhandled evaluation case: ${_exhaustive}`);
  }
}

/** Skills in target not present in candidate's matched set. */
function skillDiff(target: string[], matched: string[]): string[] {
  const matchedNorm = new Set(matched.map(normalizeSkill));
  return target.filter((t) => !matchedNorm.has(normalizeSkill(t)));
}

/** Normalize: lowercase, trim, collapse whitespace. */
function normalizeSkill(skill: string): string {
  return skill.toLowerCase().trim().replace(/\s+/g, " ");
}

function formatYoeRange(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${min}-${max} years`;
  if (min != null) return `${min}+ years`;
  if (max != null) return `0-${max} years`;
  return "Not specified";
}

/** Skill match reason string: "2/3 required skills matched; missing: Docker." */
function buildSkillsReason(
  matched: string[],
  missing: string[],
  total: number,
  isFullMatch: boolean,
  skillType: "required" | "preferred",
): string {
  const matchText = `${matched.length}/${total} ${skillType} skills matched`;
  if (isFullMatch) return `${matchText}.`;
  if (missing.length > 0) return `${matchText}; missing: ${missing.join(", ")}.`;
  return `${matchText}.`;
}
