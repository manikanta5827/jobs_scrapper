import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export let db: any;

export async function initDb() {
    if (db) return db;
    
    const DATABASE_URL = process.env.DATABASE_URL!;

    if (!DATABASE_URL) {
        console.error("DATABASE_URL not found during initDb");
        throw new Error("DATABASE_URL not found");
    }

    const pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: true, // Required for Neon
    });

    db = drizzle(pool, { schema });
    return db;
}
