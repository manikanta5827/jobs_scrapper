/**
 * fit_evaluator.ts
 * Deterministic job-fit evaluator based on facts extracted by the LLM.
 * No AI-based judgment here — only the business rules.
 */

import type { JobFitFacts, UserPromptContext } from "./types";
import {
  CATEGORY_SCORES,
  MINOR_GAPS_THRESHOLD,
  STRONG_MATCH_THRESHOLD,
  PREFERRED_BONUS_THRESHOLD,
} from "./constants";

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

  const matchedRequired = filterToTarget(
    facts.candidate_matched_required_skills ?? [],
    required,
  );
  const matchedPreferred = filterToTarget(
    facts.candidate_matched_preferred_skills ?? [],
    preferred,
  );

  const missingRequired = missingFromTarget(required, matchedRequired);
  const missingPreferred = missingFromTarget(preferred, matchedPreferred);

  // 1. Experience gate
  if (facts.min_required_yoe != null && candidateYoe < facts.min_required_yoe) {
    return buildEvaluation("experience_mismatch", facts, yoeReason, candidateYoe, {
      matched: matchedRequired,
      missing: missingRequired,
    });
  }
  if (facts.max_required_yoe != null && candidateYoe > facts.max_required_yoe) {
    return buildEvaluation("experience_mismatch", facts, yoeReason, candidateYoe, {
      matched: matchedRequired,
      missing: missingRequired,
    });
  }

  // 2. No explicit skills at all — fall back to domain matching
  const hasNoSkills = required.length === 0 && preferred.length === 0;
  if (hasNoSkills) {
    const caseKey: EvaluationCase = facts.domain_matches_candidate
      ? "no_skills_domain_match"
      : "no_skills_domain_mismatch";
    return buildEvaluation(caseKey, facts, yoeReason, candidateYoe, {
      matched: [],
      missing: [],
    });
  }

  // 3. Required skills exist — required is the gate, preferred is the bonus
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
      matched: matchedRequired,
      missing: missingRequired,
      matchedPreferred,
      totalRequired: required.length,
      totalPreferred: preferred.length,
    });
  }

  // 4. Preferred skills only — they become the target
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
      matched: matchedPreferred,
      missing: missingPreferred,
      totalPreferred: preferred.length,
    });
  }

  // Unreachable fallback
  return buildEvaluation("no_skills_domain_mismatch", facts, yoeReason, candidateYoe, {
    matched: [],
    missing: [],
  });
}

function buildEvaluation(
  caseKey: EvaluationCase,
  facts: JobFitFacts,
  yoeReason: string,
  candidateYoe: number,
  ctx: {
    matched: string[];
    missing: string[];
    matchedPreferred?: string[];
    totalRequired?: number;
    totalPreferred?: number;
  },
): FitEvaluation {
  const base = {
    matched_skills: ctx.matched,
    missing_skills: ctx.missing,
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
        category: "minor_gaps",
        reason: "No explicit skills listed; domain matches candidate.",
        score: CATEGORY_SCORES.minor_gaps,
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
          ctx.matched,
          ctx.missing,
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
          ctx.matched,
          ctx.missing,
          ctx.totalRequired ?? 1,
          false,
          "required",
        )} Preferred skills also strongly matched (${ctx.matchedPreferred?.length ?? 0}/${
          ctx.totalPreferred ?? 0
        }).`,
        score: CATEGORY_SCORES.strong_match,
      };

    case "required_skills_minor_gaps":
      return {
        ...base,
        category: "minor_gaps",
        reason: buildSkillsReason(
          ctx.matched,
          ctx.missing,
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
          ctx.matched,
          ctx.missing,
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
          ctx.matched,
          ctx.missing,
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
          ctx.matched,
          ctx.missing,
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
          ctx.matched,
          ctx.missing,
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

function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matchDistance = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  const aMatches: boolean[] = new Array(a.length).fill(false);
  const bMatches: boolean[] = new Array(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, b.length);
    for (let j = start; j < end; j++) {
      if (!bMatches[j] && a[i] === b[j]) {
        aMatches[i] = true;
        bMatches[j] = true;
        matches++;
        break;
      }
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions = Math.floor(transpositions / 2);

  const jaro =
    (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

const FUZZY_THRESHOLD = 0.85;

// Dangerous false-positive pairs that happen to score above the threshold.
// "java" ↔ "javascript" scores 0.88 but Java ≠ JavaScript.
const FUZZY_BLACKLIST = new Set(["java:javascript", "javascript:java"]);

function isFuzzyBlacklisted(a: string, b: string): boolean {
  return FUZZY_BLACKLIST.has(`${a}:${b}`);
}

function filterToTarget(raw: string[], target: string[]): string[] {
  const result: string[] = [];
  for (const m of raw) {
    // Primary: exact match after normalization — use the target name
    const exactTarget = target.find((t) => normalizeSkill(t) === normalizeSkill(m));
    if (exactTarget) {
      result.push(exactTarget);
      continue;
    }

    // Fallback: Jaro-Winkler similarity for minor string differences
    const mNorm = normalizeSkill(m);
    const best = target.reduce(
      (best, t) => {
        const tNorm = normalizeSkill(t);
        if (isFuzzyBlacklisted(mNorm, tNorm)) return best;
        const sim = jaroWinkler(mNorm, tNorm);
        return sim > best.sim ? { skill: t, sim } : best;
      },
      { skill: null as string | null, sim: 0 },
    );

    if (best.sim > FUZZY_THRESHOLD) {
      console.warn(
        `[fuzzy-match] "${m}" → "${best.skill}" (sim=${best.sim.toFixed(3)})`,
      );
      result.push(best.skill!);
    }
  }
  return result;
}

function missingFromTarget(target: string[], matched: string[]): string[] {
  return target.filter(
    (t) => !matched.some((m) => normalizeSkill(m) === normalizeSkill(t)),
  );
}

function normalizeSkill(skill: string): string {
  return skill.toLowerCase().trim().replace(/\s+/g, " ");
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
  skillType: "required" | "preferred",
): string {
  const missingSlice = missing.slice(0, 5);
  const matchText = `${matched.length}/${total} ${skillType} skills matched`;
  if (isFullMatch) {
    return `${matchText}.`;
  }
  if (missingSlice.length > 0) {
    return `${matchText}; missing: ${missingSlice.join(", ")}.`;
  }
  return `${matchText}.`;
}
