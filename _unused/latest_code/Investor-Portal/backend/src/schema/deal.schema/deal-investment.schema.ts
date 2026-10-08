import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { userInvestorProfiles } from "../investing.schema/userProfileBook.schema.js";
import { addDealForm } from "./add-deal-form.schema.js";

/** Investments added from the investor portal Add Investment flow. */
export const dealInvestment = pgTable("deal_investment", {
  id: uuid("id").defaultRandom().primaryKey(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => addDealForm.id, { onDelete: "cascade" }),
  offeringId: text("offering_id").notNull().default(""),
  contactId: text("contact_id").notNull().default(""),
  /** Member label from Add Investment (directory name); avoids showing raw user id in UI */
  contactDisplayName: text("contact_display_name").notNull().default(""),
  profileId: text("profile_id").notNull().default(""),
  /** Optional saved book profile: Investing → Profiles. */
  userInvestorProfileId: uuid("user_investor_profile_id").references(
    () => userInvestorProfiles.id,
    { onDelete: "set null" },
  ),
  investor_role: text("investor_role").notNull().default(""),
  /** Sponsor “Funded” / approve-fund flag; UI maps to Approved vs Not Approved. */
  fundApproved: boolean("fund_approved").notNull().default(false),
  /** Portal user/contact id who last approved funding for this investment row. */
  fundApprovedBy: text("fund_approved_by"),
  /** Timestamp when funding was last approved for this investment row. */
  fundApprovedAt: timestamp("fund_approved_at", { withTimezone: true }),
  /** Committed total (numeric string) when fund was last approved; used for split UI after LP adds more. */
  fundApprovedCommitmentSnapshot: text("fund_approved_commitment_snapshot")
    .notNull()
    .default(""),
  status: text("status").notNull().default(""),
  investorClass: text("investor_class").notNull().default(""),
  docSignedDate: text("doc_signed_date"),
  /** JSON: sent / viewed / signed / completed timestamps + document list. */
  esignStatusJson: text("esign_status_json"),
  /** JSON object: question id → answer string (Invest Now questionnaire). */
  investorQuestionnaireAnswersJson: text("investor_questionnaire_answers_json"),
  /** JSON: Invest Now W-9 step (name, address, SSN) for eSign W-9 appendix prefill. */
  investorW9FormJson: text("investor_w9_form_json"),
  /** Invest Now funding method (`stripe_checkout`, `wire_transfer`, legacy `ach`, `check`). */
  fundingMethod: text("funding_method").notNull().default(""),
  commitmentAmount: text("commitment_amount").notNull().default(""),
  extraContributionAmounts: jsonb("extra_contribution_amounts")
    .$type<string[]>()
    .notNull(),
  /** Relative path under uploads root, e.g. deal-assets/<dealName-dealId>/investments/... */
  documentStoragePath: text("document_storage_path"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type DealInvestmentRow = typeof dealInvestment.$inferSelect;
export type DealInvestmentInsert = typeof dealInvestment.$inferInsert;
