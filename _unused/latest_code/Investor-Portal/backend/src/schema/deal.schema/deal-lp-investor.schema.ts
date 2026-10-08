import { pgTable, text, timestamp, uuid, unique } from "drizzle-orm/pg-core";
import { users } from "../auth.schema/signin.js";
import { userInvestorProfiles } from "../investing.schema/userProfileBook.schema.js";
import { addDealForm } from "./add-deal-form.schema.js";

/**
 * LP investor (Investors tab) without a `deal_investment` row.
 * Mirrors `deal_member`: lean row + class; unique (deal_id, contact_member_id).
 */
export const dealLpInvestor = pgTable(
  "deal_lp_investor",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Denormalized investor full name (from contact / user / client display name). */
    investorName: text("investor_name").notNull().default(""),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => addDealForm.id, { onDelete: "cascade" }),
    addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
    contactMemberId: text("contact_member_id").notNull().default(""),
    /** Denormalized from contact/user for lists + queries; also resolvable via `contact_member_id`. */
    email: text("email"),
    /** e.g. `LP Investor` — stored on this row for display and filters. */
    role: text("role").notNull().default(""),
    /** Same keys as `deal_investment.profile_id` (e.g. individual, llc_corp_trust_etc). */
    profileId: text("profile_id").notNull().default(""),
    userInvestorProfileId: uuid("user_investor_profile_id").references(
      () => userInvestorProfiles.id,
      { onDelete: "set null" },
    ),
    investorClass: text("investor_class").notNull().default(""),
    /** Percent of class (ownership), e.g. `25.00%`. */
    percentOfClassOwnership: text("percent_of_class_ownership")
      .notNull()
      .default(""),
    /** Percent of class (distributions), e.g. `25.00%`. */
    percentOfClassDistributions: text("percent_of_class_distributions")
      .notNull()
      .default(""),
    /** Entity Ownership % — optional; separate from percent_of_class_ownership. */
    entityOwnershipPercent: text("entity_ownership_percent")
      .notNull()
      .default(""),
    /** Distribution Allocation % — optional; separate from percent_of_class_distributions. */
    distributionAllocationPercent: text("distribution_allocation_percent")
      .notNull()
      .default(""),
    sendInvitationMail: text("send_invitation_mail").notNull().default("no"),
    committed_amount: text("committed_amount").notNull().default(""),
    /** Calendar date when signed, or `pending` after eSign is sent. */
    docSignedDate: text("doc_signed_date"),
    esignStatusJson: text("esign_status_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("deal_lp_investor_deal_id_contact_member_id_uidx").on(
      t.dealId,
      t.contactMemberId,
    ),
  ],
);

export type DealLpInvestorRow = typeof dealLpInvestor.$inferSelect;
export type DealLpInvestorInsert = typeof dealLpInvestor.$inferInsert;
