/**
 * Upsert seeded platform admin login.
 *
 * Usage (from backend/):
 *   node scripts/seed-platform-admin.mjs
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import bcrypt from "bcrypt";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

const PLATFORM_ADMIN_ID = "b2c15cb6-1678-4819-9d24-6fdd8d192064";
const MASSIVE_CAPITAL_ORG_ID = "380a60f3-6ebf-43d4-9949-f4ee012eb426";
const EMAIL = "platform.admin@example.com";
const USERNAME = "platformadmin";
const PASSWORD = "12345678";
const BCRYPT_ROUNDS = 10;

const pool = new pg.Pool({
  user: process.env.DATABASE_USER ?? "postgres",
  password: process.env.DATABASE_PASSWORD ?? "Postgresql123",
  host: process.env.DATABASE_HOST ?? "localhost",
  port: Number(process.env.DATABASE_PORT ?? "5432"),
  database: process.env.DATABASE_NAME ?? "syndicationx_empty_db",
});

async function main() {
  const dbName = process.env.DATABASE_NAME ?? "syndicationx_empty_db";
  console.log(`Database: ${dbName}`);

  const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO companies (id, name, status, created_at, updated_at)
       VALUES ($1::uuid, 'Massive Capital', 'active', now(), now())
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name, status = EXCLUDED.status, updated_at = now()`,
      [MASSIVE_CAPITAL_ORG_ID],
    );

    const existing = await client.query(
      `SELECT id FROM users WHERE lower(trim(email)) = lower($1) LIMIT 1`,
      [EMAIL],
    );

    if (existing.rowCount > 0) {
      const id = existing.rows[0].id;
      await client.query(
        `UPDATE users SET
           username = $2,
           password_hash = $3,
           role = 'platform_admin',
           user_status = 'active',
           user_signup_completed = 'true',
           organization_id = $4::uuid,
           first_name = 'Platform',
           last_name = 'Admin',
           updated_at = now()
         WHERE id = $1::uuid`,
        [id, USERNAME, passwordHash, MASSIVE_CAPITAL_ORG_ID],
      );
      console.log(`Updated platform admin: ${EMAIL} (${id})`);
    } else {
      await client.query(
        `INSERT INTO users (
           id, email, username, password_hash, role, user_status,
           user_signup_completed, organization_id, first_name, last_name,
           phone, created_at, updated_at
         ) VALUES (
           $1::uuid, $2, $3, $4, 'platform_admin', 'active',
           'true', $5::uuid, 'Platform', 'Admin',
           '', now(), now()
         )`,
        [PLATFORM_ADMIN_ID, EMAIL, USERNAME, passwordHash, MASSIVE_CAPITAL_ORG_ID],
      );
      console.log(`Inserted platform admin: ${EMAIL} (${PLATFORM_ADMIN_ID})`);
    }

    await client.query("COMMIT");

    const verify = await client.query(
      `SELECT id, email, username, role, user_status
       FROM users
       WHERE lower(trim(email)) = lower($1)`,
      [EMAIL],
    );
    console.log("User row:", verify.rows[0]);
    console.log("Password set to:", PASSWORD);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
