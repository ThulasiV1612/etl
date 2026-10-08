/** @deprecated Use transformationService + validationService */
module.exports = {
  ...require('./transformationService'),
  validateBusinessRules: () => [],
  getRequiredExcelColumns: require('./columnMappingService').getRequiredExcelColumns,
}
