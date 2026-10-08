require('dotenv').config()

const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env')

function buildDbConfig(database) {
  const password = process.env.DB_PASSWORD

  if (password === undefined || password === null || String(password).trim() === '') {
    const hint = fs.existsSync(envPath)
      ? 'Set DB_PASSWORD in backend/.env to your PostgreSQL password.'
      : 'Copy backend/.env.example to backend/.env and set DB_PASSWORD.'

    const error = new Error(`Database configuration error: DB_PASSWORD is missing. ${hint}`)
    error.code = 'DB_CONFIG_MISSING'
    throw error
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: String(password),
    // database: database || process.env.DB_NAME || 'migrations_testing_db_SyndicationX',
    database: database || process.env.DB_NAME || 'updated_db',
  }
}

module.exports = {
  port: process.env.PORT || 3001,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  db: buildDbConfig(),
  buildDbConfig,
}
