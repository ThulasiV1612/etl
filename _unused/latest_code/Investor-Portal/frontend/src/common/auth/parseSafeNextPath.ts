/** Relative in-app path only — used for post-login / post-invite redirects from email links. */
export function parseSafeNextPath(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim()
  if (!v.startsWith("/") || v.startsWith("//")) return null
  if (v.startsWith("/signin") || v.startsWith("/signup")) return null
  return v
}
