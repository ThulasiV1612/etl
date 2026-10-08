import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./auth.schema/signin.js";

/** Logged when an admin edits or suspends a member (role / status). */
export const memberAdminAuditLogs = pgTable("member_admin_audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorUserId: uuid("actor_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  targetUserId: uuid("target_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 32 }).notNull(),
  reason: text("reason").notNull(),
  changesJson: jsonb("changes_json").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type MemberAdminAuditLogRow = typeof memberAdminAuditLogs.$inferSelect;
