import multer from "multer";

/** Dropbox Sign posts `multipart/form-data` with a `json` field. */
export const dropboxSignWebhookUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, fields: 20 },
}).none();
