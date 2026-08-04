/**
 * Pre-migration: backup job descriptions to S3 (raw SQL, no drizzle schema dependency)
 *
 * Fetches all AI-matched jobs (ai_score >= MIN_MATCH_SCORE) with description_text,
 * uploads each description to S3, and saves {jobId: s3Key} mappings to a JSON file.
 *
 * Resume-safe: loads existing mapping file, checks S3 via HEAD before uploading.
 * Writes mapping incrementally after each batch.
 *
 * Run BEFORE drizzle migration (0036 adds columns, 0037 drops old columns).
 * Usage: npx tsx scripts/backup_descriptions_to_s3.ts
 */
import fs from 'fs';
import pg from 'pg';
import pLimit from 'p-limit';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const BATCH_SIZE = 200;
const MIN_MATCH_SCORE = parseInt(process.env.MIN_MATCH_SCORE || '7', 10);
const OUTPUT_FILE = 'scripts/description_s3_keys.json';

function loadEnv() {
  if (!process.env.DATABASE_URL && fs.existsSync('.env')) {
    const envContent = fs.readFileSync('.env', 'utf-8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
      }
    }
  }
}

function loadExistingMapping(): Record<string, string> {
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    } catch { /* corrupted, start fresh */ }
  }
  return {};
}

function saveMapping(mapping: Record<string, string>) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(mapping, null, 2));
}

async function createPgClient(connectionString: string) {
  const client = new pg.Client({
    connectionString: connectionString.replace('-pooler.', '.'),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
  });
  await client.connect();
  return client;
}

async function s3ObjectExists(s3: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err: any) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return false;
    // Network errors — assume not uploaded, will retry
    return false;
  }
}

async function main() {
  loadEnv();

  const connectionString = process.env.DATABASE_URL;
  const bucketName = process.env.S3_BUCKET_NAME;

  if (!connectionString) { console.error('DATABASE_URL not set'); process.exit(1); }
  if (!bucketName) { console.error('S3_BUCKET_NAME not set'); process.exit(1); }

  const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });

  // Resume from existing mapping
  const mapping: Record<string, string> = loadExistingMapping();
  const alreadyDone = Object.keys(mapping).length;
  if (alreadyDone > 0) {
    console.log(`Resuming — ${alreadyDone} entries already in mapping file.`);
  }

  let pgClient = await createPgClient(connectionString!);

  // Count total matched jobs with descriptions
  const countRes = await pgClient.query(
    `SELECT COUNT(*) FROM jobs WHERE description_text IS NOT NULL AND ai_score IS NOT NULL AND ai_score >= $1`,
    [MIN_MATCH_SCORE]
  );
  const total = parseInt(countRes.rows[0].count, 10);
  console.log(`Found ${total} matched jobs with descriptions (score >= ${MIN_MATCH_SCORE})`);
  if (total === 0) { await pgClient.end(); return; }

  let uploaded = 0, skipped = 0, alreadyUploaded = 0;
  const limit = pLimit(10);

  for (let offset = 0; offset < total; offset += BATCH_SIZE) {
    // Reconnect on connection errors
    let res: pg.QueryResult<any>;
    while (true) {
      try {
        res = await pgClient.query(
          `SELECT id, user_id, description_text
           FROM jobs
           WHERE description_text IS NOT NULL AND ai_score IS NOT NULL AND ai_score >= $1
           ORDER BY id
           LIMIT $2 OFFSET $3`,
          [MIN_MATCH_SCORE, BATCH_SIZE, offset]
        );
        break;
      } catch (err: any) {
        if (err.message?.includes('Connection terminated') || err.message?.includes('ECONNRESET')) {
          console.error(`DB connection lost at offset ${offset}, reconnecting...`);
          try { await pgClient.end(); } catch {}
          await new Promise(r => setTimeout(r, 2000));
          pgClient = await createPgClient(connectionString!);
        } else {
          throw err;
        }
      }
    }

    const batchResults: { uploaded: string[]; skipped: string[]; alreadyDone: string[] } = {
      uploaded: [], skipped: [], alreadyDone: [],
    };

    await Promise.all(res.rows.map(row =>
      limit(async () => {
        if (!row.description_text || !row.id || !row.user_id) {
          batchResults.skipped.push(row.id); return;
        }

        // Already done from previous run?
        if (mapping[row.id]) {
          batchResults.alreadyDone.push(row.id); return;
        }

        const key = `job-descriptions/${row.user_id}/${row.id}.txt`;

        // HEAD check: skip if S3 object already exists (from crashed run)
        const exists = await s3ObjectExists(s3, bucketName, key);
        if (exists) {
          mapping[row.id] = key;
          batchResults.alreadyDone.push(row.id);
          return;
        }

        try {
          await s3.send(new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: row.description_text,
            ContentType: 'text/plain',
          }));
          mapping[row.id] = key;
          batchResults.uploaded.push(row.id);
        } catch (err) {
          console.error(`Failed to upload description for job ${row.id}:`, err);
          batchResults.skipped.push(row.id);
        }
      })
    ));

    uploaded += batchResults.uploaded.length;
    skipped += batchResults.skipped.length;
    alreadyUploaded += batchResults.alreadyDone.length;

    // Save mapping after every batch — crash-safe
    saveMapping(mapping);

    const progress = Math.min(offset + BATCH_SIZE, total);
    console.log(`Progress: ${progress}/${total} (${uploaded} uploaded, ${alreadyUploaded} already-done, ${skipped} skipped)`);

    // DB batch delay
    if (offset + BATCH_SIZE < total) await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nDone. ${uploaded} new uploaded, ${alreadyUploaded} already-done, ${skipped} skipped.`);
  console.log(`Mapping saved to ${OUTPUT_FILE} (${Object.keys(mapping).length} entries)`);
  await pgClient.end();
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
