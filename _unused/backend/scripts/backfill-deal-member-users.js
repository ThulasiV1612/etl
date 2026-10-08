require('dotenv').config()
const { Pool } = require('pg')
const {
  ensureSignedUpDealMemberUser,
} = require('../services/etl/inviteUserEtlService')
const { resolveDealOrganizationId } = require('../services/etl/inviteUserEtlService')

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })
  const client = await pool.connect()

  try {
    const rows = await client.query(`
      SELECT dm.id, dm.deal_id, dm.contact_member_id, dm.deal_member_role,
        EXISTS(SELECT 1 FROM users u WHERE u.id::text = TRIM(dm.contact_member_id)) AS in_users,
        EXISTS(SELECT 1 FROM contact c WHERE c.id::text = TRIM(dm.contact_member_id)) AS in_contact,
        c.email, c.first_name, c.last_name, c.phone,
        d.organization_id
      FROM deal_member dm
      LEFT JOIN contact c ON c.id::text = TRIM(dm.contact_member_id)
      LEFT JOIN add_deal_form d ON d.id = dm.deal_id
      ORDER BY dm.created_at
    `)

    console.log('before summary')
    console.log({
      total: rows.rows.length,
      inUsers: rows.rows.filter((r) => r.in_users).length,
      inContactOnly: rows.rows.filter((r) => r.in_contact && !r.in_users).length,
    })

    await client.query('BEGIN')
    let updated = 0
    for (const row of rows.rows) {
      if (row.in_users) continue
      if (!row.in_contact) {
        console.log('skip no contact', row.id, row.contact_member_id)
        continue
      }

      const orgId =
        row.organization_id ||
        (await resolveDealOrganizationId(client, row.deal_id))

      const userResult = await ensureSignedUpDealMemberUser(client, {
        contactId: String(row.contact_member_id),
        organizationId: orgId,
        dealMemberRole: row.deal_member_role || 'Member',
        email: row.email || '',
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        phone: row.phone || '',
      })

      await client.query(
        `UPDATE deal_member
         SET contact_member_id = $2, updated_at = NOW()
         WHERE id = $1`,
        [row.id, userResult.userId]
      )
      updated++
      console.log(
        `fixed ${row.email} → user ${userResult.userId} role=${userResult.role} created=${userResult.created}`
      )
    }
    await client.query('COMMIT')

    const roles = await client.query(`
      SELECT role, COUNT(*)::int AS n FROM users GROUP BY role ORDER BY n DESC
    `)
    console.log('users by role after', roles.rows)
    console.log('updated deal_member rows', updated)
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
