/**
 * Dev helper: set password 12345678 for co-sponsor portal users and
 * investors added by those co-sponsors so they can sign in with email.
 *
 * Usage (from backend/):
 *   node scripts/set-cosponsor-investor-passwords.mjs
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import bcrypt from "bcrypt";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

const PASSWORD = "12345678";
const BCRYPT_ROUNDS = 10;

const pool = new pg.Pool({
  user: process.env.DATABASE_USER ?? "postgres",
  password: process.env.DATABASE_PASSWORD ?? "Postgresql123",
  host: (process.env.DATABASE_HOST ?? "localhost").trim(),
  port: Number(process.env.DATABASE_PORT ?? "5432"),
  database: process.env.DATABASE_NAME ?? "investor_portal_db",
});

const CO_SPONSOR_ROLES_SQL = `('co-sponsor', 'co sponsor', 'co_sponsor')`;

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
  const client = await pool.connect();
  try {
    console.log(`Database: ${process.env.DATABASE_NAME}`);

    const preview = await client.query(`
      WITH co_sponsor_ids AS (
        SELECT DISTINCT u.id
        FROM deal_member dm
        JOIN users u ON (
          u.id::text = dm.contact_member_id
          OR lower(trim(u.email)) = lower(trim(dm.contact_member_id))
        )
        WHERE lower(trim(dm.deal_member_role)) IN ${CO_SPONSOR_ROLES_SQL}
        UNION
        SELECT DISTINCT u.id
        FROM deal_investment di
        JOIN users u ON (
          u.id::text = di.contact_id
          OR lower(trim(u.email)) = lower(trim(di.contact_id))
        )
        WHERE lower(trim(di.investor_role)) IN ${CO_SPONSOR_ROLES_SQL}
      ),
      investor_ids AS (
        SELECT DISTINCT u.id
        FROM deal_lp_investor lp
        JOIN users u ON (
          u.id::text = lp.contact_member_id
          OR lower(trim(u.email)) = lower(trim(coalesce(lp.email, '')))
        )
        WHERE lp.added_by IN (SELECT id FROM co_sponsor_ids)
        UNION
        SELECT DISTINCT u.id
        FROM deal_member dm
        JOIN users u ON (
          u.id::text = dm.contact_member_id
          OR lower(trim(u.email)) = lower(trim(dm.contact_member_id))
        )
        WHERE dm.added_by IN (SELECT id FROM co_sponsor_ids)
          AND lower(trim(dm.deal_member_role)) NOT IN ${CO_SPONSOR_ROLES_SQL}
          AND lower(trim(dm.deal_member_role)) NOT IN ('lead sponsor', 'admin sponsor')
        UNION
        SELECT DISTINCT u.id
        FROM users u
        WHERE lower(trim(u.role)) IN ('investor', 'deal_participant')
      )
      SELECT u.id, u.email, u.role, u.user_status, u.user_signup_completed,
        CASE WHEN u.id IN (SELECT id FROM co_sponsor_ids) THEN 'co_sponsor' ELSE 'investor' END AS kind
      FROM users u
      WHERE u.id IN (SELECT id FROM co_sponsor_ids UNION SELECT id FROM investor_ids)
      ORDER BY kind, u.email
    `);

    console.log(`Matching accounts: ${preview.rowCount}`);
    for (const row of preview.rows) {
      console.log(`  [${row.kind}] ${row.email} role=${row.role} status=${row.user_status} signup=${row.user_signup_completed}`);
    }

    if (preview.rowCount === 0) {
      console.log("No co-sponsor or co-sponsor-investor users found.");
      return;
    }

    const ids = preview.rows.map((r) => r.id);
    const updated = await client.query(
      `UPDATE users
       SET password_hash = $1,
           user_signup_completed = 'true',
           user_status = CASE
             WHEN lower(trim(user_status)) IN ('inactive', 'suspended') THEN user_status
             ELSE 'active'
           END,
           updated_at = now()
       WHERE id = ANY($2::uuid[])
       RETURNING email`,
      [passwordHash, ids],
    );
    console.log(`Updated password for ${updated.rowCount} users.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
