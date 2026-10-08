/** U.S. EIN — display XX-XXXXXXX, store up to 9 digits. */

export const EIN_LEN = 9;

export function nineDigitsFromEinInput(raw: string): string {
  return String(raw ?? "")
    .replace(/\D/g, "")
    .slice(0, EIN_LEN);
}

export function formatEinDisplay(digits: string): string {
  const d = nineDigitsFromEinInput(digits);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}-${d.slice(2)}`;
}

export function formatEinInput(raw: string): string {
  return formatEinDisplay(nineDigitsFromEinInput(raw));
}

export function isValidEinNine(d: string): boolean {
  if (!/^\d{9}$/.test(d)) return false;
  if (d.slice(0, 2) === "00") return false;
  return true;
}
