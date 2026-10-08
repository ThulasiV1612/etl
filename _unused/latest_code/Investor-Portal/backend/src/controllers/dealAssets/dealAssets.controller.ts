import type { Request, Response } from "express";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  assertDealIdInViewerScope,
  resolveDealViewerScope,
} from "../../services/deal/dealAccess.service.js";
import { requestedOrganizationIdFromRequest } from "../../services/org/orgResolution.service.js";
import {
  deleteDealAsset,
  getDealAssetByClientId,
  listDealAssetsByDealId,
  parseReplaceBody,
  parseSingleAssetBody,
  replaceDealAssets,
  upsertDealAsset,
} from "../../services/dealAssets/dealAssets.service.js";

function paramId(v: string | string[] | undefined): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return "";
}

async function assertDealAccess(
  req: Request,
  dealId: string,
): Promise<
  | { ok: true }
  | { ok: false; status: number; message: string }
> {
  const user = await getValidJwtUser(req);
  if (!user?.id)
    return { ok: false, status: 401, message: "Authorization required" };
  const scope = await resolveDealViewerScope(
    user.id,
    user.userRole,
    requestedOrganizationIdFromRequest(req),
  );
  if (!(await assertDealIdInViewerScope(dealId, scope)))
    return { ok: false, status: 404, message: "Deal not found" };
  return { ok: true };
}

/** GET /deals/:dealId/assets — list Assets section + additional information */
export async function getDealAssets(
  req: Request,
  res: Response,
): Promise<void> {
  const dealId = paramId(req.params.dealId);
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  const access = await assertDealAccess(req, dealId);
  if (!access.ok) {
    res.status(access.status).json({ message: access.message });
    return;
  }
  try {
    const bundle = await listDealAssetsByDealId(dealId);
    if (!bundle) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    res.status(200).json({ assets: bundle.assets, dealId: bundle.dealId });
  } catch (err) {
    console.error("getDealAssets:", err);
    res.status(500).json({ message: "Could not load deal assets" });
  }
}

/** GET /deals/:dealId/assets/:assetId — one asset by client id */
export async function getDealAsset(
  req: Request,
  res: Response,
): Promise<void> {
  const dealId = paramId(req.params.dealId);
  const assetId = paramId(req.params.assetId);
  if (!dealId || !assetId) {
    res.status(400).json({ message: "Missing deal or asset id" });
    return;
  }
  const access = await assertDealAccess(req, dealId);
  if (!access.ok) {
    res.status(access.status).json({ message: access.message });
    return;
  }
  try {
    const asset = await getDealAssetByClientId({
      dealId,
      clientAssetId: assetId,
    });
    if (!asset) {
      res.status(404).json({ message: "Asset not found" });
      return;
    }
    res.status(200).json({ asset });
  } catch (err) {
    console.error("getDealAsset:", err);
    res.status(500).json({ message: "Could not load deal asset" });
  }
}

/** PUT /deals/:dealId/assets — replace full Assets section for the deal */
export async function putDealAssets(
  req: Request,
  res: Response,
): Promise<void> {
  const dealId = paramId(req.params.dealId);
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  const access = await assertDealAccess(req, dealId);
  if (!access.ok) {
    res.status(access.status).json({ message: access.message });
    return;
  }
  const input = parseReplaceBody(req.body);
  if (!input) {
    res.status(400).json({
      message: "Body must be { assets: DealAssetPayload[] }",
    });
    return;
  }
  try {
    const result = await replaceDealAssets({ dealId, input });
    if (!result.ok) {
      res.status(400).json({
        message: result.message,
        fieldErrors: result.fieldErrors,
      });
      return;
    }
    res.status(200).json({
      assets: result.bundle.assets,
      dealId: result.bundle.dealId,
    });
  } catch (err) {
    console.error("putDealAssets:", err);
    res.status(500).json({ message: "Could not save deal assets" });
  }
}

/** PUT /deals/:dealId/assets/:assetId — upsert one asset */
export async function putDealAsset(
  req: Request,
  res: Response,
): Promise<void> {
  const dealId = paramId(req.params.dealId);
  const assetId = paramId(req.params.assetId);
  if (!dealId || !assetId) {
    res.status(400).json({ message: "Missing deal or asset id" });
    return;
  }
  const access = await assertDealAccess(req, dealId);
  if (!access.ok) {
    res.status(access.status).json({ message: access.message });
    return;
  }
  const parsed = parseSingleAssetBody(req.body);
  if (!parsed) {
    res.status(400).json({ message: "Invalid asset payload" });
    return;
  }
  const asset = { ...parsed, id: assetId };
  try {
    const result = await upsertDealAsset({ dealId, asset });
    if (!result.ok) {
      res.status(400).json({
        message: result.message,
        fieldErrors: result.fieldErrors,
      });
      return;
    }
    res.status(200).json({ asset: result.asset });
  } catch (err) {
    console.error("putDealAsset:", err);
    res.status(500).json({ message: "Could not save deal asset" });
  }
}

/** POST /deals/:dealId/assets — create / upsert one asset */
export async function postDealAsset(
  req: Request,
  res: Response,
): Promise<void> {
  const dealId = paramId(req.params.dealId);
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  const access = await assertDealAccess(req, dealId);
  if (!access.ok) {
    res.status(access.status).json({ message: access.message });
    return;
  }
  const asset = parseSingleAssetBody(req.body);
  if (!asset) {
    res.status(400).json({ message: "Invalid asset payload" });
    return;
  }
  try {
    const result = await upsertDealAsset({ dealId, asset });
    if (!result.ok) {
      res.status(400).json({
        message: result.message,
        fieldErrors: result.fieldErrors,
      });
      return;
    }
    res.status(201).json({ asset: result.asset });
  } catch (err) {
    console.error("postDealAsset:", err);
    res.status(500).json({ message: "Could not create deal asset" });
  }
}

/** DELETE /deals/:dealId/assets/:assetId */
export async function deleteDealAssetHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const dealId = paramId(req.params.dealId);
  const assetId = paramId(req.params.assetId);
  if (!dealId || !assetId) {
    res.status(400).json({ message: "Missing deal or asset id" });
    return;
  }
  const access = await assertDealAccess(req, dealId);
  if (!access.ok) {
    res.status(access.status).json({ message: access.message });
    return;
  }
  try {
    const result = await deleteDealAsset({
      dealId,
      clientAssetId: assetId,
    });
    if (!result.ok) {
      res.status(404).json({ message: result.message });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("deleteDealAssetHandler:", err);
    res.status(500).json({ message: "Could not delete deal asset" });
  }
}
