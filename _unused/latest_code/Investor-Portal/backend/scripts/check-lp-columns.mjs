import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"
import pg from "pg"

const dir = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(dir, ".env.local") })
dotenv.config({ path: path.join(dir, ".env") })

const user = process.env.DATABASE_USER ?? "postgres"
const password = process.env.DATABASE_PASSWORD ?? "Postgresql123"
const host = process.env.DATABASE_HOST ?? "localhost"
const port = process.env.DATABASE_PORT ?? "5432"
const name = process.env.DATABASE_NAME ?? "prod_syndicationx_db"

console.log("DB:", name, "@", `${host}:${port}`)

const client = new pg.Client({
  connectionString: `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${name}`,
})

await client.connect()

const cols = await client.query(`
  SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'deal_lp_investor'
    AND column_name IN (
      'percent_of_class_ownership',
      'percent_of_class_distributions',
      'entity_ownership_percent',
      'distribution_allocation_percent'
    )
  ORDER BY column_name
`)
console.log("matching columns:", cols.rows)

const all = await client.query(`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'deal_lp_investor'
  ORDER BY ordinal_position
`)
console.log(
  "all deal_lp_investor columns:",
  all.rows.map((r) => r.column_name),
)

try {
  const mig = await client.query(`
    SELECT id, hash, created_at
    FROM drizzle.__drizzle_migrations
    ORDER BY created_at DESC
    LIMIT 10
  `)
  console.log("recent drizzle migrations:", mig.rows)
} catch (err) {
  console.log("migration table read failed:", err.message)
}

await client.end()
