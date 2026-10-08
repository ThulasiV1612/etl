/**
 * Seed Deal testing 01 with sponsors + LPs for investor-communication intercept.
 *
 * From backend/:
 *   node scripts/seed-deal-testing-01-intercept-roster.mjs
 *
 * Logins (password 12345678):
 *   platform.admin@example.com     Lead Sponsor (existing)
 *   check@cosponsor.com            Co-sponsor, Yes intercept (existing)
 *   intercept.seed.admin@example.com
 *   intercept.seed.cosponsor.no@example.com
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcrypt";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const DEAL_ID = "49b15b2f-b270-4cdd-9016-2551b143c300";
const CLASS_A_ID = "ecc9d12b-efd3-4c20-a717-3018bb818b51";
const CLASS_A_NAME = "Class A";
const LEAD_ID = "b2c15cb6-1678-4819-9d24-6fdd8d192064";
const ORG_ID = "380a60f3-6ebf-43d4-9949-f4ee012eb426";
const YES_CO_USER_ID = "ec2f6f4c-dbe8-4797-88b0-2e20cb61e037";
const PASSWORD = "12345678";
const EMAIL_PREFIX = "intercept.seed.";

const pool = new pg.Pool({
  user: process.env.DATABASE_USER ?? "postgres",
  password: process.env.DATABASE_PASSWORD ?? "Postgresql123",
  host: String(process.env.DATABASE_HOST ?? "localhost").trim(),
  port: Number(process.env.DATABASE_PORT ?? "5432"),
  database: process.env.DATABASE_NAME ?? "investor_portal_db",
});

function mockEmail(slug) {
  return `${EMAIL_PREFIX}${slug}@example.com`;
}

async function upsertPortalUser(client, row) {
  const existing = await client.query(
    `SELECT id FROM users WHERE lower(trim(email)) = lower($1) LIMIT 1`,
    [row.email],
  );
  if (existing.rowCount > 0) {
    const id = existing.rows[0].id;
    await client.query(
      `UPDATE users SET
         username = $2,
         password_hash = $3,
         role = 'deal_participant',
         user_status = 'active',
         user_signup_completed = 'true',
         organization_id = $4::uuid,
         first_name = $5,
         last_name = $6,
         updated_at = now()
       WHERE id = $1::uuid`,
      [id, row.username, row.passwordHash, ORG_ID, row.first, row.last],
    );
    return id;
  }
  const inserted = await client.query(
    `INSERT INTO users (
       email, username, password_hash, role, user_status,
       user_signup_completed, organization_id, first_name, last_name,
       phone, created_at, updated_at
     ) VALUES (
       $1, $2, $3, 'deal_participant', 'active',
       'true', $4::uuid, $5, $6,
       '', now(), now()
     )
     RETURNING id`,
    [row.email, row.username, row.passwordHash, ORG_ID, row.first, row.last],
  );
  return inserted.rows[0].id;
}

async function upsertContact(client, row) {
  const existing = await client.query(
    `SELECT id FROM contact WHERE lower(trim(email)) = lower($1) LIMIT 1`,
    [row.email],
  );
  const fullName = `${row.first} ${row.last}`;
  if (existing.rowCount > 0) {
    const id = existing.rows[0].id;
    await client.query(
      `UPDATE contact SET
         first_name = $2,
         last_name = $3,
         full_name = $4,
         is_portal_user = $5,
         organization_id = $6::uuid,
         note = $7,
         status = 'active'
       WHERE id = $1::uuid`,
      [id, row.first, row.last, fullName, row.portal, ORG_ID, row.note],
    );
    return id;
  }
  const inserted = await client.query(
    `INSERT INTO contact (
       first_name, last_name, full_name, email, phone, note,
       tags, lists, owners, status, created_by, organization_id,
       is_portal_user, platform_admin_only, accreditation_status
     ) VALUES (
       $1, $2, $3, $4, '', $5,
       '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'active', $6::uuid, $7::uuid,
       $8, false, 'Accredited'
     )
     RETURNING id`,
    [
      row.first,
      row.last,
      fullName,
      row.email,
      row.note,
      LEAD_ID,
      ORG_ID,
      row.portal,
    ],
  );
  return inserted.rows[0].id;
}

async function upsertMember(client, { userId, role, intercept }) {
  const existing = await client.query(
    `SELECT id FROM deal_member
     WHERE deal_id = $1 AND trim(contact_member_id) = $2
     LIMIT 1`,
    [DEAL_ID, userId],
  );
  if (existing.rowCount > 0) {
    await client.query(
      `UPDATE deal_member SET
         deal_member_role = $2,
         lead_sponsor_email_intercept = $3,
         updated_at = now()
       WHERE id = $1::uuid`,
      [existing.rows[0].id, role, intercept],
    );
    return;
  }
  await client.query(
    `INSERT INTO deal_member (
       deal_id, added_by, contact_member_id, deal_member_role,
       send_invitation_mail, lead_sponsor_email_intercept
     ) VALUES (
       $1::uuid, $2::uuid, $3, $4, 'no', $5
     )`,
    [DEAL_ID, LEAD_ID, userId, role, intercept],
  );
}

async function upsertSponsorInvestment(client, { contactId, displayName, role }) {
  const existing = await client.query(
    `SELECT id FROM deal_investment
     WHERE deal_id = $1 AND contact_id = $2 AND investor_role = $3
     LIMIT 1`,
    [DEAL_ID, contactId, role],
  );
  if (existing.rowCount > 0) return;
  await client.query(
    `INSERT INTO deal_investment (
       deal_id, offering_id, contact_id, contact_display_name, profile_id,
       investor_role, fund_approved, status, investor_class,
       commitment_amount, extra_contribution_amounts, funding_method
     ) VALUES (
       $1::uuid, '', $2, $3, 'individual',
       $4, false, '', '',
       '', '[]'::jsonb, ''
     )`,
    [DEAL_ID, contactId, displayName, role],
  );
}

async function insertLp(client, { contactId, fullName, email, addedBy, amount }) {
  await client.query(
    `DELETE FROM deal_lp_investor
     WHERE deal_id = $1 AND (
       contact_member_id = $2 OR lower(trim(email)) = lower($3)
     )`,
    [DEAL_ID, contactId, email],
  );
  await client.query(
    `DELETE FROM deal_investment
     WHERE deal_id = $1 AND contact_id = $2 AND investor_role = 'lp_investors'`,
    [DEAL_ID, contactId],
  );

  await client.query(
    `INSERT INTO deal_lp_investor (
       deal_id, added_by, contact_member_id, investor_name, email, role,
       profile_id, investor_class, committed_amount,
       percent_of_class_ownership, percent_of_class_distributions,
       entity_ownership_percent, distribution_allocation_percent,
       send_invitation_mail, doc_signed_date
     ) VALUES (
       $1::uuid, $2::uuid, $3, $4, $5, 'LP Investor',
       'individual', $6, $7,
       '10', '10',
       '7', '7',
       'no', '08/31/2026'
     )`,
    [DEAL_ID, addedBy, contactId, fullName, email, CLASS_A_NAME, String(amount)],
  );

  await client.query(
    `INSERT INTO deal_investment (
       deal_id, offering_id, contact_id, contact_display_name, profile_id,
       investor_role, fund_approved, fund_approved_by, fund_approved_at,
       fund_approved_commitment_snapshot, status, investor_class,
       doc_signed_date, commitment_amount, extra_contribution_amounts,
       funding_method
     ) VALUES (
       $1::uuid, '', $2, $3, 'individual',
       'lp_investors', true, $4::uuid, now(),
       $5, 'Funds fully received', $6,
       '08/31/2026', $5, '[]'::jsonb,
       'wire_transfer'
     )`,
    [DEAL_ID, contactId, fullName, addedBy, String(amount), CLASS_A_NAME],
  );
}

const client = await pool.connect();
try {
  const deal = await client.query(
    `SELECT id, deal_name FROM add_deal_form WHERE id = $1`,
    [DEAL_ID],
  );
  if (deal.rows.length === 0) throw new Error("Deal testing 01 not found");
  const classRow = await client.query(
    `SELECT id FROM deal_investor_class WHERE id = $1 AND deal_id = $2`,
    [CLASS_A_ID, DEAL_ID],
  );
  if (classRow.rows.length === 0) throw new Error("Class A not found");

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  await client.query("BEGIN");

  const prior = await client.query(
    `SELECT id, email FROM contact WHERE lower(email) LIKE $1`,
    [`${EMAIL_PREFIX}%@example.com`],
  );
  const priorIds = prior.rows.map((r) => r.id);
  if (priorIds.length > 0) {
    await client.query(
      `DELETE FROM deal_investment
       WHERE deal_id = $1 AND contact_id = ANY($2::text[])`,
      [DEAL_ID, priorIds],
    );
    await client.query(
      `DELETE FROM deal_lp_investor
       WHERE deal_id = $1 AND contact_member_id = ANY($2::text[])`,
      [DEAL_ID, priorIds],
    );
    await client.query(
      `DELETE FROM deal_member
       WHERE deal_id = $1 AND contact_member_id = ANY($2::text[])`,
      [DEAL_ID, priorIds],
    );
  }
  const priorUsers = await client.query(
    `SELECT id FROM users WHERE lower(email) LIKE $1`,
    [`${EMAIL_PREFIX}%@example.com`],
  );
  const priorUserIds = priorUsers.rows.map((r) => String(r.id));
  if (priorUserIds.length > 0) {
    await client.query(
      `DELETE FROM deal_member
       WHERE deal_id = $1 AND contact_member_id = ANY($2::text[])`,
      [DEAL_ID, priorUserIds],
    );
  }

  const adminUserId = await upsertPortalUser(client, {
    email: mockEmail("admin"),
    username: "intercept_seed_admin",
    passwordHash,
    first: "Riley",
    last: "Admin",
  });
  const adminContactId = await upsertContact(client, {
    email: mockEmail("admin"),
    first: "Riley",
    last: "Admin",
    portal: true,
    note: "Seeded admin sponsor for intercept mail test",
  });
  await upsertMember(client, {
    userId: adminUserId,
    role: "admin sponsor",
    intercept: "yes",
  });
  await upsertSponsorInvestment(client, {
    contactId: adminUserId,
    displayName: "Riley Admin",
    role: "admin sponsor",
  });

  const noCoUserId = await upsertPortalUser(client, {
    email: mockEmail("cosponsor.no"),
    username: "intercept_seed_cosponsor_no",
    passwordHash,
    first: "Morgan",
    last: "Nohold",
  });
  await upsertContact(client, {
    email: mockEmail("cosponsor.no"),
    first: "Morgan",
    last: "Nohold",
    portal: true,
    note: "Seeded co-sponsor with No intercept",
  });
  await upsertMember(client, {
    userId: noCoUserId,
    role: "Co-sponsor",
    intercept: "no",
  });
  await upsertSponsorInvestment(client, {
    contactId: noCoUserId,
    displayName: "Morgan Nohold",
    role: "Co-sponsor",
  });

  await client.query(
    `UPDATE deal_member
     SET lead_sponsor_email_intercept = 'yes', updated_at = now()
     WHERE deal_id = $1::uuid
       AND lower(trim(deal_member_role)) IN ('co-sponsor', 'co sponsor')
       AND (
         trim(contact_member_id) = $2
         OR trim(contact_member_id) = $3
       )`,
    [DEAL_ID, YES_CO_USER_ID, "15129013-cc66-4704-be50-c37b519f2a3b"],
  );

  const lps = [
    { slug: "lp.lead.avery", first: "Avery", last: "Leadlp", addedBy: LEAD_ID, amount: 50000 },
    { slug: "lp.lead.jordan", first: "Jordan", last: "Leadlp", addedBy: LEAD_ID, amount: 40000 },
    { slug: "lp.admin.priya", first: "Priya", last: "Adminlp", addedBy: adminUserId, amount: 35000 },
    { slug: "lp.admin.marcus", first: "Marcus", last: "Adminlp", addedBy: adminUserId, amount: 25000 },
    { slug: "lp.yes.sofia", first: "Sofia", last: "Yeslp", addedBy: YES_CO_USER_ID, amount: 30000 },
    { slug: "lp.yes.liam", first: "Liam", last: "Yeslp", addedBy: YES_CO_USER_ID, amount: 20000 },
    { slug: "lp.no.hannah", first: "Hannah", last: "Nolp", addedBy: noCoUserId, amount: 28000 },
    { slug: "lp.no.noah", first: "Noah", last: "Nolp", addedBy: noCoUserId, amount: 18000 },
  ];

  const created = [];
  for (const lp of lps) {
    const email = mockEmail(lp.slug);
    const contactId = await upsertContact(client, {
      email,
      first: lp.first,
      last: lp.last,
      portal: false,
      note: "Seeded LP for intercept mail test",
    });
    await insertLp(client, {
      contactId,
      fullName: `${lp.first} ${lp.last}`,
      email,
      addedBy: lp.addedBy,
      amount: lp.amount,
    });
    created.push({ name: `${lp.first} ${lp.last}`, email, addedBy: lp.addedBy, amount: lp.amount });
  }

  await client.query("COMMIT");

  console.log(`Seeded intercept roster on ${deal.rows[0].deal_name}`);
  console.log("Sponsors (password 12345678):");
  console.log("  Lead Sponsor     platform.admin@example.com");
  console.log("  Admin sponsor    intercept.seed.admin@example.com");
  console.log("  Co-sponsor YES   check@cosponsor.com");
  console.log("  Co-sponsor NO    intercept.seed.cosponsor.no@example.com");
  console.log("Limited partners:");
  for (const row of created) {
    console.log(`  $${String(row.amount).padStart(5)}  ${row.name.padEnd(16)}  ${row.email}`);
  }
} catch (err) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error(err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
