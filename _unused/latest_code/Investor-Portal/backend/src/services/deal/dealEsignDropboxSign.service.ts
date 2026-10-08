import { getDropboxSignConfig } from "../../config/dropboxSign.config.js";
import {
  createEmbeddedTemplateDraft,
  type EmbeddedTemplateDraftResult,
  tryGetEmbeddedTemplateEditUrl,
  waitForEmbeddedTemplateEditUrl,
} from "../esign/dropboxSign.service.js";
import { getInvestorQuestionnaireSignatureFormFields } from "./esignPdfMerge.service.js";
import {
  ensureEsignTemplatePdfPrepared,
  findEsignTemplateFile,
  getDealEsignTemplatesState,
  isPdfEsignFile,
  readEsignTemplatePdfBuffer,
  type EsignTemplateFileRecord,
  type EsignTemplatesJson,
} from "./dealEsignTemplates.service.js";
import { eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { addDealForm } from "../../schema/deal.schema/add-deal-form.schema.js";

async function persistEsignTemplatesJson(
  dealId: string,
  state: EsignTemplatesJson,
): Promise<void> {
  await db
    .update(addDealForm)
    .set({ esignTemplatesJson: JSON.stringify(state) })
    .where(eq(addDealForm.id, dealId));
}

async function clearStoredDropboxTemplateId(
  dealId: string,
  file: EsignTemplateFileRecord,
  state: EsignTemplatesJson,
): Promise<void> {
  delete file.dropboxSignTemplateId;
  delete file.dropboxSignStatus;
  delete file.dropboxSignSavedAt;
  await persistEsignTemplatesJson(dealId, state);
}

/** Resume an existing embedded draft, or null when the stored id is stale/unusable. */
async function tryResumeEmbeddedTemplateEdit(
  storedTemplateId: string,
): Promise<{ editUrl: string; expiresAt: number } | null> {
  try {
    let existing = await tryGetEmbeddedTemplateEditUrl(storedTemplateId);
    if (!existing) {
      existing = await waitForEmbeddedTemplateEditUrl(storedTemplateId, {
        maxAttempts: 5,
        delayMs: 1500,
      }).catch(() => null);
    }
    return existing;
  } catch (err) {
    console.warn(
      `[esign] Could not resume Dropbox template ${storedTemplateId}; creating a new embedded draft:`,
      err,
    );
    return null;
  }
}

async function createDealEmbeddedTemplateDraft(params: {
  title: string;
  fileBuffer: Buffer;
  fileName: string;
  includeQuestionnaire: boolean;
}): Promise<EmbeddedTemplateDraftResult> {
  const base = {
    title: params.title,
    fileBuffer: params.fileBuffer,
    fileName: params.fileName,
    subject: "Please review and sign",
    message: "Documents for your investment",
  };

  if (!params.includeQuestionnaire) {
    return createEmbeddedTemplateDraft(base);
  }

  try {
    return await createEmbeddedTemplateDraft({
      ...base,
      formFieldsPerDocument: getInvestorQuestionnaireSignatureFormFields(),
    });
  } catch (err) {
    console.warn(
      "[esign] embedded draft with questionnaire preset fields failed; retrying without preset fields:",
      err,
    );
    return createEmbeddedTemplateDraft(base);
  }
}

/**
 * File upload handling for Dropbox Sign: reads the on-disk PDF that was saved during
 * multipart upload (`saveDealEsignTemplateFiles`) and opens the embedded field editor
 * via POST /template/create_embedded_draft (placeholder popup).
 */
export async function startDealEsignEmbeddedTemplateDraft(params: {
  dealId: string;
  fileId: string;
  title?: string;
}): Promise<{
  file: EsignTemplateFileRecord;
  editUrl: string;
  templateId: string;
  expiresAt: number;
  clientId: string;
  testMode: boolean;
}> {
  const cfg = getDropboxSignConfig();
  if (!cfg) {
    throw new Error(
      "Dropbox Sign is not configured. Add DROPBOX_SIGN_API_KEY and DROPBOX_SIGN_CLIENT_ID to backend/.env",
    );
  }

  const state = await getDealEsignTemplatesState(params.dealId);
  const file = findEsignTemplateFile(state, params.fileId);
  if (!file) {
    throw new Error("eSign template file not found");
  }
  if (!isPdfEsignFile(file)) {
    throw new Error(
      "Only PDF documents can be configured in Dropbox Sign. Convert Word files to PDF before uploading.",
    );
  }

  await ensureEsignTemplatePdfPrepared(
    params.dealId,
    file,
    state,
  );
  const fileBuffer = await readEsignTemplatePdfBuffer(file.relativePath);

  const title =
    params.title?.trim() ||
    file.templateName?.trim() ||
    file.dropboxSignTitle?.trim() ||
    file.originalName.replace(/\.pdf$/i, "") ||
    "Deal eSign template";

  const storedTemplateId = file.dropboxSignTemplateId?.trim();
  if (storedTemplateId) {
    const existing = await tryResumeEmbeddedTemplateEdit(storedTemplateId);
    if (existing) {
      return {
        file,
        editUrl: existing.editUrl,
        templateId: storedTemplateId,
        expiresAt: existing.expiresAt,
        clientId: cfg.clientId,
        testMode: cfg.testMode,
      };
    }
    console.warn(
      `[esign] Dropbox template ${storedTemplateId} not found for deal ${params.dealId} file ${params.fileId}; creating new embedded draft`,
    );
    await clearStoredDropboxTemplateId(params.dealId, file, state);
  }

  const draft = await createDealEmbeddedTemplateDraft({
    title,
    fileBuffer,
    fileName: file.originalName,
    includeQuestionnaire: Boolean(file.includeQuestionnaire),
  });

  file.dropboxSignTemplateId = draft.templateId;
  file.dropboxSignStatus = "draft";
  file.dropboxSignTitle = title;
  await persistEsignTemplatesJson(params.dealId, state);

  return {
    file,
    editUrl: draft.editUrl,
    templateId: draft.templateId,
    expiresAt: draft.expiresAt,
    clientId: cfg.clientId,
    testMode: cfg.testMode,
  };
}

/**
 * Template save logic: after the sponsor finishes the embedded editor, persist the
 * Dropbox Sign `template_id` and mark the portal record as ready for send-esign flows.
 */
export async function completeDealEsignEmbeddedTemplate(params: {
  dealId: string;
  fileId: string;
  dropboxSignTemplateId: string;
  title?: string;
}): Promise<EsignTemplateFileRecord> {
  const state = await getDealEsignTemplatesState(params.dealId);
  const file = findEsignTemplateFile(state, params.fileId);
  if (!file) {
    throw new Error("eSign template file not found");
  }

  const templateId = params.dropboxSignTemplateId.trim();
  if (!templateId) {
    throw new Error("dropboxSignTemplateId is required");
  }

  file.dropboxSignTemplateId = templateId;
  file.dropboxSignStatus = "ready";
  file.dropboxSignSavedAt = new Date().toISOString();
  if (params.title?.trim()) {
    file.dropboxSignTitle = params.title.trim();
  }

  await persistEsignTemplatesJson(params.dealId, state);
  return file;
}

/** Public config for frontend embedded client (no API key). */
export function getDealEsignDropboxSignPublicConfig(): {
  configured: boolean;
  clientId: string | null;
  testMode: boolean;
} {
  const cfg = getDropboxSignConfig();
  return {
    configured: Boolean(cfg),
    clientId: cfg?.clientId ?? null,
    testMode: cfg?.testMode ?? false,
  };
}
