import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "../auth.schema/signin.js";
import { companies } from "./company.js";

/** Logged when a platform admin edits or suspends a company. */
export const companyAdminAuditLogs = pgTable("company_admin_audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorUserId: uuid("actor_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  targetCompanyId: uuid("target_company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  action: varchar("action", { length: 32 }).notNull(),
  reason: text("reason").notNull(),
  changesJson: jsonb("changes_json").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type CompanyAdminAuditLogRow =
  typeof companyAdminAuditLogs.$inferSelect;
