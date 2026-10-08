import {
  createCipheriv,
  createDecipheriv,
  createHash,
  scryptSync,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const KDF_SALT = "offering-preview-token-v1";
/** Mixed into SHA-256 so IV derivation is distinct from other hashes. */
const IV_DOMAIN = "offering-preview-iv-v1";
const SPONSOR_REF_IV_DOMAIN = "offering-preview-sponsor-ref-iv-v1";

/** Any standard UUID (version-agnostic) after decrypt or legacy plain query. */
const DEAL_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secretKey(): Buffer {
  const s = process.env.OFFERING_PREVIEW_SECRET?.trim();
  if (!s) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("OFFERING_PREVIEW_SECRET is required in production.");
    }
    return scryptSync("dev-insecure-offering-preview", KDF_SALT, 32);
  }
  return scryptSync(s, KDF_SALT, 32);
}

/**
 * Stable IV per deal id so the same secret + deal always yields the same preview token
 * (share links do not change on every mint).
 */
function deterministicIvForDeal(normalizedDealId: string): Buffer {
  return createHash("sha256")
    .update(normalizedDealId, "utf8")
    .update("\0", "utf8")
    .update(IV_DOMAIN, "utf8")
    .digest()
    .subarray(0, IV_LEN);
}

/**
 * AES-256-GCM ciphertext for the deal UUID (iv.tag.payload as base64url, dot-separated).
 * Hides the raw id in share URLs; requires the same OFFERING_PREVIEW_SECRET to open.
 * IV is derived from the deal id so tokens are stable across requests.
 */
export function encryptOfferingPreviewDealId(dealId: string): string {
  const id = dealId.trim();
  if (!DEAL_UUID_RE.test(id)) {
    throw new Error("Invalid deal id for preview token.");
  }
  const normalized = id.toLowerCase();
  const key = secretKey();
  const iv = deterministicIvForDeal(normalized);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}

export function decryptOfferingPreviewToken(token: string): string | null {
  const raw = token.trim();
  if (!raw || raw.split(".").length !== 3) return null;
  const [ivB64, tagB64, dataB64] = raw.split(".");
  try {
    const key = secretKey();
    const iv = Buffer.from(ivB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    const data = Buffer.from(dataB64, "base64url");
    if (iv.length !== IV_LEN || tag.length !== 16) return null;
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    const id = dec.toString("utf8").trim();
    return DEAL_UUID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Resolve `preview` query value to a deal UUID: legacy plain UUID first, else encrypted token.
 */
export function resolvePublicPreviewDealId(previewParam: string): string | null {
  const t = previewParam.trim();
  if (!t) return null;
  if (DEAL_UUID_RE.test(t)) return t;
  return decryptOfferingPreviewToken(t);
}

function normalizeUuidForPreview(id: string): string | null {
  const t = id.trim();
  return DEAL_UUID_RE.test(t) ? t.toLowerCase() : null;
}

function deterministicIvForSponsorRef(dealId: string, sponsorUserId: string): Buffer {
  return createHash("sha256")
    .update(dealId.toLowerCase(), "utf8")
    .update("\0", "utf8")
    .update(sponsorUserId.toLowerCase(), "utf8")
    .update("\0", "utf8")
    .update(SPONSOR_REF_IV_DOMAIN, "utf8")
    .digest()
    .subarray(0, IV_LEN);
}

/**
 * Encrypted sponsor attribution for offering preview URLs (`ref=` query param).
 * Binds a portal user id to a deal so investors see the referring sponsor in Invest Now.
 */
export function encryptOfferingPreviewSponsorRef(
  dealId: string,
  sponsorUserId: string,
): string {
  const d = normalizeUuidForPreview(dealId);
  const s = normalizeUuidForPreview(sponsorUserId);
  if (!d || !s) {
    throw new Error("Invalid deal or sponsor id for preview sponsor ref.");
  }
  const payload = `${d}:${s}`;
  const key = secretKey();
  const iv = deterministicIvForSponsorRef(d, s);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}

export function decryptOfferingPreviewSponsorRef(
  refToken: string,
): { dealId: string; sponsorUserId: string } | null {
  const raw = refToken.trim();
  if (!raw || raw.split(".").length !== 3) return null;
  const [ivB64, tagB64, dataB64] = raw.split(".");
  try {
    const key = secretKey();
    const iv = Buffer.from(ivB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    const data = Buffer.from(dataB64, "base64url");
    if (iv.length !== IV_LEN || tag.length !== 16) return null;
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    const payload = dec.toString("utf8").trim();
    const sep = payload.indexOf(":");
    if (sep <= 0) return null;
    const dealId = normalizeUuidForPreview(payload.slice(0, sep));
    const sponsorUserId = normalizeUuidForPreview(payload.slice(sep + 1));
    if (!dealId || !sponsorUserId) return null;
    return { dealId, sponsorUserId };
  } catch {
    return null;
  }
}
