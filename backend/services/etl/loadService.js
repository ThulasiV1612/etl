const databaseInsertService = require('./databaseInsertService')

/** @deprecated Use databaseInsertService directly */
module.exports = {
  ...databaseInsertService,
  dealExists: async (dealRef) => {
    const dealId = await databaseInsertService.resolveDealId(dealRef)
    return dealId !== null
  },
  insertDealCreation: databaseInsertService.insertAddDealForm,
  insertInvestorRecord: databaseInsertService.insertDealLpInvestor,
  getProcessor(uploadType) {
    return {
      async loadRecord(data) {
        return databaseInsertService.insertRecord({ uploadType, data })
      },
      async validateRelationship(data, rowNumber) {
        return databaseInsertService.validateRelationship({ uploadType, data, rowNumber })
      },
    }
  },
  processors: {},
}
