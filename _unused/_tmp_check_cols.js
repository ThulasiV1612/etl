const { Pool } = require('./backend/node_modules/pg')

async function main() {
  const p = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'Postgresql123',
    database: 'migration_db',
  })
  try {
    const r = await p.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_name IN ('deal_lp_investor', 'deal_investment')
        AND (
          column_name ILIKE '%percent%'
          OR column_name ILIKE '%ownership%'
          OR column_name ILIKE '%allocation%'
        )
      ORDER BY 1, 2
    `)
    console.log(JSON.stringify(r.rows, null, 2))

    const all = await p.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'deal_lp_investor'
      ORDER BY ordinal_position
    `)
    console.log('deal_lp_investor columns:', all.rows.map((x) => x.column_name).join(', '))
  } finally {
    await p.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
