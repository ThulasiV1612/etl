/**
 * Column / sheet constants for ETL_Class_Mapping_Template_v2.xlsx
 * Sheets (import order): Classes → Hurdles → Final Tier
 */

const CLASS_SHEET_ALIASES = {
  classes: ['classes', 'class'],
  hurdles: ['hurdles', 'hurdle'],
  finalTier: ['final tier', 'final_tier', 'finaltier', 'final'],
}

const CLASSES_COLUMNS = {
  source_class_name: ['source_class_name', 'source class name'],
  name: ['name', 'class_name', 'class name'],
  subscription_type: ['subscription_type', 'subscription type'],
  status: ['status'],
  display_order: ['display_order', 'display order'],
  entity_name: ['entity_name', 'entity name'],
  start_date: ['start_date', 'start date'],
  offering_size: ['offering_size', 'offering size'],
  raise_amount_distributions: [
    'raise_amount_distributions',
    'raise amount distributions',
  ],
  billing_raise_quota: ['billing_raise_quota', 'billing raise quota'],
  minimum_investment: ['minimum_investment', 'minimum investment'],
  number_of_units: ['number_of_units', 'number of units'],
  price_per_unit: ['price_per_unit', 'price per unit'],
  visibility: ['visibility'],
  equity_pct: ['equity_pct', 'equity pct', 'equity %'],
  distribution_share_pct: [
    'distribution_share_pct',
    'distribution share pct',
    'distribution share %',
  ],
  maps_to: ['maps_to', 'maps to'],
  pref_enabled: ['pref_enabled', 'pref enabled'],
  pref_rate: ['pref_rate', 'pref rate'],
  pref_type: ['pref_type', 'pref type'],
  pref_compounding: ['pref_compounding', 'pref compounding'],
  pref_distribution_frequency: [
    'pref_distribution_frequency',
    'pref distribution frequency',
  ],
  pref_current_portion: ['pref_current_portion', 'pref current portion'],
  pref_accrued_portion: ['pref_accrued_portion', 'pref accrued portion'],
  deal_target_raise: ['deal_target_raise', 'deal target raise', 'target_raise'],
  deal_promote: ['deal_promote', 'promote', 'deal promote'],
}

const HURDLES_COLUMNS = {
  class_name: ['class_name', 'class name', 'name'],
  tier_order: ['tier_order', 'tier order'],
  hurdle_name: ['hurdle_name', 'hurdle name'],
  hurdle_rate_pct: ['hurdle_rate_pct', 'hurdle rate pct', 'hurdle_rate'],
  lp_pct: ['lp_pct', 'lp pct'],
  gp_pct: ['gp_pct', 'gp pct'],
  preferred_return_type: [
    'preferred_return_type',
    'preferred return type',
  ],
  is_final: ['is_final', 'is final'],
}

const FINAL_TIER_COLUMNS = {
  class_name: ['class_name', 'class name', 'name'],
  final_lp_pct: ['final_lp_pct', 'final lp pct'],
  final_gp_pct: ['final_gp_pct', 'final gp pct'],
  hurdle_name: ['hurdle_name', 'hurdle name'],
}

module.exports = {
  CLASS_SHEET_ALIASES,
  CLASSES_COLUMNS,
  HURDLES_COLUMNS,
  FINAL_TIER_COLUMNS,
}
