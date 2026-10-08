import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getBackendPackageRoot(): string {
  return path.resolve(__dirname, "..", "..");
}

const DEFAULT_RELATIVE = path.join("src", "storage", "fw9.pdf");

/**
 * Absolute path to the standard W-9 PDF appended to every eSign template document.
 * Override with `ESIGN_W9_PDF_PATH` (absolute or relative to backend package root).
 */
export function getEsignW9PdfPath(): string {
  const fromEnv = process.env.ESIGN_W9_PDF_PATH?.trim();
  const pkg = getBackendPackageRoot();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(pkg, fromEnv);
  }
  return path.join(pkg, DEFAULT_RELATIVE);
}

export function esignW9PdfExists(): boolean {
  try {
    return fs.existsSync(getEsignW9PdfPath());
  } catch {
    return false;
  }
}
