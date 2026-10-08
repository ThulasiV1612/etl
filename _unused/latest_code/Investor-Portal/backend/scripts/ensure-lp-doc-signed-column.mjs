/**
 * Ensures deal_lp_investor.doc_signed_date exists (migration 0044).
 * Usage: node scripts/ensure-lp-doc-signed-column.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env.local") });

const sql = readFileSync(
  join(__dirname, "..", "migrations", "0044_deal_lp_investor_doc_signed_date.sql"),
  "utf8",
);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

try {
  await pool.query(sql);
  console.log("deal_lp_investor.doc_signed_date column ensured.");
} finally {
  await pool.end();
}
