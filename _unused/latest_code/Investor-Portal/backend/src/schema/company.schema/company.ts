import {
  pgTable,
  text,
  uuid,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  /** GoHighLevel sub-account (location) id when per-org CRM is enabled. */
  ghlLocationId: varchar("ghl_location_id", { length: 64 }),
  /** pending | active | failed | skipped */
  ghlLocationStatus: varchar("ghl_location_status", { length: 32 })
    .notNull()
    .default("pending"),
  ghlLocationError: text("ghl_location_error"),
  ghlLocationProvisionedAt: timestamp("ghl_location_provisioned_at", {
    withTimezone: true,
  }),
  /** Stripe Customer id (cus_…) for this organization. */
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  /** Stripe Subscription id (sub_…) when on a paid plan. */
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  /** portal | platform | custom | null when none. */
  stripePlanId: varchar("stripe_plan_id", { length: 64 }),
  /** monthly | annually | null. */
  stripeBillingCycle: varchar("stripe_billing_cycle", { length: 32 }),
  /**
   * none | incomplete | trialing | active | past_due | canceled | unpaid |
   * incomplete_expired | paused
   */
  stripeSubscriptionStatus: varchar("stripe_subscription_status", {
    length: 64,
  })
    .notNull()
    .default("none"),
  stripePriceId: varchar("stripe_price_id", { length: 255 }),
  stripeCurrentPeriodEnd: timestamp("stripe_current_period_end", {
    withTimezone: true,
  }),
  /** Last payment failure message from Stripe (invoice.payment_failed). */
  stripeLastPaymentError: text("stripe_last_payment_error"),
  stripeLastPaymentFailedAt: timestamp("stripe_last_payment_failed_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type CompanyRow = typeof companies.$inferSelect;
