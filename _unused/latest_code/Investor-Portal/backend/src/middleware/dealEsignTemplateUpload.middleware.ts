import multer from "multer";

/** eSign template PDF upload — register before `express.json()` (see server.ts). */
export const uploadDealEsignTemplateFiles = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
}).array("esignFiles", 1);
