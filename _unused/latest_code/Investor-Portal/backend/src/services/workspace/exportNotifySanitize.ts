/** Shared limits for export audit payloads (members, companies, contacts). */

export const MAX_EXPORT_NOTIFY_LINES = 100;
export const MAX_EXPORT_LINE_LEN = 400;

export function sanitizeExportedLinesForNotify(
  raw: unknown,
): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const x of raw) {
    if (out.length >= MAX_EXPORT_NOTIFY_LINES) break;
    const s = typeof x === "string" ? x.trim() : String(x ?? "").trim();
    if (!s) continue;
    out.push(
      s.length > MAX_EXPORT_LINE_LEN
        ? `${s.slice(0, MAX_EXPORT_LINE_LEN)}…`
        : s,
    );
  }
  return out.length > 0 ? out : undefined;
}
