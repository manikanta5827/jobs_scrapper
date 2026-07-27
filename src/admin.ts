/**
 * admin.ts — Admin Lambda Handler
 * Provides a RESTful JSON API with strict Zod validation for triggering runs, candidate CRUD, Apify key management, and financial analytics dashboard.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { 
  getAllUsers, 
  getUserById, 
  createUser, 
  updateUser, 
  deleteUser, 
  topUpUserBalance,
  getAllApifyTokens,
  addApifyToken,
  updateApifyToken,
  deleteApifyToken,
  getAnalyticsStats,
  getJobsForUser,
  getJobByFingerprintOrId,
  updateJobResumeMd
} from './helper/db_helper';
import { analyzeResumeWithLLM, generateAtsResume } from './helper/llm';
import { shutdownTelemetry } from './helper/telemetry';
import { 
  UuidParamSchema, 
  NumericIdParamSchema, 
  TriggerRunSchema, 
  CreateUserSchema, 
  UpdateUserSchema, 
  AnalyzeResumeSchema,
  TopupWalletSchema, 
  CreateApifyKeySchema, 
  UpdateApifyKeySchema, 
  formatZodError 
} from './helper/validation';

const MIN_MATCH_SCORE = parseInt(process.env.MIN_MATCH_SCORE ?? "80", 10);
const lambdaClient = new LambdaClient({});

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    return await processAdminRequest(event);
  } finally {
    await shutdownTelemetry();
  }
};

async function processAdminRequest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const path = event.resource || event.path;
  const body = event.body ? JSON.parse(event.body) : {};
  const pathParameters = event.pathParameters || {};

  // 1a. Public endpoint: GET /jobs/{id}/resume — Retrieve or generate (On-Demand) candidate ATS-optimized resume Markdown for a job
  if ((path === '/jobs/{id}/resume' || path.endsWith('/resume')) && method === 'GET') {
    const rawId = pathParameters.id || path.split('/')[2] || '';
    const idOrFingerprint = decodeURIComponent(rawId).trim();
    if (!idOrFingerprint) {
      return response(400, { error: 'Missing Job ID or fingerprint parameter' });
    }
    const job = await getJobByFingerprintOrId(idOrFingerprint);
    if (!job) {
      return response(404, { error: 'Job not found' });
    }

    let resumeMd = job.optimizedResumeMd || null;
    let changesMade: string[] = [];
    let keywordsUsed: string[] = [];

    // ponytail: Lazy Evaluation — generate ATS resume On-Demand if it hasn't been generated yet and score >= MIN_MATCH_SCORE
    if (!resumeMd && (job.aiScore ?? 0) >= MIN_MATCH_SCORE && job.userId) {
      const user = await getUserById(job.userId);
      if (user && user.resumeText) {
        try {
          const result = await generateAtsResume(
            user.resumeText,
            job.jobTitle || 'Job Role',
            job.companyName || 'Company',
            job.descriptionText || job.aiReason || '',
            job.matchedSkills || []
          );
          resumeMd = result.resumeMd;
          changesMade = result.changesMade;
          keywordsUsed = result.keywordsUsed;
          await updateJobResumeMd(job.id, resumeMd);
        } catch (genErr) {
          console.error(`Failed on-demand ATS resume generation for job ${job.id}:`, genErr);
        }
      }
    }

    return response(200, {
      jobId: job.id,
      jobTitle: job.jobTitle,
      companyName: job.companyName,
      location: job.location,
      aiScore: job.aiScore,
      optimizedResumeMd: resumeMd,
      changesMade,
      keywordsUsed,
      createdAt: job.createdAt
    });
  }

  // 1b. Public endpoint: GET /users/{id}/jobs — Retrieve candidate's matched jobs by email or UUID
  if ((path === '/users/{id}/jobs' || path.endsWith('/jobs')) && method === 'GET') {
    const rawId = pathParameters.id || path.split('/')[2] || '';
    const identifier = decodeURIComponent(rawId).trim();
    if (!identifier) {
      return response(400, { error: 'Missing Candidate Email or User ID parameter' });
    }

    const qp = event.queryStringParameters || {};
    const page = qp.page ? parseInt(qp.page, 10) : 1;
    const limit = qp.limit ? parseInt(qp.limit, 10) : 50;
    const fromDate = qp.fromDate || undefined;
    const toDate = qp.toDate || undefined;
    const minScore = qp.minScore ? parseInt(qp.minScore, 10) : undefined;
    const maxScore = qp.maxScore ? parseInt(qp.maxScore, 10) : undefined;

    const result = await getJobsForUser(identifier, { page, limit, fromDate, toDate, minScore, maxScore });
    return response(200, result);
  }

  // 2. Handle HTTP OPTIONS pre-flight requests for browser CORS before API key check
  if (method === 'OPTIONS') {
    return response(200, { message: 'CORS preflight OK' });
  }

  // 3. Security Check: verify x-api-key header matches configured ADMIN_API_KEY for API endpoints
  const rawApiKey = event.headers['x-api-key'] || event.headers['X-Api-Key'] || event.headers['X-API-KEY'] || '';
  const requestApiKey = rawApiKey.split(',')[0].trim();
  if (!requestApiKey || requestApiKey !== process.env.ADMIN_API_KEY) {
    console.warn(`Unauthorized access attempt to Admin API (received: "${requestApiKey}")`);
    return response(401, { error: 'Unauthorized: Invalid or missing API Key' });
  }

  try {
    // ─── Route: POST /admin/analyze-resume (Synchronous Resume Analysis) ──────
    if ((path === '/admin/analyze-resume') && method === 'POST') {
      const parseResult = AnalyzeResumeSchema.safeParse(body);
      if (!parseResult.success) {
        return response(400, { error: `Validation Error: ${formatZodError(parseResult.error)}` });
      }
      const analysis = await analyzeResumeWithLLM(parseResult.data.resumeText);
      return response(200, { analysis });
    }

    // ─── Route: GET /stats ─────────────────────────────────────────────────────
    if (path === '/stats' && method === 'GET') {
      const stats = await getAnalyticsStats();
      return response(200, { stats });
    }

    // ─── Route: POST /run ──────────────────────────────────────────────────────
    if (path === '/run' && method === 'POST') {
      const parseResult = TriggerRunSchema.safeParse(body);
      if (!parseResult.success) {
        return response(400, { error: `Validation Error: ${formatZodError(parseResult.error)}` });
      }

      const { lookbackHours, targetUserId } = parseResult.data;

      await lambdaClient.send(new InvokeCommand({
        FunctionName: process.env.MAIN_LAMBDA_FUNCTION_NAME!,
        InvocationType: 'Event',
        Payload: JSON.stringify({ 
          lookbackHours, 
          targetUserId, 
          adminApiKey: process.env.ADMIN_API_KEY 
        }),
      }));

      return response(202, { message: 'MainLambda invoked', lookbackHours, targetUserId });
    }

    // ─── Route: /users (List Users or Add User) ────────────────────────────────
    if (path === '/users') {
      // GET /users — List all users in database
      if (method === 'GET') {
        const usersList = await getAllUsers();
        return response(200, { users: usersList });
      }

      // POST /users — Create a new user record with strict Zod validation
      if (method === 'POST') {
        const parseResult = CreateUserSchema.safeParse(body);
        if (!parseResult.success) {
          return response(400, { error: `Validation Error: ${formatZodError(parseResult.error)}` });
        }

        const { 
          email, name, resumeText, telegramChatId, 
          linkedinCredentials, initialInr, customRunCostUsd, excludeTitleKeywords,
          experienceYears, targetLocations, employmentType,
          primaryDomain, candidateSummary, knownSkills, education, projects, certifications, keyHighlights, suggestedJobTitles, source
        } = parseResult.data;

        const initialUsd = Number(((initialInr || 500) / 100).toFixed(2));
        const created = await createUser({
          email,
          name,
          resumeText,
          telegramChatId: telegramChatId || "",
          linkedinCredentials,
          balanceUsd: initialUsd,
          customRunCostUsd: customRunCostUsd ?? undefined,
          excludeTitleKeywords: excludeTitleKeywords,
          experienceYears: experienceYears ?? 0,
          targetLocations: targetLocations || undefined,
          employmentType: employmentType || undefined,
          primaryDomain,
          candidateSummary,
          knownSkills,
          education,
          projects,
          certifications,
          keyHighlights,
          suggestedJobTitles,
          source,
          isActive: true
        });

        return response(201, { message: 'User created successfully', user: created[0] });
      }
    }

    // ─── Route: /users/{id} (Get, Update, or Delete User) ──────────────────────
    if (path === '/users/{id}' && pathParameters.id) {
      const paramParse = UuidParamSchema.safeParse(pathParameters.id);
      if (!paramParse.success) {
        return response(400, { error: `Validation Error: ${formatZodError(paramParse.error)}` });
      }
      const userId = paramParse.data;

      // GET /users/{id} — Retrieve user profile by UUID
      if (method === 'GET') {
        const user = await getUserById(userId);
        if (!user) return response(404, { error: 'User not found' });
        return response(200, { user });
      }

      // PUT /users/{id} — Update existing user profile or wallet balance with Zod validation
      if (method === 'PUT') {
        const parseResult = UpdateUserSchema.safeParse(body);
        if (!parseResult.success) {
          return response(400, { error: `Validation Error: ${formatZodError(parseResult.error)}` });
        }

        const existingUser = await getUserById(userId);
        if (!existingUser) return response(404, { error: 'User not found' });

        const updateData: Record<string, unknown> = { ...parseResult.data };

        // Convert amountInr to USD balance if amountInr is passed in PUT body
        if (parseResult.data.amountInr) {
          const addUsd = Number((parseResult.data.amountInr / 100).toFixed(2));
          updateData.balanceUsd = (existingUser.balanceUsd || 0) + addUsd;
          delete updateData.amountInr;
        }

        const updated = await updateUser(userId, updateData as Parameters<typeof updateUser>[1]);
        return response(200, { message: 'User updated successfully', user: updated[0] });
      }

      // DELETE /users/{id} — Delete user record from database
      if (method === 'DELETE') {
        const deleted = await deleteUser(userId);
        if (deleted.length === 0) return response(404, { error: 'User not found' });
        return response(200, { message: `User ID ${userId} deleted successfully` });
      }
    }

    // ─── Route: /users/{id}/topup (Recharge User Wallet Balance) ──────────────
    if (path === '/users/{id}/topup' && pathParameters.id && method === 'POST') {
      const paramParse = UuidParamSchema.safeParse(pathParameters.id);
      if (!paramParse.success) {
        return response(400, { error: `Validation Error: ${formatZodError(paramParse.error)}` });
      }
      const userId = paramParse.data;

      const parseResult = TopupWalletSchema.safeParse(body);
      if (!parseResult.success) {
        return response(400, { error: `Validation Error: ${formatZodError(parseResult.error)}` });
      }

      const { amountInr } = parseResult.data;
      const updated = await topUpUserBalance(userId, amountInr);
      if (updated.length === 0) return response(404, { error: 'User not found' });

      return response(200, { 
        message: `Successfully topped up user ID ${userId} with ₹${amountInr} INR`, 
        newBalanceUsd: updated[0].balanceUsd 
      });
    }

    // ─── Route: /apify-keys (Apify Key Rotation CRUD) ─────────────────────────
    if (path === '/apify-keys') {
      if (method === 'GET') {
        const keys = await getAllApifyTokens();
        return response(200, { keys });
      }

      if (method === 'POST') {
        const parseResult = CreateApifyKeySchema.safeParse(body);
        if (!parseResult.success) {
          return response(400, { error: `Validation Error: ${formatZodError(parseResult.error)}` });
        }

        const { apiKey, subscriptionStartDate, name } = parseResult.data;
        const created = await addApifyToken(apiKey, subscriptionStartDate, name);
        return response(201, { message: 'Apify token added', key: created[0] });
      }
    }

    // ─── Route: /apify-keys/{id} (Update or Delete Apify Key) ──────────────────
    if (path === '/apify-keys/{id}' && pathParameters.id) {
      const paramParse = NumericIdParamSchema.safeParse(pathParameters.id);
      if (!paramParse.success) {
        return response(400, { error: `Validation Error: ${formatZodError(paramParse.error)}` });
      }
      const keyId = paramParse.data;

      if (method === 'PUT') {
        const parseResult = UpdateApifyKeySchema.safeParse(body);
        if (!parseResult.success) {
          return response(400, { error: `Validation Error: ${formatZodError(parseResult.error)}` });
        }

        const updated = await updateApifyToken(keyId, parseResult.data);
        return response(200, { message: 'Apify token updated', key: updated[0] });
      }

      if (method === 'DELETE') {
        await deleteApifyToken(keyId);
        return response(200, { message: `Apify key ID ${keyId} deleted` });
      }
    }

    return response(404, { error: 'Not Found' });
  } catch (err: unknown) {
    console.error('Admin API error:', err);
    throw err;
  }
};

// Helper function to format JSON API response with standard CORS headers
function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key,Authorization,x-api-key,X-API-KEY,Accept',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS'
    }
  };
}
