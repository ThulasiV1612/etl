import {
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./auth.schema/signin.js";
import { companies } from "./company.schema/company.js";
import { contact } from "./contact.schema.js";

export const platformSignupNotification = pgTable(
  "platform_signup_notification",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contact.id, {
      onDelete: "set null",
    }),
    /** `investor` (no company) or `company` (self-serve with company name). */
    signupKind: varchar("signup_kind", { length: 32 }).notNull(),
    companyName: varchar("company_name", { length: 500 }),
    organizationId: uuid("organization_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    userEmail: varchar("user_email", { length: 255 }).notNull(),
    userDisplayName: varchar("user_display_name", { length: 400 }).notNull(),
    userRole: varchar("user_role", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

export type PlatformSignupNotificationRow =
  typeof platformSignupNotification.$inferSelect;
export type PlatformSignupNotificationInsert =
  typeof platformSignupNotification.$inferInsert;
