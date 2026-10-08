import { isCloudinaryDeliveryUrl, normalizeCloudinaryDeliveryUrl, resolveCloudinaryImageSrc } from "./cloudinaryImage"

/**
 * Builds the `/api/v1` root from `VITE_BASE_URL`.
 * Accepts either `http://host:port` or `http://host:port/api/v1` so paths are not doubled.
 */
export function getApiV1Base(): string {
  const raw = (import.meta.env.VITE_BASE_URL ?? "").toString().trim();
  /**
   * Empty `VITE_BASE_URL` → same-origin `/api/v1` (Vite dev proxy or production reverse proxy
   * forwarding `/api` to the API). Returning `""` here broke production builds: `fetchContacts`
   * never called the API and the UI stayed empty.
   */
  if (!raw) {
    return "/api/v1";
  }
  const base = raw.replace(/\/$/, "");
  const withApiV1 = base.endsWith("/api/v1") ? base : `${base}/api/v1`;

  /**
   * Vite dev: `VITE_BASE_URL=http://localhost:5004` forces the browser to call port 5004
   * directly from the SPA origin (e.g. :5174), which triggers CORS preflight and often fails
   * with “CORS request did not succeed” (status null) when the connection drops — so deal
   * members / commitment never load. Prefer same-origin `/api/v1` so `vite.config` proxies
   * `/api` → `127.0.0.1:5004`. Set `VITE_FORCE_ABSOLUTE_API_URL=true` to keep the full URL.
   */
  if (
    import.meta.env.DEV &&
    import.meta.env.VITE_FORCE_ABSOLUTE_API_URL !== "true"
  ) {
    try {
      const u = new URL(withApiV1);
      if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
        return "/api/v1";
      }
    } catch {
      /* ignore */
    }
  }

  if (base.endsWith("/api/v1")) return base;
  return `${base}/api/v1`;
}

/** Strip leading slashes and optional `uploads/` so DB segments join cleanly as `/uploads/<path>`. */
function uploadsRelativeSegment(seg: string): string {
  let rel = seg.trim().replace(/^\/+/, "");
  const lower = rel.toLowerCase();
  if (lower.startsWith("uploads/")) {
    rel = rel.slice("uploads/".length);
  }
  return rel.replace(/^\/+/, "");
}

/**
 * Turn an API upload-relative path (e.g. `deal-assets/<dealId>/<file>.pdf`) into a
 * root-relative URL for storing in offering preview JSON so it works for every viewer.
 */
export function dealAssetRelativePathToUploadsUrl(relativePath: string): string {
  const rel = uploadsRelativeSegment(relativePath);
  if (!rel) return "";
  return `/uploads/${rel}`;
}

/** Origin for static assets (e.g. `/uploads/...`) when API base is `.../api/v1`. */
export function getBackendOrigin(): string {
  const v1 = getApiV1Base();
  if (!v1) return "";
  /** Same-origin relative API (Vite proxy) — assets use current origin; proxy `/uploads` to backend in dev. */
  if (v1.startsWith("/")) {
    if (typeof window !== "undefined") return window.location.origin;
    return "";
  }
  if (v1.endsWith("/api/v1")) return v1.slice(0, -"/api/v1".length);
  return v1.replace(/\/api\/v1\/?$/, "");
}

/**
 * Base URL (no trailing slash) used to build browser `src` for `/uploads/...` files.
 * Falls back to `window.location.origin` when `VITE_BASE_URL` is unset so preview/gallery
 * still load on same-origin deployments (reverse proxy serves `/uploads`).
 *
 * In **Vite dev**, when `VITE_BASE_URL` points at `localhost` / `127.0.0.1`, prefer the
 * **SPA origin** so `/uploads/*` is fetched through the dev proxy (`vite.config` → API).
 * Otherwise `<img src="http://localhost:5004/uploads/...">` bypasses the proxy and breaks
 * if the API process does not serve static files from the same disk root as uploads.
 */
export function getUploadsPublicOrigin(): string {
  if (import.meta.env.DEV && typeof window !== "undefined") {
    const v1 = getApiV1Base();
    if (v1.startsWith("http://") || v1.startsWith("https://")) {
      try {
        const host = new URL(v1).hostname;
        if (host === "localhost" || host === "127.0.0.1") {
          return window.location.origin.replace(/\/$/, "");
        }
      } catch {
        /* fall through */
      }
    }
  }
  const fromApi = getBackendOrigin();
  if (fromApi) return fromApi.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin.replace(/\/$/, "");
  return "";
}

function appendUploadAccessParams(
  url: string,
  uploadAccess?: { previewToken?: string | null },
): string {
  const token = uploadAccess?.previewToken?.trim();
  if (!token || !url.includes("/uploads/")) return url;
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(url, base);
    if (!parsed.pathname.toLowerCase().includes("/uploads/")) return url;
    parsed.searchParams.set("preview", token);
    if (url.startsWith("http://") || url.startsWith("https://")) return parsed.toString();
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    const join = url.includes("?") ? "&" : "?";
    return `${url}${join}preview=${encodeURIComponent(token)}`;
  }
}

/**
 * Normalize gallery/cover `src` for `<img>`: absolute `http(s)`, `data:image/*`, or
 * root-relative `/uploads/...` resolved against the uploads origin.
 *
 * Pass `uploadAccess.previewToken` on public offering preview pages so `/uploads/`
 * requests are authorized without a login session.
 */
export function normalizeDealGallerySrc(
  raw: string | null | undefined,
  uploadAccess?: { previewToken?: string | null },
): string {
  const s = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
  if (!s) return "";
  /** `blob:` contains `/` (e.g. `blob:http://.../uuid`); do not treat as a relative uploads path. */
  if (s.startsWith("blob:")) return s;
  if (s.startsWith("data:image/")) return s;
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (u.protocol !== "http:" && u.protocol !== "https:") return s;
      if (isCloudinaryDeliveryUrl(s)) return normalizeCloudinaryDeliveryUrl(s);
      const lowerPath = u.pathname.toLowerCase();
      const uploadsIdx = lowerPath.indexOf("/uploads/");
      if (uploadsIdx >= 0 || lowerPath.startsWith("/uploads")) {
        const pathAndQuery = `${u.pathname.slice(uploadsIdx >= 0 ? uploadsIdx : 0)}${
          u.search || ""
        }`;
        const normalizedPath = pathAndQuery.startsWith("/")
          ? pathAndQuery
          : `/${pathAndQuery}`;
        const root =
          import.meta.env.DEV && typeof window !== "undefined"
            ? window.location.origin.replace(/\/$/, "")
            : getUploadsPublicOrigin();
        if (root) return appendUploadAccessParams(`${root}${normalizedPath}`, uploadAccess);
      }
    } catch {
      /* keep original */
    }
    return appendUploadAccessParams(s, uploadAccess);
  }
  if (s.startsWith("/uploads/")) {
    const root = getUploadsPublicOrigin();
    if (root) return appendUploadAccessParams(`${root}${s}`, uploadAccess);
    return appendUploadAccessParams(s, uploadAccess);
  }
  /**
   * DB / JSON may store a path without a leading slash (e.g. `company-workspace/...`
   * or `uploads/...`). Turn into `/uploads/...` so the dev proxy and prod nginx resolve it.
   */
  if (!s.startsWith("/") && s.includes("/")) {
    const rel = dealAssetRelativePathToUploadsUrl(s);
    if (rel) {
      const root = getUploadsPublicOrigin();
      if (root) return appendUploadAccessParams(`${root}${rel}`, uploadAccess);
      return appendUploadAccessParams(rel, uploadAccess);
    }
  }
  return appendUploadAccessParams(s, uploadAccess);
}

/**
 * First image URL from API `assetImagePath` (semicolon-separated paths under `uploads/`).
 */
export function assetImagePathToUrl(assetImagePath: string | null | undefined): string {
  if (assetImagePath == null || !String(assetImagePath).trim()) return ""
  const first = String(assetImagePath).split(";")[0]?.trim()
  if (!first) return ""
  if (
    first.startsWith("data:image/") ||
    isCloudinaryDeliveryUrl(first) ||
    /^https?:\/\//i.test(first) ||
    first.startsWith("/uploads/")
  ) {
    return resolveCloudinaryImageSrc(first, normalizeDealGallerySrc)
  }
  const rel = uploadsRelativeSegment(first)
  if (!rel) return ""
  const root = getUploadsPublicOrigin()
  if (!root) return `/uploads/${rel}`
  return `${root}/uploads/${rel}`
}

/** Absolute URLs for each path in a semicolon-separated `assetImagePath` from the API. */
export function assetImagePathsToUrls(
  assetImagePath: string | null | undefined,
): string[] {
  if (assetImagePath == null || !String(assetImagePath).trim()) return []
  const root = getUploadsPublicOrigin()
  return String(assetImagePath)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((seg) => {
      if (
        seg.startsWith("data:image/") ||
        isCloudinaryDeliveryUrl(seg) ||
        /^https?:\/\//i.test(seg) ||
        seg.startsWith("/uploads/")
      ) {
        return resolveCloudinaryImageSrc(seg, normalizeDealGallerySrc)
      }
      const rel = uploadsRelativeSegment(seg)
      if (!rel) return ""
      if (root) return `${root}/uploads/${rel}`
      return `/uploads/${rel}`
    })
    .filter(Boolean)
}
