import pg from "pg";

const DEAL_ID = "35fb4db2-ddc1-4b6c-8de3-1035bc8851d2";
const CLASS_B_NAME = "Class B - General partners";
const SPONSOR_ID = "b2c15cb6-1678-4819-9d24-6fdd8d192064";
const ORG_ID = "3f8a9c1e-2b4d-4f6a-8c7e-1d0e9a8b7c6d";

/** Same Class B ownership mix as Candela Retail Development. */
const GPS = [
  {
    first: "Northridge",
    last: "Holdings",
    entity: "Northridge Realty Group",
    profile: "llc_corp_trust_etc",
    classPct: "57.81",
    entityPct: "17.343",
  },
  {
    first: "Blake",
    last: "Harlan",
    entity: "Harlan Management LLC",
    profile: "llc_corp_trust_etc",
    classPct: "6.67",
    entityPct: "2.001",
  },
  {
    first: "Celeste",
    last: "Park",
    entity: "Park Growth LLC",
    profile: "llc_corp_trust_etc",
    classPct: "6.67",
    entityPct: "2.001",
  },
  {
    first: "Dana",
    last: "Morse",
    entity: "Morse Point Capital LLC",
    profile: "llc_corp_trust_etc",
    classPct: "6.67",
    entityPct: "2.001",
  },
  {
    first: "Elliot",
    last: "Kane",
    entity: "Kane Management Inc",
    profile: "llc_corp_trust_etc",
    classPct: "6.67",
    entityPct: "2.001",
  },
  {
    first: "Golden",
    last: "Oak",
    entity: "Oakleaf 1, LLC",
    profile: "llc_corp_trust_etc",
    classPct: "5.53",
    entityPct: "1.659",
  },
  {
    first: "Harper",
    last: "Miles",
    entity: "Miles Circle Holdings, LLC",
    profile: "llc_corp_trust_etc",
    classPct: "4.45",
    entityPct: "1.335",
  },
  {
    first: "Irene",
    last: "Walsh",
    entity: "Irene Walsh",
    profile: "individual",
    classPct: "3.16",
    entityPct: "94.8",
  },
  {
    first: "James",
    last: "Ortega",
    entity: "James Ortega",
    profile: "individual",
    classPct: "2.37",
    entityPct: "71.1",
  },
];

function mockEmail(first, last) {
  return `deal11.mock.gp.${first.toLowerCase()}.${last.toLowerCase()}@example.com`;
}

const pool = new pg.Pool({
  connectionString:
    "postgresql://postgres:Postgresql123@localhost:5432/syndicationx_17Aug2026",
});
const client = await pool.connect();

try {
  const classSum = GPS.reduce((s, g) => s + Number(g.classPct), 0);
  if (Math.abs(classSum - 100) > 0.02) {
    throw new Error(`Class B ownership sums to ${classSum}, expected 100`);
  }

  await client.query("BEGIN");

  const already = await client.query(
    `SELECT email FROM deal_lp_investor
     WHERE deal_id = $1 AND lower(email) LIKE 'deal11.mock.gp.%@example.com'`,
    [DEAL_ID],
  );
  if (already.rows.length > 0) {
    throw new Error(
      `Class B mocks already exist: ${already.rows.map((r) => r.email).join(", ")}`,
    );
  }

  const now = new Date();
  const signedDate = "08/19/2026";
  const created = [];

  for (const gp of GPS) {
    const email = mockEmail(gp.first, gp.last);
    const personName = `${gp.first} ${gp.last}`;
    const displayName = gp.entity;
    const isLlc = gp.profile === "llc_corp_trust_etc";

    const contact = await client.query(
      `INSERT INTO contact (
         first_name, last_name, full_name, email, phone, note,
         tags, lists, owners, status, created_by, organization_id,
         is_portal_user, platform_admin_only, accreditation_status
       ) VALUES (
         $1, $2, $3, $4, '', 'Mock Class B GP seeded for deal11 (Candela mix)',
         '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'active', $5, $6,
         false, false, 'Accredited'
       )
       RETURNING id`,
      [gp.first, gp.last, personName, email, SPONSOR_ID, ORG_ID],
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
         $6, $7, '0',
         $8, $8,
         $9, $9,
         'no', $10, $11
       )`,
      [
        DEAL_ID,
        SPONSOR_ID,
        contactId,
        personName,
        email,
        gp.profile,
        CLASS_B_NAME,
        gp.classPct,
        gp.entityPct,
        signedDate,
        displayName,
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
         $1, '', $2, $3, $4,
         'lp_investors', true, $5, $6,
         '0', 'Funds fully received', $7,
         $8, '0', '[]'::jsonb,
         'wire_transfer',
         '{"accreditation_status":"Accredited"}'
       )`,
      [
        DEAL_ID,
        contactId,
        displayName,
        gp.profile,
        SPONSOR_ID,
        now,
        CLASS_B_NAME,
        signedDate,
      ],
    );

    created.push({
      name: personName,
      display: displayName,
      classPct: gp.classPct,
      llc: isLlc,
    });
  }

  await client.query("COMMIT");

  console.log(`Added ${created.length} Class B GP investors to deal11`);
  for (const row of created) {
    console.log(
      `  ${row.classPct.padStart(6)}%  ${row.display}${row.llc ? " (LLC)" : ""}`,
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
