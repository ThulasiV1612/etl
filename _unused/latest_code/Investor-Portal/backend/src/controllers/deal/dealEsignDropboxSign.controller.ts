import type { Request, Response } from "express";
import { getActiveEsignProvider } from "../../config/esignProvider.config.js";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  assertDealIdInViewerScope,
  resolveDealViewerScope,
} from "../../services/deal/dealAccess.service.js";
import { requestedOrganizationIdFromRequest } from "../../services/org/orgResolution.service.js";
import { isPortalUserLeadOrAdminSponsorOnDeal } from "../../services/deal/dealMemberScope.service.js";
import {
  completeDealEsignEmbeddedTemplate,
  getDealEsignDropboxSignPublicConfig,
  startDealEsignEmbeddedTemplateDraft,
} from "../../services/deal/dealEsignDropboxSign.service.js";
import {
  addDealEsignSignflowInvestorDataField,
  completeDealEsignSignflowTemplate,
  startDealEsignSignflowTemplateDraft,
} from "../../services/deal/dealEsignSignflow.service.js";
import { ESIGN_INVESTOR_DATA_FIELDS } from "../../services/deal/esignInvestorDataFieldCatalog.js";
import { getSignFlowPublicConfig } from "../../config/signflow.config.js";
import {
  formatEsignProviderUnreachableMessage,
  isEsignProviderUnreachableError,
} from "../../services/esign/esignProviderErrors.js";
import {
  dealEsignTemplatesFullyConfigured,
  dealHasEsignTemplateDocuments,
  getDealEsignTemplatesState,
  groupEsignFilesByCategory,
} from "../../services/deal/dealEsignTemplates.service.js";

function bodyString(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    if (v.length === 0) return "";
    return bodyString(v[v.length - 1]);
  }
  if (v != null) return String(v);
  return "";
}

/**
 * GET /deals/esign-templates/dropbox-sign-config
 * Returns client id for hellosign-embedded (never exposes API key).
 */
export async function getDealEsignDropboxSignConfig(
  _req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(_req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const provider = getActiveEsignProvider();
  if (provider === "signflow") {
    res.status(200).json(getSignFlowPublicConfig());
    return;
  }
  res.status(200).json({
    ...getDealEsignDropboxSignPublicConfig(),
    provider: "dropbox",
  });
}

/**
 * POST /deals/:dealId/esign-templates/:fileId/embedded-draft
 * Creates (or resumes) a Dropbox Sign embedded template draft; returns edit_url for iframe.
 */
export async function postDealEsignEmbeddedDraft(
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
  const title = bodyString(b.title).trim() || undefined;

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
          "Only the lead or admin sponsor can configure Dropbox Sign templates",
      });
      return;
    }

    const result =
      getActiveEsignProvider() === "signflow"
        ? await startDealEsignSignflowTemplateDraft({ dealId, fileId, title })
        : await startDealEsignEmbeddedTemplateDraft({ dealId, fileId, title });

    const state = await getDealEsignTemplatesState(dealId);
    res.status(200).json({
      provider: getActiveEsignProvider(),
      editUrl: result.editUrl,
      templateId: result.templateId,
      expiresAt: result.expiresAt,
      clientId: "clientId" in result ? result.clientId : null,
      testMode: result.testMode,
      embedApiKey:
        "embedApiKey" in result ? result.embedApiKey : null,
      appBaseUrl: "appBaseUrl" in result ? result.appBaseUrl : null,
      file: result.file,
      hasDocuments: dealHasEsignTemplateDocuments(state),
      filesByCategory: groupEsignFilesByCategory(state),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not start embedded template editor";
    console.error("postDealEsignEmbeddedDraft:", err);
    const unreachable = isEsignProviderUnreachableError(err);
    const status =
      message.includes("not configured") || unreachable ? 503 : 400;
    const userMessage =
      unreachable && getActiveEsignProvider() === "signflow"
        ? formatEsignProviderUnreachableMessage(
            "signflow",
            getSignFlowPublicConfig().baseUrl,
          )
        : message;
    res.status(status).json({ message: userMessage });
  }
}

/**
 * POST /deals/:dealId/esign-templates/:fileId/complete-embedded-template
 * Persists template_id after sponsor saves in embedded editor (createTemplate event).
 */
export async function postDealEsignCompleteEmbeddedTemplate(
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
  const dropboxSignTemplateId = bodyString(
    b.dropboxSignTemplateId ?? b.template_id ?? b.templateId,
  ).trim();
  const signflowDocumentId = bodyString(
    b.signflowDocumentId ?? b.template_id ?? b.templateId,
  ).trim();
  const title = bodyString(b.title).trim() || undefined;

  const provider = getActiveEsignProvider();
  const externalId =
    provider === "signflow" ? signflowDocumentId : dropboxSignTemplateId;
  if (!externalId) {
    res.status(400).json({
      message:
        provider === "signflow"
          ? "signflowDocumentId is required"
          : "dropboxSignTemplateId is required",
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
          "Only the lead or admin sponsor can save Dropbox Sign templates",
      });
      return;
    }

    const file =
      provider === "signflow"
        ? await completeDealEsignSignflowTemplate({
            dealId,
            fileId,
            signflowDocumentId: externalId,
            title,
          })
        : await completeDealEsignEmbeddedTemplate({
            dealId,
            fileId,
            dropboxSignTemplateId: externalId,
            title,
          });

    const state = await getDealEsignTemplatesState(dealId);
    res.status(200).json({
      message:
        provider === "signflow"
          ? "SignFlow template saved"
          : "Dropbox Sign template saved",
      file,
      hasDocuments: dealHasEsignTemplateDocuments(state),
      templatesFullyConfigured: dealEsignTemplatesFullyConfigured(state),
      filesByCategory: groupEsignFilesByCategory(state),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not save embedded template";
    console.error("postDealEsignCompleteEmbeddedTemplate:", err);
    res.status(400).json({ message });
  }
}

/**
 * GET /deals/:dealId/esign-templates/investor-data-fields
 * Catalog of investor profile fields sponsors can place for auto-prefill.
 */
export async function getDealEsignInvestorDataFields(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  res.status(200).json({ fields: ESIGN_INVESTOR_DATA_FIELDS });
}

/**
 * POST /deals/:dealId/esign-templates/:fileId/add-investor-data-field
 * Adds a labeled investor data field onto the open SignFlow draft.
 */
export async function postDealEsignAddInvestorDataField(
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

  const body = (req.body as Record<string, unknown> | undefined) ?? {};
  const fieldKey = bodyString(body.fieldKey).trim();
  if (!fieldKey) {
    res.status(400).json({ message: "fieldKey is required" });
    return;
  }

  const rawProfileIds = body.profileIds ?? body.profile_ids;
  const profileIds = Array.isArray(rawProfileIds)
    ? rawProfileIds
        .map((id) => bodyString(id).trim())
        .filter(Boolean)
    : [];

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
          "Only the lead or admin sponsor can configure eSign template fields",
      });
      return;
    }

    if (getActiveEsignProvider() !== "signflow") {
      res.status(400).json({
        message: "Investor data field placement is available for SignFlow only",
      });
      return;
    }

    const result = await addDealEsignSignflowInvestorDataField({
      dealId,
      fileId,
      fieldKey,
      profileIds,
    });
    res.status(200).json(result);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Could not add investor data field to the template";
    console.error("postDealEsignAddInvestorDataField:", err);
    res.status(400).json({ message });
  }
}
