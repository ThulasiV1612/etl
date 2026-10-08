require('dotenv').config()

const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')
const config = require('./config/database')
const etlRoutes = require('./routes/etlRoutes')
const dealRoutes = require('./routes/dealRoutes')
const organizationRoutes = require('./routes/organizationRoutes')
const mediaRoutes = require('./routes/mediaRoutes')
const { initDatabase } = require('./services/dbService')

const app = express()

const dirs = [
  'logs',
  'uploads',
  'images',
  'downloads',
  path.join('uploads', 'media'),
  path.join('uploads', 'media', 'documents'),
  path.join('uploads', 'media', 'images'),
]
dirs.forEach((dir) => {
  const dirPath = path.join(__dirname, dir)
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
})

app.use(cors({ origin: config.frontendUrl }))
app.use(express.json())
app.use('/images', express.static(path.join(__dirname, 'images')))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))
app.use('/downloads', express.static(path.join(__dirname, 'downloads')))
app.use(
  '/mapFolder',
  express.static(path.join(__dirname, '..', 'python', 'mapFolder'))
)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'syndication-etl-api' })
})

app.use('/api/etl', etlRoutes)
app.use('/api/deals', dealRoutes)
app.use('/api/organizations', organizationRoutes)
app.use('/api/media', mediaRoutes)

app.use((err, _req, res, _next) => {
  if (
    err.code === 'LIMIT_FILE_SIZE' ||
    err.message?.includes('Excel') ||
    err.message?.includes('PDF') ||
    err.message?.includes('image')
  ) {
    return res.status(400).json({ error: err.message })
  }
  return res.status(500).json({ error: err.message || 'Internal server error' })
})

async function startServer() {
  try {
    await initDatabase()
    console.log('Database initialized successfully')

    app.listen(config.port, () => {
      console.log(`Backend API running on http://localhost:${config.port}`)
      console.log(`Health:      GET  http://localhost:${config.port}/api/health`)
      console.log(`List Deals:  GET  http://localhost:${config.port}/api/deals`)
      console.log(`ETL Upload:  POST http://localhost:${config.port}/api/etl/migrate`)
      console.log(`Cash Flow:   POST http://localhost:${config.port}/api/etl/cash-flow/process`)
      console.log(`Classes PDF: POST http://localhost:${config.port}/api/etl/classes/process`)
      console.log(`Distributions: POST http://localhost:${config.port}/api/etl/distributions/process`)
      console.log(`Prior Dist:  POST http://localhost:${config.port}/api/etl/distributions/prior/process`)
      console.log(`ETL Dashboard: GET  http://localhost:${config.port}/api/etl/dashboard`)
    })
  } catch (error) {
    console.error('Failed to start server:', error.message || error)
    if (error.code) console.error('Error code:', error.code)

    if (error.code === 'DB_CONFIG_MISSING') {
      console.error('\nFix: copy backend/.env.example to backend/.env and set DB_PASSWORD.')
    }

    if (error.code === '28P01') {
      console.error('\nFix: DB_PASSWORD in backend/.env does not match your PostgreSQL password.')
    }

    process.exit(1)
  }
}

startServer()
