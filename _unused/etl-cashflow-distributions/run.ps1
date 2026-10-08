# Distribution ETL (same pattern as classes / profile investors)
#
# A) Waterfall CONFIG from Class_Mapping_FILLED:
#   python map_class_to_distribution_setup.py
#   python map_class_to_distribution_setup.py --all-migration-deals
#
# B) Already-PAID ledger from Cash Flow "distributions paid" Excel:
#   Drop the paid xlsx into .\input\ then:
#     python map_paid_excel_to_prior_distributions.py
#   Or all known migration files:
#     python map_paid_excel_to_prior_distributions.py --all-migration-deals
#
# Load into DB (after classes + waterfall exist; fill migration_deal_ids.json):
#   python load_distribution_setup.py --all-migration-deals --token <jwt>
#   python load_prior_distributions.py --all-migration-deals --token <jwt>
#
# Default entry: map class → dist setup (pass args through)
python map_class_to_distribution_setup.py @args
