import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./signin.js";
import { userPortalSessions } from "../userActivity.schema.js";

export const userAuthTokens = pgTable("user_auth_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenType: varchar("token_type", { length: 16 }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  replacedById: uuid("replaced_by_id"),
  portalSessionId: uuid("portal_session_id").references(
    () => userPortalSessions.id,
    { onDelete: "set null" },
  ),
  userAgent: text("user_agent"),
  clientIp: varchar("client_ip", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type UserAuthTokenRow = typeof userAuthTokens.$inferSelect;
export type UserAuthTokenInsert = typeof userAuthTokens.$inferInsert;
