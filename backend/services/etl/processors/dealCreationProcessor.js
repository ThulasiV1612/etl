const databaseInsertService = require('../databaseInsertService')
const columnMappingService = require('../columnMappingService')

async function processDealCreationRow({ data, rowNumber }) {
  const errors = await databaseInsertService.validateRelationship({
    uploadType: 'DEAL_CREATION',
    data,
    rowNumber,
  })

  if (errors.length) {
    return { success: false, errors }
  }

  const result = await databaseInsertService.insertRecord({
    uploadType: 'DEAL_CREATION',
    data,
  })

  if (!result.success) {
    return {
      success: false,
      errors: [{
        rowNumber,
        errorType: 'LOAD',
        errorMessage: result.error,
      }],
    }
  }

  return { success: true, entityId: result.entityId }
}

function getDealCreationTemplate() {
  return columnMappingService.getTemplateColumns('DEAL_CREATION')
}

module.exports = {
  processDealCreationRow,
  getDealCreationTemplate,
}
