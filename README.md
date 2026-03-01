# 🚀 AI-Powered LinkedIn Job Scraper

An automated job discovery engine that acts as your personal recruiter. It scrapes LinkedIn for new opportunities, evaluates them against your specific profile using OpenAI, and delivers a curated list of high-quality matches directly to your inbox.

## 🌟 Key Features

*   **Automated Discovery**: Runs daily at 7:30 AM IST, so you never miss a new posting.
*   **AI-Powered Scoring**: Uses GPT-4o-mini to analyze job descriptions against your resume, providing a match score (0-100) and a brief reason.
*   **Smart Filtering**: Multi-layer filtering (Deduplication -> Keyword Filter -> AI Analysis) ensures you only see relevant roles.
*   **Professional Reports**: Receive a clean, emoji-free HTML email summary with the best matches sorted by relevance.
*   **Serverless Architecture**: Built on AWS Lambda for minimal cost and zero maintenance.

## 🛠 How It Works (The Pipeline)

1.  **Scrape**: Fetches raw job listings from LinkedIn via **Apify**.
2.  **Deduplicate**: Checks against **Neon Postgres** to ensure you don't see the same job twice.
3.  **Keyword Filter**: Instantly removes roles with mismatched seniority (e.g., "10+ YOE") or irrelevant domains.
4.  **AI Analysis**: GPT-4o-mini evaluates the job against your `resume.txt` to find the best fit.
5.  **Notify**: High-scoring matches are saved to the database and sent via **AWS SES**.

## 🏗 Tech Stack

*   **Logic**: Node.js, TypeScript, AWS Lambda.
*   **Storage**: Neon Serverless Postgres, Drizzle ORM.
*   **Intelligence**: OpenAI API (GPT-4o-mini).
*   **Infrastructure**: AWS SAM (EventBridge, SSM, SES).
*   **Scraping**: Apify LinkedIn Scraper.

---
*For technical setup and deployment instructions, see [RUN.md](./RUN.md).*
