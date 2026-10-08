import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { companies } from "../../schema/schema.js";
import { getWorkspaceTabPayloadWithUpdatedAt } from "../../services/company/companyWorkspaceSettings.service.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function paramStr(v: string | string[] | undefined): string {
  if (v == null) return "";
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" ? s.trim() : "";
}

/**
 * Public: logo / background / tab icon URLs for sign-in and other unauthenticated screens.
 * No secrets; only non-sensitive paths from workspace `settings` tab JSON.
 */
export async function getPublicCompanyBranding(
  req: Request,
  res: Response,
): Promise<void> {
  const raw = paramStr(req.params.companyId);
  const id = raw.toLowerCase();
  if (!id || !UUID_RE.test(id)) {
    res.status(400).json({ message: "Invalid company id" });
    return;
  }
  const [row] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1);
  if (!row) {
    res.status(404).json({ message: "Company not found" });
    return;
  }
  const { payload: p, updatedAt: settingsRowUpdatedAt } =
    await getWorkspaceTabPayloadWithUpdatedAt(id, "settings");
  const logoUrl =
    typeof p.logoImageUrl === "string" && p.logoImageUrl.trim()
      ? p.logoImageUrl.trim()
      : null;
  const bgUrl =
    typeof p.backgroundImageUrl === "string" && p.backgroundImageUrl.trim()
      ? p.backgroundImageUrl.trim()
      : null;
  const iconFromUrl =
    typeof p.logoIconUrl === "string" && p.logoIconUrl.trim()
      ? p.logoIconUrl.trim()
      : "";
  const iconFromKey =
    typeof p.logoIcon === "string" && p.logoIcon.trim() ? p.logoIcon.trim() : "";
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.status(200).json({
    logoImageUrl: logoUrl,
    backgroundImageUrl: bgUrl,
    logoIconUrl: iconFromUrl || iconFromKey || null,
    settingsTabUpdatedAt:
      settingsRowUpdatedAt != null
        ? settingsRowUpdatedAt.toISOString()
        : null,
  });
}
