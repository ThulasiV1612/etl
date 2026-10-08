/**
 * Insert Cortexsce org data from the 14 Aug dump.
 * Safe to re-run (upserts).
 *
 * From backend/:
 *   node scripts/seed-cortexsce-org.js
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

  const sqlPath = path.join(__dirname, 'seed-cortexsce-org.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')

  await client.connect()
  console.log(`Database: ${process.env.DB_NAME}`)

  try {
    await client.query(sql)

    const company = await client.query(
      `SELECT id, name, status, ghl_location_id, ghl_location_status
       FROM companies
       WHERE id = '633c510a-292a-425c-b11f-3591340c0985'`
    )
    const user = await client.query(
      `SELECT id, email, username, role, user_status, organization_id
       FROM users
       WHERE id = 'b0077501-e91e-4ebf-8422-158f9788e397'`
    )
    const membership = await client.query(
      `SELECT id, user_id, company_id, role
       FROM user_company_membership
       WHERE company_id = '633c510a-292a-425c-b11f-3591340c0985'`
    )
    const sessions = await client.query(
      `SELECT id, login_at, logout_at
       FROM user_portal_sessions
       WHERE user_id = 'b0077501-e91e-4ebf-8422-158f9788e397'`
    )
    const tokens = await client.query(
      `SELECT id, token_type, expires_at
       FROM user_auth_tokens
       WHERE user_id = 'b0077501-e91e-4ebf-8422-158f9788e397'`
    )
    const navigations = await client.query(
      `SELECT id, page_path, page_label, visit_count
       FROM user_page_navigations
       WHERE user_id = 'b0077501-e91e-4ebf-8422-158f9788e397'`
    )
    const audits = await client.query(
      `SELECT count(*)::int AS count
       FROM soc_auth_audit_logs
       WHERE id IN (
         '12a4e418-d90a-4ea0-8468-a8672f733b02',
         'ceb44915-4d21-4ea5-828d-ce072b13dc4c',
         'd9795c43-6083-4cd3-9931-04b25086544b',
         'f24cc708-d9bc-4f7e-815d-099524069413',
         '87069ed5-6f91-4799-bfe3-14e2603b542e',
         '799d7e74-363a-4069-bacb-dce82f1225a5',
         'fad31937-bdeb-4c7e-8b93-f7e209718abd',
         '47f4bd6f-e2f2-4707-bcf9-98cd692c91e5',
         'eab7f2a8-12aa-47d5-bef5-95b1c6a43418',
         '954cef5b-b54c-479a-8665-128f06593404',
         '4f1be4be-f0ec-44f2-b380-d8e9ffbc4a39',
         '4249b885-6de1-4dc9-9ed2-c75fff47da98',
         '51d76a28-9b9b-4738-9eeb-a201288516b3',
         '0dd14482-d4c1-498c-8a1c-15af7386451c',
         '4634acad-7786-4f22-bc61-05a19d4e5ce9',
         'feddec40-0af8-463c-b721-1c9b88f6a16d',
         '09c95e49-2a1e-4d6a-aa0b-ef4716d4a541',
         '7988c367-64f1-42c7-9686-c6f425a23dd8',
         'bdbcc354-c18b-4015-b49b-669d03cfcef3',
         'a2d1d0a3-0efd-4fe4-85f0-921d1a5de080',
         '9191c4e0-da85-4230-8b76-e922008fa2ef'
       )`
    )

    console.log('Cortexsce company:', company.rows[0])
    console.log('Admin user:', user.rows[0])
    console.log('Membership:', membership.rows[0])
    console.log(`Portal sessions: ${sessions.rowCount}`)
    console.log(`Auth tokens: ${tokens.rowCount}`)
    console.log(`Page navigations: ${navigations.rowCount}`)
    console.log(`Audit logs: ${audits.rows[0].count}`)
    console.log('Seed complete.')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
