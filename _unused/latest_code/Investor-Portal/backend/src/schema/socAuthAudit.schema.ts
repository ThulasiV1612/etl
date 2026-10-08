/**
 * SOC security audit rows (HTTP + auth events) in PostgreSQL.
 *
 * Column names ↔ Pino JSON (camelCase): requestUrl → request_url, requestedMachineIp → requested_machine_ip, userId → user_id, etc.
 */

import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const socAuthAuditLogs = pgTable("soc_auth_audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  event: varchar("event", { length: 512 }).notNull(),
  outcome: varchar("outcome", { length: 32 }).notNull(),
  httpStatus: integer("http_status").notNull(),
  durationMs: integer("duration_ms").notNull(),
  method: varchar("method", { length: 16 }),
  path: text("path"),
  /** Email / username snippets — never passwords. */
  identifier: text("identifier"),
  clientIp: varchar("client_ip", { length: 128 }),
  requestedMachineIp: varchar("requested_machine_ip", { length: 128 }),
  requestUrl: text("request_url"),
  userAgent: text("user_agent"),
  userId: varchar("user_id", { length: 36 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type SocAuthAuditLogRow = typeof socAuthAuditLogs.$inferSelect;
export type SocAuthAuditLogInsert = typeof socAuthAuditLogs.$inferInsert;
