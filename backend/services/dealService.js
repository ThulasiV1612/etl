const { getPool } = require('./dbService')

async function listDeals() {
  const db = await getPool()
  const result = await db.query(
    `SELECT
       id,
       deal_name,
       deal_stage,
       organization_id,
       created_at,
       property_name,
       internal_name
     FROM add_deal_form
     ORDER BY NULLIF(TRIM(deal_name), '') ASC NULLS LAST, created_at DESC`
  )

  return result.rows.map((row) => {
    const dealName =
      String(row.deal_name || '').trim() ||
      String(row.property_name || '').trim() ||
      String(row.internal_name || '').trim() ||
      'Unnamed deal'

    return {
      id: row.id,
      dealName,
      dealStage: row.deal_stage || null,
      organizationId: row.organization_id,
      createdAt: row.created_at,
    }
  })
}

module.exports = {
  listDeals,
}
