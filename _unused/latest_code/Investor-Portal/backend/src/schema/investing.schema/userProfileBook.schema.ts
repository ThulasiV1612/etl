import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "../auth.schema/signin.js";

/**
 * LP “My profiles” book: one row per saved investor profile (display label, type, audit, optional form JSON).
 * DB comment on the table: see migration `0026_user_investor_profile_form_snapshot_jsonb.sql`.
 */
export const userInvestorProfiles = pgTable("user_investor_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Identity in lists / investments
  profileName: varchar("profile_name", { length: 255 }).notNull(),
  profileType: varchar("profile_type", { length: 100 }).notNull().default(""),
  // Metadata
  addedBy: varchar("added_by", { length: 255 }).notNull().default(""),
  investmentsCount: integer("investments_count").notNull().default(0),
  archived: boolean("archived").notNull().default(false),
  /** True while add-profile wizard autosave is in progress; cleared on final Save. */
  isDraft: boolean("is_draft").notNull().default(false),
  lastEditReason: text("last_edit_reason"),
  /**
   * Multi-step add/edit form as JSON; matches the portal “Add profile” wizard (names, SSN, distribution, etc.).
   * `jsonb` in Postgres; API still exposes it as `profileWizardState` for the client.
   */
  formSnapshot: jsonb("form_snapshot").$type<Record<string, unknown> | null>(),
  /** `ach` | `check` | `other` — synced from wizard on save. */
  distributionMethod: varchar("distribution_method", { length: 32 })
    .notNull()
    .default(""),
  achRoutingNumber: varchar("ach_routing_number", { length: 9 })
    .notNull()
    .default(""),
  achAccountNumber: varchar("ach_account_number", { length: 34 })
    .notNull()
    .default(""),
  achBankAddress: text("ach_bank_address").notNull().default(""),
  achBankName: varchar("ach_bank_name", { length: 255 }).notNull().default(""),
  achBankAccountType: varchar("ach_bank_account_type", { length: 32 })
    .notNull()
    .default(""),
  /** Free-text distribution instructions when method is `other`. */
  bankAccountQuery: text("bank_account_query").notNull().default(""),
  /**
   * Stripe Connect recipient account. Bank details stay with Stripe and are
   * collected through hosted Connect onboarding; never populate this from the
   * legacy routing/account-number fields above.
   */
  stripeConnectAccountId: varchar("stripe_connect_account_id", { length: 255 }),
  stripeConnectDetailsSubmitted: boolean("stripe_connect_details_submitted")
    .notNull()
    .default(false),
  stripeConnectChargesEnabled: boolean("stripe_connect_charges_enabled")
    .notNull()
    .default(false),
  stripeConnectPayoutsEnabled: boolean("stripe_connect_payouts_enabled")
    .notNull()
    .default(false),
  stripeConnectStatus: varchar("stripe_connect_status", { length: 32 })
    .notNull()
    .default("not_started"),
  stripeConnectUpdatedAt: timestamp("stripe_connect_updated_at", {
    withTimezone: true,
  }),
  checkPayeeName: varchar("check_payee_name", { length: 255 })
    .notNull()
    .default(""),
  checkMailingAddressId: uuid("check_mailing_address_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const userBeneficiaries = pgTable("user_beneficiaries", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  fullName: varchar("full_name", { length: 200 }).notNull().default(""),
  relationship: varchar("relationship", { length: 100 }).notNull().default(""),
  taxId: varchar("tax_id", { length: 100 }).notNull().default(""),
  phone: varchar("phone", { length: 32 }).notNull().default(""),
  email: varchar("email", { length: 255 }).notNull().default(""),
  addressQuery: text("address_query").notNull().default(""),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const userSavedAddresses = pgTable("user_saved_addresses", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  fullNameOrCompany: varchar("full_name_or_company", { length: 255 })
    .notNull()
    .default(""),
  country: varchar("country", { length: 100 }).notNull().default(""),
  street1: varchar("street1", { length: 255 }).notNull().default(""),
  street2: varchar("street2", { length: 255 }).notNull().default(""),
  city: varchar("city", { length: 100 }).notNull().default(""),
  state: varchar("state", { length: 100 }).notNull().default(""),
  zip: varchar("zip", { length: 32 }).notNull().default(""),
  checkMemo: varchar("check_memo", { length: 500 }).notNull().default(""),
  distributionNote: text("distribution_note").notNull().default(""),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type UserInvestorProfileRow = typeof userInvestorProfiles.$inferSelect;
export type UserBeneficiaryRow = typeof userBeneficiaries.$inferSelect;
export type UserSavedAddressRow = typeof userSavedAddresses.$inferSelect;
