import * as path from "node:path";
import { eq } from "drizzle-orm";
import { getUploadsPhysicalRoot } from "../../config/uploadPaths.js";
import { db } from "../../database/db.js";
import { addDealForm } from "../../schema/deal.schema/add-deal-form.schema.js";

/** Relative segment under the uploads root for all deal-scoped files. */
export const DEAL_ASSETS_UPLOAD_SUBDIR = "deal-assets";

/** eSign template PDFs: `deal-assets/<deal-folder>/e-signed/<category>/`. */
export const DEAL_ESIGN_TEMPLATES_FOLDER = "e-signed";

/** Completed investor signatures: `deal-assets/<deal-folder>/e-signed-completed/`. */
export const DEAL_ESIGN_COMPLETED_FOLDER = "e-signed-completed";

/** Investor preview PDFs (questionnaire + template) while eSign is pending. */
export const DEAL_ESIGN_PREVIEW_FOLDER = "e-signed-preview";

/** Investment subscription uploads: `deal-assets/<deal-folder>/investments/`. */
export const DEAL_INVESTMENTS_FOLDER = "investments";

/** Safe path segment (lowercase, hyphenated). */
export function sanitizeStoragePathSegment(
  raw: string,
  maxLength: number,
): string {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
  return t || "deal";
}

/**
 * Folder name for a deal under `deal-assets/`: `{dealName}-{dealId}`.
 * Example: `green-tech-park-fund-13984f94-33b4-4123-a698-51d76cd6c0c3`
 */
export function buildDealStorageFolderName(
  dealId: string,
  dealName?: string | null,
): string {
  const idSeg = sanitizeStoragePathSegment(dealId, 36);
  const nameSeg = sanitizeStoragePathSegment(dealName?.trim() || "deal", 80);
  return `${nameSeg}-${idSeg}`;
}

export async function resolveDealStorageFolderName(
  dealId: string,
): Promise<string> {
  const id = dealId.trim();
  if (!id) return "deal";

  const [row] = await db
    .select({ dealName: addDealForm.dealName })
    .from(addDealForm)
    .where(eq(addDealForm.id, id))
    .limit(1);

  return buildDealStorageFolderName(id, row?.dealName);
}

/** `deal-assets/<deal-folder>/part1/part2/...` */
export function dealAssetsRelativePath(
  dealFolder: string,
  ...segments: string[]
): string {
  const parts = [
    DEAL_ASSETS_UPLOAD_SUBDIR,
    dealFolder,
    ...segments.filter((s) => String(s).trim()),
  ];
  return path.join(...parts).replace(/\\/g, "/");
}

export function dealAssetsAbsoluteDir(
  dealFolder: string,
  ...segments: string[]
): string {
  return path.join(
    getUploadsPhysicalRoot(),
    dealAssetsRelativePath(dealFolder, ...segments),
  );
}
