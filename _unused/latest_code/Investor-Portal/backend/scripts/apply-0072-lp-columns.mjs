import dotenv from "dotenv"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import pg from "pg"

const dir = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(dir, "..")
dotenv.config({ path: path.join(root, ".env.local") })
dotenv.config({ path: path.join(root, ".env") })

const user = process.env.DATABASE_USER ?? "postgres"
const password = process.env.DATABASE_PASSWORD ?? "Postgresql123"
const host = process.env.DATABASE_HOST ?? "localhost"
const port = process.env.DATABASE_PORT ?? "5432"
const name = process.env.DATABASE_NAME ?? "prod_syndicationx_db"

console.log("Applying 0072 on DB:", name)

const client = new pg.Client({
  connectionString: `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${name}`,
})

await client.connect()

const sqlPath = path.join(
  root,
  "migrations",
  "0072_deal_lp_investor_entity_ownership_distribution_allocation.sql",
)
const sql = fs.readFileSync(sqlPath, "utf8")
await client.query(sql)

const cols = await client.query(`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'deal_lp_investor'
    AND column_name IN (
      'entity_ownership_percent',
      'distribution_allocation_percent',
      'percent_of_class_ownership',
      'percent_of_class_distributions'
    )
  ORDER BY column_name
`)
console.log("columns now present:", cols.rows.map((r) => r.column_name))

await client.end()
console.log("Done.")
