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

// For Neon DB migrations, ensure we use direct unpooled connection (remove -pooler suffix if present)
const directConnectionString = connectionString.replace('-pooler.', '.');

async function runMigrations(attempts = 3) {
  console.log('Connecting to PostgreSQL database for migrations...');
  
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const client = new pg.Client({
      connectionString: directConnectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });

    try {
      await client.connect();
      const db = drizzle(client);
      console.log('Applying pending Drizzle migrations from ./drizzle...');
      await migrate(db, { migrationsFolder: './drizzle' });
      console.log('✅ Migrations applied successfully!');
      await client.end();
      return;
    } catch (err: any) {
      try { await client.end(); } catch (_) {}
      console.warn(`⚠️ Migration attempt ${attempt}/${attempts} failed: ${err?.message || err}`);
      if (attempt < attempts) {
        console.log(`⏳ Retrying in 2 seconds (waking up Neon compute instance if idle)...`);
        await new Promise((res) => setTimeout(res, 2000));
      } else {
        console.error('❌ Migration failed after all retry attempts:', err);
        process.exit(1);
      }
    }
  }
}

runMigrations();
