import * as fs from "node:fs";
import type { Request, Response } from "express";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  assertDealIdInViewerScope,
  assertDealIdReadableOrAssignedParticipant,
  resolveDealViewerScope,
} from "../../services/deal/dealAccess.service.js";
import { requestedOrganizationIdFromRequest } from "../../services/org/orgResolution.service.js";
import type { DealMemoryUploadFile } from "../../services/deal/dealForm.service.js";
import { isPortalUserLeadOrAdminSponsorOnDeal } from "../../services/deal/dealMemberScope.service.js";
import {
  dealEsignTemplatesFullyConfigured,
  dealHasEsignTemplateDocuments,
  ensureEsignTemplatePdfPrepared,
  findEsignTemplateFile,
  getDealEsignTemplatesState,
  groupEsignFilesByCategory,
  isPdfEsignFile,
  listIncompleteEsignTemplates,
  removeDealEsignTemplateFile,
  parseEsignTemplateUploadMeta,
  EsignTemplateNameRequiredError,
  EsignTemplateRenameNotAllowedError,
  EsignTemplateUploadLimitError,
  saveDealEsignTemplateFiles,
  updateDealEsignTemplateName,
  updateDealEsignTemplateSigningWorkflow,
} from "../../services/deal/dealEsignTemplates.service.js";
import { isPdfUploadFile } from "../../services/deal/esignPdfMerge.service.js";
import { validatePdfUploadFiles } from "../../utils/uploadFileValidation.js";
import {
  groupEsignFilesByCategoryWithInvestorFilled,
} from "../../services/deal/dealEsignTemplateInvestorFilled.service.js";
import {
  normalizeEsignSignflowSigningOrder,
  normalizeEsignSignflowWorkflowType,
} from "../../constants/esignSigningWorkflow.js";
import { filterEsignTemplateFilesForInvestorProfile, esignTemplateViewableForInvestorProfile } from "../../services/deal/dealEsignProfileTemplate.service.js";

function bodyString(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    if (v.length === 0) return "";
    return bodyString(v[v.length - 1]);
  }
  if (v != null) return String(v);
  return "";
}

const ALLOWED_ESIGN_CATEGORIES = new Set([
  "all_profiles",
  "individual",
  "custodian_ira_401k",
  "joint_tenancy",
  "llc",
]);

/**
 * GET /deals/:dealId/esign-templates
 */
export async function getDealEsignTemplates(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId =
    typeof req.params.dealId === "string"
      ? req.params.dealId
      : req.params.dealId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdReadableOrAssignedParticipant(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    const state = await getDealEsignTemplatesState(dealId);
    const profileId = bodyString(
      (req.query as Record<string, unknown>).profile_id ??
        (req.query as Record<string, unknown>).profileId,
    ).trim();
    const filesForViewer = profileId
      ? await filterEsignTemplateFilesForInvestorProfile(state.files, profileId)
      : state.files;
    const filesByCategory = await groupEsignFilesByCategoryWithInvestorFilled(
      dealId,
      filesForViewer,
    );
    const incompleteTemplates = listIncompleteEsignTemplates(state);
    res.status(200).json({
      hasDocuments: dealHasEsignTemplateDocuments(state),
      templatesFullyConfigured: dealEsignTemplatesFullyConfigured(state),
      incompleteTemplateCount: incompleteTemplates.length,
      filesByCategory,
    });
  } catch (err) {
    console.error("getDealEsignTemplates:", err);
    res.status(500).json({ message: "Could not load eSign templates" });
  }
}

function safeInlineFilename(raw: string): string {
  const base = raw.trim().replace(/[^\w.\- ()]+/g, "_").slice(0, 180);
  if (!base) return "esign-template.pdf";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

/**
 * GET /deals/:dealId/esign-templates/:fileId/view-url
 * Returns the sponsor-uploaded template for read-only preview (not investor-signed copies).
 * Ensures W-9 is on disk when needed for PDF templates.
 */
export async function getDealEsignTemplateViewUrl(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId =
    typeof req.params.dealId === "string"
      ? req.params.dealId
      : req.params.dealId?.[0];
  const fileId =
    typeof req.params.fileId === "string"
      ? req.params.fileId
      : req.params.fileId?.[0];
  if (!dealId || !fileId) {
    res.status(400).json({ message: "Missing deal id or file id" });
    return;
  }

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdReadableOrAssignedParticipant(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }

    const state = await getDealEsignTemplatesState(dealId);
    const file = findEsignTemplateFile(state, fileId);
    if (!file) {
      res.status(404).json({ message: "File not found" });
      return;
    }

    const profileId = bodyString(
      (req.query as Record<string, unknown>).profile_id ??
        (req.query as Record<string, unknown>).profileId,
    ).trim();
    if (profileId) {
      const allowed = await esignTemplateViewableForInvestorProfile(
        file,
        profileId,
      );
      if (!allowed) {
        res.status(404).json({
          message: "No eSign document is configured for this investor profile",
        });
        return;
      }
    }

    if (!isPdfEsignFile(file)) {
      const rel = file.relativePath
        ?.replace(/^\/+/, "")
        .replace(/^uploads\//i, "");
      res.status(200).json({
        viewUrl: rel ? `/uploads/${rel}` : "",
        displayName:
          file.templateName?.trim() || file.originalName?.trim() || "Document",
        isPdf: false,
      });
      return;
    }

    const { file: updated } = await ensureEsignTemplatePdfPrepared(
      dealId,
      file,
      state,
    );
    const rel = updated.relativePath
      ?.replace(/^\/+/, "")
      .replace(/^uploads\//i, "");
    if (!rel) {
      res.status(404).json({ message: "File not found on disk" });
      return;
    }

    res.status(200).json({
      viewUrl: `/uploads/${rel}`,
      displayName:
        updated.templateName?.trim() ||
        updated.originalName?.trim() ||
        "Document",
      isPdf: true,
      includesW9Appendix: Boolean(updated.includesW9Appendix),
    });
  } catch (err) {
    console.error("getDealEsignTemplateViewUrl:", err);
    res.status(500).json({ message: "Could not open eSign template preview" });
  }
}

/**
 * GET /deals/:dealId/esign-templates/:fileId/view
 * PDFs are served with W-9 appendix merged when missing (same as upload / Dropbox editor).
 */
export async function getDealEsignTemplateView(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId =
    typeof req.params.dealId === "string"
      ? req.params.dealId
      : req.params.dealId?.[0];
  const fileId =
    typeof req.params.fileId === "string"
      ? req.params.fileId
      : req.params.fileId?.[0];
  if (!dealId || !fileId) {
    res.status(400).json({ message: "Missing deal id or file id" });
    return;
  }

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdReadableOrAssignedParticipant(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }

    const state = await getDealEsignTemplatesState(dealId);
    const file = findEsignTemplateFile(state, fileId);
    if (!file) {
      res.status(404).json({ message: "File not found" });
      return;
    }

    const profileId = bodyString(
      (req.query as Record<string, unknown>).profile_id ??
        (req.query as Record<string, unknown>).profileId,
    ).trim();
    if (profileId) {
      const allowed = await esignTemplateViewableForInvestorProfile(
        file,
        profileId,
      );
      if (!allowed) {
        res.status(404).json({
          message: "No eSign document is configured for this investor profile",
        });
        return;
      }
    }

    if (!isPdfEsignFile(file)) {
      res.status(400).json({
        message: "W-9 preview is only merged for PDF eSign templates",
      });
      return;
    }

    const { absolutePath } = await ensureEsignTemplatePdfPrepared(
      dealId,
      file,
      state,
    );
    if (!fs.existsSync(absolutePath)) {
      res.status(404).json({ message: "File not found on disk" });
      return;
    }

    const displayName =
      file.templateName?.trim() ||
      file.originalName.trim() ||
      "esign-template";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${safeInlineFilename(displayName)}"`,
    );
    res.sendFile(absolutePath, (err) => {
      if (err && !res.headersSent) {
        console.error("getDealEsignTemplateView sendFile:", err);
        res.status(500).json({ message: "Could not open eSign template" });
      }
    });
  } catch (err) {
    console.error("getDealEsignTemplateView:", err);
    if (!res.headersSent) {
      res.status(500).json({ message: "Could not open eSign template" });
    }
  }
}

/**
 * POST /deals/:dealId/esign-template-uploads
 * multipart field `esignFiles`; body field `categoryId`.
 * Lead sponsor only.
 */
export async function postDealEsignTemplateUploads(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId =
    typeof req.params.dealId === "string"
      ? req.params.dealId
      : req.params.dealId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const categoryId = bodyString(b.categoryId ?? b.category_id).trim();
  if (!categoryId || !ALLOWED_ESIGN_CATEGORIES.has(categoryId)) {
    res.status(400).json({ message: "Valid categoryId is required" });
    return;
  }

  const files = (req as Request & { files?: DealMemoryUploadFile[] }).files;
  const fileList = Array.isArray(files) ? files : [];
  if (!fileList.length) {
    res.status(400).json({
      message:
        'No files uploaded. Choose a PDF and try again. If this keeps happening, refresh the page and ensure the backend was restarted.',
    });
    return;
  }
  if (!isPdfUploadFile(fileList[0]!)) {
    res.status(400).json({ message: "Only PDF files can be used for eSign templates." });
    return;
  }
  const pdfValidation = validatePdfUploadFiles(fileList, "eSign template");
  if (!pdfValidation.ok) {
    res.status(400).json({ message: pdfValidation.message });
    return;
  }
  if (fileList.length > 1) {
    res.status(400).json({
      message: "Only one file can be uploaded per profile type.",
    });
    return;
  }

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdInViewerScope(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    if (!(await isPortalUserLeadOrAdminSponsorOnDeal(dealId, user.id))) {
      res.status(403).json({
        message:
          "Only the lead or admin sponsor on this deal can manage eSign templates",
      });
      return;
    }

    const templateMeta = parseEsignTemplateUploadMeta(
      b.templateMeta ?? b.template_meta,
      fileList.length,
    );

    const added = await saveDealEsignTemplateFiles({
      dealId,
      categoryId,
      files: fileList,
      meta: templateMeta,
    });
    const state = await getDealEsignTemplatesState(dealId);
    res.status(200).json({
      message: "eSign templates uploaded",
      added,
      hasDocuments: dealHasEsignTemplateDocuments(state),
      filesByCategory: groupEsignFilesByCategory(state),
    });
  } catch (err) {
    if (err instanceof EsignTemplateUploadLimitError) {
      res.status(409).json({ message: err.message });
      return;
    }
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Could not upload eSign templates";
    console.error("postDealEsignTemplateUploads:", err);
    res.status(500).json({ message });
  }
}

/**
 * PATCH /deals/:dealId/esign-templates/:fileId
 * Body: { templateName?, signflowWorkflowType?, signflowSigningOrder? }
 */
export async function patchDealEsignTemplate(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId =
    typeof req.params.dealId === "string"
      ? req.params.dealId
      : req.params.dealId?.[0];
  const fileId =
    typeof req.params.fileId === "string"
      ? req.params.fileId
      : req.params.fileId?.[0];
  if (!dealId || !fileId) {
    res.status(400).json({ message: "Missing deal id or file id" });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const templateName = bodyString(b.templateName ?? b.template_name).trim();
  const workflowType = normalizeEsignSignflowWorkflowType(
    b.signflowWorkflowType ?? b.signflow_workflow_type,
  );
  const signingOrder = normalizeEsignSignflowSigningOrder(
    b.signflowSigningOrder ?? b.signflow_signing_order,
  );

  if (!templateName && workflowType === null && signingOrder === null) {
    res.status(400).json({
      message:
        "Provide templateName and/or signing workflow settings (signflowWorkflowType, signflowSigningOrder)",
    });
    return;
  }

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdInViewerScope(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    if (!(await isPortalUserLeadOrAdminSponsorOnDeal(dealId, user.id))) {
      res.status(403).json({
        message:
          "Only the lead or admin sponsor on this deal can manage eSign templates",
      });
      return;
    }

    let updated = null as Awaited<
      ReturnType<typeof updateDealEsignTemplateName>
    >;

    if (templateName) {
      updated = await updateDealEsignTemplateName(dealId, fileId, templateName);
      if (!updated) {
        res.status(404).json({ message: "File not found" });
        return;
      }
    }

    if (workflowType !== null || signingOrder !== null) {
      const workflowUpdated = await updateDealEsignTemplateSigningWorkflow(
        dealId,
        fileId,
        {
          ...(workflowType !== null
            ? { signflowWorkflowType: workflowType }
            : {}),
          ...(signingOrder !== null
            ? { signflowSigningOrder: signingOrder }
            : {}),
        },
      );
      if (!workflowUpdated) {
        res.status(404).json({ message: "File not found" });
        return;
      }
      updated = workflowUpdated;
    }

    if (!updated) {
      res.status(404).json({ message: "File not found" });
      return;
    }

    const state = await getDealEsignTemplatesState(dealId);
    res.status(200).json({
      message: templateName
        ? "Template updated"
        : "Signing workflow updated",
      file: updated,
      hasDocuments: dealHasEsignTemplateDocuments(state),
      filesByCategory: groupEsignFilesByCategory(state),
    });
  } catch (err) {
    if (err instanceof EsignTemplateNameRequiredError) {
      res.status(400).json({ message: err.message });
      return;
    }
    if (err instanceof EsignTemplateRenameNotAllowedError) {
      res.status(409).json({ message: err.message });
      return;
    }
    console.error("patchDealEsignTemplate:", err);
    res.status(500).json({ message: "Could not update template name" });
  }
}

/**
 * DELETE /deals/:dealId/esign-templates/:fileId — lead sponsor only.
 */
export async function deleteDealEsignTemplate(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId =
    typeof req.params.dealId === "string"
      ? req.params.dealId
      : req.params.dealId?.[0];
  const fileId =
    typeof req.params.fileId === "string"
      ? req.params.fileId
      : req.params.fileId?.[0];
  if (!dealId || !fileId) {
    res.status(400).json({ message: "Missing deal id or file id" });
    return;
  }

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdInViewerScope(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    if (!(await isPortalUserLeadOrAdminSponsorOnDeal(dealId, user.id))) {
      res.status(403).json({
        message:
          "Only the lead or admin sponsor on this deal can manage eSign templates",
      });
      return;
    }

    const removed = await removeDealEsignTemplateFile(dealId, fileId);
    if (!removed) {
      res.status(404).json({ message: "File not found" });
      return;
    }
    const state = await getDealEsignTemplatesState(dealId);
    res.status(200).json({
      hasDocuments: dealHasEsignTemplateDocuments(state),
      filesByCategory: groupEsignFilesByCategory(state),
    });
  } catch (err) {
    console.error("deleteDealEsignTemplate:", err);
    res.status(500).json({ message: "Could not remove eSign template" });
  }
}
