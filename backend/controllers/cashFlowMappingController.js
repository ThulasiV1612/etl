const { processCashFlowWorkbook } = require('../services/etl/cashFlowMappingService')

async function processCashFlowMapping(req, res) {
  const cashFlowFile = req.files?.file?.[0] || req.file
  const membersFile = req.files?.membersFile?.[0]

  if (!cashFlowFile) {
    return res.status(400).json({
      success: false,
      error: 'Please upload the Cash Flow investments Excel (.xlsx) file.',
    })
  }
  if (!membersFile) {
    return res.status(400).json({
      success: false,
      error: 'Please upload the Deal Members Excel (.xlsx) with sponsor names and emails.',
    })
  }

  try {
    const result = await processCashFlowWorkbook({
      filePath: cashFlowFile.path,
      originalName: cashFlowFile.originalname,
      membersFilePath: membersFile.path,
      membersOriginalName: membersFile.originalname,
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
  processCashFlowMapping,
}
