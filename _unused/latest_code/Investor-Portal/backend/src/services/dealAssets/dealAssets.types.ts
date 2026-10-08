/** Attribute kinds used by Additional information (mirrors frontend). */
export const DEAL_ASSET_ATTRIBUTE_KINDS = [
  "asset_type_search",
  "text",
  "number_units",
  "money",
  "date_na",
  "year_na",
] as const;

export type DealAssetAttributeKind =
  (typeof DEAL_ASSET_ATTRIBUTE_KINDS)[number];

export interface DealAssetAdditionalInfoPair {
  label: string;
  value: string;
}

export interface DealAssetAttributeRow {
  id: string;
  label: string;
  kind: DealAssetAttributeKind;
  value: string;
  unitSuffix?: string;
  na?: boolean;
  preset?: boolean;
}

export interface DealAssetDraft {
  propertyName: string;
  country: string;
  streetAddress1: string;
  streetAddress2: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface DealAssetTableRow {
  id: string;
  name: string;
  address: string;
  assetType: string;
  imageCount: number;
  archived?: boolean;
  additionalInfo?: DealAssetAdditionalInfoPair[];
}

/** API shape for one deal asset (matches client persisted payload). */
export interface DealAssetPayload {
  id: string;
  row: DealAssetTableRow;
  draft: DealAssetDraft;
  attrRows: DealAssetAttributeRow[];
  imagePreviewDataUrls?: string[];
  sortOrder?: number;
}

export interface DealAssetsBundle {
  dealId: string;
  assets: DealAssetPayload[];
}

export interface DealAssetsReplaceInput {
  assets: DealAssetPayload[];
}
