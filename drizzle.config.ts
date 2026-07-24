import fs from "fs";
import { defineConfig } from "drizzle-kit";

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

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error("❌ Error: DATABASE_URL environment variable is not set and no .env file found!");
    throw new Error("DATABASE_URL environment variable is not set!");
}

export default defineConfig({
    schema: "./src/db/schema.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        url: DATABASE_URL,
        ssl: {
          rejectUnauthorized: false
        }
    },
});
