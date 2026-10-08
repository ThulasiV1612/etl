import { Readable } from "node:stream";
import { URL } from "node:url";
import { v2 as cloudinary } from "cloudinary";
export type CloudinaryBrandingAssetType = "logo" | "background" | "logoIcon";

let didConfigure = false;

function unquote(v: string): string {
  const s = String(v ?? "").trim();
  if (s.length >= 2) {
    const a = s[0];
    const b = s[s.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) return s.slice(1, -1).trim();
  }
  return s;
}

/**
 * True when the env has either a full `CLOUDINARY_URL` or the three named variables.
 */
export function isCloudinaryConfigured(): boolean {
  if (unquote(String(process.env.CLOUDINARY_URL ?? "")).length > 0) return true;
  const n = unquote(String(process.env.CLOUDINARY_CLOUD_NAME ?? ""));
  const k = unquote(String(process.env.CLOUDINARY_API_KEY ?? ""));
  const s = unquote(String(process.env.CLOUDINARY_API_SECRET ?? ""));
  return Boolean(n && k && s);
}

/** Official format: `cloudinary://<API_KEY>:<API_SECRET>@<CLOUD_NAME>`. The cloud name is the host. */
function configFromCloudinaryUrl(envUrl: string): {
  cloud_name: string;
  api_key: string;
  api_secret: string;
} {
  const raw = unquote(envUrl);
  if (!raw.toLowerCase().startsWith("cloudinary://")) {
    throw new Error(
      "Invalid CLOUDINARY_URL: it must start with cloudinary:// (not https). Copy the full variable from the Cloudinary dashboard, or set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
    );
  }
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(
      "Invalid CLOUDINARY_URL: could not parse. Expected cloudinary://API_KEY:API_SECRET@CLOUD_NAME",
    );
  }
  if (u.protocol !== "cloudinary:") {
    throw new Error("Invalid CLOUDINARY_URL: protocol must be cloudinary:");
  }
  const cloud_name = u.hostname.trim();
  const api_key = (u.username ?? "").trim();
  const api_secret = (u.password ?? "").trim();
  if (!cloud_name || !api_key || !api_secret) {
    throw new Error(
      "Invalid CLOUDINARY_URL: missing API key, secret, or cloud name. Format: cloudinary://<API_KEY>:<API_SECRET>@<CLOUD_NAME> (e.g. cloudinary://1234567890:xxxxx@mycloud). If your API secret includes special characters, URL-encode them in the string.",
    );
  }
  return { cloud_name, api_key, api_secret };
}

function applyCloudinaryConfigFromEnv(): void {
  const name = unquote(String(process.env.CLOUDINARY_CLOUD_NAME ?? ""));
  const key = unquote(String(process.env.CLOUDINARY_API_KEY ?? ""));
  const sec = unquote(String(process.env.CLOUDINARY_API_SECRET ?? ""));
  if (name && key && sec) {
    cloudinary.config({ cloud_name: name, api_key: key, api_secret: sec, secure: true });
    return;
  }
  const url = unquote(String(process.env.CLOUDINARY_URL ?? ""));
  if (url) {
    const parsed = configFromCloudinaryUrl(url);
    cloudinary.config({
      cloud_name: parsed.cloud_name,
      api_key: parsed.api_key,
      api_secret: parsed.api_secret,
      secure: true,
    });
    return;
  }
  throw new Error("Cloudinary is not configured (set CLOUDINARY_URL or all of CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).");
}

function configureIfNeeded(): void {
  if (didConfigure) return;
  if (!isCloudinaryConfigured()) {
    throw new Error("Cloudinary is not configured (set CLOUDINARY_URL or cloud name + key + secret).");
  }
  applyCloudinaryConfigFromEnv();
  didConfigure = true;
}

function folderForCompany(companyId: string): string {
  return `investor_portal/companies/${companyId.toLowerCase()}`;
}

function folderForDeal(dealId: string | undefined): string {
  const id = String(dealId ?? "").trim().toLowerCase();
  if (id) return `investor_portal/deals/${id}`;
  return "investor_portal/deals/unassigned";
}

async function uploadImageBufferToCloudinary(opts: {
  folder: string;
  publicIdStem: string;
  buffer: Buffer;
}): Promise<{ secureUrl: string; publicId: string }> {
  configureIfNeeded();
  const idPart = `${opts.publicIdStem.replace(/[^a-z0-9_-]/gi, "_")}-${Date.now()}`;
  const uploadOptions = {
    folder: opts.folder,
    public_id: idPart,
    resource_type: "image" as const,
    overwrite: false,
    use_filename: false,
    unique_filename: false,
    invalidate: true,
  };
  const res = await new Promise<{
    secure_url?: string;
    public_id?: string;
  }>((resolve, reject) => {
    /**
     * `v2` uploader uses `v1_adapters` with `upload_stream: 0` → the public call order is
     * `(options, callback)`, not the v1 `(callback, options)`. Passing them reversed makes the
     * options object the “callback” in `v1_result_adapter` → "callback is not a function" when
     * the upload response arrives.
     */
    const uploader = cloudinary.uploader.upload_stream(
      uploadOptions,
      (err: Error | null | undefined, result?: { secure_url?: string; public_id?: string }) => {
        if (err) {
          reject(err);
          return;
        }
        resolve((result as { secure_url?: string; public_id?: string }) ?? {});
      },
    );
    uploader.on("error", (e: Error) => reject(e));
    Readable.from(opts.buffer).pipe(uploader);
  });

  const secureUrl = String(res?.secure_url ?? "").trim();
  const publicId = String(res?.public_id ?? "").trim();
  if (!secureUrl || !publicId) {
    throw new Error("Cloudinary upload did not return a secure URL and public id.");
  }
  return { secureUrl, publicId };
}

/**
 * Upload a workspace branding file to Cloudinary, scoped by company id in the folder.
 * Returns the delivery URL and the public id (path) for the asset.
 */
export async function uploadCompanyBrandingToCloudinary(opts: {
  companyId: string;
  assetType: CloudinaryBrandingAssetType;
  buffer: Buffer;
  mimetype: string;
}): Promise<{ secureUrl: string; publicId: string }> {
  return uploadImageBufferToCloudinary({
    folder: folderForCompany(opts.companyId),
    publicIdStem: opts.assetType.replace(/[^a-z0-9_]/gi, "_"),
    buffer: opts.buffer,
  });
}

/**
 * Upload a deal gallery / asset image to Cloudinary.
 * When `dealId` is missing (create-deal flow), files land under `investor_portal/deals/unassigned/`.
 */
export async function uploadDealImageToCloudinary(opts: {
  dealId?: string;
  buffer: Buffer;
  labelStem: string;
}): Promise<{ secureUrl: string; publicId: string }> {
  return uploadImageBufferToCloudinary({
    folder: folderForDeal(opts.dealId),
    publicIdStem: opts.labelStem,
    buffer: opts.buffer,
  });
}

/** True for `https://res.cloudinary.com/...` delivery URLs stored in deal gallery fields. */
export function isCloudinaryDeliveryUrl(raw: string): boolean {
  const s = String(raw ?? "").trim();
  if (!/^https?:\/\//i.test(s)) return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && /(^|\.)res\.cloudinary\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

/** Best-effort delete; logs and ignores failures. */
export async function destroyCloudinaryByPublicId(publicId: string): Promise<void> {
  const id = String(publicId ?? "").trim();
  if (!id || !isCloudinaryConfigured()) return;
  try {
    configureIfNeeded();
    await cloudinary.uploader.destroy(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console -- best-effort cleanup
      console.warn("destroyCloudinaryByPublicId:", id, msg);
    }
  }
}
