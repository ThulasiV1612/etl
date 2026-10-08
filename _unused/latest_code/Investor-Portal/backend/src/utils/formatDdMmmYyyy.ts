const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * API/UI display: **DD-MMM-YYYY** (e.g. `03-Apr-2026`).
 * `YYYY-MM-DD` uses local noon to avoid timezone boundary issues.
 */
export function formatDdMmmYyyy(
  input: Date | string | null | undefined,
): string {
  if (input == null || input === "") return "—";
  let d: Date;
  if (input instanceof Date) {
    d = input;
  } else {
    const s = String(input).trim();
    if (!s || s === "—") return "—";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) d = new Date(`${s}T12:00:00`);
    else {
      const t = Date.parse(s);
      if (Number.isNaN(t)) return s;
      d = new Date(t);
    }
  }
  if (Number.isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const mon = MONTH_SHORT[d.getMonth()] ?? "Jan";
  const y = d.getFullYear();
  return `${day}-${mon}-${y}`;
}
