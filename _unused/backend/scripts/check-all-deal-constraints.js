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
  const result = await client.query(`
    SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'add_deal_form'::regclass
      AND contype = 'c'
    ORDER BY conname
  `)
  console.log(JSON.stringify(result.rows, null, 2))
  await client.end()
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
