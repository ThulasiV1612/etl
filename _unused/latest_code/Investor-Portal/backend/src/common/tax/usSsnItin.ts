/** U.S. SSN / ITIN — display XXX-XX-XXXX, store up to 9 digits. */

export const SSN_ITIN_LEN = 9;

/** Strip non-digits; cap at 9 (national identifier). */
export function nineDigitsFromSsnItinInput(raw: string): string {
  return String(raw ?? "")
    .replace(/\D/g, "")
    .slice(0, SSN_ITIN_LEN);
}

/** Format digit string as XXX-XX-XXXX. */
export function formatSsnItinDisplay(digits: string): string {
  const d = nineDigitsFromSsnItinInput(digits);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

/**
 * Mask SSN / ITIN for display and e-sign docs — only the last 4 digits visible.
 * Uses ASCII "X" so PDF standard fonts can render the value.
 * Idempotent for already-masked values (XXX-XX-1234 / •••-••-1234).
 * Examples: "" → ""; "1234" → "XXXX1234"; "123456789" → "XXX-XX-6789".
 */
export function maskSsnItinLast4(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const compact = s.replace(/\s/g, "");
  const alreadyMasked = /^[X•x*]{3}-?[X•x*]{2}-?\d{4}$/.test(compact);
  if (alreadyMasked) {
    const last4 = compact.replace(/\D/g, "").slice(-4);
    return last4 ? `XXX-XX-${last4}` : "";
  }
  const d = nineDigitsFromSsnItinInput(s);
  if (!d) return "";
  if (d.length <= 4) return `XXXX${d}`;
  return `XXX-XX-${d.slice(-4)}`;
}

/** True when a field/answer key or label is an SSN / ITIN identifier. */
export function isSsnItinFieldKey(raw: string): boolean {
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const compact = normalized.replace(/_/g, "");
  if (
    compact === "ssn" ||
    compact === "itin" ||
    compact === "tin" ||
    compact === "spousessn" ||
    compact === "socialsecurity" ||
    compact === "socialsecuritynumber" ||
    compact === "ssnitin"
  ) {
    return true;
  }
  const label = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return (
    label === "ssn" ||
    label === "itin" ||
    label === "tin" ||
    label === "ssn / itin" ||
    label === "ssn/itin" ||
    label === "social security number" ||
    label === "social security" ||
    label === "spouse ssn"
  );
}

