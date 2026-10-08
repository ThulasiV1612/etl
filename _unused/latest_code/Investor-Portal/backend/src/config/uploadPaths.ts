import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Backend package root (`backend/`), stable regardless of `process.cwd()` when starting Node. */
function getBackendPackageRoot(): string {
  // This file lives at `src/config/` (dev) or `dist/config/` (production build)
  return path.resolve(__dirname, "..", "..");
}

/**
 * Folder on disk that Express serves at HTTP `/uploads/*`.
 *
 * - Env `UPLOADS_PHYSICAL_ROOT`: absolute path, or relative to the backend package root (not `cwd`).
 * - Default: `<backend>/src/storage/uploads` (files live under backend, not the frontend app).
 *
 * DB stores paths relative to this root, e.g.
 * `deal-assets/<dealName-dealId>/…` (deal images, e-sign templates, signed PDFs, investments).
 */
export function getUploadsPhysicalRoot(): string {
  const pkg = getBackendPackageRoot();
  const fromEnv = process.env.UPLOADS_PHYSICAL_ROOT?.trim();
  if (fromEnv)
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(pkg, fromEnv);
  return path.join(pkg, "src", "storage", "uploads");
}
