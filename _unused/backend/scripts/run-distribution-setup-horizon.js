require('dotenv').config()
const {
  runDistributionSetupEtl,
  readDistributionWorkbook,
} = require('../services/etl/distributionSetupEtlService')
const { getPool } = require('../services/dbService')

async function main() {
  const filePath = require('path').join(
    __dirname,
    '..',
    '..',
    'ETL_Distribution_Setup_FILLED_Horizon.xlsx'
  )

  const preview = readDistributionWorkbook(filePath)
  console.log(
    'PREVIEW deals=',
    preview.deals.map((d) => ({
      dealName: d.dealName,
      rows: d.rows.length,
      kinds: d.rows.map((r) => `${r.source}:${r.kind}`),
    }))
  )

  const db = await getPool()
  const deals = await db.query(
    `SELECT id, deal_name FROM add_deal_form
     WHERE LOWER(TRIM(deal_name)) LIKE '%horizon%'
     ORDER BY created_at DESC LIMIT 5`
  )
  console.log('DEALS', deals.rows)

  if (deals.rows[0]) {
    const classes = await db.query(
      `SELECT id, name, subscription_type FROM deal_investor_class WHERE deal_id = $1`,
      [deals.rows[0].id]
    )
    console.log('CLASSES', classes.rows)
  }

  const result = await runDistributionSetupEtl({
    filePath,
    onRowResult: async (r) => console.log('ROW', r.success ? 'OK' : 'FAIL', r.message || r.errorMessage),
  })
  console.log('RESULT', JSON.stringify(result, null, 2))

  if (result.dealReports[0]) {
    const saved = await db.query(
      `SELECT deal_name, distribution_setup_json FROM add_deal_form WHERE id = $1`,
      [result.dealReports[0].dealId]
    )
    console.log('SAVED JSON', saved.rows[0]?.distribution_setup_json)
  }

  process.exit(result.failedCount ? 1 : 0)
}

main().catch((error) => {
  console.error('FAIL', error)
  process.exit(1)
})
