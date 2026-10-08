require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const { Client } = require('pg')

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })

  await client.connect()

  const constraints = await client.query(`
    SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'add_deal_form'::regclass
      AND contype = 'c'
  `)

  console.log('CHECK constraints on add_deal_form:')
  console.log(JSON.stringify(constraints.rows, null, 2))

  const stages = await client.query(`
    SELECT DISTINCT deal_stage
    FROM add_deal_form
    WHERE deal_stage IS NOT NULL
    ORDER BY deal_stage
    LIMIT 30
  `)

  console.log('\nExisting deal_stage values in DB:')
  console.log(stages.rows.map((row) => row.deal_stage))

  await client.end()
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
