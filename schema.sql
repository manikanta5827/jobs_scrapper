-- Run this once in your Neon SQL Editor to create the table

CREATE TABLE jobs (
  job_link  TEXT PRIMARY KEY,
  seen_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matched_jobs (
  id                  SERIAL PRIMARY KEY,
  job_link            TEXT UNIQUE NOT NULL,        -- unique constraint handles deduplication
  job_title           TEXT,
  company_name        TEXT,
  company_website     TEXT,
  posted_at           TEXT,
  salary              TEXT,
  applicants_count    TEXT,
  apply_url           TEXT,
  ai_score            INT  DEFAULT 0,
  ai_reason           TEXT,
  ai_matched_skills   TEXT,                        -- JSON array stored as text
  ai_missing_skills   TEXT,                        -- JSON array stored as text
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  applied             BOOLEAN DEFAULT FALSE,        -- you manually toggle this in dashboard
  notes               TEXT                         -- your personal notes per job
);

-- Index for your dashboard queries
CREATE INDEX IF NOT EXISTS idx_jobs_status    ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_ai_score  ON jobs(ai_score DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_created   ON jobs(created_at DESC);

-- Quick view for your dashboard: only matched jobs sorted by score
CREATE OR REPLACE VIEW matched_jobs AS
  SELECT
    id, job_link, job_title, company_name, salary,
    posted_at, apply_url, applicants_count,
    ai_score, ai_reason, ai_matched_skills, ai_missing_skills,
    applied, notes, created_at
  FROM matched_jobsjobs
  WHERE status = 'matched'
  ORDER BY ai_score DESC, created_at DESC;
