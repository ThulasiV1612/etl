import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./auth.schema/signin.js";
import { addDealForm } from "./deal.schema/add-deal-form.schema.js";
import { dealInvestment } from "./deal.schema/deal-investment.schema.js";
import { userInvestorProfiles } from "./investing.schema/userProfileBook.schema.js";

/**
 * One Stripe Checkout attempt for an investor contribution.
 * Multiple attempts are allowed for an investment; Stripe IDs remain unique.
 */
export const investorCheckoutPayments = pgTable(
  "investor_checkout_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    investmentId: uuid("investment_id")
      .notNull()
      .references(() => dealInvestment.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => addDealForm.id, { onDelete: "cascade" }),
    investorUserId: uuid("investor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeCheckoutSessionId: varchar("stripe_checkout_session_id", {
      length: 255,
    }).notNull(),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", {
      length: 255,
    }),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 16 }).notNull().default("usd"),
    /** created | processing | succeeded | failed | expired | refunded */
    status: varchar("status", { length: 32 }).notNull().default("created"),
    failureMessage: text("failure_message"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("investor_checkout_payments_session_uidx").on(
      t.stripeCheckoutSessionId,
    ),
    uniqueIndex("investor_checkout_payments_pi_uidx").on(
      t.stripePaymentIntentId,
    ),
    index("investor_checkout_payments_investment_idx").on(t.investmentId),
    index("investor_checkout_payments_deal_idx").on(t.dealId),
  ],
);

/**
 * One ACH distribution payout per investor line in a completed distribution.
 * The uniqueness constraint makes execution safely retryable.
 */
export const investorDistributionPayouts = pgTable(
  "investor_distribution_payouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => addDealForm.id, { onDelete: "cascade" }),
    distributionId: varchar("distribution_id", { length: 255 }).notNull(),
    investmentId: uuid("investment_id")
      .notNull()
      .references(() => dealInvestment.id, { onDelete: "restrict" }),
    userInvestorProfileId: uuid("user_investor_profile_id")
      .notNull()
      .references(() => userInvestorProfiles.id, { onDelete: "restrict" }),
    investorUserId: uuid("investor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    initiatedByUserId: uuid("initiated_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 16 }).notNull().default("usd"),
    stripeConnectedAccountId: varchar("stripe_connected_account_id", {
      length: 255,
    }).notNull(),
    stripeTransferId: varchar("stripe_transfer_id", { length: 255 }),
    stripePayoutId: varchar("stripe_payout_id", { length: 255 }),
    /** pending | transferred | processing | paid | failed | canceled | reversed */
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    failureCode: varchar("failure_code", { length: 128 }),
    failureMessage: text("failure_message"),
    initiatedAt: timestamp("initiated_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("investor_distribution_payouts_line_uidx").on(
      t.dealId,
      t.distributionId,
      t.investmentId,
    ),
    uniqueIndex("investor_distribution_payouts_transfer_uidx").on(
      t.stripeTransferId,
    ),
    uniqueIndex("investor_distribution_payouts_payout_uidx").on(
      t.stripePayoutId,
    ),
    index("investor_distribution_payouts_distribution_idx").on(
      t.dealId,
      t.distributionId,
    ),
    index("investor_distribution_payouts_profile_idx").on(
      t.userInvestorProfileId,
    ),
  ],
);

export type InvestorCheckoutPaymentRow =
  typeof investorCheckoutPayments.$inferSelect;
export type InvestorDistributionPayoutRow =
  typeof investorDistributionPayouts.$inferSelect;
