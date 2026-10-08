import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { companies } from "./company.schema/company.js";
import { users } from "./auth.schema/signin.js";

export type EsignTemplateSignerRole = {
  name: string;
  order: number;
};

export type EsignReusableTemplateStatus = "none" | "draft" | "ready";

/** Org-scoped reusable Dropbox Sign document templates (library). */
export const esignReusableTemplate = pgTable("esign_reusable_template", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => companies.id, {
    onDelete: "set null",
  }),
  name: varchar("name", { length: 255 }).notNull(),
  dropboxSignTemplateId: varchar("dropbox_sign_template_id", { length: 128 }),
  dropboxSignStatus: varchar("dropbox_sign_status", { length: 16 })
    .notNull()
    .default("none"),
  roles: jsonb("roles").$type<EsignTemplateSignerRole[]>().notNull().default([]),
  relativePath: text("relative_path"),
  originalName: varchar("original_name", { length: 512 }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  archived: boolean("archived").notNull().default(false),
});

export type EsignReusableTemplateRow = typeof esignReusableTemplate.$inferSelect;
export type EsignReusableTemplateInsert =
  typeof esignReusableTemplate.$inferInsert;
