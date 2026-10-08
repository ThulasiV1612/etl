import {
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { dealInvestment } from "./deal-investment.schema.js";

/** Dropbox Sign workflow tracking for Invest Now / investment onboarding (webhook-driven). */
export const investmentSignatures = pgTable("investment_signatures", {
  id: uuid("id").defaultRandom().primaryKey(),
  investmentId: uuid("investment_id")
    .notNull()
    .references(() => dealInvestment.id, { onDelete: "cascade" }),
  investorId: text("investor_id").notNull().default(""),
  signatureRequestId: text("signature_request_id").notNull(),
  status: text("status").notNull().default("Sent"),
  signUrl: text("sign_url"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  viewedAt: timestamp("viewed_at", { withTimezone: true }),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  dropboxResponse: text("dropbox_response"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type InvestmentSignatureRow = typeof investmentSignatures.$inferSelect;
export type InvestmentSignatureInsert = typeof investmentSignatures.$inferInsert;
