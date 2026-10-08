import { pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "../auth.schema/signin.js";
import { companies } from "./company.js";

/** Company-scoped role membership for a portal user. */
export const userCompanyMembership = pgTable(
  "user_company_membership",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 50 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("user_company_membership_user_company_uidx").on(t.userId, t.companyId),
  ],
);

export type UserCompanyMembershipRow = typeof userCompanyMembership.$inferSelect;
export type UserCompanyMembershipInsert = typeof userCompanyMembership.$inferInsert;
