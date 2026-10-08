import type { Request, Response } from "express";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import { getSignFlowPublicConfig } from "../../config/signflow.config.js";
import { verifySignFlowConnection } from "../../services/esign/signflow.service.js";

/**
 * GET /deals/esign-templates/signflow-config
 * Returns public SignFlow config (never exposes API key).
 */
export async function getDealEsignSignFlowConfig(
  _req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(_req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  res.status(200).json(getSignFlowPublicConfig());
}

/**
 * GET /deals/esign-templates/signflow-verify
 * Confirms SignFlow health + API key (authenticated sponsors only).
 */
export async function getDealEsignSignFlowVerify(
  _req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(_req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const publicCfg = getSignFlowPublicConfig();
  if (!publicCfg.configured) {
    res.status(503).json({
      ...publicCfg,
      message:
        "SignFlow is not configured. Set SIGNFLOW_API_BASE_URL and SIGNFLOW_API_KEY in backend/.env (see API_INTEGRATION.md).",
    });
    return;
  }

  try {
    const result = await verifySignFlowConnection();
    res.status(200).json({ ...publicCfg, ...result });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "SignFlow connection failed";
    res.status(502).json({ ...publicCfg, message });
  }
}
