import { type NextFunction, type Request, type Response } from "express";
import multer from "multer";

const MAX_OFFERING_DOCUMENT_FILE_BYTES = 100 * 1024 * 1024;
const MAX_OFFERING_DOCUMENT_FILES = 50;

/**
 * Deal Documents tab uploads — register on `app` *before* `express.json()` so
 * Express 5 does not touch the stream before multer/busboy (Chrome/Edge
 * multipart can arrive empty otherwise). Same pattern as gallery / eSign.
 */
const offeringDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_OFFERING_DOCUMENT_FILE_BYTES,
    files: MAX_OFFERING_DOCUMENT_FILES,
  },
});

function handleMulterError(res: Response, err: unknown): void {
  const m = err as { code?: string; message?: string };
  if (m.code === "LIMIT_FILE_SIZE") {
    res.status(400).json({ message: "Document too large (max 100 MB each)." });
    return;
  }
  if (m.code === "LIMIT_FILE_COUNT") {
    res.status(400).json({ message: "Too many documents (max 50 per request)." });
    return;
  }
  if (m.code) {
    res
      .status(400)
      .json({ message: m.message || "Document upload was rejected" });
    return;
  }
  if (m.message) {
    res.status(400).json({ message: m.message });
    return;
  }
  res.status(400).json({ message: "Document upload was rejected" });
}

export function uploadDealOfferingDocumentFiles(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  void offeringDocumentUpload.array(
    "documentFiles",
    MAX_OFFERING_DOCUMENT_FILES,
  )(
    req,
    res,
    (err: unknown) => {
      if (err == null) {
        next();
        return;
      }
      handleMulterError(res, err);
    },
  );
}
