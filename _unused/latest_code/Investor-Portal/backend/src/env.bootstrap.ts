import dotenv from "dotenv";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

function loadEnvAt(root: string): boolean {
  const base = path.join(root, ".env");
  const local = path.join(root, ".env.local");
  const hasBase = existsSync(base);
  const hasLocal = existsSync(local);
  if (!hasBase && !hasLocal) return false;
  if (hasBase) dotenv.config({ path: base });
  if (hasLocal) dotenv.config({ path: local, override: true });
  return true;
}

function walkForEnvRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 6; i++) {
    if (
      existsSync(path.join(dir, ".env.local")) ||
      existsSync(path.join(dir, ".env"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const fileDir = path.dirname(fileURLToPath(import.meta.url));
const roots = [walkForEnvRoot(fileDir), walkForEnvRoot(process.cwd())].filter(
  (root, index, all): root is string =>
    Boolean(root) && all.indexOf(root) === index,
);

for (const root of roots) {
  if (loadEnvAt(root)) break;
}
