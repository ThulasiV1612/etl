import { type NextFunction, type Request, type Response } from "express";
import multer from "multer";

/**
 * Deal property / gallery images — same pattern as company branding uploads:
 * register on `app` *before* `express.json()` so Express 5 does not touch the stream
 * before multer/busboy (Chrome/Edge multipart can arrive empty otherwise).
 */
const dealImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 20 },
});

function handleMulterError(
  res: Response,
  err: unknown,
  label: string,
): void {
  const m = err as { code?: string; message?: string };
  if (m.code === "LIMIT_FILE_SIZE") {
    res.status(400).json({ message: "Image too large (max 20 MB each)." });
    return;
  }
  if (m.code === "LIMIT_FILE_COUNT") {
    res.status(400).json({ message: "Too many images (max 20 per request)." });
    return;
  }
  if (m.code) {
    res
      .status(400)
      .json({ message: m.message || `${label} upload was rejected` });
    return;
  }
  if (m.message) {
    res.status(400).json({ message: m.message });
    return;
  }
  res.status(400).json({ message: `${label} upload was rejected` });
}

export function uploadDealCreateOrUpdateAssetImages(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  void dealImageUpload.array("assetImages", 20)(req, res, (err: unknown) => {
    if (err == null) {
      next();
      return;
    }
    handleMulterError(res, err, "Deal image");
  });
}

/** One gallery file per request — same as org branding (`multer.single("file")`). */
export function uploadDealOfferingGalleryFile(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  void dealImageUpload.single("galleryFiles")(req, res, (err: unknown) => {
    if (err == null) {
      next();
      return;
    }
    handleMulterError(res, err, "Gallery image");
  });
}

/** Batch gallery upload (legacy); prefer {@link uploadDealOfferingGalleryFile} per file. */
export function uploadDealOfferingGalleryFiles(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  void dealImageUpload.array("galleryFiles", 20)(req, res, (err: unknown) => {
    if (err == null) {
      next();
      return;
    }
    handleMulterError(res, err, "Gallery image");
  });
}
