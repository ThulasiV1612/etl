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

  const lp = await pool.query(
    `SELECT id, deal_id, investor_name, email, contact_member_id, profile_id
     FROM deal_lp_investor
     WHERE LOWER(COALESCE(investor_name,'')) LIKE '%hussam%'
     LIMIT 5`
  )
  console.log('lp', lp.rows)

  if (lp.rows[0]?.contact_member_id) {
    const u = await pool.query(
      `SELECT id, email, first_name, last_name FROM users WHERE id = $1`,
      [lp.rows[0].contact_member_id]
    )
    console.log('user via contact_member_id', u.rows)
  }

  // how many redacted__ profile-id style vs name style
  const stats = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE email ~* '^redacted__[a-z0-9]{8,12}$') AS profile_id_like,
      COUNT(*) FILTER (WHERE email ~* '^redacted__[a-z]+_[a-z]+$') AS name_like,
      COUNT(*) FILTER (WHERE email ILIKE 'redacted__%') AS all_redacted_slug
    FROM users
  `)
  console.log('user email patterns', stats.rows[0])

  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
