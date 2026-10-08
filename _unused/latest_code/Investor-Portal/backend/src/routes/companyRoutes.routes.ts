import { Router } from "express";
import {
  getCompanies,
  patchCompany,
  postCompany,
} from "../controllers/company/company.controller.js";
import { postCompaniesExportNotify } from "../controllers/exportNotify.controller.js";
import { getPublicCompanyBranding } from "../controllers/company/companyPublicBranding.controller.js";
import {
  getWorkspaceTabSettings,
  putWorkspaceTabSettings,
} from "../controllers/company/companyWorkspaceSettings.controller.js";

const router = Router();

/** Unauthenticated: paths only, for sign-in / marketing shell */
router.get(
  "/public/company-branding/:companyId",
  getPublicCompanyBranding,
);

/* Branding `POST` is registered on the app in `server.ts` before body parsers. */

router.get("/companies", getCompanies);
router.post("/companies", postCompany);
router.post("/companies/export-notify", postCompaniesExportNotify);
router.patch("/companies/:companyId", patchCompany);
router.get(
  "/companies/:companyId/workspace-settings/:tabKey",
  getWorkspaceTabSettings,
);
router.put(
  "/companies/:companyId/workspace-settings/:tabKey",
  putWorkspaceTabSettings,
);

export default router;
