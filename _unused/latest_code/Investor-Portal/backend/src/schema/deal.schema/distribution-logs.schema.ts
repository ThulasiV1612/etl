import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "../auth.schema/signin.js";
import { addDealForm } from "./add-deal-form.schema.js";

/**
 * Append-only history when sponsors edit investor payment / % of class
 * on Distribution Details (or related distribution mutations).
 */
export const distributionLogs = pgTable("distribution_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => addDealForm.id, { onDelete: "cascade" }),
  distributionId: varchar("distribution_id", { length: 120 }).notNull(),
  investorId: varchar("investor_id", { length: 120 }).notNull().default(""),
  contactMemberId: text("contact_member_id").notNull().default(""),
  actorUserId: uuid("actor_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  /** e.g. `investor_payment_edit` */
  action: varchar("action", { length: 64 }).notNull(),
  reason: text("reason").notNull().default(""),
  changesJson: jsonb("changes_json").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type DistributionLogRow = typeof distributionLogs.$inferSelect;
export type DistributionLogInsert = typeof distributionLogs.$inferInsert;
