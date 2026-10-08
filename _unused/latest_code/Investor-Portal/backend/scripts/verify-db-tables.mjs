/**
 * Compare public DB tables to Drizzle application schema tables.
 * Usage: node scripts/verify-db-tables.mjs
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SCHEMA_TABLES = [
  "add_deal_form",
  "assigning_deal_user",
  "companies",
  "company_admin_audit_logs",
  "company_workspace_tab_settings",
  "contact",
  "contact_email_template",
  "deal_investment",
  "deal_investor_class",
  "deal_lp_investor",
  "deal_member",
  "deals",
  "esign_reusable_template",
  "investment_signatures",
  "investor_communication_logs",
  "member_admin_audit_logs",
  "organization_contact_list",
  "organization_contact_tag",
  "soc_auth_audit_logs",
  "user_beneficiaries",
  "user_company_membership",
  "user_investor_profiles",
  "user_page_navigations",
  "user_portal_sessions",
  "user_saved_addresses",
  "users",
];

const pool = new pg.Pool({
  user: process.env.DATABASE_USER ?? "postgres",
  password: process.env.DATABASE_PASSWORD ?? "Postgresql123",
  host: process.env.DATABASE_HOST ?? "localhost",
  port: Number(process.env.DATABASE_PORT ?? "5432"),
  database: process.env.DATABASE_NAME ?? "investor_portal_db",
});

const r = await pool.query(`
  SELECT tablename
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename
`);
const dbTables = r.rows.map((row) => row.tablename);
const extra = dbTables.filter((t) => !SCHEMA_TABLES.includes(t));
const missing = SCHEMA_TABLES.filter((t) => !dbTables.includes(t));

console.log(`Database: ${process.env.DATABASE_NAME}`);
console.log(`Public tables (${dbTables.length}):`, dbTables.join(", "));
if (extra.length) console.error("Extra (not in schema):", extra);
if (missing.length) console.error("Missing (in schema):", missing);
if (!extra.length && !missing.length) console.log("OK — DB matches application schema.");

await pool.end();
process.exit(extra.length || missing.length ? 1 : 0);
