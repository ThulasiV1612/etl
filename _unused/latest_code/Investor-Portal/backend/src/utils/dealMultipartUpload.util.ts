import type { Request, Response } from "express";
import type { DealMemoryUploadFile } from "../services/deal/dealForm.service.js";
import {
  validateImageUploadFiles,
  validateOfferingDocumentUploadFiles,
} from "./uploadFileValidation.js";

type MulterMemoryFile = {
  buffer?: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};

function multerCandidates(req: Request): MulterMemoryFile[] {
  const r = req as Request & {
    file?: MulterMemoryFile;
    files?: MulterMemoryFile[];
  };
  const fromArray = Array.isArray(r.files) ? r.files : [];
  if (fromArray.length > 0) return fromArray;
  return r.file ? [r.file] : [];
}

function toDealMemoryFile(file: MulterMemoryFile): DealMemoryUploadFile | null {
  if (!file.buffer?.length) return null;
  let originalname = String(file.originalname ?? "").trim();
  if (!originalname) originalname = "property-image.jpg";
  return { buffer: file.buffer, originalname };
}

function parseDealMultipartFiles(req: Request): DealMemoryUploadFile[] {
  return multerCandidates(req)
    .map(toDealMemoryFile)
    .filter((f): f is DealMemoryUploadFile => f != null);
}

function emptyMultipartMessage(
  req: Request,
  fieldName: string,
): string {
  const ct = String(req.get("content-type") ?? "");
  return ct && ct.toLowerCase().includes("multipart")
    ? `Missing or empty "${fieldName}" in multipart form.`
    : `Use multipart form-data with a field named "${fieldName}". Received: ${ct || "no Content-Type"}`;
}

/**
 * Gallery upload — requires at least one non-empty file (same checks as org branding).
 * Returns `null` after sending 400 when nothing usable was received.
 */
export function requireDealMultipartFiles(
  req: Request,
  res: Response,
  fieldName: "galleryFiles" | "assetImages",
): DealMemoryUploadFile[] | null {
  const files = parseDealMultipartFiles(req);
  if (files.length > 0) {
    const validation = validateImageUploadFiles(
      files.map((f) => ({ originalname: f.originalname, buffer: f.buffer })),
      fieldName === "galleryFiles" ? "Gallery image" : "Deal image",
    );
    if (!validation.ok) {
      res.status(400).json({ message: validation.message });
      return null;
    }
    return files;
  }

  const hadParts = multerCandidates(req).length > 0;
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console -- dev-only upload diagnostics
    console.warn("dealMultipartUpload: no file buffers", {
      contentType: req.get("content-type") ?? null,
      fieldName,
      hadParts,
      method: req.method,
    });
  }
  res.status(400).json({ message: emptyMultipartMessage(req, fieldName) });
  return null;
}

/**
 * Documents tab upload — requires at least one non-empty PDF/Office file.
 * Returns `null` after sending 400 when nothing usable was received.
 */
export function requireDealDocumentMultipartFiles(
  req: Request,
  res: Response,
): DealMemoryUploadFile[] | null {
  const files = parseDealMultipartFiles(req);
  if (files.length > 0) {
    const validation = validateOfferingDocumentUploadFiles(
      files.map((f) => ({ originalname: f.originalname, buffer: f.buffer })),
    );
    if (!validation.ok) {
      res.status(400).json({ message: validation.message });
      return null;
    }
    return files;
  }

  const hadParts = multerCandidates(req).length > 0;
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console -- dev-only upload diagnostics
    console.warn("dealMultipartUpload: no document file buffers", {
      contentType: req.get("content-type") ?? null,
      fieldName: "documentFiles",
      hadParts,
      method: req.method,
    });
  }
  res.status(400).json({ message: emptyMultipartMessage(req, "documentFiles") });
  return null;
}

/** Create/update deal — images optional (upload via gallery endpoint when omitted). */
export function optionalDealMultipartFiles(
  req: Request,
  res: Response,
): DealMemoryUploadFile[] | null {
  const hadParts = multerCandidates(req).length > 0;
  const files = parseDealMultipartFiles(req);
  if (files.length === 0) {
    if (hadParts) {
      res.status(400).json({ message: emptyMultipartMessage(req, "assetImages") });
      return null;
    }
    return files;
  }
  const validation = validateImageUploadFiles(
    files.map((f) => ({ originalname: f.originalname, buffer: f.buffer })),
    "Deal image",
  );
  if (!validation.ok) {
    res.status(400).json({ message: validation.message });
    return null;
  }
  return files;
}
