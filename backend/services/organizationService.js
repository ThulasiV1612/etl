const { getPool } = require('./dbService')

async function listOrganizations() {
  const db = await getPool()
  const result = await db.query(
    `SELECT
       id::text AS id,
       name,
       status,
       created_at
     FROM companies
     ORDER BY NULLIF(TRIM(name), '') ASC NULLS LAST, created_at DESC`
  )

  return result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name || '').trim() || 'Unnamed organization',
    status: row.status || null,
    createdAt: row.created_at,
  }))
}

module.exports = {
  listOrganizations,
}
