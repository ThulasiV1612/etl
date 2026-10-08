const path = require('path')
const fs = require('fs')
const { getPool } = require('../services/dbService')
const { logAudit } = require('../services/logger')

function ensureMediaDirs() {
  const root = path.join(__dirname, '..', 'uploads', 'media')
  const docs = path.join(root, 'documents')
  const images = path.join(root, 'images')

  ;[root, docs, images].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  })

  return { root, docs, images }
}

async function uploadMedia(req, res) {
  const inferredType = req.files?.[0]
    ? (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(path.extname(req.files[0].originalname).toLowerCase())
      ? 'image'
      : 'document')
    : null

  const mediaType = String(req.body.mediaType || inferredType || '').toLowerCase()
  const entityType = String(req.body.entityType || 'DEAL').toUpperCase()
  const dealId = req.body.dealId || null
  const organizationId = req.body.organizationId || null
  const documentSection = String(req.body.documentSection || '').trim() || null
  const createdBy = req.body.createdBy || 'web-user'

  if (!['document', 'image'].includes(mediaType)) {
    cleanupFiles(req.files)
    return res.status(400).json({ error: 'mediaType must be document or image' })
  }

  if (!req.files || !req.files.length) {
    return res.status(400).json({ error: 'No files uploaded' })
  }

  if ((entityType === 'INVESTORS' || entityType === 'MEMBERS' || entityType === 'DEAL') && !dealId) {
    cleanupFiles(req.files)
    return res.status(400).json({ error: 'Deal ID is required for this media upload. Select a deal name first.' })
  }

  if (mediaType === 'document' && !documentSection) {
    cleanupFiles(req.files)
    return res.status(400).json({ error: 'Document section is required' })
  }

  try {
    const db = await getPool()
    const saved = []

    for (const file of req.files) {
      const result = await db.query(
        `INSERT INTO etl_media_uploads
         (entity_type, media_type, document_section, deal_id, organization_id, original_name, stored_name, file_path, file_size, mime_type, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          entityType,
          mediaType,
          documentSection,
          dealId,
          organizationId,
          file.originalname,
          file.filename,
          file.path,
          file.size,
          file.mimetype,
          createdBy,
        ]
      )

      saved.push(result.rows[0])
      logAudit(`Media uploaded | type=${mediaType} section=${documentSection || '-'} entity=${entityType} file=${file.originalname}`)
    }

    if (entityType === 'DEAL' && mediaType === 'image' && dealId) {
      await attachDealAssetPaths({
        db,
        dealId,
        filePaths: saved.map((row) => row.file_path),
      })
    }

    return res.status(201).json({
      success: true,
      mediaType,
      entityType,
      documentSection,
      count: saved.length,
      files: saved.map((row) => ({
        mediaId: row.media_id,
        originalName: row.original_name,
        fileSize: row.file_size,
        dealId: row.deal_id,
        documentSection: row.document_section,
        createdAt: row.created_at,
      })),
    })
  } catch (error) {
    cleanupFiles(req.files)
    return res.status(500).json({ error: error.message })
  }
}

async function attachDealAssetPaths({ db, dealId, filePaths }) {
  if (!filePaths?.length) return

  const dealResult = await db.query(
    'SELECT id, asset_image_path, offering_gallery_paths FROM add_deal_form WHERE id = $1 LIMIT 1',
    [dealId]
  )
  if (!dealResult.rows.length) {
    throw new Error(`Selected deal does not exist: ${dealId}`)
  }

  const deal = dealResult.rows[0]
  let gallery = []
  try {
    gallery = JSON.parse(deal.offering_gallery_paths || '[]')
    if (!Array.isArray(gallery)) gallery = []
  } catch {
    gallery = []
  }

  const relativePaths = filePaths.map((filePath) => {
    const normalized = String(filePath).replace(/\\/g, '/')
    const marker = '/uploads/'
    const index = normalized.toLowerCase().lastIndexOf(marker)
    return index >= 0 ? normalized.slice(index) : normalized
  })

  gallery = [...gallery, ...relativePaths]
  const assetImagePath = deal.asset_image_path || relativePaths[0]

  await db.query(
    `UPDATE add_deal_form
     SET asset_image_path = $2,
         offering_gallery_paths = $3
     WHERE id = $1`,
    [dealId, assetImagePath, JSON.stringify(gallery)]
  )
}

async function listMedia(req, res) {
  const db = await getPool()
  const values = []
  const filters = []

  if (req.query.entityType) {
    values.push(String(req.query.entityType).toUpperCase())
    filters.push(`entity_type = $${values.length}`)
  }

  if (req.query.mediaType) {
    values.push(String(req.query.mediaType).toLowerCase())
    filters.push(`media_type = $${values.length}`)
  }

  if (req.query.dealId) {
    values.push(req.query.dealId)
    filters.push(`deal_id = $${values.length}`)
  }

  if (req.query.documentSection) {
    values.push(String(req.query.documentSection))
    filters.push(`document_section = $${values.length}`)
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  const result = await db.query(
    `SELECT * FROM etl_media_uploads ${where} ORDER BY media_id DESC LIMIT 100`,
    values
  )

  return res.json({ media: result.rows })
}

function cleanupFiles(files) {
  if (!files) return
  files.forEach((file) => {
    if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path)
  })
}

module.exports = {
  uploadMedia,
  listMedia,
  ensureMediaDirs,
}
