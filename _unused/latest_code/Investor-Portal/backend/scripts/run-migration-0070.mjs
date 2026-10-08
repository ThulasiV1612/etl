/**
 * Apply migrations/0070_investor_stripe_payments.sql
 */
import dotenv from "dotenv"
import fs from "node:fs"
import path from "node:path"
import pg from "pg"
import { fileURLToPath } from "node:url"
import crypto from "node:crypto"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, "..", ".env.local") })
dotenv.config({ path: path.join(__dirname, "..", ".env") })

const host = (process.env.DATABASE_HOST ?? "localhost").trim()
const port = Number(process.env.DATABASE_PORT ?? "5432")
const database = process.env.DATABASE_NAME ?? "investor_portal_db"
const user = process.env.DATABASE_USER ?? "postgres"
const password = process.env.DATABASE_PASSWORD ?? ""

const sqlPath = path.join(
  __dirname,
  "..",
  "migrations",
  "0070_investor_stripe_payments.sql",
)
const sql = fs.readFileSync(sqlPath, "utf8")
const tag = "0070_investor_stripe_payments"
const hash = crypto.createHash("sha256").update(sql).digest("hex")

const client = new pg.Client({ host, port, database, user, password })
await client.connect()
console.log(`Connected to ${database} @ ${host}:${port}`)

try {
  await client.query("BEGIN")
  await client.query(sql)
  console.log("Applied SQL:", path.basename(sqlPath))

  // Record in drizzle migrations table when present (idempotent-ish).
  const migTable = await client.query(`
    SELECT n.nspname AS schema, c.relname AS table
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND c.relname = '__drizzle_migrations'
    LIMIT 1
  `)
  if (migTable.rowCount > 0) {
    const schema = migTable.rows[0].schema
    const fq = `"${schema}"."__drizzle_migrations"`
    const existing = await client.query(
      `SELECT id FROM ${fq} WHERE hash = $1 LIMIT 1`,
      [hash],
    )
    if (existing.rowCount === 0) {
      // Some drizzle installs use (id, hash, created_at); others add tag.
      const cols = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = '__drizzle_migrations'`,
        [schema],
      )
      const names = new Set(cols.rows.map((r) => r.column_name))
      if (names.has("created_at")) {
        await client.query(
          `INSERT INTO ${fq} (hash, created_at) VALUES ($1, $2)`,
          [hash, Date.now()],
        )
      } else {
        await client.query(`INSERT INTO ${fq} (hash) VALUES ($1)`, [hash])
      }
      console.log("Recorded in", fq, "hash", hash.slice(0, 12) + "…")
    } else {
      console.log("Already recorded in", fq)
    }
  } else {
    console.log("No __drizzle_migrations table — SQL applied only.")
  }

  // Quick verify
  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'investor_checkout_payments',
        'investor_distribution_payouts'
      )
    ORDER BY table_name
  `)
  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_investor_profiles'
      AND column_name LIKE 'stripe_connect%'
    ORDER BY column_name
  `)
  console.log(
    "Verified tables:",
    tables.rows.map((r) => r.table_name).join(", ") || "(none)",
  )
  console.log(
    "Verified profile columns:",
    cols.rows.map((r) => r.column_name).join(", ") || "(none)",
  )

  await client.query("COMMIT")
  console.log("Migration 0070 complete:", tag)
} catch (err) {
  await client.query("ROLLBACK").catch(() => {})
  console.error("Migration failed:", err instanceof Error ? err.message : err)
  process.exitCode = 1
} finally {
  await client.end()
}
