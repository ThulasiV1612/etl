import {
  boolean,
  date,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { companies } from "../company.schema/company.js";

/** Syndication wizard submissions — column names match DB fields. */
export const addDealForm = pgTable("add_deal_form", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** Company (customer) that owns this deal — used for directory counts. */
  organizationId: uuid("organization_id").references(() => companies.id, {
    onDelete: "set null",
  }),
  dealName: text("deal_name").notNull(),
  dealType: text("deal_type").notNull().default(""),
  dealStage: text("deal_stage").notNull(),
  secType: text("sec_type").notNull(),
  closeDate: date("close_date"),
  owningEntityName: text("owning_entity_name").notNull(),
  fundsRequiredBeforeGpSign: boolean("funds_required_before_gp_sign").notNull(),
  autoSendFundingInstructions: boolean(
    "auto_send_funding_instructions",
  ).notNull(),
  propertyName: text("property_name").notNull(),
  country: text("country").notNull().default(""),
  addressLine1: text("address_line_1"),
  addressLine2: text("address_line_2"),
  city: text("city").notNull().default(""),
  state: text("state"),
  zipCode: text("zip_code"),
  /** Relative paths under the uploads physical root (see getUploadsPhysicalRoot), joined with `;` */
  assetImagePath: text("asset_image_path"),
  /** Rich HTML shown to investors (Offering details / preview); sanitized on save. */
  investorSummaryHtml: text("investor_summary_html"),
  /** Full image URL (https or data:image/*) chosen as deal cover; shown on dashboard & preview hero. */
  galleryCoverImageUrl: text("gallery_cover_image_url"),
  /** JSON array: { id, metric, newClass, isPreset }[] for Key Highlights (Offering details). */
  keyHighlightsJson: text("key_highlights_json"),
  /** JSON: Funding Info (ACH / wire / checks / investment fee) on Offering details. */
  fundingInstructionsJson: text("funding_instructions_json"),
  /** Shown at top of deal detail for every user who can open this deal. */
  dealAnnouncementTitle: text("deal_announcement_title"),
  dealAnnouncementMessage: text("deal_announcement_message"),
  /** Investor-facing offering workflow status (Offering details → Overview). */
  offeringStatus: text("offering_status").notNull().default("draft_hidden"),
  offeringVisibility: text("offering_visibility")
    .notNull()
    .default("show_on_dashboard"),
  showOnInvestbase: boolean("show_on_investbase").notNull().default(false),
  internalName: text("internal_name").notNull().default(""),
  /** JSON string array of deal asset row ids (offering overview multi-select). */
  offeringOverviewAssetIds: text("offering_overview_asset_ids")
    .notNull()
    .default("[]"),
  /** Investor class highlighted on offering overview / public offering page. */
  offeringOverviewClassId: uuid("offering_overview_class_id"),
  /** JSON string array: relative paths under uploads (same segments as `asset_image_path`) for offering gallery / public preview. */
  offeringGalleryPaths: text("offering_gallery_paths").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  /** Encrypted token for `/offering_portfolio?preview=` (set on create; backfilled for legacy rows). */
  offeringPreviewToken: text("offering_preview_token"),
  /**
   * JSON: `{ "v": 1, "visibility": { … }, "sections": [ … ] }` for offering preview
   * (documents layout + “Make it visible to Investors” toggles). Shared with public preview link.
   */
  offeringInvestorPreviewJson: text("offering_investor_preview_json"),
  /**
   * JSON: `{ "v": 1, "files": [{ id, categoryId, relativePath, originalName, uploadedAt }] }`
   * for eSign Templates tab uploads (`deal-assets/<dealName-dealId>/e-signed/<category>/`).
   */
  esignTemplatesJson: text("esign_templates_json"),
  /**
   * JSON: `{ "v": 1, "sections": [...], "questions": [...] }` for eSign Templates → Questionnaire
   * (section tabs + per-section question cards).
   */
  investorQuestionnaireJson: text("investor_questionnaire_json"),
  /** Syndication deals list: Active vs Archives tab. */
  archived: boolean("archived").notNull().default(false),
  /**
   * JSON: Class Setup deal-level config (`targetRaise`, `latestChanges`, etc.).
   * Per-class economic terms remain on `deal_investor_class` / advanced_options_json.
   */
  classSetupJson: text("class_setup_json").notNull().default("{}"),
  /**
   * JSON: Distribution Setup — `waterfalls.operating` / `waterfalls.capital`
   * payment rows. Split cascade derived from class_setup_json.promote.
   */
  distributionSetupJson: text("distribution_setup_json").notNull().default("{}"),
  /**
   * Stripe Connect account (Accounts v2) that funds ACH distributions for this deal.
   * Lead/admin sponsor onboards bank details; payouts debit this account, not platform SaaS billing.
   */
  stripeDistributionFundingAccountId: text(
    "stripe_distribution_funding_account_id",
  ),
  stripeDistributionFundingStatus: text("stripe_distribution_funding_status")
    .notNull()
    .default("not_started"),
  stripeDistributionFundingDetailsSubmitted: boolean(
    "stripe_distribution_funding_details_submitted",
  )
    .notNull()
    .default(false),
  stripeDistributionFundingPayoutsEnabled: boolean(
    "stripe_distribution_funding_payouts_enabled",
  )
    .notNull()
    .default(false),
  stripeDistributionFundingSetupByUserId: uuid(
    "stripe_distribution_funding_setup_by_user_id",
  ),
  stripeDistributionFundingUpdatedAt: timestamp(
    "stripe_distribution_funding_updated_at",
    { withTimezone: true },
  ),
  /**
   * Per-deal SaaS subscription (company still owns the Stripe Customer).
   * Draft / archived / liquidated deals are not billed.
   */
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  stripePlanId: varchar("stripe_plan_id", { length: 64 }),
  stripeBillingCycle: varchar("stripe_billing_cycle", { length: 32 }),
  stripeSubscriptionStatus: varchar("stripe_subscription_status", {
    length: 64,
  })
    .notNull()
    .default("none"),
  stripePriceId: varchar("stripe_price_id", { length: 255 }),
  stripeCurrentPeriodEnd: timestamp("stripe_current_period_end", {
    withTimezone: true,
  }),
  /**
   * First charge / paywall date (00:00 UTC). Defaults to the 1st of next
   * month; platform admin may set another date.
   */
  saasBillingStartsAt: timestamp("saas_billing_starts_at", {
    withTimezone: true,
  }),
  /**
   * Extra company users (team members) already paid at $10 each, beyond the
   * plan included count (Starter 1 / Running 2 / Growth 3).
   */
  extraCompanyUsersPaid: integer("extra_company_users_paid")
    .notNull()
    .default(0),
  extraCompanyUsersLastPaymentRef: varchar(
    "extra_company_users_last_payment_ref",
    { length: 255 },
  ),
  /**
   * Intended Capital Raising / Asset Managing stage while SaaS payment is
   * pending. `deal_stage` stays Draft until payment completes.
   */
  pendingDealStage: varchar("pending_deal_stage", { length: 64 }),
});

export type AddDealFormRow = typeof addDealForm.$inferSelect;
export type AddDealFormInsert = typeof addDealForm.$inferInsert;
