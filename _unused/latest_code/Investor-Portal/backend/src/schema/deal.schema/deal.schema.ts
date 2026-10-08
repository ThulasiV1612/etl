import {
  pgTable,
  uuid,
  timestamp,
} from "drizzle-orm/pg-core";
import { companies } from "../company.schema/company.js";

/** Placeholder for syndication deals; counts appear on company directory. */
export const deals = pgTable("deals", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type DealRow = typeof deals.$inferSelect;
