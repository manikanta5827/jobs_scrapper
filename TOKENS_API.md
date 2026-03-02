# 🔑 Apify Token Management API

This document explains how to use the Admin API to manage Apify API keys for the rotation system. These endpoints are handled by the `AdminLambda`.

## 📍 Base URL
Once deployed via SAM, you can find the `ApiUrl` in the CloudFormation outputs. It will look like:
`https://{api-id}.execute-api.{region}.amazonaws.com/Prod/tokens`

---

## 1. List All Tokens
Fetch the status, usage cost, and renewal dates for all tokens in the database.

**Method:** `GET`  
**Endpoint:** `/tokens`

**Example Request:**
```bash
curl -X GET https://your-api-url.com/Prod/tokens
```

---

## 2. Add a New Token
Add a new Apify API key to the rotation pool.

**Method:** `POST`  
**Endpoint:** `/tokens`  
**Payload:**
- `apiKey` (string): The Apify API token.
- `subscriptionStartDate` (string): The date the account was created/renewed (`YYYY-MM-DD`). The system resets usage on the **next day** of this date every month.

**Example Request:**
```bash
curl -X POST https://your-api-url.com/Prod/tokens 
     -H "Content-Type: application/json" 
     -d '{
       "apiKey": "apify_api_XXXXXX",
       "subscriptionStartDate": "2024-03-21"
     }'
```

---

## 3. Update/Reset a Token
Manually update a token's usage cost, expiry status, or renewal date.

**Method:** `PATCH`  
**Endpoint:** `/tokens`  
**Payload:**
- `id` (number): The database ID of the token.
- `usageCost` (number, optional): Manually set the cost (e.g., `0` to reset).
- `isExpired` (boolean, optional): Set to `false` to reactivate a token.
- `subscriptionStartDate` (string, optional): Update the renewal day.

**Example Request (Resetting a Token):**
```bash
curl -X PATCH https://your-api-url.com/Prod/tokens 
     -H "Content-Type: application/json" 
     -d '{
       "id": 5,
       "usageCost": 0,
       "isExpired": false
     }'
```

---

## 4. Delete a Token
Remove a token permanently from the rotation pool.

**Method:** `DELETE`  
**Endpoint:** `/tokens`  
**Payload:**
- `id` (number): The database ID of the token.

**Example Request:**
```bash
curl -X DELETE https://your-api-url.com/Prod/tokens 
     -H "Content-Type: application/json" 
     -d '{ "id": 5 }'
```

---

## 🛡️ Notes
- **Renewal Logic:** The system resets usage automatically when `current_day == (subscriptionStartDate.day + 1)`.
- **Cost Calculation:** Usage is tracked in USD ($). The scraper assumes **$0.001 per job** (rounded to 2 decimal places).
- **Auto-Expiry:** If Apify returns a `403` (Limit Exceeded), the scraper automatically marks that specific token as `is_expired: true`.
