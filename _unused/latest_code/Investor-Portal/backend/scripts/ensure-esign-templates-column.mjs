import dotenv from "dotenv";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const host = process.env.DATABASE_HOST ?? "localhost";
const port = Number(process.env.DATABASE_PORT ?? "5432");
const database = process.env.DATABASE_NAME ?? "investor_portal_db";
const user = process.env.DATABASE_USER ?? "postgres";
const password = process.env.DATABASE_PASSWORD ?? "Postgresql123";

const client = new pg.Client({ host, port, database, user, password });
await client.connect();
console.log(`Connected to ${database} @ ${host}:${port}`);

const check = await client.query(
  `SELECT column_name FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'add_deal_form'
     AND column_name = 'esign_templates_json'`,
);

if (check.rows.length > 0) {
  console.log("Column esign_templates_json already exists.");
} else {
  await client.query(
    `ALTER TABLE add_deal_form ADD COLUMN IF NOT EXISTS esign_templates_json text`,
  );
  console.log("Added column esign_templates_json.");
}

try {
  const mig = await client.query(
    `SELECT hash, created_at FROM drizzle.__drizzle_migrations
     ORDER BY created_at DESC LIMIT 3`,
  );
  console.log(
    "Recent drizzle migrations:",
    mig.rows.map((r) => r.hash?.slice(0, 12) ?? "?").join(", "),
  );
} catch (e) {
  console.log("Could not read drizzle.__drizzle_migrations:", e.message);
}

await client.end();
