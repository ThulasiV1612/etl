/**
 * Wipes application data while keeping:
 * - all rows in `companies`
 * - all users with role `platform_admin` (credentials unchanged)
 *
 * Usage (from backend/):
 *   npm run db:cleanup
 *   node scripts/cleanup-db-keep-platform-admin.mjs
 *   node scripts/cleanup-db-keep-platform-admin.mjs --dry-run
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

const dryRun = process.argv.includes("--dry-run");

/** Never truncate these (schema / keep forever). */
const PRESERVE_TABLES = new Set([
  "companies",
  "users",
  "__drizzle_migrations",
  "drizzle_migrations",
  "spatial_ref_sys",
]);

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

const pool = new pg.Pool({
  user: process.env.DATABASE_USER ?? "postgres",
  password: process.env.DATABASE_PASSWORD ?? "Postgresql123",
  host: process.env.DATABASE_HOST ?? "localhost",
  port: Number(process.env.DATABASE_PORT ?? "5432"),
  database: process.env.DATABASE_NAME ?? "investor_portal_db",
});

async function listPublicTables(client) {
  const { rows } = await client.query(`
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
    ORDER BY c.relname
  `);
  return rows.map((r) => String(r.table_name));
}

async function main() {
  const dbName = process.env.DATABASE_NAME ?? "investor_portal_db";
  console.log(`Database: ${dbName}${dryRun ? " (dry-run)" : ""}`);
  console.log("Keep: all companies + all platform_admin users");

  const client = await pool.connect();
  try {
    const adminCheck = await client.query(`
      SELECT id, email, username, role
      FROM users
      WHERE role = 'platform_admin'
      ORDER BY email
    `);

    if (adminCheck.rowCount === 0) {
      console.error(
        "No platform_admin users found. Aborting so the DB is not wiped without an admin login.",
      );
      process.exit(1);
    }

    console.log("Platform admin(s) to preserve:");
    for (const row of adminCheck.rows) {
      console.log(`  ${row.email} (${row.id}) role=${row.role}`);
    }

    const tables = await listPublicTables(client);
    const wipeTables = tables.filter((t) => !PRESERVE_TABLES.has(t));

    const countsBefore = await client.query(`
      SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM users WHERE role = 'platform_admin') AS platform_admins,
        (SELECT count(*)::int FROM companies) AS companies
    `);
    console.log("Before:", countsBefore.rows[0]);
    console.log(
      `Tables to clear (${wipeTables.length}): ${wipeTables.join(", ") || "(none)"}`,
    );

    if (dryRun) {
      console.log("Dry-run: no changes applied.");
      return;
    }

    await client.query("BEGIN");
    try {
      // Clear dependent data (CASCADE handles FK order between wiped tables).
      for (const table of wipeTables) {
        await client.query(
          `TRUNCATE TABLE ${quoteIdent(table)} RESTART IDENTITY CASCADE`,
        );
        console.log(`  truncated ${table}`);
      }

      const deletedUsers = await client.query(`
        DELETE FROM users
        WHERE role IS DISTINCT FROM 'platform_admin'
        RETURNING id, email, role
      `);
      console.log(`Deleted non-platform-admin users: ${deletedUsers.rowCount}`);

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    const countsAfter = await client.query(`
      SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM users WHERE role = 'platform_admin') AS platform_admins,
        (SELECT count(*)::int FROM companies) AS companies
    `);
    console.log("After:", countsAfter.rows[0]);
    console.log(
      "Cleanup complete. Companies kept. Platform admin credentials unchanged.",
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
