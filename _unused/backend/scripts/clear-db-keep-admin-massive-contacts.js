/**
 * Wipe application data.
 * KEEP:
 *   - users: platform.admin@example.com only
 *   - companies: Massive Capital only
 *   - contact: all rows (repoint created_by / organization_id so FKs survive)
 *
 * Run from backend/:
 *   node scripts/clear-db-keep-admin-massive-contacts.js
 *
 * BACK UP THE DATABASE FIRST.
 */
require('dotenv').config()
const { Pool } = require('pg')

const ADMIN_EMAIL = 'platform.admin@example.com'
const MASSIVE_CAPITAL_ID = '3f8a9c1e-2b4d-4f6a-8c7e-1d0e9a8b7c6d'

async function tableExists(db, name) {
  const r = await db.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  )
  return r.rows.length > 0
}

async function deleteAll(db, table) {
  if (!(await tableExists(db, table))) {
    console.log(`skip missing ${table}`)
    return
  }
  const r = await db.query(`DELETE FROM ${table}`)
  console.log(`cleared ${table}: ${r.rowCount}`)
}

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
    await client.query('BEGIN')

    const admin = await client.query(
      `SELECT id, organization_id FROM users
       WHERE lower(trim(email)) = lower($1)
       LIMIT 1`,
      [ADMIN_EMAIL]
    )
    if (!admin.rows.length) {
      throw new Error(`Platform admin not found: ${ADMIN_EMAIL}`)
    }
    const adminId = admin.rows[0].id

    const company = await client.query(
      `SELECT id, name FROM companies WHERE id = $1 OR lower(name) = 'massive capital' LIMIT 1`,
      [MASSIVE_CAPITAL_ID]
    )
    if (!company.rows.length) {
      throw new Error('Massive Capital company not found')
    }
    const keepCompanyId = company.rows[0].id
    console.log('keep admin', adminId, 'company', keepCompanyId, company.rows[0].name)

    await client.query(
      `UPDATE users
       SET organization_id = $1, updated_at = now()
       WHERE id = $2 AND organization_id IS DISTINCT FROM $1`,
      [keepCompanyId, adminId]
    )

    // Keep contacts: repoint FKs before deleting other users/companies
    const contactFix = await client.query(
      `UPDATE contact
       SET created_by = $1,
           organization_id = COALESCE(organization_id, $2)
       WHERE created_by IS DISTINCT FROM $1
          OR organization_id IS NULL
          OR organization_id <> $2`,
      [adminId, keepCompanyId]
    )
    // Force all contacts under Massive Capital so other companies can be deleted
    const contactOrg = await client.query(
      `UPDATE contact SET organization_id = $1 WHERE organization_id IS DISTINCT FROM $1`,
      [keepCompanyId]
    )
    console.log('contact created_by/org fixed', {
      createdByUpdated: contactFix.rowCount,
      orgUpdated: contactOrg.rowCount,
    })

    // Activity / sessions
    await deleteAll(client, 'user_page_navigations')
    await deleteAll(client, 'user_portal_sessions')
    await deleteAll(client, 'user_auth_tokens')

    // Audit / mail / billing
    await deleteAll(client, 'investor_communication_logs')
    await deleteAll(client, 'member_admin_audit_logs')
    await deleteAll(client, 'company_admin_audit_logs')
    await deleteAll(client, 'soc_auth_audit_logs')
    await deleteAll(client, 'company_billing_events')
    await deleteAll(client, 'company_billing_invoices')
    await deleteAll(client, 'company_billing_payment_methods')
    await deleteAll(client, 'distribution_logs')
    await deleteAll(client, 'investor_distribution_payouts')
    await deleteAll(client, 'investor_checkout_payments')
    await deleteAll(client, 'platform_signup_notification')

    // eSign
    await deleteAll(client, 'esign_reusable_template')
    await deleteAll(client, 'investment_signatures')

    // Membership / CRM lists (keep contact rows)
    await deleteAll(client, 'user_company_membership')
    await deleteAll(client, 'contact_email_template')
    await deleteAll(client, 'organization_contact_tag')
    await deleteAll(client, 'organization_contact_list')

    // Investor profile book
    await deleteAll(client, 'user_beneficiaries')
    await deleteAll(client, 'user_saved_addresses')
    await deleteAll(client, 'user_investor_profiles')

    // Deal graph
    await deleteAll(client, 'deal_investment')
    await deleteAll(client, 'deal_investor_class')
    await deleteAll(client, 'deal_member')
    await deleteAll(client, 'deal_lp_investor')
    await deleteAll(client, 'deal_asset')
    await deleteAll(client, 'assigning_deal_user')
    await deleteAll(client, 'add_deal_form')
    await deleteAll(client, 'deals')
    await deleteAll(client, 'investors')

    // Company settings
    await deleteAll(client, 'company_workspace_tab_settings')

    // ETL operational tables
    await deleteAll(client, 'etl_error_log')
    await deleteAll(client, 'etl_stage_log')
    await deleteAll(client, 'etl_record_status')
    await deleteAll(client, 'etl_contact_review')
    await deleteAll(client, 'etl_media_uploads')
    await deleteAll(client, 'etl_file_tracking')
    await deleteAll(client, 'etl_job_master')
    await deleteAll(client, 'etl_column_mapping')

    // users — keep platform admin only
    const delUsers = await client.query(
      `DELETE FROM users WHERE id <> $1`,
      [adminId]
    )
    console.log('deleted users', delUsers.rowCount)

    // companies — keep Massive Capital only
    const delCompanies = await client.query(
      `DELETE FROM companies WHERE id <> $1`,
      [keepCompanyId]
    )
    console.log('deleted companies', delCompanies.rowCount)

    await client.query('COMMIT')

    const usersLeft = await client.query(
      `SELECT id, email, role, organization_id FROM users`
    )
    const companiesLeft = await client.query(
      `SELECT id, name, status FROM companies`
    )
    const contactsLeft = await client.query(
      `SELECT COUNT(*)::int AS n FROM contact`
    )
    const dealsLeft = await client.query(
      `SELECT COUNT(*)::int AS n FROM add_deal_form`
    )

    console.log('KEEP users', usersLeft.rows)
    console.log('KEEP companies', companiesLeft.rows)
    console.log('KEEP contacts', contactsLeft.rows[0])
    console.log('deals remaining', dealsLeft.rows[0])
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
