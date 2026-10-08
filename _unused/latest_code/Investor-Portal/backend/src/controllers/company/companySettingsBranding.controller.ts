import type { Request, Response } from "express";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getUploadsPhysicalRoot } from "../../config/uploadPaths.js";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  getWorkspaceTabPayload,
  upsertWorkspaceTabPayload,
  userCanEditCompanyWorkspace,
} from "../../services/company/companyWorkspaceSettings.service.js";
import {
  destroyCloudinaryByPublicId,
  isCloudinaryConfigured,
  uploadCompanyBrandingToCloudinary,
} from "../../services/company/cloudinaryCompanyBranding.service.js";
import { logSocCompanyBrandingUpload } from "../../audit/index.js";

const ASSET_TYPES = new Set(["logo", "background", "logoIcon"]);

const ASSET_TYPE_TO_SETTINGS_KEY: Record<
  string,
  "logoImageUrl" | "backgroundImageUrl" | "logoIconUrl"
> = {
  logo: "logoImageUrl",
  background: "backgroundImageUrl",
  logoIcon: "logoIconUrl",
};

/** Cloudinary `public_id` (path) for replacing/deleting the previous asset. */
const ASSET_TYPE_TO_PUBLIC_ID_KEY: Record<
  string,
  "logoImagePublicId" | "backgroundImagePublicId" | "logoIconPublicId"
> = {
  logo: "logoImagePublicId",
  background: "backgroundImagePublicId",
  logoIcon: "logoIconPublicId",
};

const MAX_BYTES = 1 * 1024 * 1024;

const ALLOWED_IMAGE_EXT = new Set(["png", "jpg", "webp", "gif", "svg", "ico"]);

function extFromMimetype(m: string): string {
  const m2 = m.toLowerCase();
  if (m2 === "image/png") return "png";
  if (m2 === "image/jpeg" || m2 === "image/jpg") return "jpg";
  if (m2 === "image/webp") return "webp";
  if (m2 === "image/gif") return "gif";
  if (m2 === "image/svg+xml") return "svg";
  if (
    m2 === "image/x-icon" ||
    m2 === "image/vnd.microsoft.icon" ||
    m2 === "image/ico"
  ) {
    return "ico";
  }
  return "";
}

function extFromOriginalFilename(originalname: string): string {
  const b = path.extname(originalname).toLowerCase();
  if (b === ".png") return "png";
  if (b === ".jpg" || b === ".jpeg") return "jpg";
  if (b === ".webp") return "webp";
  if (b === ".gif") return "gif";
  if (b === ".svg") return "svg";
  if (b === ".ico") return "ico";
  return "";
}

/**
 * Browsers / OS often send .ico (tab icons) with x-icon, octet-stream, or an empty type.
 * We only allow known extensions (see ALLOWED_IMAGE_EXT) after mimetype+filename fallbacks.
 */
function resolveBrandingFileExtension(
  mimetype: string,
  originalname: string,
): string {
  const m = String(mimetype || "").toLowerCase();
  const fromM = extFromMimetype(m);
  if (fromM && ALLOWED_IMAGE_EXT.has(fromM)) return fromM;
  const fromName = extFromOriginalFilename(originalname);
  if (fromName && ALLOWED_IMAGE_EXT.has(fromName)) return fromName;
  return "";
}

function isAcceptableBrandingMimetype(
  mimetype: string,
  hasKnownExt: boolean,
): boolean {
  const m = String(mimetype || "").toLowerCase();
  if (m.startsWith("image/")) return true;
  /** Some OS/browsers (esp. for SVG, ICO) send empty type, octet-stream, or text/plain. */
  if (
    hasKnownExt &&
    (m === "application/octet-stream" || m === "" || m === "text/plain")
  ) {
    return true;
  }
  return false;
}

/**
 * When multipart has no original filename and/or empty type (Edge, clipboard), infer format from
 * the first few bytes. Only allows the same set as `ALLOWED_IMAGE_EXT`.
 */
function sniffImageBufferExt(buf: Buffer): string {
  if (buf.length < 4) return "";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "png";
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "gif";
  if (buf.length >= 12) {
    if (buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
      return "webp";
    }
  }
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) {
    return "ico";
  }
  const head = buf.subarray(0, Math.min(512, buf.length)).toString("utf8").toLowerCase();
  if (head.includes("<svg") || head.trimStart().startsWith("<?xml")) {
    if (head.includes("svg") || head.includes("xmlns")) return "svg";
  }
  return "";
}

function defaultMimetypeForExt(ext: string): string {
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}

function paramStr(v: string | string[] | undefined): string {
  if (v == null) return "";
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" ? s.trim() : "";
}

/** Disk path under `getUploadsPhysicalRoot()` for company branding files. */
const COMPANY_BRANDING_UPLOAD_SUBDIR = "company-branding";

/**
 * POST multipart `file` — image for company settings (logo, full-page background, favicon-style icon).
 *
 * **Cloudinary** (when `CLOUDINARY_URL` or cloud name + key + secret is set):
 * files go to folder `investor_portal/companies/<companyId>/` with a unique public id; the
 * `settings` tab JSON stores the HTTPS `secure_url` and the `public_id` in `*ImagePublicId` keys.
 *
 * **Fallback** (no Cloudinary): files are written under `uploads/company-branding/<companyId>/`
 * and the response is `{ url: "/uploads/company-branding/…" }`; public id fields are cleared.
 */
export async function postCompanySettingsBranding(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const companyId = paramStr(req.params.companyId);
  const assetType = paramStr(req.params.assetType);
  if (!companyId || !ASSET_TYPES.has(assetType)) {
    res.status(400).json({ message: "Invalid company or asset type" });
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
  const file = req.file;
  if (!file?.buffer?.length) {
    const ct = String(req.get("content-type") ?? "");
    if (process.env.NODE_ENV !== "production") {
      console.warn("postCompanySettingsBranding: no file buffer", {
        contentType: ct || null,
        hasFileObject: Boolean(req.file),
        method: req.method,
      });
    }
    res.status(400).json({
      message:
        ct && ct.toLowerCase().includes("multipart")
          ? 'Missing or empty "file" in multipart form.'
          : `Use multipart form-data with a field named "file". Received: ${ct || "no Content-Type"}`,
    });
    return;
  }
  if (file.size > MAX_BYTES) {
    res.status(400).json({ message: "File too large (max 1 MB)" });
    return;
  }
  let originalname = String(
    (file as { originalname?: string }).originalname ?? "",
  );
  if (!String(originalname).trim()) {
    const fromM = extFromMimetype(String(file.mimetype || ""));
    originalname = fromM ? `image.${fromM}` : "image";
  }
  let ext = resolveBrandingFileExtension(
    file.mimetype ?? "",
    originalname,
  );
  if (!ext && file.buffer && file.buffer.length) {
    const sniffed = sniffImageBufferExt(file.buffer);
    if (sniffed && ALLOWED_IMAGE_EXT.has(sniffed)) ext = sniffed;
  }
  if (!ext) {
    res.status(400).json({
      message:
        "Unsupported file type. Use PNG, JPEG, WebP, GIF, SVG, or ICO (e.g. favicon).",
    });
    return;
  }
  if (!isAcceptableBrandingMimetype(String(file.mimetype || ""), Boolean(ext))) {
    res.status(400).json({ message: "File must be an image" });
    return;
  }

  const settingsKey = ASSET_TYPE_TO_SETTINGS_KEY[assetType]!;
  const publicIdKey = ASSET_TYPE_TO_PUBLIC_ID_KEY[assetType]!;
  const useCloud = isCloudinaryConfigured();
  const cid = companyId.toLowerCase();
  const existing = await getWorkspaceTabPayload(companyId, "settings");
  const oldCloudPublicIdRaw = existing[publicIdKey];
  const oldCloudPublicId =
    typeof oldCloudPublicIdRaw === "string" && oldCloudPublicIdRaw.trim()
      ? oldCloudPublicIdRaw.trim()
      : "";

  if (useCloud) {
    let newPublicId = "";
    try {
      const rawType = String(file.mimetype || "").trim();
      const mimetype = rawType
        ? rawType
        : defaultMimetypeForExt(ext);
      const { secureUrl, publicId } = await uploadCompanyBrandingToCloudinary({
        companyId: cid,
        assetType: assetType as "logo" | "background" | "logoIcon",
        buffer: file.buffer,
        mimetype,
      });
      newPublicId = publicId;
      try {
        await upsertWorkspaceTabPayload(companyId, "settings", {
          [settingsKey]: secureUrl,
          [publicIdKey]: publicId,
        });
      } catch (e) {
        await destroyCloudinaryByPublicId(newPublicId);
        throw e;
      }
      if (oldCloudPublicId && oldCloudPublicId !== newPublicId) {
        void destroyCloudinaryByPublicId(oldCloudPublicId);
      }
      logSocCompanyBrandingUpload({
        actorUserId: user.id,
        companyId,
        assetType,
        storage: "cloudinary",
      });
      res.status(200).json({ url: secureUrl, publicId: newPublicId });
    } catch (e) {
      console.error("postCompanySettingsBranding Cloudinary:", e);
      const raw =
        e instanceof Error
          ? e.message
          : "Could not upload file to cloud storage";
      if (
        raw.toLowerCase().includes("not configured") ||
        raw.toLowerCase().includes("cloudinary://")
      ) {
        res.status(500).json({ message: raw });
        return;
      }
      const short =
        raw.length > 220
          ? `${raw.slice(0, 200)}…`
          : raw;
      res.status(500).json({
        message: `Cloudinary upload failed: ${short}`.replace(/\s+/g, " "),
      });
    }
    return;
  }

  const fileName = `${assetType}-${Date.now()}.${ext}`;
  const root = getUploadsPhysicalRoot();
  const full = path.join(root, COMPANY_BRANDING_UPLOAD_SUBDIR, cid, fileName);
  const base = path.posix.join(
    COMPANY_BRANDING_UPLOAD_SUBDIR,
    cid,
    fileName,
  );
  try {
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, file.buffer);
  } catch (e) {
    console.error("postCompanySettingsBranding write:", e);
    res.status(500).json({ message: "Could not store file" });
    return;
  }
  const url = `/uploads/${base}`;

  try {
    await upsertWorkspaceTabPayload(companyId, "settings", {
      [settingsKey]: url,
      [publicIdKey]: null,
    });
    if (oldCloudPublicId) {
      void destroyCloudinaryByPublicId(oldCloudPublicId);
    }
  } catch (e) {
    console.error("postCompanySettingsBranding workspace settings update:", e);
    try {
      await fs.unlink(full);
    } catch {
      // ignore
    }
    res.status(500).json({
      message: "File was stored but workspace settings could not be updated. Try again.",
    });
    return;
  }
  logSocCompanyBrandingUpload({
    actorUserId: user.id,
    companyId,
    assetType,
    storage: "disk",
  });
  res.status(200).json({ url, publicId: null });
}
