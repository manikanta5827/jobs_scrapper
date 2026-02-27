import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
const DATABASE_URL = process.env.DATABASE_URL!;

if (!DATABASE_URL) {
    console.error("DATABASE_URL not found");
    throw new Error("DATABASE_URL not found");
}

const pool = new Pool({
    connectionString: DATABASE_URL,
});

export const db = drizzle(pool, { schema });
