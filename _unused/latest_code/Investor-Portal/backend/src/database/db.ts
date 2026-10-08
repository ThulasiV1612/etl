// backend/src/database/db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../schema/schema.js";

const DATABASE_USER = process.env.DATABASE_USER ?? "postgres";
const DATABASE_PASSWORD = process.env.DATABASE_PASSWORD ?? "Syndicationx$06062026";
const DATABASE_HOST = process.env.DATABASE_HOST ?? "localhost";
const DATABASE_PORT = process.env.DATABASE_PORT ?? "5432";
// const DATABASE_NAME = process.env.DATABASE_NAME ?? "syndicationx_01Aug2026";
const DATABASE_NAME = process.env.DATABASE_NAME ?? "syndicationx_db";

const DATABASE_URI = `postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}`;

const pool = new Pool({
  connectionString: DATABASE_URI,
});

export const db = drizzle({ client: pool, schema });
export { pool };
