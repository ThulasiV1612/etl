import {
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { addDealForm } from "./add-deal-form.schema.js";

/** Per-deal investor class / offering tranche (Classes section on offering details). */
export const dealInvestorClass = pgTable("deal_investor_class", {
  id: uuid("id").defaultRandom().primaryKey(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => addDealForm.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  subscriptionType: text("subscription_type").notNull().default(""),
  entityName: text("entity_name").notNull().default(""),
  startDate: text("start_date").notNull().default(""),
  offeringSize: text("offering_size").notNull().default(""),
  raiseAmountDistributions: text("raise_amount_distributions")
    .notNull()
    .default(""),
  billingRaiseQuota: text("billing_raise_quota").notNull().default(""),
  minimumInvestment: text("minimum_investment").notNull().default(""),
  /** Count of units in the class offering (e.g. shares); stored as text like other money fields. */
  numberOfUnits: text("number_of_units").notNull().default(""),
  pricePerUnit: text("price_per_unit").notNull().default(""),
  status: text("status").notNull().default("draft"),
  visibility: text("visibility").notNull().default(""),
  /** JSON: advanced class options (investment type, ownership %, waitlist, assets tags, etc.) */
  advancedOptionsJson: text("advanced_options_json").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type DealInvestorClassRow = typeof dealInvestorClass.$inferSelect;
export type DealInvestorClassInsert = typeof dealInvestorClass.$inferInsert;
