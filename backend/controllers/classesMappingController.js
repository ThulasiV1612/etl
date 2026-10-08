const { processClassesPdf } = require('../services/etl/classesMappingService')

async function processClassesMapping(req, res) {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'Please upload a PDF (.pdf) file.',
    })
  }

  try {
    const result = await processClassesPdf({
      filePath: req.file.path,
      originalName: req.file.originalname,
      dealName: req.body?.dealName || req.body?.deal_name || '',
    })
    return res.json(result)
  } catch (error) {
    const status = error.status || 500
    return res.status(status).json({
      success: false,
      error: error.message || 'Processing failed. Please review the uploaded file.',
    })
  }
}

module.exports = {
  processClassesMapping,
}
