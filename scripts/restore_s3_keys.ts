/**
 * Post-migration: restore S3 keys into new DB columns (with transaction)
 *
 * Reads the JSON mapping files produced by backup_descriptions_to_s3.ts
 * and backup_resumes_to_s3.ts, then updates the corresponding DB columns
 * inside a single atomic transaction. If any batch fails, everything rolls back.
 *
 * Usage: npx tsx scripts/restore_s3_keys.ts
 */
import fs from 'fs';
import pg from 'pg';

const BATCH_SIZE = 200;
const DESC_FILE = 'scripts/description_s3_keys.json';
const RESUME_FILE = 'scripts/resume_s3_keys.json';

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

async function restoreMapping(
  client: pg.Client,
  mapping: Record<string, string>,
  columnName: string
): Promise<number> {
  const entries = Object.entries(mapping);
  if (entries.length === 0) return 0;

  console.log(`Restoring ${entries.length} entries into ${columnName}...`);
  let updated = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);

    const valuePlaceholders = batch.map((_, idx) => {
      const idOffset = idx * 2 + 1;
      const keyOffset = idx * 2 + 2;
      return `($${idOffset}, $${keyOffset})`;
    }).join(', ');

    const params: string[] = [];
    for (const [jobId, s3Key] of batch) {
      params.push(jobId, s3Key);
    }

    const result = await client.query(`
      UPDATE jobs SET ${columnName} = data.key
      FROM (VALUES ${valuePlaceholders}) AS data(id, key)
      WHERE jobs.id = data.id::uuid
    `, params);

    updated += result.rowCount ?? batch.length;

    const progress = Math.min(i + BATCH_SIZE, entries.length);
    console.log(`  ${columnName}: ${progress}/${entries.length}`);
  }

  return updated;
}

async function main() {
  loadEnv();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const descExists = fs.existsSync(DESC_FILE);
  const resumeExists = fs.existsSync(RESUME_FILE);

  if (!descExists && !resumeExists) {
    console.log('No mapping files found, nothing to restore.');
    process.exit(0);
  }

  const descMapping: Record<string, string> = descExists
    ? JSON.parse(fs.readFileSync(DESC_FILE, 'utf-8'))
    : {};

  const resumeMapping: Record<string, string> = resumeExists
    ? JSON.parse(fs.readFileSync(RESUME_FILE, 'utf-8'))
    : {};

  const totalEntries = Object.keys(descMapping).length + Object.keys(resumeMapping).length;
  if (totalEntries === 0) {
    console.log('Mapping files exist but are empty, nothing to restore.');
    process.exit(0);
  }

  const pgClient = new pg.Client({
    connectionString: connectionString.replace('-pooler.', '.'),
    ssl: { rejectUnauthorized: false },
  });
  await pgClient.connect();

  let descUpdated = 0;
  let resumeUpdated = 0;

  try {
    await pgClient.query('BEGIN');

    if (Object.keys(descMapping).length > 0) {
      descUpdated = await restoreMapping(pgClient, descMapping, 'description_s3_key');
    }

    if (Object.keys(resumeMapping).length > 0) {
      resumeUpdated = await restoreMapping(pgClient, resumeMapping, 'ats_resume_s3_key');
    }

    await pgClient.query('COMMIT');
    console.log(`\nRestore committed successfully.`);
    console.log(`  description_s3_key: ${descUpdated} rows updated`);
    console.log(`  ats_resume_s3_key: ${resumeUpdated} rows updated`);
  } catch (err) {
    await pgClient.query('ROLLBACK');
    console.error('Restore failed, transaction rolled back:', err);
    process.exit(1);
  } finally {
    await pgClient.end();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
