import dotenv from "dotenv"
import fs from "node:fs"
import path from "node:path"
import pg from "pg"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, "..", ".env.local") })
dotenv.config({ path: path.join(__dirname, "..", ".env") })

const host = process.env.DATABASE_HOST ?? "localhost"
const port = Number(process.env.DATABASE_PORT ?? "5432")
const database = process.env.DATABASE_NAME ?? "investor_portal_db"
const user = process.env.DATABASE_USER ?? "postgres"
const password = process.env.DATABASE_PASSWORD ?? "Postgresql123"

const sqlPath = path.join(
  __dirname,
  "..",
  "migrations",
  "0053_funding_instructions_json.sql",
)
const sql = fs.readFileSync(sqlPath, "utf8").trim()

const client = new pg.Client({ host, port, database, user, password })
await client.connect()
console.log(`Connected to ${database} @ ${host}:${port}`)

try {
  const colBefore = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'add_deal_form'
       AND column_name = 'funding_instructions_json'`,
  )
  if (colBefore.rowCount > 0) {
    console.log("Column funding_instructions_json already exists.")
    process.exit(0)
  }

  await client.query(sql)
  console.log("Applied:", path.basename(sqlPath))
  console.log(sql)

  const colAfter = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'add_deal_form'
       AND column_name = 'funding_instructions_json'`,
  )
  console.log("Verified:", colAfter.rows[0])
} catch (err) {
  console.error("Migration failed:", err instanceof Error ? err.message : err)
  process.exit(1)
} finally {
  await client.end()
}
