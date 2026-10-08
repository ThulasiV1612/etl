const express = require('express')
const multer = require('multer')
const path = require('path')
const { uploadMedia, listMedia, ensureMediaDirs } = require('../controllers/mediaController')

const router = express.Router()
const dirs = ensureMediaDirs()

const DOCUMENT_EXTS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.zip']
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']

function resolveMediaType(req, file) {
  const fromBody = String(req.body?.mediaType || '').toLowerCase()
  if (fromBody === 'document' || fromBody === 'image') return fromBody

  const ext = path.extname(file.originalname).toLowerCase()
  if (IMAGE_EXTS.includes(ext)) return 'image'
  if (DOCUMENT_EXTS.includes(ext)) return 'document'
  return null
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const mediaType = resolveMediaType(req, file)
    cb(null, mediaType === 'image' ? dirs.images : dirs.docs)
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    const ext = path.extname(file.originalname) || ''
    cb(null, `media-${uniqueSuffix}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mediaType = resolveMediaType(req, file)
    const ext = path.extname(file.originalname).toLowerCase()

    if (mediaType === 'document') {
      if (DOCUMENT_EXTS.includes(ext)) return cb(null, true)
      return cb(new Error('Only document files (.pdf, .doc, .docx, .xls, .xlsx, .csv, .txt, .zip) are allowed'))
    }

    if (mediaType === 'image') {
      if (IMAGE_EXTS.includes(ext)) return cb(null, true)
      return cb(new Error('Only image files (.jpg, .jpeg, .png, .webp, .gif) are allowed'))
    }

    return cb(new Error('Unsupported file type. Use document or image formats.'))
  },
})

router.post('/upload', upload.array('files', 20), uploadMedia)
router.get('/', listMedia)

module.exports = router
