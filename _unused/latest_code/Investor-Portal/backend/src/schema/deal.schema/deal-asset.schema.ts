import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { addDealForm } from "./add-deal-form.schema.js";

/**
 * Offering Assets section — one row per asset on a deal.
 * Additional information lives in `additional_info_json` + `attr_rows_json`.
 */
export const dealAsset = pgTable(
  "deal_asset",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => addDealForm.id, { onDelete: "cascade" }),
    /** Frontend asset id (`primary-{dealId}` / `asset-{timestamp}`). */
    clientAssetId: text("client_asset_id").notNull(),
    propertyName: text("property_name").notNull().default(""),
    country: text("country").notNull().default(""),
    streetAddress1: text("street_address_1").notNull().default(""),
    streetAddress2: text("street_address_2").notNull().default(""),
    city: text("city").notNull().default(""),
    state: text("state").notNull().default(""),
    zipCode: text("zip_code").notNull().default(""),
    addressDisplay: text("address_display").notNull().default(""),
    assetType: text("asset_type").notNull().default(""),
    imageCount: integer("image_count").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
    /** JSON: `{ label, value }[]` */
    additionalInfoJson: text("additional_info_json").notNull().default("[]"),
    /** JSON: full attribute form rows */
    attrRowsJson: text("attr_rows_json").notNull().default("[]"),
    /** JSON: string[] image preview / gallery URLs */
    imagePreviewUrlsJson: text("image_preview_urls_json")
      .notNull()
      .default("[]"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("deal_asset_deal_id_client_asset_id_uidx").on(
      t.dealId,
      t.clientAssetId,
    ),
  ],
);

export type DealAssetRow = typeof dealAsset.$inferSelect;
export type DealAssetInsert = typeof dealAsset.$inferInsert;
