import {
  pgTable,
  text,
  uuid,
  varchar,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./company.js";

/**
 * Local copy of Stripe invoices for the company (synced from webhooks + API).
 */
export const companyBillingInvoices = pgTable(
  "company_billing_invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    stripeInvoiceId: varchar("stripe_invoice_id", { length: 255 }).notNull(),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
    invoiceNumber: varchar("invoice_number", { length: 128 }),
    /** draft | open | paid | void | uncollectible */
    status: varchar("status", { length: 64 }).notNull().default("open"),
    currency: varchar("currency", { length: 16 }).notNull().default("usd"),
    amountDueCents: integer("amount_due_cents").notNull().default(0),
    amountPaidCents: integer("amount_paid_cents").notNull().default(0),
    amountRemainingCents: integer("amount_remaining_cents")
      .notNull()
      .default(0),
    hostedInvoiceUrl: text("hosted_invoice_url"),
    invoicePdf: text("invoice_pdf"),
    /** Last Stripe payment failure message, if any. */
    paymentFailureMessage: text("payment_failure_message"),
    paymentFailedAt: timestamp("payment_failed_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    invoiceDate: timestamp("invoice_date", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("company_billing_invoices_stripe_invoice_uidx").on(
      t.stripeInvoiceId,
    ),
    index("company_billing_invoices_company_idx").on(t.companyId),
  ],
);

/**
 * Append-only Stripe billing event log (webhooks + sync).
 */
export const companyBillingEvents = pgTable(
  "company_billing_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    stripeEventId: varchar("stripe_event_id", { length: 255 }),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    stripeInvoiceId: varchar("stripe_invoice_id", { length: 255 }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    message: text("message"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("company_billing_events_stripe_event_uidx").on(t.stripeEventId),
    index("company_billing_events_company_idx").on(t.companyId),
  ],
);

/**
 * Local copy of Stripe PaymentMethods for the company customer.
 * Full API object is kept in stripe_payload; key fields are denormalized for queries.
 */
export const companyBillingPaymentMethods = pgTable(
  "company_billing_payment_methods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    stripePaymentMethodId: varchar("stripe_payment_method_id", {
      length: 255,
    }).notNull(),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    type: varchar("type", { length: 64 }).notNull().default("card"),
    brand: varchar("brand", { length: 64 }),
    last4: varchar("last4", { length: 8 }),
    expMonth: integer("exp_month"),
    expYear: integer("exp_year"),
    funding: varchar("funding", { length: 32 }),
    country: varchar("country", { length: 8 }),
    fingerprint: varchar("fingerprint", { length: 255 }),
    billingName: text("billing_name"),
    billingEmail: varchar("billing_email", { length: 320 }),
    billingPhone: varchar("billing_phone", { length: 64 }),
    billingAddress: jsonb("billing_address"),
    isDefault: boolean("is_default").notNull().default(false),
    livemode: boolean("livemode").notNull().default(false),
    stripeCreatedAt: timestamp("stripe_created_at", { withTimezone: true }),
    stripePayload: jsonb("stripe_payload").notNull().default({}),
    detachedAt: timestamp("detached_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("company_billing_payment_methods_stripe_pm_uidx").on(
      t.stripePaymentMethodId,
    ),
    index("company_billing_payment_methods_company_idx").on(t.companyId),
    index("company_billing_payment_methods_customer_idx").on(
      t.stripeCustomerId,
    ),
  ],
);

export type CompanyBillingInvoiceRow =
  typeof companyBillingInvoices.$inferSelect;
export type CompanyBillingEventRow = typeof companyBillingEvents.$inferSelect;
export type CompanyBillingPaymentMethodRow =
  typeof companyBillingPaymentMethods.$inferSelect;
