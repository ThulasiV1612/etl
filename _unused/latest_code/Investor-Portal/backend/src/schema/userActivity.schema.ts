import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./auth.schema/signin.js";

/** One portal sign-in session (login → logout). */
export const userPortalSessions = pgTable("user_portal_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  loginAt: timestamp("login_at", { withTimezone: true }).defaultNow().notNull(),
  logoutAt: timestamp("logout_at", { withTimezone: true }),
});

/** Per-session page visit counts (pathname + human label). */
export const userPageNavigations = pgTable(
  "user_page_navigations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => userPortalSessions.id, { onDelete: "cascade" }),
    pagePath: text("page_path").notNull(),
    pageLabel: varchar("page_label", { length: 255 }).notNull().default(""),
    visitCount: integer("visit_count").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    sessionPathUnique: uniqueIndex("user_page_navigations_session_path_uidx").on(
      t.sessionId,
      t.pagePath,
    ),
  }),
);

export type UserPortalSessionRow = typeof userPortalSessions.$inferSelect;
export type UserPageNavigationRow = typeof userPageNavigations.$inferSelect;
