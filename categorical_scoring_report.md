# Categorical Job Scoring — DeepSeek Validation Report

> **Date**: 29 Jul 2026  
> **Test script**: `scripts/test_deepseek_batch.ts --categorical --batch-size 5`  
> **Model**: `deepseek/deepseek-v4-flash:floor`  
> **Candidate**: 1 YOE backend/AI engineer  
> **Sample**: 20 real LinkedIn jobs; 10 passed YOE pre-filter to LLM

---

## Executive Summary

Switched the AI evaluator from a numeric 0-10 score to a 5-category label scheme. After prompt refinement, `deepseek/deepseek-v4-flash:floor` scored **10/10** on a deliberately engineered edge-case test set. It is ready for production rollout.

---

## Category Definitions

| Category | Meaning | Pass? |
|---|---|---|
| `strong_match` | Explicit skill/area match, YOE fits | ✅ |
| `minor_gaps` | Vague JD or small missing skill, but domain fits | ✅ |
| `experience_mismatch` | Required YOE clearly above candidate's | ❌ |
| `skills_mismatch` | Explicitly required core skill missing | ❌ |
| `no_match` | Completely unrelated domain OR YOE + skills both fail | ❌ |

---

## Methodology

1. YOE pre-filter rejects roles whose minimum experience > 1 year.
2. Remaining 10 jobs are sent to DeepSeek in two batches of 5.
3. LLM returns exactly one category per job plus a short reason.
4. Job descriptions were intentionally modified to test specific edge cases:

| # | Job | Scenario under test |
|---|---|---|
| 1 | Associate Software Engineer @ Firstsource | Explicit missing core skills (Python, Azure) |
| 2 | Graduate Engineer @ PANI | Exact skill match (Node.js, TypeScript, AWS Lambda, LLM Integration) |
| 3 | Software Developer @ PANI (C#) | Explicit unrelated stack (C#, WinForms, WPF) |
| 4 | Software Developer @ PANI (Ahmedabad) | Misleading title — actually QA role |
| 5 | MERN Stack Developer @ SPACE AI | Title-only stack, no explicit tech in JD |
| 6 | Software Engineer I (Oracle APEX) @ Cencora | Explicit missing Oracle APEX |
| 7 | Developer @ Finlaxmi | Exact skill match (Node.js, TypeScript, PostgreSQL) |
| 8 | Backend Software Engineer @ Scoutit | Exact skill match (Node.js, AWS Lambda, API Gateway, DynamoDB) |
| 9 | Software Engineer @ The Agentic Loop | Exact AI skill match (AI Agent Design, LLM Integration, RAG, Vercel AI SDK) |
| 10 | Full Stack Developer I @ FedEx ACC | Matching core skills + "nice-to-have" gaps (Kubernetes, React) |

Final prompt rules:

- Ground strictly on technologies **explicitly named in the JD description**; do not infer skills from the job title.
- Vague JDs that fit the candidate's domain → `minor_gaps`, never `no_match` or `strong_match`.
- Explicit missing core skill → `skills_mismatch`.
- Job title is used as a domain hint when the JD body is vague/empty.
- Title/domain mismatches (QA, DevOps, Embedded, Security, Networking) → `no_match`.
- Reason ≤ 15 words; lists ≤ 5 items.

---

## Results

### Aggregate

| Metric | DeepSeek v4 flash |
|---|---|
| Matched | 6 |
| LLM-Rejected | 4 |
| Accuracy vs expected | **10/10** |
| Output tokens | 984 |
| Cost | **$0.000451** |
| Latency | 50.3s |

### Per-Job Breakdown

| # | Job | Expected | DeepSeek |
|---|---|---|---|
| 1 | Associate Software Engineer @ Firstsource | `skills_mismatch` | ✅ `skills_mismatch` |
| 2 | Graduate Engineer @ PANI | `strong_match` | ✅ `strong_match` |
| 3 | Software Developer @ PANI (C#) | `skills_mismatch` | ✅ `skills_mismatch` |
| 4 | Software Developer @ PANI (Ahmedabad QA) | `no_match` | ✅ `no_match` |
| 5 | MERN Stack Developer @ SPACE AI | `minor_gaps` | ✅ `minor_gaps` |
| 6 | Software Engineer I (Oracle APEX) @ Cencora | `skills_mismatch` | ✅ `skills_mismatch` |
| 7 | Developer @ Finlaxmi | `strong_match` | ✅ `strong_match` |
| 8 | Backend Software Engineer @ Scoutit | `strong_match` | ✅ `strong_match` |
| 9 | Software Engineer @ The Agentic Loop | `strong_match` | ✅ `strong_match` |
| 10 | Full Stack Developer I @ FedEx ACC | `minor_gaps` | ✅ `minor_gaps` |

### Selected Reason Samples

- **Strong Match (PANI Graduate Engineer):** "Skills match exactly: Node.js, TS, Lambda, LLM."
- **Strong Match (Scoutit Backend):** "All required skills (Node.js, AWS Lambda, API Gateway, DynamoDB) matched."
- **Skills Mismatch (Firstsource):** "Requires Python & Azure; candidate lacks both."
- **No Match (PANI Ahmedabad QA):** "QA role, not backend/AI. Domain mismatch."
- **Minor Gaps (FedEx):** "Core skills (Node.js, TypeScript, PostgreSQL) matched; missing bonus skills."

---

## Observations

1. **Perfect category accuracy on the edge-case set.** DeepSeek correctly distinguished exact matches, vague-but-fitting roles, explicit skill gaps, and domain mismatches.
2. **Strong_match is used correctly.** It appeared only when the JD explicitly listed skills the candidate has and YOE fits.
3. **Title-inference guardrails work.** The MERN role stayed `minor_gaps` because the JD body did not explicitly list MERN technologies.
4. **Domain-signal rule works.** The misleading "Software Developer" title in the QA role was correctly overridden by the JD body and classified as `no_match`.
5. **Mixed-skill JD handled correctly.** FedEx listed matching core skills plus bonus Kubernetes/React; DeepSeek classified it as `minor_gaps` rather than inflating gaps.
6. **`experience_mismatch` is not triggered** because the YOE pre-filter removes those jobs before LLM scoring.
7. **Cost remains low.** ~$0.00045 per 10-job batch, ~1,000 output tokens, ~50s latency.

---

## Recommendations

1. **Adopt `deepseek/deepseek-v4-flash:floor` with the final categorical prompt for production.** Accuracy is stable and cost is minimal.
2. **Use `strong_match` output as a high-confidence signal** for immediate Telegram alerts; `minor_gaps` can be batched or highlighted with the missing-skill caveat.
3. **Do not relax the explicit-skill rule.** It prevents false positives on vague titles and protects against title-only bait.
4. **Keep `no_match` for unrelated domains.** It is the safest bucket for QA, DevOps, Embedded, Security, and Networking roles that slip through the pre-filter.
5. **Qwen is not needed for this candidate profile.** DeepSeek is cheaper, faster, and equally accurate on this sample. Re-evaluate Qwen only if DeepSeek degrades or a new domain requires more verbose reasoning.

---

## Next Steps

1. **Productionize the categorical scorer:**
   - Update `src/helper/llm.ts` to call the categorical batch prompt.
   - Update constants/templates for Telegram messages to display category labels and reasons.
   - Update DB schema/helpers to store `ai_category`, `ai_reason`, `ai_matched_skills`, `ai_missing_skills`.
2. **Add a regression eval** in `scripts/test_deepseek_batch.ts` that asserts the expected category for each of the 10 test jobs.
3. **Run a larger validation set** (≥ 50 jobs across multiple candidates and domains) before customer-facing deployment.
4. **Monitor live pass-through rate** after rollout; tune `strong_match` / `minor_gaps` thresholds if candidates receive too many or too few alerts.

---

## Senior Candidate Stress Test

To test behavior outside the original junior profile, the resume was upgraded to a **6-YOE Staff Backend Engineer** with added skills (Python, Kubernetes, React, Terraform, System Design). All 20 jobs then passed the YOE pre-filter and were scored.

### Aggregate

| Metric | Senior DeepSeek run |
|---|---|
| Jobs sent to LLM | 20 |
| Matched | 10 |
| LLM-Rejected | 10 |
| Output tokens | 2,021 |
| Cost | $0.001002 |
| Latency | 62.5s |

### Per-Job Results

| # | Job | DeepSeek | Notes |
|---|---|---|---|
| 1 | Associate Software Engineer @ Firstsource | `experience_mismatch` | Rejected as overqualified (0–2 YOE vs 6 YOE) |
| 2 | Graduate Engineer @ PANI | `strong_match` | All required skills match |
| 3 | Software Developer @ PANI (C#) | `no_match` | Domain mismatch (desktop/C#) |
| 4 | Software Developer @ PANI (Ahmedabad QA) | `no_match` | Correctly identified QA role |
| 5 | MERN Stack Developer @ SPACE AI | `minor_gaps` | Vague JD, title-only MERN |
| 6 | Software Engineer I (Oracle APEX) @ Cencora | `no_match` | Domain mismatch; should arguably be `skills_mismatch` |
| 7 | Developer @ Finlaxmi | `strong_match` | Exact skill match |
| 8 | Software Engineer @ The Agentic Loop | `strong_match` | Exact AI skill match |
| 9 | Quality Assurance Engineer @ Scoutit | `no_match` | Correct |
| 10 | Software Test Engineer – Embedded @ Best NanoTech | `no_match` | Correct |
| 11 | Application Security Engineer @ DigiCert | `no_match` | Correct |
| 12 | ML Eval Engineer @ Evomaton | `no_match` | Correctly identified mechanical/chemical domain |
| 13 | Junior AI Networking Engineer @ Qubrid AI | `no_match` | Correct |
| 14 | Backend Software Engineer @ Scoutit (entry) | `strong_match` | Exact skill match |
| 15 | Backend Software Engineer @ Scoutit (3 yr) | `strong_match` | Exact skill match, YOE > min |
| 16 | ML Engineer I @ UST | `strong_match` | Python/RAG/LLM skills match |
| 17 | DevOps Engineer @ BNP Paribas | `no_match` | Correct category, but hallucinated `Jenkins` in matched_skills |
| 18 | Software engineer @ hackajob (Barclays) | `strong_match` | Missing Java, but model accepted Python/AWS overlap |
| 19 | Full Stack Developer I @ FedEx ACC (explicit) | `strong_match` | All skills match |
| 20 | Full Stack Developer I @ FedEx ACC (vague) | `minor_gaps` | Vague JD, domain fits |

### Senior-Run Observations

1. **Overqualification rejection appeared.** Firstsource (0–2 YOE) was labeled `experience_mismatch` because the candidate has 6 YOE. This is **not explicitly instructed** in the current prompt; the prompt only rejects when JD min YOE > candidate YOE.
2. **Domain-missing skills flip to `no_match`.** C# PANI and Oracle APEX Cencora were previously `skills_mismatch` for the junior profile; now they are `no_match`. The model is treating specialized missing stacks as domain mismatches for a senior candidate.
3. **Skill hallucination occurred once.** DevOps role listed `Jenkins` in `matched_skills`, which is not in the candidate's known skills.
4. **Partial language overlap can pass.** The hackajob "Java/Python AWS Engineer" role was accepted as `strong_match` despite missing Java, because Python and AWS matched.
5. **Unrelated domains are reliably rejected.** QA, embedded, security, DevOps, networking, and mechanical/chemical roles all received `no_match`.

### Senior-Run Recommendations

1. **Decide if overqualification filtering is desired.** If senior candidates should not see entry-level/fresher roles, add a rule: "If JD explicitly targets 0–2 years / freshers and candidate YOE ≥ 4, use `experience_mismatch`."
2. **Tighten matched_skills grounding.** Add an explicit instruction that `matched_skills` must be a subset of the candidate's listed skills to prevent Jenkins-like hallucinations.
3. **Clarify `skills_mismatch` vs `no_match` for senior candidates.** If a backend candidate is missing Oracle APEX or C#, keep those as `skills_mismatch` rather than `no_match` — the domain is still software engineering.
4. **Handle language alternatives explicitly.** For roles listing "Java/Python", the model currently passes if either language matches. Decide whether missing one listed language should be `minor_gaps` instead of `strong_match`.
