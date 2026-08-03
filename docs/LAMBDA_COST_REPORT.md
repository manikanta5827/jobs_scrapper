# 📊 AWS Lambda Resource Consumption & Financial Cost Report
**Architecture: LinkedIn + Naukri Only | Naukri RAM = 512 MB**

---

## 1. Executive Summary

This document provides an exact cost and resource consumption breakdown for the AWS Lambda job scraper and evaluator pipeline.

### Architectural Parameters:
* **Active Platforms**: LinkedIn (axios guest API) + Naukri (Puppeteer Headless Chromium)
* **Removed Platforms**: SimplyHired & Indeed
* **Naukri Lambda RAM**: 512 MB (0.50 GB)
* **EventBridge Schedule**: 3 runs daily (`11:00`, `16:00`, `20:00` IST for scrapers; 30 mins later for evaluators)

---

## 2. Invocations & Memory Matrix (Per Single User Run)

Every single user run triggers **10 Lambda invocations**:
* **Scraper Pipeline (8 Invocations)**: 1 Scraper Dispatcher + 5 LinkedIn Scrapers + 2 Naukri Scrapers
* **Evaluator Pipeline (2 Invocations)**: 1 Evaluator Dispatcher + 1 Per-User Evaluator Worker

| Pipeline Phase | Lambda Function | Invocation Count | Architecture | Memory (MB / GB) | Avg Duration | GB-Seconds per Run |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Scraper** | `ScraperDispatcherLambda` | 1 | `arm64` | 256 MB (0.25 GB) | ~3.0s | $0.25 \times 3.0 \times 1 = \mathbf{0.750 \text{ GB-s}}$ |
| **Scraper** | `linkedin-jobs-scraper` | 5 | `arm64` | 256 MB (0.25 GB) | ~12.5s | $0.25 \times 12.5 \times 5 = \mathbf{15.625 \text{ GB-s}}$ |
| **Scraper** | `naukri-jobs-scraper` | 2 | `x86_64` | 512 MB (0.50 GB) | ~37.5s | $0.50 \times 37.5 \times 2 = \mathbf{37.500 \text{ GB-s}}$ |
| **Evaluator** | `EvaluatorDispatcherLambda` | 1 | `arm64` | 128 MB (0.125 GB) | ~3.0s | $0.125 \times 3.0 \times 1 = \mathbf{0.375 \text{ GB-s}}$ |
| **Evaluator** | `EvaluatorLambda` | 1 | `arm64` | 256 MB (0.25 GB) | ~20.0s | $0.25 \times 20.0 \times 1 = \mathbf{5.000 \text{ GB-s}}$ |

---

## 3. Resource Consumption (GB-Seconds Breakdown)

- **`arm64` GB-Seconds per Run**: $0.750 + 15.625 + 0.375 + 5.000 = \mathbf{21.750 \text{ GB-Seconds}}$
- **`x86_64` GB-Seconds per Run** (Naukri @ 512 MB): $\mathbf{37.500 \text{ GB-Seconds}}$
- **Total Combined GB-Seconds per Single User Run**: $21.750 + 37.500 = \mathbf{59.250 \text{ GB-Seconds}}$

---

## 4. Multi-Scenario Financial Cost Breakdown

### Standard AWS Regional Pricing Rates:
* **arm64 Rate**: $\$0.0000133334 \text{ per GB-second}$
* **x86_64 Rate**: $\$0.0000166667 \text{ per GB-second}$
* **Request Price**: $\$0.20 \text{ per million requests}$ ($\$0.00000020 \text{ per request}$)

---

### Scenario A: 1 User — 1 Run (10 Lambda Invocations)
* **arm64 Compute Cost**: $21.750 \text{ GB-s} \times \$0.0000133334 = \$0.00029000$
* **x86_64 Compute Cost**: $37.500 \text{ GB-s} \times \$0.0000166667 = \$0.00062500$
* **Request Cost**: $10 \times \$0.00000020 = \$0.00000200$
* 💰 **Total Cost for 1 User / 1 Run**: $\mathbf{\$0.000917} \approx \mathbf{\$0.00092}$ (**~0.09 cents** / less than 1/10th of a cent)

---

### Scenario B: 1 User — 3 Runs / 1 Day (30 Lambda Invocations)
* **arm64 GB-Seconds**: $21.750 \times 3 = \mathbf{65.250 \text{ GB-s}}$ $\rightarrow \$0.00087000$
* **x86_64 GB-Seconds**: $37.500 \times 3 = \mathbf{112.500 \text{ GB-s}}$ $\rightarrow \$0.00187500$
* **Request Cost**: $30 \times \$0.00000020 = \$0.00000600$
* 💰 **Total Cost for 1 User / 1 Day (3 Runs)**: $\mathbf{\$0.002751} \approx \mathbf{\$0.00275}$ (**~0.28 cents / day**)

---

### Scenario C: 10 Users — 1 Day (3 Runs / Day = 30 User Runs)
* **Total Lambda Invocations**: ~246 to 300 invocations
* **arm64 GB-Seconds**: $21.750 \times 30 = \mathbf{652.500 \text{ GB-s}}$ $\rightarrow \$0.00870004$
* **x86_64 GB-Seconds**: $37.500 \times 30 = \mathbf{1,125.000 \text{ GB-s}}$ $\rightarrow \$0.01875004$
* **Request Cost**: $246 \text{ to } 300 \text{ requests} \rightarrow \$0.00006000$
* 💰 **Total Cost for 10 Users / 1 Day**: $\mathbf{\$0.027510} \approx \mathbf{\$0.0275 / day}$ (**~2.75 cents / day**)

---

## 5. Summary Table

| Metric | 1 User — 1 Run | 1 User — 3 Runs (1 Day) | 10 Users — 1 Day (3 Runs/Day) |
| :--- | :--- | :--- | :--- |
| **Total Invocations** | 10 Invocations | 30 Invocations | ~246 - 300 Invocations |
| **arm64 GB-Seconds** | 21.750 GB-s | 65.250 GB-s | 652.500 GB-s |
| **x86_64 GB-Seconds** | 37.500 GB-s | 112.500 GB-s | 1,125.000 GB-s |
| **Total GB-Seconds** | **59.250 GB-s** | **177.750 GB-s** | **1,777.500 GB-s** |
| **Total Cost (USD)** | **$0.00092** | **$0.00275** | **$0.0275** |
| **Cost in US Cents** | ~0.09 cents | ~0.28 cents | ~2.75 cents |

> 💡 **AWS Free Tier Note**: AWS provides **400,000 free GB-Seconds per month**. Running 10 users 3 times daily for a full month consumes ~53,325 GB-Seconds, which is **100% COVERED under the AWS free tier ($\mathbf{\$0.00 \text{ net bill}}$)**.
