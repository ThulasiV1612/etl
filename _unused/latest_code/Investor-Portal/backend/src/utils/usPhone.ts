/**
 * U.S. NANP phone: validate, normalize to E.164 (+1XXXXXXXXXX), and 10-digit keys for uniqueness.
 */

const NANP_LEN = 10;

/**
 * Masked values look like "+1 (415) …" — stripping every digit from the whole
 * string treats the country-code `1` in "+1" as the first NANP digit. Prefer
 * digits only after the "+1 (" label; fall back for "+1…" before "(" appears.
 */
function digitSourceForNationalParsing(raw: string): string {
  const s = String(raw ?? "");
  const afterNanpOpen = "+1 (";
  const j = s.indexOf(afterNanpOpen);
  if (j >= 0) return s.slice(j + afterNanpOpen.length);
  const trimmed = s.trimStart();
  if (!trimmed.startsWith("+1")) return s;
  const k = s.indexOf("+1");
  const after = s.slice(k + 2);
  const p = after.indexOf("(");
  if (p >= 0) return after.slice(p + 1);
  return after.replace(/^\s+/, "");
}

/** Strip to digits; if 11 digits starting with 1, use national 10; cap at 10. */
export function nationalTenDigitsFromRawInput(raw: string): string {
  const src = digitSourceForNationalParsing(raw);
  let d = src.replace(/\D/g, "");
  if (d.length >= 11 && d.startsWith("1")) d = d.slice(-10);
  if (d.length > NANP_LEN) d = d.slice(0, NANP_LEN);
  return d;
}

export function isValidUsNanp10(d: string): boolean {
  if (!/^\d{10}$/.test(d)) return false;
  if (d[0] === "0" || d[0] === "1") return false;
  if (d[3] === "0" || d[3] === "1") return false;
  return true;
}

/** E.164 U.S. or null if empty/invalid. */
export function parseUsPhoneToE164(raw: string): string | null {
  const d = nationalTenDigitsFromRawInput(raw);
  if (d.length === 0) return null;
  if (!isValidUsNanp10(d)) return null;
  return `+1${d}`;
}

/** Last 10 digit characters of normalized digit string (for DB uniqueness). */
export function canonicalUsPhoneKey10(raw: string): string | null {
  const d = nationalTenDigitsFromRawInput(raw);
  if (d.length !== NANP_LEN) return null;
  if (!isValidUsNanp10(d)) return null;
  return d;
}

export function usPhoneE164FromAnyStored(raw: string): string | null {
  return parseUsPhoneToE164(raw);
}
