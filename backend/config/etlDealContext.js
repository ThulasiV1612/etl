/**
 * Shared Deal ID context for ETL uploads.
 *
 * To apply the UI Deal dropdown to any DB column, add in etlMappings.js defaults:
 *
 *   deal_id: { source: 'context', key: 'dealId', force: true },
 *
 * Upload types with such defaults automatically require Deal selection in the UI
 * and apply the selected deal UUID to every row during transformation.
 */
const etlMappings = require('./etlMappings')

const DEAL_CONTEXT_KEY = 'dealId'

function getDealContextFields(uploadType) {
  const config = etlMappings[uploadType]
  if (!config?.defaults) return []

  return Object.entries(config.defaults)
    .filter(([, rule]) => rule.source === 'context' && rule.key === DEAL_CONTEXT_KEY)
    .map(([databaseColumn]) => databaseColumn)
}

function uploadTypeRequiresDealId(uploadType) {
  return getDealContextFields(uploadType).length > 0
}

module.exports = {
  DEAL_CONTEXT_KEY,
  getDealContextFields,
  uploadTypeRequiresDealId,
}
