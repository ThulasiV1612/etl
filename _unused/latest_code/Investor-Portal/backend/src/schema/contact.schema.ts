import {
  boolean,
  date,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { companies } from "./company.schema/company.js";
import { users } from "./auth.schema/signin.js";

/** CRM-style contacts added from the portal; `created_by` is the authenticated user who saved the row */
export const contact = pgTable("contact", {
  id: uuid("id").defaultRandom().primaryKey(),
  /**
   * Same `companies.id` as `users.organization_id` for the creating user (set on insert via
   * `resolveOrganizationIdForUserId` — usually the creator’s `users.organization_id`, or
   * resolved from `companies` via the portal user’s `organization_id`).
   */
  organizationId: uuid("organization_id").references(() => companies.id, {
    onDelete: "set null",
  }),
  firstName: varchar("first_name", { length: 200 }).notNull(),
  lastName: varchar("last_name", { length: 200 }).notNull(),
  /** Concat of first + last name; kept in sync on write for now. */
  fullName: varchar("full_name", { length: 400 }).notNull().default(""),
  email: varchar("email", { length: 255 }).notNull(),
  /** True when this email is linked to a row in `users` — excluded from All Contacts lists. */
  isPortalUser: boolean("is_portal_user").notNull().default(false),
  /**
   * Self-registered investor CRM rows (no company) — visible to platform admins only.
   */
  platformAdminOnly: boolean("platform_admin_only").notNull().default(false),
  phone: varchar("phone", { length: 64 }).notNull().default(""),
  note: text("note").notNull().default(""),
  tags: jsonb("tags").$type<string[]>().notNull(),
  lists: jsonb("lists").$type<string[]>().notNull(),
  owners: jsonb("owners").$type<string[]>().notNull(),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  /**
   * Per-contact offering visibility for the investor portal.
   * `ALL_OFFERINGS` | `HIDE_OFFERINGS` | `506C_ONLY` — nullable when unset.
   */
  showOfferingsVisibility: varchar("show_offerings_visibility", { length: 32 }),
  /** Accreditation status label; nullable when unset. */
  accreditationStatus: text("accreditation_status"),
  /** Date the relationship with this contact was established; nullable when unset. */
  knownSince: date("known_since"),
  lastEditReason: text("last_edit_reason"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type ContactRow = typeof contact.$inferSelect;
export type ContactInsert = typeof contact.$inferInsert;

export type EmailTemplateAttachment = {
  fileName: string;
  mimeType: string;
  size: number;
  dataBase64: string;
};

/** Reusable contact email templates, scoped by organization. */
export const contactEmailTemplate = pgTable("contact_email_template", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => companies.id, {
    onDelete: "set null",
  }),
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull().default(""),
  body: text("body").notNull().default(""),
  attachment: jsonb("attachment").$type<EmailTemplateAttachment | null>(),
  archived: boolean("archived").notNull().default(false),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type ContactEmailTemplateRow = typeof contactEmailTemplate.$inferSelect;
export type ContactEmailTemplateInsert =
  typeof contactEmailTemplate.$inferInsert;
