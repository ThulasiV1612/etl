import * as fs from "node:fs";
import * as path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { getUploadsPhysicalRoot } from "../config/uploadPaths.js";
import { bearerToken, getJwtUser } from "./jwtUser.js";
import { readRefreshTokenFromRequest } from "../utils/authCookies.js";
import { verifyUploadSignature } from "../utils/uploadSignedUrl.js";
import { resolvePublicPreviewDealId } from "../utils/offeringPreviewCrypto.js";
import { hashToken } from "../utils/tokenHash.js";
import { db } from "../database/db.js";
import { userAuthTokens } from "../schema/auth.schema/userAuthTokens.schema.js";
import { and, eq, isNull } from "drizzle-orm";

const BLOCKED_EXTENSIONS = new Set([
  ".sql",
  ".env",
  ".pem",
  ".key",
  ".sh",
  ".bat",
  ".cmd",
  ".exe",
  ".php",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".html",
  ".htm",
]);

function uploadsRelativeFromRequest(req: Request): string | null {
  const raw = req.path.replace(/^\/+/, "");
  if (!raw || raw.includes("..")) return null;
  return raw;
}

function hasBlockedExtension(relativePath: string): boolean {
  const ext = path.extname(relativePath).toLowerCase();
  return BLOCKED_EXTENSIONS.has(ext);
}

async function refreshTokenIsActive(req: Request): Promise<boolean> {
  const token = readRefreshTokenFromRequest(req);
  if (!token) return false;
  const [row] = await db
    .select({ expiresAt: userAuthTokens.expiresAt })
    .from(userAuthTokens)
    .where(
      and(
        eq(userAuthTokens.tokenHash, hashToken(token)),
        eq(userAuthTokens.tokenType, "refresh"),
        isNull(userAuthTokens.revokedAt),
      ),
    )
    .limit(1);
  return Boolean(row && row.expiresAt > new Date());
}

function previewTokenGrantsPath(
  previewToken: string,
  relativePath: string,
): boolean {
  try {
    const dealId = resolvePublicPreviewDealId(previewToken.trim());
    if (!dealId) return false;
    const norm = relativePath.toLowerCase();
    return norm.includes(dealId.toLowerCase());
  } catch {
    return false;
  }
}

function signedQueryGrantsPath(req: Request, relativePath: string): boolean {
  const expRaw = req.query.e;
  const sigRaw = req.query.s;
  const exp = Number(
    typeof expRaw === "string" ? expRaw : Array.isArray(expRaw) ? expRaw[0] : "",
  );
  const sig =
    typeof sigRaw === "string" ? sigRaw : Array.isArray(sigRaw) ? sigRaw[0] : "";
  return verifyUploadSignature(relativePath, exp, String(sig ?? ""));
}

async function requestMayAccessUploads(
  req: Request,
  relativePath: string,
): Promise<boolean> {
  if (signedQueryGrantsPath(req, relativePath)) return true;

  const previewRaw = req.query.preview;
  const preview =
    typeof previewRaw === "string"
      ? previewRaw
      : Array.isArray(previewRaw)
        ? String(previewRaw[0] ?? "")
        : "";
  if (preview && previewTokenGrantsPath(preview, relativePath)) return true;

  if (bearerToken(req) && getJwtUser(req)?.id) return true;
  if (await refreshTokenIsActive(req)) return true;

  return false;
}

/**
 * Serves files from the uploads root after auth, signed URL, or valid preview token.
 */
export async function protectedUploadsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).json({ message: "Method not allowed" });
    return;
  }

  const relativePath = uploadsRelativeFromRequest(req);
  if (!relativePath) {
    res.status(400).json({ message: "Invalid path" });
    return;
  }

  if (hasBlockedExtension(relativePath)) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  const allowed = await requestMayAccessUploads(req, relativePath);
  if (!allowed) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const root = getUploadsPhysicalRoot();
  const abs = path.resolve(root, relativePath);
  if (!abs.startsWith(path.resolve(root))) {
    res.status(400).json({ message: "Invalid path" });
    return;
  }

  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    res.status(404).end();
    return;
  }

  res.sendFile(abs, (err) => {
    if (err && !res.headersSent) next(err);
  });
}
