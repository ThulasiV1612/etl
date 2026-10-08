import { Router } from "express";
import {
  getGhlIntegrationConfig,
  getGhlIntegrationContactById,
  getGhlIntegrationContacts,
  getGhlIntegrationVerify,
  postGhlProvisionCompany,
  postGhlSyncContact,
} from "../controllers/integrations/ghl.controller.js";

const router = Router();

router.get("/integrations/ghl/config", getGhlIntegrationConfig);
router.get("/integrations/ghl/contacts", getGhlIntegrationContacts);
router.get("/integrations/ghl/contacts/:ghlContactId", getGhlIntegrationContactById);
router.get("/integrations/ghl/verify", getGhlIntegrationVerify);
router.post("/integrations/ghl/sync-contact/:contactId", postGhlSyncContact);
router.post(
  "/integrations/ghl/provision-company/:companyId",
  postGhlProvisionCompany,
);

export default router;
