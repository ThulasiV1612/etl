import type { DealAssetPayload, DealAssetsReplaceInput } from "./dealAssets.types.js";

export interface DealAssetsValidationResult {
  ok: boolean;
  message?: string;
  fieldErrors: Array<{ field: string; message: string }>;
}

export function validateDealAssetPayload(
  asset: DealAssetPayload,
): DealAssetsValidationResult {
  const fieldErrors: Array<{ field: string; message: string }> = [];
  if (!asset.id.trim())
    fieldErrors.push({ field: "id", message: "Asset id is required" });
  if (!asset.draft.propertyName.trim() && !asset.row.name.trim())
    fieldErrors.push({
      field: "propertyName",
      message: "Property name is required",
    });
  return {
    ok: fieldErrors.length === 0,
    message: fieldErrors[0]?.message,
    fieldErrors,
  };
}

export function validateDealAssetsReplaceInput(
  input: DealAssetsReplaceInput,
): DealAssetsValidationResult {
  const fieldErrors: Array<{ field: string; message: string }> = [];
  if (!Array.isArray(input.assets)) {
    return {
      ok: false,
      message: "assets must be an array",
      fieldErrors: [{ field: "assets", message: "assets must be an array" }],
    };
  }
  const seen = new Set<string>();
  for (let i = 0; i < input.assets.length; i++) {
    const a = input.assets[i]!;
    const one = validateDealAssetPayload(a);
    for (const e of one.fieldErrors)
      fieldErrors.push({ field: `assets[${i}].${e.field}`, message: e.message });
    const id = a.id.trim();
    if (id && seen.has(id))
      fieldErrors.push({
        field: `assets[${i}].id`,
        message: `Duplicate asset id: ${id}`,
      });
    if (id) seen.add(id);
  }
  return {
    ok: fieldErrors.length === 0,
    message: fieldErrors[0]?.message,
    fieldErrors,
  };
}
