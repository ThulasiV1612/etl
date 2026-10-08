import { Router } from "express";
import {
  getDealById,
  getDeals,
  getOfferingPreviewToken,
  getPublicOfferingPreview,
  postOfferingPreviewShareEmail,
  patchDealAnnouncement,
  patchDealGalleryCover,
  patchDealOfferingGallery,
  postDealOfferingGalleryUploads,
  postDealOfferingDocumentUploads,
  patchDealInvestorSummary,
  patchDealKeyHighlights,
  patchDealFundingInstructions,
  getDealOfferingInvestorPreview,
  patchDealOfferingInvestorPreview,
  patchDealOfferingOverview,
  patchDealArchived,
  postDeal,
  putDeal,
  deleteDeal,
} from "../controllers/deal/add_deal.controller.js";
import {
  deleteDealPriorDistribution,
  postDealDistributionComplete,
  putDealPriorDistributions,
} from "../controllers/distributionSetup/distributionSetup.controller.js";
import {
  getDealCommitmentAmountByContact,
  getDealInvestors,
  postDealInvestment,
  putDealInvestment,
} from "../controllers/deal/dealInvestment.controller.js";
import {
  getDealLpInvestor,
  patchDealLpInvestorMyCommitment,
  postDealLpInvestor,
  putDealLpInvestor,
} from "../controllers/deal/dealLpInvestor.controller.js";
import { patchDealLpInvestorMyInvestNowAddon } from "../controllers/deal/dealLpInvestorMyInvestNow.addon.controller.js";
import { getDealLpInvestorMyInvestNowCommitment } from "../controllers/deal/dealLpInvestorMyInvestNowCommitment.get.controller.js";
import { postDealLpInvestorMyInvestNowEsignSend } from "../controllers/deal/dealLpInvestorMyInvestNowEsignSend.controller.js";
import {
  deleteDealEsignTemplate,
  getDealEsignTemplateView,
  getDealEsignTemplateViewUrl,
  getDealEsignTemplates,
  patchDealEsignTemplate,
} from "../controllers/deal/dealEsignTemplates.controller.js";
import {
  getDealEsignDropboxSignConfig,
  getDealEsignInvestorDataFields,
  postDealEsignAddInvestorDataField,
  postDealEsignCompleteEmbeddedTemplate,
  postDealEsignEmbeddedDraft,
} from "../controllers/deal/dealEsignDropboxSign.controller.js";
import {
  getDealEsignSignFlowConfig,
  getDealEsignSignFlowVerify,
} from "../controllers/esign/signflow.controller.js";
import {
  getDealInvestorQuestionnaire,
  putDealInvestorQuestionnaire,
} from "../controllers/deal/dealInvestorQuestionnaire.controller.js";
import {
  deleteDealMember,
  getDealCoSponsorEmailIntercept,
  getDealMemberEsignStatus,
  getDealMembers,
  getDealReferringSponsor,
  patchDealCoSponsorEmailIntercept,
  postDealMemberInvitationEmail,
  postDealMemberSendEsign,
} from "../controllers/deal/dealMember.controller.js";
import {
  getDealMyEsignDocuments,
  getDealMyEsignSignSessionHandler,
  getDealSponsorEsignSignSessionHandler,
  postDealMyEsignMarkViewed,
  postDealMyEsignSync,
  postDealSponsorEsignSync,
  postSyncCompletedEsignDocuments,
} from "../controllers/deal/dealInvestorEsignDocuments.controller.js";
import { postDealDocumentSharedNotification } from "../controllers/deal/dealDocumentNotification.controller.js";
import {
  deleteDealInvestorClass,
  getDealInvestorClasses,
  postDealInvestorClass,
  putDealInvestorClass,
} from "../controllers/deal/dealInvestorClass.controller.js";
import {
  postDealInvestorsExportNotify,
  postDealMembersExportNotify,
  postDealsExportNotify,
} from "../controllers/exportNotify.controller.js";
import { getDealOfferingShareRecipients } from "../controllers/deal/dealOfferingShareRecipients.addon.controller.js";
import {
  deleteDealInvestorCommunicationMailHandler,
  getDealInvestorCommunicationMails,
  postDealInvestorCommunicationMail,
} from "../controllers/deal/dealInvestorCommunicationMail.controller.js";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 20 },
});

const router = Router();

router.get("/public/offering-preview", getPublicOfferingPreview);

router.get("/deals", getDeals);
router.post("/deals/export-notify", postDealsExportNotify);
router.get("/deals/:dealId/investor-classes", getDealInvestorClasses);
router.post("/deals/:dealId/investor-classes", postDealInvestorClass);
router.put("/deals/:dealId/investor-classes/:classId", putDealInvestorClass);
router.delete(
  "/deals/:dealId/investor-classes/:classId",
  deleteDealInvestorClass,
);
router.get("/deals/:dealId/investors", getDealInvestors);
router.get(
  "/deals/:dealId/commitment-amount",
  getDealCommitmentAmountByContact,
);
router.post(
  "/deals/:dealId/investors/export-notify",
  postDealInvestorsExportNotify,
);
router.post("/deals/:dealId/lp-investors", postDealLpInvestor);
router.get("/deals/:dealId/lp-investors/:lpInvestorId", getDealLpInvestor);
router.put("/deals/:dealId/lp-investors/:lpInvestorId", putDealLpInvestor);
router.patch(
  "/deals/:dealId/lp-investors/my-commitment",
  patchDealLpInvestorMyCommitment,
);
router.get(
  "/deals/:dealId/lp-investors/my-invest-now-commitment",
  getDealLpInvestorMyInvestNowCommitment,
);
router.patch(
  "/deals/:dealId/lp-investors/my-invest-now-commitment",
  patchDealLpInvestorMyInvestNowAddon,
);
router.post(
  "/deals/:dealId/lp-investors/my-invest-now-esign-send",
  postDealLpInvestorMyInvestNowEsignSend,
);
router.get(
  "/deals/:dealId/investor-communication/mails",
  getDealInvestorCommunicationMails,
);
router.post(
  "/deals/:dealId/investor-communication/mails",
  postDealInvestorCommunicationMail,
);
router.delete(
  "/deals/:dealId/investor-communication/mails/:mailId",
  deleteDealInvestorCommunicationMailHandler,
);
router.get("/deals/:dealId/referring-sponsor", getDealReferringSponsor);
router.get("/deals/:dealId/members", getDealMembers);
router.get(
  "/deals/:dealId/co-sponsor-email-intercept",
  getDealCoSponsorEmailIntercept,
);
router.patch(
  "/deals/:dealId/co-sponsor-email-intercept",
  patchDealCoSponsorEmailIntercept,
);
router.post(
  "/deals/:dealId/members/export-notify",
  postDealMembersExportNotify,
);
router.delete("/deals/:dealId/members/:rowId", deleteDealMember);
router.post(
  "/deals/:dealId/members/send-invitation-email",
  postDealMemberInvitationEmail,
);
router.post(
  "/deals/:dealId/members/send-esign",
  postDealMemberSendEsign,
);
router.get(
  "/deals/:dealId/members/:rowId/esign-status",
  getDealMemberEsignStatus,
);
router.get("/deals/:dealId/my-esign-documents", getDealMyEsignDocuments);
router.post("/deals/:dealId/my-esign-sync", postDealMyEsignSync);
router.post("/deals/:dealId/my-esign-mark-viewed", postDealMyEsignMarkViewed);
router.get("/deals/:dealId/my-esign-sign-session", getDealMyEsignSignSessionHandler);
router.get(
  "/deals/:dealId/sponsor-esign-sign-session",
  getDealSponsorEsignSignSessionHandler,
);
router.post("/deals/:dealId/sponsor-esign-sync", postDealSponsorEsignSync);
router.post(
  "/deals/:dealId/documents/sync-esign-completed",
  postSyncCompletedEsignDocuments,
);
router.get("/deals/esign-templates/dropbox-sign-config", getDealEsignDropboxSignConfig);
router.get("/deals/esign-templates/signflow-config", getDealEsignSignFlowConfig);
router.get("/deals/esign-templates/signflow-verify", getDealEsignSignFlowVerify);
router.get("/deals/:dealId/esign-templates", getDealEsignTemplates);
router.get(
  "/deals/:dealId/esign-templates/:fileId/view-url",
  getDealEsignTemplateViewUrl,
);
router.get(
  "/deals/:dealId/esign-templates/:fileId/view",
  getDealEsignTemplateView,
);
router.post(
  "/deals/:dealId/esign-templates/:fileId/embedded-draft",
  postDealEsignEmbeddedDraft,
);
router.post(
  "/deals/:dealId/esign-templates/:fileId/complete-embedded-template",
  postDealEsignCompleteEmbeddedTemplate,
);
router.get(
  "/deals/:dealId/esign-templates/investor-data-fields",
  getDealEsignInvestorDataFields,
);
router.post(
  "/deals/:dealId/esign-templates/:fileId/add-investor-data-field",
  postDealEsignAddInvestorDataField,
);
router.patch(
  "/deals/:dealId/esign-templates/:fileId",
  patchDealEsignTemplate,
);
router.delete(
  "/deals/:dealId/esign-templates/:fileId",
  deleteDealEsignTemplate,
);
router.get(
  "/deals/:dealId/investor-questionnaire",
  getDealInvestorQuestionnaire,
);
router.put(
  "/deals/:dealId/investor-questionnaire",
  putDealInvestorQuestionnaire,
);
router.post(
  "/deals/:dealId/documents/send-shared-notification",
  postDealDocumentSharedNotification,
);
router.post(
  "/deals/:dealId/investments",
  upload.single("subscriptionDocument"),
  postDealInvestment,
);
router.put(
  "/deals/:dealId/investments/:investmentId",
  upload.single("subscriptionDocument"),
  putDealInvestment,
);
router.patch("/deals/:dealId/investor-summary", patchDealInvestorSummary);
router.patch("/deals/:dealId/deal-announcement", patchDealAnnouncement);
router.patch("/deals/:dealId/key-highlights", patchDealKeyHighlights);
router.patch(
  "/deals/:dealId/funding-instructions",
  patchDealFundingInstructions,
);
router.get(
  "/deals/:dealId/offering-investor-preview",
  getDealOfferingInvestorPreview,
);
router.patch(
  "/deals/:dealId/offering-investor-preview",
  patchDealOfferingInvestorPreview,
);
router.patch("/deals/:dealId/gallery-cover", patchDealGalleryCover);
router.post(
  "/deals/:dealId/offering-gallery-uploads",
  postDealOfferingGalleryUploads,
);
router.post(
  "/deals/:dealId/offering-document-uploads",
  postDealOfferingDocumentUploads,
);
router.patch("/deals/:dealId/offering-gallery", patchDealOfferingGallery);
router.patch("/deals/:dealId/offering-overview", patchDealOfferingOverview);
router.patch("/deals/:dealId/archived", patchDealArchived);
router.get(
  "/deals/:dealId/offering-preview-token",
  getOfferingPreviewToken,
);
router.post(
  "/deals/:dealId/offering-preview-share-email",
  postOfferingPreviewShareEmail,
);
router.get(
  "/deals/:dealId/offering-share-recipients",
  getDealOfferingShareRecipients,
);
/** Complete a distribution run (also on distributionSetup.routes — kept here so deals router always exposes it). */
router.post(
  "/deals/:dealId/distribution-setup/complete",
  postDealDistributionComplete,
);
router.put(
  "/deals/:dealId/distribution-setup/prior-distributions",
  putDealPriorDistributions,
);
router.delete(
  "/deals/:dealId/distributions/:distributionId",
  deleteDealPriorDistribution,
);
router.get("/deals/:dealId", getDealById);
router.put("/deals/:dealId", putDeal);
router.delete("/deals/:dealId", deleteDeal);
router.post("/deals", postDeal);

export default router;
