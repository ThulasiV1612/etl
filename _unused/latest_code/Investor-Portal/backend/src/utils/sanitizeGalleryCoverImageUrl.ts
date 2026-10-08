const MAX_LEN = 500_000;

export class GalleryCoverUrlTooLargeError extends Error {
  constructor() {
    super("GALLERY_COVER_URL_TOO_LARGE");
    this.name = "GalleryCoverUrlTooLargeError";
  }
}

/** Accepts https URL or data:image/* for a deal card / hero cover. */
export function sanitizeGalleryCoverImageUrl(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const s = typeof raw === "string" ? raw.trim() : String(raw).trim();
  if (!s) return null;
  if (s.length > MAX_LEN) {
    throw new GalleryCoverUrlTooLargeError();
  }
  /** Includes `data:image/png;charset=utf-8;base64,...` (FileReader is usually plain `;base64`). */
  if (s.startsWith("data:image/")) {
    const comma = s.indexOf(",");
    const head = comma === -1 ? s : s.slice(0, comma);
    if (!/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml)/i.test(head)) {
      return null;
    }
    return s;
  }
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      return s;
    } catch {
      return null;
    }
  }
  /** Same-origin gallery `src` may be root-relative `/uploads/...` */
  if (/^\/uploads\/[a-zA-Z0-9/_\-.~%+]+(?:\?[\w%.&=+-]*)?$/i.test(s)) {
    return s;
  }
  return null;
}
