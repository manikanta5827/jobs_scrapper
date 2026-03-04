# Architectural Vision & Roadmap: AI Career Agent (v2.0)

This document outlines the strategic redesign and feature roadmap for the Job Scraper system, moving it from a "Linear Script" to a "Production-Grade Distributed Pipeline."

---

## 1. Architectural Shift: From Monolith to Distributed
**The Goal**: Move from a single `MainLambda` to a "Fan-Out/Fan-In" pattern using AWS native services.

### Proposed Workflow:
1.  **Orchestrator (AWS Step Functions)**: Coordinates the entire run.
2.  **Scraper (Producer Lambda)**: Scrapes job URLs and basic metadata. Instead of processing them, it pushes each job as a message into an **AWS SQS Queue**.
3.  **Analyzer (Worker Lambda - The Consumer)**:
    *   Triggers automatically for every message in the SQS queue.
    *   Performs the OpenAI AI Match and DB deduplication in parallel across hundreds of workers.
    *   **Why?**: Infinite horizontal scaling. You can process 10,000 jobs in 2 minutes without hitting Lambda's 15-minute timeout.
4.  **Notifier (Collector Lambda)**: Aggregates the results and sends a single, polished summary to Telegram.

---

## 2. Engineering & Reliability Improvements

### A. Observability & Tracing
*   **AWS X-Ray**: Implement distributed tracing. You should be able to see the "Life of a Job" from the moment it was scraped to the moment it was matched or rejected.
*   **CloudWatch Metrics**: Add custom metrics for "Match Rate %" and "Average OpenAI Latency" to monitor system health and AI performance.

### B. Intelligent Caching
*   **Redis (Upstash or ElastiCache)**: Instead of querying the Neon DB for every job's "fingerprint" during deduplication, use a high-speed Redis cache. This reduces database I/O and speeds up the "Filter" phase significantly.

### C. Vector-Based Matching (Semantic Search)
*   **The Problem**: Keyword matching is brittle (e.g., "React" vs "Frontend Developer").
*   **The Fix**: Use **Neon's pgvector**. Convert your resume into a **Vector Embedding** (using OpenAI's `text-embedding-3-small`).
*   **The Benefit**: The database can now find jobs that are "conceptually similar" to your experience even if they don't share the exact same keywords.

---

## 3. High-Value Feature Roadmap

### 🚀 Phase 1: Automated Resume Tailoring
*   **Feature**: For every "Matched" job, the AI generates a customized **Markdown or PDF Resume** that highlights exactly what that specific job description is looking for.
*   **Delivery**: Store the tailored resume in S3 and send a signed download link directly in the Telegram message.

### 📊 Phase 2: Market Analytics Dashboard
*   **Feature**: Aggregated insights from the thousands of jobs you scrape but don't apply to.
*   **Insights**:
    *   "Skill Gap Analysis": "90% of your field is now asking for 'Next.js'—you should add this to your stack."
    *   "Salary Benchmarking": Real-time salary ranges based on your actual job matches.
*   **Implementation**: A simple Next.js frontend reading from your Neon DB.

### 🤖 Phase 3: Browser Automation (One-Click Apply)
*   **Feature**: Since we detect `direct_apply` links (Google Forms, Typeform, etc.), use a Lambda with **Playwright/Puppeteer** to pre-fill those forms with your data.
*   **User Flow**: You click a button in Telegram $ightarrow$ Lambda fills the form $ightarrow$ You get a confirmation.

---

## 4. Governance & Cost Control

### A. Token Budgeting
*   Implement a "Safety Valve" in the `Analyzer` Lambda. If a run attempts to process >5,000 jobs, trigger an alert and pause to prevent unexpected OpenAI API costs.

### B. Multi-Profile Support
*   Allow the system to run for different "Personas" (e.g., "Fullstack Engineer" vs "Backend Engineer"). Each persona has its own resume and its own Telegram channel.

### C. Secret Management
*   Evolve from SSM Parameter Store to **AWS Secrets Manager**. This allows for automatic rotation of your OpenAI and Apify keys and provides better audit logging of who (or what) is accessing your keys.

---

**The Vision**: You are no longer building a "Scraper." You are building an **AI Career Agent** that works while you sleep to ensure you never miss an opportunity and always apply with the most competitive version of your resume.
