import {
  pgTable,
  uuid,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { companies } from "../company.schema/company.js";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull().default("platform_user"),
  userStatus: varchar("user_status", { length: 50 }).notNull().default("active"),
  userSignupCompleted: varchar("user_signup_completed", { length: 10 })
    .notNull()
    .default("true"),
  /** Same `companies.id` as `contact.organization_id` — user’s company membership. */
  organizationId: uuid("organization_id").references(() => companies.id, {
    onDelete: "set null",
  }),
  firstName: varchar("first_name", { length: 100 }).notNull().default(""),
  lastName: varchar("last_name", { length: 100 }).notNull().default(""),
  phone: varchar("phone", { length: 32 }).notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
});

export type UserRow = typeof users.$inferSelect;
