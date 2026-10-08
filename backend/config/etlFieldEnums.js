/**
 * @deprecated Use backend/constants/deal.constants.js
 * Kept for backward compatibility with older imports.
 */
const {
  dealStageAliases,
  getAllowedDealFieldKeys,
} = require('../constants/deal.constants')

module.exports = {
  deal_stage: getAllowedDealFieldKeys('deal_stage'),
  deal_stage_aliases: {
    ...Object.fromEntries(
      Object.entries(dealStageAliases).map(([key, label]) => [label, key])
    ),
  },
}
