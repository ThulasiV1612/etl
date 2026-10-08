import { pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { users } from "../auth.schema/signin.js";
import { addDealForm } from "./add-deal-form.schema.js";

/** Portal users assigned to deals via Add Investment (`deal_investment.contact_id` as user id). */
export const assigningDealUser = pgTable(
  "assigning_deal_user",
  {
    dealId: uuid("deal_id")
      .notNull()
      .references(() => addDealForm.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userAddedDeal: uuid("user_added_deal").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [primaryKey({ columns: [t.dealId, t.userId] })],
);

export type AssigningDealUserRow = typeof assigningDealUser.$inferSelect;
export type AssigningDealUserInsert = typeof assigningDealUser.$inferInsert;
