import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const pool = new pg.Pool({
  user: process.env.DATABASE_USER ?? "postgres",
  password: process.env.DATABASE_PASSWORD ?? "Postgresql123",
  host: process.env.DATABASE_HOST ?? "localhost",
  port: Number(process.env.DATABASE_PORT ?? 5432),
  database: process.env.DATABASE_NAME ?? "investor_portal_db",
});

const tables = await pool.query(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name
`);
let migrationsApplied = null;
const drizzleMeta = tables.rows.find((r) =>
  String(r.table_name).includes("drizzle"),
);
if (drizzleMeta) {
  const mig = await pool.query(
    `SELECT COUNT(*)::int AS n FROM "${drizzleMeta.table_name}"`,
  );
  migrationsApplied = mig.rows[0].n;
}
const appTables = tables.rows
  .map((r) => r.table_name)
  .filter((n) => !String(n).includes("drizzle"));
console.log(
  JSON.stringify(
    {
      tableCount: tables.rows.length,
      applicationTableCount: appTables.length,
      migrationsApplied,
      drizzleMetaTable: drizzleMeta?.table_name ?? null,
      tables: tables.rows.map((r) => r.table_name),
      applicationTables: appTables,
    },
    null,
    2,
  ),
);
await pool.end();
