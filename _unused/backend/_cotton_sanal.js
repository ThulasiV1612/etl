require('dotenv').config()
const { Pool } = require('pg')

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })
  const dealId = '3876ab45-cb76-4930-9956-f5f19c334453'

  // Collapse Sanal duplicate: same source_profile_id+class, different contacts — keep the real-email user
  const sanal = await pool.query(
    `SELECT id, contact_member_id, email, source_profile_id, investor_class
     FROM deal_lp_investor
     WHERE deal_id = $1 AND source_profile_id = 'CBLSRUYYNU'
     ORDER BY CASE WHEN email LIKE '%@%' THEN 0 ELSE 1 END, created_at`,
    [dealId]
  )
  console.log('sanal rows', sanal.rows)
  if (sanal.rows.length > 1) {
    const keep = sanal.rows[0]
    const drop = sanal.rows.slice(1).map((r) => r.id)
    // Repoint investments from dropped contacts to keep contact if same profile
    for (const row of sanal.rows.slice(1)) {
      await pool.query(
        `UPDATE deal_investment
         SET contact_id = $1
         WHERE deal_id = $2 AND contact_id = $3
           AND investor_class = $4`,
        [keep.contact_member_id, dealId, row.contact_member_id, row.investor_class]
      )
    }
    const del = await pool.query(
      `DELETE FROM deal_lp_investor WHERE id = ANY($1::uuid[]) RETURNING id`,
      [drop]
    )
    console.log('removed sanal dups', del.rowCount, 'kept', keep.email)
  }

  const after = await pool.query(
    `SELECT COUNT(*)::int AS seats, COUNT(DISTINCT contact_member_id)::int AS contacts
     FROM deal_lp_investor WHERE deal_id = $1`,
    [dealId]
  )
  console.log('after', after.rows[0])
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
