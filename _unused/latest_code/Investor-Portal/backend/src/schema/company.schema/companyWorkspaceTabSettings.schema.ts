import { jsonb, pgTable, primaryKey, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { companies } from "./company.js";

/** Per-tab JSON workspace data for the Company / Settings page (Settings, Email, Contact attributes, Offerings). */
export const companyWorkspaceTabSettings = pgTable(
  "company_workspace_tab_settings",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    tabKey: varchar("tab_key", { length: 64 }).notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.tabKey] })],
);

export type CompanyWorkspaceTabSettingsRow =
  typeof companyWorkspaceTabSettings.$inferSelect;
export type CompanyWorkspaceTabSettingsInsert =
  typeof companyWorkspaceTabSettings.$inferInsert;
