import pg from "pg";

const DATABASE_URI =
  "postgresql://postgres:Postgresql123@localhost:5432/syndicationx_17Aug2026";

const DEAL_ID = "35fb4db2-ddc1-4b6c-8de3-1035bc8851d2";
const CLASS_A_ID = "671d2684-c937-45b9-bc2a-e0b691da2086";
const CLASS_A_NAME = "Class A - Limited partners";
const SPONSOR_ID = "b2c15cb6-1678-4819-9d24-6fdd8d192064";
const ORG_ID = "3f8a9c1e-2b4d-4f6a-8c7e-1d0e9a8b7c6d";
const TARGET_RAISE = 1_580_000;
const ACTUALLY_FUNDED = 1_505_000;
const LP_EQUITY_PCT = 0.7;

/** Same Class A commitment amounts as Candela Retail Development. */
const INVESTORS = [
  { first: "Avery", last: "Chen", amount: 250_000, funded: true },
  { first: "Jordan", last: "Hale", amount: 100_000, funded: true },
  { first: "Priya", last: "Raman", amount: 100_000, funded: true },
  { first: "Marcus", last: "Ellison", amount: 100_000, funded: true },
  { first: "Sofia", last: "Navarro", amount: 100_000, funded: true },
  { first: "Liam", last: "Okafor", amount: 75_000, funded: true },
  { first: "Hannah", last: "Briggs", amount: 75_000, funded: true },
  { first: "Noah", last: "Patel", amount: 75_000, funded: true },
  { first: "Elena", last: "Voss", amount: 75_000, funded: true },
  { first: "Caleb", last: "Wright", amount: 75_000, funded: true },
  { first: "Maya", last: "Singh", amount: 75_000, funded: false },
  { first: "Owen", last: "Brooks", amount: 75_000, funded: true },
  { first: "Isla", last: "Bennett", amount: 50_000, funded: true },
  { first: "Theo", last: "Grant", amount: 50_000, funded: true },
  { first: "Nina", last: "Alvarez", amount: 50_000, funded: true },
  { first: "Felix", last: "Ward", amount: 50_000, funded: true },
  { first: "Quinn", last: "Harper", amount: 50_000, funded: true },
  { first: "Ruby", last: "Kim", amount: 50_000, funded: true },
  { first: "Samir", last: "Cole", amount: 34_000, funded: true },
  { first: "Tara", last: "Jensen", amount: 30_000, funded: true },
  { first: "Victor", last: "Lang", amount: 25_000, funded: true },
  { first: "Wren", last: "Diaz", amount: 16_000, funded: true },
];

function pctOfClass(amount) {
  return ((amount / TARGET_RAISE) * 100).toFixed(6);
}

function pctOfEntity(amount) {
  return ((amount / TARGET_RAISE) * 100 * LP_EQUITY_PCT).toFixed(6);
}

function mockEmail(first, last) {
  return `deal11.mock.${first.toLowerCase()}.${last.toLowerCase()}@example.com`;
}

const pool = new pg.Pool({ connectionString: DATABASE_URI });
const client = await pool.connect();

try {
  const committed = INVESTORS.reduce((s, i) => s + i.amount, 0);
  const funded = INVESTORS.filter((i) => i.funded).reduce(
    (s, i) => s + i.amount,
    0,
  );
  if (committed !== TARGET_RAISE) {
    throw new Error(`Committed ${committed}, expected ${TARGET_RAISE}`);
  }
  if (funded !== ACTUALLY_FUNDED) {
    throw new Error(`Funded ${funded}, expected ${ACTUALLY_FUNDED}`);
  }

  await client.query("BEGIN");

  const deal = await client.query(
    `SELECT id, class_setup_json FROM add_deal_form WHERE id = $1`,
    [DEAL_ID],
  );
  if (deal.rows.length === 0) throw new Error("deal11 not found");

  const classRow = await client.query(
    `SELECT id, advanced_options_json
     FROM deal_investor_class
     WHERE id = $1 AND deal_id = $2`,
    [CLASS_A_ID, DEAL_ID],
  );
  if (classRow.rows.length === 0) {
    throw new Error("Class A - Limited partners not found on deal11");
  }

  const mockContacts = await client.query(
    `SELECT id FROM contact WHERE lower(email) LIKE 'deal11.mock.%@example.com'`,
  );
  const mockIds = mockContacts.rows.map((r) => r.id);
  if (mockIds.length > 0) {
    await client.query(
      `DELETE FROM deal_investment
       WHERE deal_id = $1 AND contact_id = ANY($2::text[])`,
      [DEAL_ID, mockIds],
    );
    await client.query(
      `DELETE FROM deal_lp_investor
       WHERE deal_id = $1 AND contact_member_id = ANY($2::text[])`,
      [DEAL_ID, mockIds],
    );
    await client.query(`DELETE FROM contact WHERE id = ANY($1::uuid[])`, [
      mockIds,
    ]);
  }

  const meta = JSON.parse(deal.rows[0].class_setup_json || "{}");
  meta.targetRaise = String(TARGET_RAISE);
  meta.latestChanges =
    "Class A LP amounts matched to Candela (22 investors, $1,505,000 funded)";
  meta.updatedAt = new Date().toISOString();
  if (!meta.promote) meta.promote = { hurdles: [], shares: {} };

  await client.query(
    `UPDATE add_deal_form SET class_setup_json = $2 WHERE id = $1`,
    [DEAL_ID, JSON.stringify(meta)],
  );

  const adv = JSON.parse(classRow.rows[0].advanced_options_json || "{}");
  adv.classSetup = {
    ...(adv.classSetup ?? {}),
    actuallyFunded: String(ACTUALLY_FUNDED),
  };

  await client.query(
    `UPDATE deal_investor_class
     SET offering_size = $3,
         raise_amount_distributions = $4,
         status = 'active',
         advanced_options_json = $5,
         updated_at = now()
     WHERE id = $1 AND deal_id = $2`,
    [
      CLASS_A_ID,
      DEAL_ID,
      String(TARGET_RAISE),
      String(ACTUALLY_FUNDED),
      JSON.stringify(adv),
    ],
  );

  const now = new Date();
  const signedDate = "08/19/2026";
  const created = [];

  for (const inv of INVESTORS) {
    const email = mockEmail(inv.first, inv.last);
    const fullName = `${inv.first} ${inv.last}`;
    const classPct = pctOfClass(inv.amount);
    const entityPct = pctOfEntity(inv.amount);
    const amount = String(inv.amount);

    const contact = await client.query(
      `INSERT INTO contact (
         first_name, last_name, full_name, email, phone, note,
         tags, lists, owners, status, created_by, organization_id,
         is_portal_user, platform_admin_only, accreditation_status
       ) VALUES (
         $1, $2, $3, $4, '', 'Mock LP seeded for deal11 (Candela amounts)',
         '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'active', $5, $6,
         false, false, 'Accredited'
       )
       RETURNING id`,
      [inv.first, inv.last, fullName, email, SPONSOR_ID, ORG_ID],
    );
    const contactId = contact.rows[0].id;

    await client.query(
      `INSERT INTO deal_lp_investor (
         deal_id, added_by, contact_member_id, investor_name, email, role,
         profile_id, investor_class, committed_amount,
         percent_of_class_ownership, percent_of_class_distributions,
         entity_ownership_percent, distribution_allocation_percent,
         send_invitation_mail, doc_signed_date, profile_display_name
       ) VALUES (
         $1, $2, $3, $4, $5, 'LP Investor',
         'individual', $6, $7,
         $8, $8,
         $9, $9,
         'no', $10, $4
       )`,
      [
        DEAL_ID,
        SPONSOR_ID,
        contactId,
        fullName,
        email,
        CLASS_A_NAME,
        amount,
        classPct,
        entityPct,
        inv.funded ? signedDate : "pending",
      ],
    );

    await client.query(
      `INSERT INTO deal_investment (
         deal_id, offering_id, contact_id, contact_display_name, profile_id,
         investor_role, fund_approved, fund_approved_by, fund_approved_at,
         fund_approved_commitment_snapshot, status, investor_class,
         doc_signed_date, commitment_amount, extra_contribution_amounts,
         funding_method, investor_questionnaire_answers_json
       ) VALUES (
         $1, '', $2, $3, 'individual',
         'lp_investors', $4, $5, $6,
         $7, $8, $9,
         $10, $11, '[]'::jsonb,
         'wire_transfer',
         '{"accreditation_status":"Accredited"}'
       )`,
      [
        DEAL_ID,
        contactId,
        fullName,
        inv.funded,
        inv.funded ? SPONSOR_ID : null,
        inv.funded ? now : null,
        inv.funded ? amount : "",
        inv.funded ? "Funds fully received" : "Document signing started",
        CLASS_A_NAME,
        inv.funded ? signedDate : null,
        amount,
      ],
    );

    created.push({
      name: fullName,
      email,
      amount: inv.amount,
      funded: inv.funded,
      classPct,
    });
  }

  await client.query("COMMIT");

  console.log("deal11 Class A investors replaced with Candela amounts");
  console.log(`  investors: ${created.length}`);
  console.log(`  committed: $${committed.toLocaleString("en-US")}`);
  console.log(`  funded:    $${funded.toLocaleString("en-US")}`);
  for (const row of created) {
    console.log(
      `    ${row.funded ? "funded " : "pending"}  $${row.amount
        .toLocaleString("en-US")
        .padStart(7)}  ${row.name}`,
    );
  }
} catch (err) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error(err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
