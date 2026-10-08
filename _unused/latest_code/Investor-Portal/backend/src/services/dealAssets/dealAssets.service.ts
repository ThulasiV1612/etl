/**
 * Deal Assets service — persist Offering Assets section + additional information.
 * New module; does not modify existing dealForm / localStorage flows.
 */

import { and, asc, eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { addDealForm } from "../../schema/deal.schema/add-deal-form.schema.js";
import { dealAsset } from "../../schema/deal.schema/deal-asset.schema.js";
import {
  parseDealAssetPayload,
  rowToDealAssetPayload,
  serializeAdditionalInfo,
  serializeAttrRows,
  serializeImagePreviewUrls,
} from "./dealAssets.mapper.js";
import type {
  DealAssetPayload,
  DealAssetsBundle,
  DealAssetsReplaceInput,
} from "./dealAssets.types.js";
import {
  validateDealAssetPayload,
  validateDealAssetsReplaceInput,
} from "./dealAssets.validation.js";

async function dealExists(dealId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: addDealForm.id })
    .from(addDealForm)
    .where(eq(addDealForm.id, dealId))
    .limit(1);
  return Boolean(row?.id);
}

function payloadToInsertValues(
  dealId: string,
  asset: DealAssetPayload,
  sortOrder: number,
) {
  const name = asset.draft.propertyName.trim() || asset.row.name.trim();
  const additionalInfo = asset.row.additionalInfo ?? [];
  const imageUrls = asset.imagePreviewDataUrls ?? [];
  return {
    dealId,
    clientAssetId: asset.id.trim(),
    propertyName: name,
    country: asset.draft.country.trim() || "US",
    streetAddress1: asset.draft.streetAddress1.trim(),
    streetAddress2: asset.draft.streetAddress2.trim(),
    city: asset.draft.city.trim(),
    state: asset.draft.state.trim(),
    zipCode: asset.draft.zipCode.trim(),
    addressDisplay: asset.row.address.trim() || "—",
    assetType: asset.row.assetType.trim() || "—",
    imageCount:
      typeof asset.row.imageCount === "number"
        ? asset.row.imageCount
        : imageUrls.length,
    archived: Boolean(asset.row.archived),
    additionalInfoJson: serializeAdditionalInfo(additionalInfo),
    attrRowsJson: serializeAttrRows(asset.attrRows ?? []),
    imagePreviewUrlsJson: serializeImagePreviewUrls(imageUrls),
    sortOrder: asset.sortOrder ?? sortOrder,
    updatedAt: new Date(),
  };
}

export async function listDealAssetsByDealId(
  dealId: string,
): Promise<DealAssetsBundle | null> {
  const trimmed = dealId.trim();
  if (!trimmed) return null;
  if (!(await dealExists(trimmed))) return null;

  const rows = await db
    .select()
    .from(dealAsset)
    .where(eq(dealAsset.dealId, trimmed))
    .orderBy(asc(dealAsset.sortOrder), asc(dealAsset.createdAt));

  return {
    dealId: trimmed,
    assets: rows.map(rowToDealAssetPayload),
  };
}

export async function getDealAssetByClientId(params: {
  dealId: string;
  clientAssetId: string;
}): Promise<DealAssetPayload | null> {
  const dealId = params.dealId.trim();
  const clientAssetId = params.clientAssetId.trim();
  if (!dealId || !clientAssetId) return null;
  if (!(await dealExists(dealId))) return null;

  const [row] = await db
    .select()
    .from(dealAsset)
    .where(
      and(
        eq(dealAsset.dealId, dealId),
        eq(dealAsset.clientAssetId, clientAssetId),
      ),
    )
    .limit(1);

  return row ? rowToDealAssetPayload(row) : null;
}

/** Replace all assets for a deal (full Assets section save). */
export async function replaceDealAssets(params: {
  dealId: string;
  input: DealAssetsReplaceInput;
}): Promise<
  | { ok: true; bundle: DealAssetsBundle }
  | { ok: false; message: string; fieldErrors?: Array<{ field: string; message: string }> }
> {
  const dealId = params.dealId.trim();
  if (!dealId) return { ok: false, message: "Missing deal id" };
  if (!(await dealExists(dealId)))
    return { ok: false, message: "Deal not found" };

  const validation = validateDealAssetsReplaceInput(params.input);
  if (!validation.ok) {
    return {
      ok: false,
      message: validation.message || "Invalid assets payload",
      fieldErrors: validation.fieldErrors,
    };
  }

  await db.delete(dealAsset).where(eq(dealAsset.dealId, dealId));

  const assets = params.input.assets;
  if (assets.length > 0) {
    await db.insert(dealAsset).values(
      assets.map((a, i) => payloadToInsertValues(dealId, a, i)),
    );
  }

  const bundle = await listDealAssetsByDealId(dealId);
  if (!bundle) return { ok: false, message: "Deal not found" };
  return { ok: true, bundle };
}

export async function upsertDealAsset(params: {
  dealId: string;
  asset: DealAssetPayload;
}): Promise<
  | { ok: true; asset: DealAssetPayload }
  | { ok: false; message: string; fieldErrors?: Array<{ field: string; message: string }> }
> {
  const dealId = params.dealId.trim();
  if (!dealId) return { ok: false, message: "Missing deal id" };
  if (!(await dealExists(dealId)))
    return { ok: false, message: "Deal not found" };

  const validation = validateDealAssetPayload(params.asset);
  if (!validation.ok) {
    return {
      ok: false,
      message: validation.message || "Invalid asset payload",
      fieldErrors: validation.fieldErrors,
    };
  }

  const existing = await getDealAssetByClientId({
    dealId,
    clientAssetId: params.asset.id,
  });
  const values = payloadToInsertValues(
    dealId,
    params.asset,
    params.asset.sortOrder ?? 0,
  );

  if (existing) {
    await db
      .update(dealAsset)
      .set(values)
      .where(
        and(
          eq(dealAsset.dealId, dealId),
          eq(dealAsset.clientAssetId, params.asset.id.trim()),
        ),
      );
  } else {
    await db.insert(dealAsset).values(values);
  }

  const saved = await getDealAssetByClientId({
    dealId,
    clientAssetId: params.asset.id,
  });
  if (!saved) return { ok: false, message: "Could not save asset" };
  return { ok: true, asset: saved };
}

export async function deleteDealAsset(params: {
  dealId: string;
  clientAssetId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const dealId = params.dealId.trim();
  const clientAssetId = params.clientAssetId.trim();
  if (!dealId || !clientAssetId)
    return { ok: false, message: "Missing deal or asset id" };
  if (!(await dealExists(dealId)))
    return { ok: false, message: "Deal not found" };

  await db
    .delete(dealAsset)
    .where(
      and(
        eq(dealAsset.dealId, dealId),
        eq(dealAsset.clientAssetId, clientAssetId),
      ),
    );
  return { ok: true };
}

export function parseReplaceBody(body: unknown): DealAssetsReplaceInput | null {
  if (body == null || typeof body !== "object" || Array.isArray(body))
    return null;
  const b = body as Record<string, unknown>;
  const list = Array.isArray(b.assets)
    ? b.assets
    : Array.isArray(b)
      ? b
      : null;
  if (!list) return null;
  const assets: DealAssetPayload[] = [];
  for (const item of list) {
    const parsed = parseDealAssetPayload(item);
    if (!parsed) return null;
    assets.push(parsed);
  }
  return { assets };
}

export function parseSingleAssetBody(body: unknown): DealAssetPayload | null {
  return parseDealAssetPayload(body);
}
