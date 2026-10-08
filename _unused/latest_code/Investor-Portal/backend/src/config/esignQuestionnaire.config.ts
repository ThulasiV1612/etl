import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getBackendPackageRoot(): string {
  return path.resolve(__dirname, "..", "..");
}

const DEFAULT_IMAGE_RELATIVE = path.join(
  "src",
  "storage",
  "investor-questionnaire-signature-page.png",
);

const DEFAULT_PDF_RELATIVE = path.join(
  "src",
  "storage",
  "investor-questionnaire-signature-page.pdf",
);

/**
 * PNG source for the investor questionnaire signature page (page 1 when enabled).
 * Override with `ESIGN_QUESTIONNAIRE_SIGNATURE_IMAGE_PATH`.
 */
export function getEsignQuestionnaireSignatureImagePath(): string {
  const fromEnv = process.env.ESIGN_QUESTIONNAIRE_SIGNATURE_IMAGE_PATH?.trim();
  const pkg = getBackendPackageRoot();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(pkg, fromEnv);
  }
  return path.join(pkg, DEFAULT_IMAGE_RELATIVE);
}

/**
 * Optional pre-built PDF for the signature page.
 * Override with `ESIGN_QUESTIONNAIRE_SIGNATURE_PDF_PATH`.
 */
export function getEsignQuestionnaireSignaturePdfPath(): string {
  const fromEnv = process.env.ESIGN_QUESTIONNAIRE_SIGNATURE_PDF_PATH?.trim();
  const pkg = getBackendPackageRoot();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(pkg, fromEnv);
  }
  return path.join(pkg, DEFAULT_PDF_RELATIVE);
}

export function esignQuestionnaireSignatureImageExists(): boolean {
  try {
    return fs.existsSync(getEsignQuestionnaireSignatureImagePath());
  } catch {
    return false;
  }
}

export function esignQuestionnaireSignaturePdfExists(): boolean {
  try {
    return fs.existsSync(getEsignQuestionnaireSignaturePdfPath());
  } catch {
    return false;
  }
}

/**
 * When true, load PNG/PDF assets (may include printed field boxes).
 * Default is text-only page 1 (title + legal copy); sponsors place fields in the editor.
 */
export function esignQuestionnaireSignatureUseImageAsset(): boolean {
  const v = process.env.ESIGN_QUESTIONNAIRE_SIGNATURE_USE_ASSET?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
