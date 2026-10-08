import {
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { companies } from "./company.js";

/** Distinct CRM contact tag names used within an organization (company). */
export const organizationContactTag = pgTable(
  "organization_contact_tag",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("organization_contact_tag_org_name_uidx").on(
      t.organizationId,
      t.name,
    ),
  ],
);

/** Distinct CRM contact list names used within an organization (company). */
export const organizationContactList = pgTable(
  "organization_contact_list",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("organization_contact_list_org_name_uidx").on(
      t.organizationId,
      t.name,
    ),
  ],
);

export type OrganizationContactTagRow =
  typeof organizationContactTag.$inferSelect;
export type OrganizationContactListRow =
  typeof organizationContactList.$inferSelect;
