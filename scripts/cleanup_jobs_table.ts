/**
 * Post-migration cleanup: REINDEX + VACUUM FULL + autovacuum tuning
 *
 * Run AFTER all migrations (0036 + 0037) and after restore_s3_keys.ts.
 * This reclaims disk space from dropped columns and sets aggressive autovacuum
 * to prevent bloat from daily 30K insert/delete churn.
 *
 * Usage: npx tsx scripts/cleanup_jobs_table.ts
 *
 * WARNING: VACUUM FULL acquires an ACCESS EXCLUSIVE lock — blocks all writes.
 * Run during a maintenance window.
 */
import fs from 'fs';
import pg from 'pg';

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

async function main() {
  loadEnv();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) { console.error('DATABASE_URL not set'); process.exit(1); }

  const client = new pg.Client({
    connectionString: connectionString.replace('-pooler.', '.'),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  console.log('Running REINDEX TABLE jobs...');
  await client.query('REINDEX TABLE jobs');
  console.log('REINDEX complete.');

  console.log('Running VACUUM FULL jobs (this may take minutes, blocks writes)...');
  await client.query('VACUUM FULL jobs');
  console.log('VACUUM FULL complete.');

  console.log('Setting aggressive autovacuum on jobs table...');
  await client.query("ALTER TABLE jobs SET (autovacuum_vacuum_scale_factor = 0.01)");
  await client.query("ALTER TABLE jobs SET (autovacuum_vacuum_threshold = 1000)");
  console.log('Autovacuum configured: scale_factor=0.01, threshold=1000');

  // Verify table size
  const sizeRes = await client.query(
    `SELECT pg_size_pretty(pg_total_relation_size('jobs')) AS total_size`
  );
  console.log(`\nJobs table total size: ${sizeRes.rows[0].total_size}`);
  console.log('Cleanup complete.');

  await client.end();
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
