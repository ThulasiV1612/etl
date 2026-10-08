const { processDistributionsMapping } = require('../services/etl/distributionsMappingService')

async function processDistributionsMappingHandler(req, res) {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'Please upload an Excel (.xlsx) Class Mapping file.',
    })
  }

  try {
    const result = await processDistributionsMapping({
      filePath: req.file.path,
      originalName: req.file.originalname,
      dealId: req.body.dealId || req.body.deal_id,
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
  processDistributionsMapping: processDistributionsMappingHandler,
}
