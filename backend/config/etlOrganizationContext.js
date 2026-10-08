/**
 * Shared Organization ID context for ETL uploads.
 *
 * To apply the UI Organization ID input to any DB column, add in etlMappings.js defaults:
 *
 *   organization_id: { source: 'context', key: 'organizationId' },
 *   // or for tables that use company_id:
 *   company_id: { source: 'context', key: 'organizationId' },
 *
 * Upload types with such defaults automatically require Organization ID in the UI
 * and apply it to every row during transformation.
 */
const etlMappings = require('./etlMappings')

const ORGANIZATION_CONTEXT_KEY = 'organizationId'

function getOrganizationContextFields(uploadType) {
  const config = etlMappings[uploadType]
  if (!config?.defaults) return []

  return Object.entries(config.defaults)
    .filter(([, rule]) => rule.source === 'context' && rule.key === ORGANIZATION_CONTEXT_KEY)
    .map(([databaseColumn]) => databaseColumn)
}

function uploadTypeRequiresOrganizationId(uploadType) {
  return getOrganizationContextFields(uploadType).length > 0
}

module.exports = {
  ORGANIZATION_CONTEXT_KEY,
  getOrganizationContextFields,
  uploadTypeRequiresOrganizationId,
}
