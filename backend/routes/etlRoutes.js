const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const {
  getUploadTypes,
  getSchema,
  validateUpload,
  startMigration,
  retryFailed,
  getJobDetails,
  listJobs,
  downloadErrorReport,
  getDashboard,
  getColumnMappings,
  listContactReviews,
  resolveContactReviewAction,
} = require('../controllers/etlController')
const { processCashFlowMapping } = require('../controllers/cashFlowMappingController')
const { processClassesMapping } = require('../controllers/classesMappingController')
const { processDistributionsMapping } = require('../controllers/distributionsMappingController')
const { processPriorDistributionsMapping } = require('../controllers/priorDistributionsMappingController')

const router = express.Router()

const uploadsDir = path.join(__dirname, '..', 'uploads')

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    const ext = path.extname(file.originalname) || '.xlsx'
    cb(null, `upload-${uniqueSuffix}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.xlsx', '.xls', '.csv', '.json']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error('Only Excel/CSV/JSON files (.xlsx, .xls, .csv, .json) are allowed'))
    }
  },
})

const uploadXlsx = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (ext === '.xlsx') {
      cb(null, true)
    } else {
      cb(new Error('Please upload an Excel (.xlsx) file.'))
    }
  },
})

const uploadPdf = multer({
  storage,
  limits: { fileSize: 40 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (ext === '.pdf') {
      cb(null, true)
    } else {
      cb(new Error('Please upload a PDF (.pdf) file.'))
    }
  },
})

router.get('/upload-types', getUploadTypes)
router.get('/schema', getSchema)
router.get('/dashboard', getDashboard)
router.get('/jobs', listJobs)
router.get('/jobs/:jobId', getJobDetails)
router.get('/jobs/:jobId/errors/download', downloadErrorReport)
router.get('/mappings/:uploadType', getColumnMappings)
router.post(
  '/cash-flow/process',
  uploadXlsx.fields([
    { name: 'file', maxCount: 1 },
    { name: 'membersFile', maxCount: 1 },
  ]),
  processCashFlowMapping
)
router.post('/classes/process', uploadPdf.single('file'), processClassesMapping)
router.post('/distributions/process', uploadXlsx.single('file'), processDistributionsMapping)
router.post(
  '/distributions/prior/process',
  uploadXlsx.fields([
    { name: 'file', maxCount: 1 },
    { name: 'files', maxCount: 50 },
  ]),
  processPriorDistributionsMapping
)
router.post('/validate', upload.single('file'), validateUpload)
router.post(
  '/migrate',
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'profileFile', maxCount: 1 },
    { name: 'addInvestorFile', maxCount: 1 },
  ]),
  (req, res, next) => {
    // Normalize dual/single uploads so startMigration can use req.file for single-file types
    if (!req.file && req.files?.file?.[0]) {
      req.file = req.files.file[0]
    }
    next()
  },
  startMigration
)
router.post('/jobs/:jobId/retry', retryFailed)
router.get('/contact-reviews', listContactReviews)
router.post('/contact-reviews/:reviewId/resolve', resolveContactReviewAction)

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'syndication-etl' })
})

module.exports = router
