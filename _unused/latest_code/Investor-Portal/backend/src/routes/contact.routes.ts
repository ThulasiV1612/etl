import { Router } from "express";
import {
  deleteContactEmailTemplate,
  getContact,
  getContactEmailTemplates,
  getContacts,
  getOrganizationContactLists,
  getOrganizationContactTags,
  patchContact,
  patchContactAccreditationStatus,
  patchContactEmailTemplate,
  patchContactKnownSince,
  patchContactShowOfferings,
  patchContactStatus,
  postContact,
  postContactEmailTemplate,
} from "../controllers/contact.controller.js";
import { postContactsExportNotify } from "../controllers/exportNotify.controller.js";

const router = Router();

router.get("/contacts", getContacts);
router.get("/contacts/email-templates", getContactEmailTemplates);
router.get("/contacts/organization-tags", getOrganizationContactTags);
router.get("/contacts/organization-lists", getOrganizationContactLists);
router.get("/contacts/:contactId", getContact);
router.post("/contacts", postContact);
router.post("/contacts/email-templates", postContactEmailTemplate);
router.post("/contacts/export-notify", postContactsExportNotify);
router.patch("/contacts/:contactId/status", patchContactStatus);
router.patch("/contacts/:contactId/show-offerings", patchContactShowOfferings);
router.patch(
  "/contacts/:contactId/accreditation-status",
  patchContactAccreditationStatus,
);
router.patch("/contacts/:contactId/known-since", patchContactKnownSince);
router.patch("/contacts/:contactId", patchContact);
router.patch("/contacts/email-templates/:templateId", patchContactEmailTemplate);
router.delete("/contacts/email-templates/:templateId", deleteContactEmailTemplate);

export default router;
