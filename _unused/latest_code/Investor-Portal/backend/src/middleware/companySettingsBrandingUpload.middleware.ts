import { type Request, type Response, type NextFunction } from "express";
import multer from "multer";

/**
 * `memoryStorage` multipart handler for `POST /companies/:companyId/settings/branding/:assetType`.
 * Kept in one module so the route can be registered on `app` *before* `express.json` (avoids
 * any edge case where a parser touches the request stream before multer/busboy in Express 5).
 */
const brandingUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024, files: 1 },
});

export function uploadCompanySettingsBranding(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  void brandingUpload.single("file")(req, res, (err: unknown) => {
    if (err == null) {
      next();
      return;
    }
    const m = err as { code?: string; message?: string };
    if (m.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ message: "File too large (max 1 MB)" });
      return;
    }
    if (m.code) {
      res
        .status(400)
        .json({ message: m.message || "File upload was rejected" });
      return;
    }
    if (m.message) {
      res.status(400).json({ message: m.message });
      return;
    }
    res.status(400).json({ message: "File upload was rejected" });
  });
}
