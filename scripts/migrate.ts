/**
 * migrate.ts — Standalone Database Migration Runner
 * Executes all pending SQL migration files in drizzle/ directory against PostgreSQL.
 */

import fs from 'fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

// Auto-parse .env file if DATABASE_URL is not set in shell environment
if (!process.env.DATABASE_URL && fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Error: DATABASE_URL environment variable is not set and no .env file was found!');
  console.error('Please create a .env file with DATABASE_URL=postgres://... or run: DATABASE_URL="your-db-url" npm run db:migrate');
  process.exit(1);
}

async function runMigrations() {
  console.log('Connecting to PostgreSQL database for migrations...');
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 1
  });

  const db = drizzle(pool);

  try {
    console.log('Applying pending Drizzle migrations from ./drizzle...');
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('✅ Migrations applied successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
