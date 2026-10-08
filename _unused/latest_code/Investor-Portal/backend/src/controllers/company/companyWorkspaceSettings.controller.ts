import type { Request, Response } from "express";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  getWorkspaceTabPayload,
  isWorkspaceTabKey,
  upsertWorkspaceTabPayload,
  userCanAccessCompanyWorkspace,
  userCanEditCompanyWorkspace,
} from "../../services/company/companyWorkspaceSettings.service.js";

function paramStr(v: string | string[] | undefined): string {
  if (v == null) return "";
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" ? s.trim() : "";
}

function pgErrorCode(err: unknown): string {
  let e: unknown = err;
  for (let i = 0; i < 4 && e != null; i += 1) {
    if (typeof e === "object" && e !== null && "code" in e) {
      const c = (e as { code?: unknown }).code;
      if (typeof c === "string" && c.length > 0) return c;
    }
    e =
      typeof e === "object" && e !== null && "cause" in e
        ? (e as { cause: unknown }).cause
        : null;
  }
  return "";
}

export async function getWorkspaceTabSettings(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const user = await getValidJwtUser(req);
    if (!user?.id) {
      res.status(401).json({ message: "Authorization required" });
      return;
    }
    const companyId = paramStr(req.params.companyId);
    const tabKeyRaw = paramStr(req.params.tabKey);
    if (!companyId || !tabKeyRaw || !isWorkspaceTabKey(tabKeyRaw)) {
      res.status(400).json({ message: "Invalid company or workspace tab" });
      return;
    }
    const can = await userCanAccessCompanyWorkspace(
      user.id,
      user.userRole,
      companyId,
    );
    if (!can) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    const payload = await getWorkspaceTabPayload(companyId, tabKeyRaw);
    res.status(200).json({ payload });
  } catch (err) {
    console.error("getWorkspaceTabSettings:", err);
    if (!res.headersSent) {
      res
        .status(500)
        .json({ message: "Could not load workspace settings" });
    }
  }
}

export async function putWorkspaceTabSettings(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const user = await getValidJwtUser(req);
    if (!user?.id) {
      res.status(401).json({ message: "Authorization required" });
      return;
    }
    const companyId = paramStr(req.params.companyId);
    const tabKeyRaw = paramStr(req.params.tabKey);
    if (!companyId || !tabKeyRaw || !isWorkspaceTabKey(tabKeyRaw)) {
      res.status(400).json({ message: "Invalid company or workspace tab" });
      return;
    }
    const can = await userCanEditCompanyWorkspace(
      user.id,
      user.userRole,
      companyId,
    );
    if (!can) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    const b = req.body as unknown;
    let payload: Record<string, unknown> = {};
    if (b != null && typeof b === "object" && !Array.isArray(b)) {
      const o = b as Record<string, unknown>;
      const inner = o.payload;
      if (
        inner != null &&
        typeof inner === "object" &&
        !Array.isArray(inner)
      ) {
        payload = { ...(inner as Record<string, unknown>) };
      } else {
        payload = { ...o };
      }
    }
    try {
      await upsertWorkspaceTabPayload(companyId, tabKeyRaw, payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save";
      if (msg.startsWith("Invalid workspace company id")) {
        res.status(400).json({ message: msg });
        return;
      }
      if (pgErrorCode(err) === "23503") {
        res.status(400).json({
          message:
            "Workspace could not be saved: company is missing in the database (check workspace company id).",
        });
        return;
      }
      console.error("putWorkspaceTabSettings:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Could not save workspace settings" });
      }
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("putWorkspaceTabSettings:", err);
    if (!res.headersSent) {
      res.status(500).json({ message: "Could not save workspace settings" });
    }
  }
}
