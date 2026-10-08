/**
 * ETL_Distribution_Setup_FILLED_*.xlsx / .payload.json
 * Sheets: Deal_Meta, Waterfall_Operating, Waterfall_Capital (Dist_Setup_Seed alias)
 * Spec: etl-distribution-setup-mapping.mdc
 */

const DISTRIBUTION_SHEET_ALIASES = {
  dealMeta: ['deal meta', 'deal_meta', 'meta'],
  operating: [
    'waterfall operating',
    'waterfall_operating',
    'operating',
  ],
  capital: [
    'waterfall capital',
    'waterfall_capital',
    'capital',
    'capital event',
  ],
  distSetupSeed: ['dist setup seed', 'dist_setup_seed'],
  /** Explicitly ignored ledger sheets (Cash Flow paid / payment details) */
  paid: [
    'paid',
    'distributions paid',
    'distributions_paid',
    'distributions by investment',
    'ledger',
    'payment details',
    'prior runs',
    'prior_runs',
    'prior investor lines',
  ],
}

const DIST_ROW_COLUMNS = {
  deal_name: ['deal_name', 'deal name'],
  deal_id: ['deal_id', 'deal id'],
  row_order: ['row_order', 'row order', 'order'],
  row_id: ['row_id', 'row id', 'id'],
  kind: ['kind'],
  name: ['name'],
  pay_to_class_name: [
    'pay_to_class_name',
    'pay to class name',
    'pay_to',
    'pay to',
    'class_name',
    'class name',
  ],
  pay_to_class_id: [
    'pay_to_class_id',
    'pay to class id',
    'class_id',
    'class id',
  ],
  amount_mode: ['amount_mode', 'amount mode'],
  input_amount: ['input_amount', 'input amount'],
  catchup_pct: ['catchup_pct', 'catchup pct', 'catchup'],
  source: ['source', 'waterfall_source'],
}

const WF_KINDS = new Set([
  'LP_PREF',
  'PREF_CURRENT',
  'PREF_ACCRUED',
  'ROC',
  'CATCHUP',
])

const AMOUNT_MODES = new Set(['calc', 'input'])

module.exports = {
  DISTRIBUTION_SHEET_ALIASES,
  DIST_ROW_COLUMNS,
  WF_KINDS,
  AMOUNT_MODES,
}
