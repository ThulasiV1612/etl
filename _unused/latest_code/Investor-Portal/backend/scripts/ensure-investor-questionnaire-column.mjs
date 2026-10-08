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
     AND column_name = 'investor_questionnaire_json'`,
);

if (check.rows.length > 0) {
  console.log("Column investor_questionnaire_json already exists.");
} else {
  await client.query(
    `ALTER TABLE add_deal_form ADD COLUMN IF NOT EXISTS investor_questionnaire_json text`,
  );
  console.log("Added column investor_questionnaire_json.");
}

await client.end();
