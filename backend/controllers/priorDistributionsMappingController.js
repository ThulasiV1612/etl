const {
  processPriorDistributionsMapping,
} = require('../services/etl/priorDistributionsMappingService')

async function processPriorDistributionsMappingHandler(req, res) {
  const files = []
  if (Array.isArray(req.files)) {
    files.push(...req.files)
  } else if (req.files && typeof req.files === 'object') {
    if (Array.isArray(req.files.files)) files.push(...req.files.files)
    if (Array.isArray(req.files.file)) files.push(...req.files.file)
  }
  if (req.file) files.push(req.file)

  if (!files.length) {
    return res.status(400).json({
      success: false,
      error:
        'Please upload one or more Excel (.xlsx) distribution files ' +
        '(period Payment-details or distributions-paid).',
    })
  }

  try {
    const result = await processPriorDistributionsMapping({
      filePaths: files.map((f) => f.path),
      originalName: files.map((f) => f.originalname).join(', '),
      dealId: req.body.dealId || req.body.deal_id,
      inputDir: req.body.inputDir || req.body.input_dir || '',
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
  processPriorDistributionsMapping: processPriorDistributionsMappingHandler,
}
