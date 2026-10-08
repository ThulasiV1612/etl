require('dotenv').config()
const { Pool } = require('pg')
const openpyxl = null
async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })
  const dealId = 'd86cf5e9-4c53-4bea-b037-6130552a20c3'
  const lp = await pool.query(
    SELECT COALESCE(NULLIF(TRIM(source_profile_id),''),'') AS pid,
            investor_class, investor_name, email, profile_display_name
     FROM deal_lp_investor WHERE deal_id = $1`,
    [dealId]
  )
  console.log('lp count', lp.rows.length)
  // list pids
  const pids = new Set(lp.rows.map(r => r.pid.toLowerCase()).filter(Boolean))
  console.log('lp unique source_profile_id', pids.size)
  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
