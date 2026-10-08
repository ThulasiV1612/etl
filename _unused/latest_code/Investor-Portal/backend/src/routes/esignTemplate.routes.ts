import { Router } from "express";
import multer from "multer";
import {
  getReusableTemplates,
  getTemplatesDropboxSignConfig,
  postReusableTemplateEmbeddedDraft,
  postReusableTemplateSave,
  postReusableTemplateUpload,
} from "../controllers/esign/reusableTemplate.controller.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

const router = Router();

router.get("/templates/dropbox-sign-config", getTemplatesDropboxSignConfig);
router.get("/templates", getReusableTemplates);
router.post("/templates/save", postReusableTemplateSave);
router.post("/templates/upload", upload.single("file"), postReusableTemplateUpload);
router.post(
  "/templates/:templateId/embedded-draft",
  postReusableTemplateEmbeddedDraft,
);

export default router;
