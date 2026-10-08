/**
 * Remove Cortexsce org data inserted by seed-cortexsce-org.js
 * Safe to re-run.
 *
 * From backend/:
 *   node scripts/remove-cortexsce-org.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })

  const sqlPath = path.join(__dirname, 'remove-cortexsce-org.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')

  await client.connect()
  console.log(`Database: ${process.env.DB_NAME}`)

  try {
    await client.query(sql)

    const leftover = await client.query(`
      SELECT
        (SELECT count(*) FROM companies WHERE id = '633c510a-292a-425c-b11f-3591340c0985') AS companies,
        (SELECT count(*) FROM users WHERE id = 'b0077501-e91e-4ebf-8422-158f9788e397') AS users,
        (SELECT count(*) FROM user_company_membership WHERE company_id = '633c510a-292a-425c-b11f-3591340c0985') AS memberships,
        (SELECT count(*) FROM user_portal_sessions WHERE user_id = 'b0077501-e91e-4ebf-8422-158f9788e397') AS sessions,
        (SELECT count(*) FROM user_auth_tokens WHERE user_id = 'b0077501-e91e-4ebf-8422-158f9788e397') AS tokens,
        (SELECT count(*) FROM user_page_navigations WHERE user_id = 'b0077501-e91e-4ebf-8422-158f9788e397') AS navigations,
        (SELECT count(*) FROM soc_auth_audit_logs
          WHERE user_id = 'b0077501-e91e-4ebf-8422-158f9788e397'
             OR identifier = 'matt@cortexsce.com'
             OR request_url LIKE '%633c510a-292a-425c-b11f-3591340c0985%'
             OR request_url LIKE '%matt%40cortexsce.com%'
        ) AS audits
    `)

    console.log('Leftover Cortexsce rows:', leftover.rows[0])
    console.log('Remove complete.')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
