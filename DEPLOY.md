# Lambda Deployment Guide

## Parameter Store Setup (do this first)

aws ssm put-parameter \
  --name "/job-scraper/APIFY_API_KEY" \
  --value "your_apify_api_key" \
  --type SecureString \
  --region us-east-1

aws ssm put-parameter \
  --name "/job-scraper/OPENAI_API_KEY" \
  --value "sk-..." \
  --type SecureString \
  --region us-east-1

aws ssm put-parameter \
  --name "/job-scraper/DATABASE_URL" \
  --value "postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require" \
  --type SecureString \
  --region us-east-1

# RESUME_TEXT: paste your resume as plain text (not PDF)
aws ssm put-parameter \
  --name "/job-scraper/RESUME_TEXT" \
  --value "$(cat your_resume.txt)" \
  --type SecureString \
  --region us-east-1


## Lambda Function Config

- Runtime:       Node.js 20.x
- Architecture:  arm64 (Graviton — cheaper, faster)
- Memory:        512MB (overkill but safe)
- Timeout:       900 seconds (15 minutes — maximum)
- Handler:       lambda.handler

## IAM Role — attach these policies to Lambda execution role

1. AWSLambdaBasicExecutionRole (CloudWatch logs)
2. Custom inline policy for SSM:

{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["ssm:GetParameter", "ssm:GetParameters"],
    "Resource": "arn:aws:ssm:us-east-1:YOUR_ACCOUNT:parameter/job-scraper/*"
  }]
}

## Environment Variables in Lambda (NOT secrets — these are non-sensitive)

APIFY_API_KEY        → {{resolve:ssm:/job-scraper/APIFY_API_KEY}}
OPENAI_API_KEY     → {{resolve:ssm:/job-scraper/OPENAI_API_KEY}}
DATABASE_URL  → {{resolve:ssm:/job-scraper/DATABASE_URL}}
RESUME_TEXT        → {{resolve:ssm:/job-scraper/RESUME_TEXT}}

Set these in Lambda console → Configuration → Environment Variables
Reference Parameter Store values directly.

## EventBridge Scheduler

Cron expression for 7:30 AM IST (2:00 AM UTC):
  cron(0 2 * * ? *)

Create via console:
  EventBridge → Schedules → Create schedule
  → Flexible time window: Off
  → Target: Lambda function → job-scraper
  → Rate: cron(0 2 * * ? *)

## Build & Deploy

npm install
npm run deploy   # builds, zips, uploads to Lambda

## Neon DB Setup

1. Create account at neon.tech
2. Create project → us-east-1 region
3. Open SQL Editor
4. Paste and run schema.sql
5. Copy connection string → store in Parameter Store

## Cost Summary (monthly)

Lambda compute    : ~$0.00  (well within free tier: 1M req, 400K GB-seconds)
Parameter Store   : $0.00   (standard tier free)
EventBridge       : $0.00   (first 14M events free)
CloudWatch Logs   : $0.00   (first 5GB free)
Neon DB           : $0.00   (free tier, us-east-1, never pauses)
----------------------------
Total             : $0.00/month

Note: Lambda free tier = 1M requests + 400,000 GB-seconds per month.
Your usage: 30 invocations × 512MB × 300s = 4,608 GB-seconds. Far under limit.
