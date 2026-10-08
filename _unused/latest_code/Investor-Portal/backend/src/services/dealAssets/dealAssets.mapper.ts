import type { DealAssetRow } from "../../schema/deal.schema/deal-asset.schema.js";
import type {
  DealAssetAdditionalInfoPair,
  DealAssetAttributeKind,
  DealAssetAttributeRow,
  DealAssetDraft,
  DealAssetPayload,
  DealAssetTableRow,
} from "./dealAssets.types.js";
import { DEAL_ASSET_ATTRIBUTE_KINDS } from "./dealAssets.types.js";

function asRecord(v: unknown): Record<string, unknown> {
  if (v != null && typeof v === "object" && !Array.isArray(v))
    return v as Record<string, unknown>;
  return {};
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
}

function parseJsonArray(raw: string | null | undefined): unknown[] {
  if (raw == null || String(raw).trim() === "") return [];
  try {
    const p = JSON.parse(String(raw)) as unknown;
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

export function serializeAdditionalInfo(
  pairs: DealAssetAdditionalInfoPair[],
): string {
  return JSON.stringify(
    pairs.map((p) => ({
      label: String(p.label ?? "").trim() || "Attribute",
      value: String(p.value ?? "").trim(),
    })),
  );
}

export function serializeAttrRows(rows: DealAssetAttributeRow[]): string {
  return JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      label: r.label,
      kind: r.kind,
      value: r.value,
      ...(r.unitSuffix != null ? { unitSuffix: r.unitSuffix } : {}),
      ...(r.na != null ? { na: r.na } : {}),
      ...(r.preset != null ? { preset: r.preset } : {}),
    })),
  );
}

export function serializeImagePreviewUrls(urls: string[]): string {
  return JSON.stringify(urls.map((u) => String(u ?? "").trim()).filter(Boolean));
}

export function parseAdditionalInfoJson(
  raw: string | null | undefined,
): DealAssetAdditionalInfoPair[] {
  return parseJsonArray(raw)
    .map((item) => {
      const o = asRecord(item);
      return {
        label: str(o.label) || "Attribute",
        value: str(o.value),
      };
    })
    .filter((p) => p.value !== "");
}

export function parseAttrRowsJson(
  raw: string | null | undefined,
): DealAssetAttributeRow[] {
  return parseJsonArray(raw).map((item, i) => {
    const o = asRecord(item);
    const kindRaw = str(o.kind) || "text";
    const kind = (DEAL_ASSET_ATTRIBUTE_KINDS as readonly string[]).includes(
      kindRaw,
    )
      ? (kindRaw as DealAssetAttributeKind)
      : "text";
    const row: DealAssetAttributeRow = {
      id: str(o.id) || `attr-${i + 1}`,
      label: str(o.label) || "Attribute",
      kind,
      value: typeof o.value === "string" ? o.value : str(o.value),
    };
    if (o.unitSuffix != null) row.unitSuffix = str(o.unitSuffix);
    if (typeof o.na === "boolean") row.na = o.na;
    if (typeof o.preset === "boolean") row.preset = o.preset;
    return row;
  });
}

export function parseImagePreviewUrlsJson(
  raw: string | null | undefined,
): string[] {
  return parseJsonArray(raw)
    .map((u) => str(u))
    .filter(Boolean);
}

function emptyDraft(): DealAssetDraft {
  return {
    propertyName: "",
    country: "US",
    streetAddress1: "",
    streetAddress2: "",
    city: "",
    state: "",
    zipCode: "",
  };
}

export function rowToDealAssetPayload(row: DealAssetRow): DealAssetPayload {
  const additionalInfo = parseAdditionalInfoJson(row.additionalInfoJson);
  const attrRows = parseAttrRowsJson(row.attrRowsJson);
  const imagePreviewDataUrls = parseImagePreviewUrlsJson(
    row.imagePreviewUrlsJson,
  );
  const tableRow: DealAssetTableRow = {
    id: row.clientAssetId,
    name: row.propertyName,
    address: row.addressDisplay || "—",
    assetType: row.assetType || "—",
    imageCount: row.imageCount ?? 0,
    archived: Boolean(row.archived),
    additionalInfo,
  };
  const draft: DealAssetDraft = {
    propertyName: row.propertyName,
    country: row.country || "US",
    streetAddress1: row.streetAddress1,
    streetAddress2: row.streetAddress2,
    city: row.city,
    state: row.state,
    zipCode: row.zipCode,
  };
  return {
    id: row.clientAssetId,
    row: tableRow,
    draft,
    attrRows,
    imagePreviewDataUrls,
    sortOrder: row.sortOrder ?? 0,
  };
}

export function parseDealAssetPayload(raw: unknown): DealAssetPayload | null {
  const o = asRecord(raw);
  const id = str(o.id);
  if (!id) return null;

  const rowObj = asRecord(o.row);
  const draftObj = asRecord(o.draft);
  const attrRaw = Array.isArray(o.attrRows)
    ? o.attrRows
    : Array.isArray(o.attr_rows)
      ? o.attr_rows
      : [];

  const additionalFromRow = Array.isArray(rowObj.additionalInfo)
    ? rowObj.additionalInfo
    : Array.isArray(rowObj.additional_info)
      ? rowObj.additional_info
      : [];

  const attrRows = parseAttrRowsJson(JSON.stringify(attrRaw));
  const additionalInfo =
    additionalFromRow.length > 0
      ? parseAdditionalInfoJson(JSON.stringify(additionalFromRow))
      : attrRows
          .filter((r) => r.id !== "attr-asset-type")
          .map((r) => ({
            label: r.label.trim() || "Attribute",
            value: r.na ? "N/A" : String(r.value ?? "").trim(),
          }))
          .filter((p) => p.value !== "");

  const imagePreviewDataUrls = Array.isArray(o.imagePreviewDataUrls)
    ? o.imagePreviewDataUrls.map((u) => str(u)).filter(Boolean)
    : Array.isArray(o.image_preview_data_urls)
      ? o.image_preview_data_urls.map((u) => str(u)).filter(Boolean)
      : [];

  const draft: DealAssetDraft = {
    ...emptyDraft(),
    propertyName: str(
      draftObj.propertyName ?? draftObj.property_name ?? rowObj.name,
    ),
    country: str(draftObj.country) || "US",
    streetAddress1: str(
      draftObj.streetAddress1 ?? draftObj.street_address_1,
    ),
    streetAddress2: str(
      draftObj.streetAddress2 ?? draftObj.street_address_2,
    ),
    city: str(draftObj.city),
    state: str(draftObj.state),
    zipCode: str(draftObj.zipCode ?? draftObj.zip_code),
  };

  const assetTypeFromAttr = attrRows.find((r) => r.id === "attr-asset-type");
  const tableRow: DealAssetTableRow = {
    id,
    name: str(rowObj.name) || draft.propertyName,
    address: str(rowObj.address) || "—",
    assetType:
      str(rowObj.assetType ?? rowObj.asset_type) ||
      assetTypeFromAttr?.value?.trim() ||
      "—",
    imageCount:
      typeof rowObj.imageCount === "number"
        ? rowObj.imageCount
        : typeof rowObj.image_count === "number"
          ? rowObj.image_count
          : imagePreviewDataUrls.length,
    archived: Boolean(rowObj.archived),
    additionalInfo,
  };

  const sortOrder =
    typeof o.sortOrder === "number"
      ? o.sortOrder
      : typeof o.sort_order === "number"
        ? o.sort_order
        : undefined;

  return {
    id,
    row: tableRow,
    draft,
    attrRows,
    imagePreviewDataUrls,
    ...(sortOrder != null ? { sortOrder } : {}),
  };
}
