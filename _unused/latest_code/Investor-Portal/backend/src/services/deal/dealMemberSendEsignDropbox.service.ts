import { mkdir, writeFile } from "node:fs/promises";
import * as nodePath from "node:path";
import { and, eq } from "drizzle-orm";
import { getUploadsPhysicalRoot } from "../../config/uploadPaths.js";
import { db } from "../../database/db.js";
import { dealInvestment } from "../../schema/deal.schema/deal-investment.schema.js";
import { getDropboxSignConfig } from "../../config/dropboxSign.config.js";
import type { DealInvestorEsignDocumentRef } from "../../constants/deal-investor-esign-status.js";
import {
  createEmbeddedSignatureRequestWithFile,
  createEmbeddedSignatureRequestWithTemplates,
  getDropboxSignTemplateFormFieldsForEmbeddedFile,
  type DropboxSignFormFieldPerDocument,
  type DropboxSignPrefillCustomField,
} from "../esign/dropboxSign.service.js";
import { getDealInvestorQuestionnaireState } from "./dealInvestorQuestionnaire.service.js";
import {
  buildInvestorQuestionnaireAnswersPdf,
  countPdfPages,
} from "./investorQuestionnaireAnswersPdf.service.js";
import {
  type InvestorQuestionnaireAnswersMap,
} from "./investorQuestionnaireAnswers.service.js";
import {
  ensureEsignTemplatePdfPrepared,
  getDealEsignTemplatesState,
  isPdfEsignFile,
  readEsignTemplatePdfBuffer,
  type EsignTemplateFileRecord,
} from "./dealEsignTemplates.service.js";
import {
  prependPdfBuffers,
  replaceW9AppendixWithFilled,
  appendW9ToPdfBuffer,
} from "./esignPdfMerge.service.js";
import {
  normalizeInvestorW9FormInput,
  readInvestorW9FormForTarget,
  type InvestorW9FormData,
} from "./investorW9Form.service.js";
import {
  applyQuestionnairePrefillToEsignFormFields,
  type EsignQuestionnairePrefillContext,
} from "./investorQuestionnaireEsignPrefill.service.js";
import { resolveQuestionnaireAnswersForEsign } from "./investorProfileQuestionnairePrefill.service.js";
import {
  addressPrefillPartsFromProfileBook,
  addressPrefillPartsFromW9,
  type EsignAddressPrefillParts,
} from "./investorEsignAddressPrefill.service.js";
import { getProfileBookForUser } from "../investing/investingProfileBook.service.js";
import type { InvestorEsignRowTarget } from "./dealMemberEsignStatus.service.js";
import {
  DEAL_ESIGN_PREVIEW_FOLDER,
  dealAssetsRelativePath,
  resolveDealStorageFolderName,
  sanitizeStoragePathSegment,
} from "./dealStoragePaths.service.js";

export type CreateInvestorSignatureRequestResult = {
  signatureRequestId: string;
  signatureId: string;
  signUrl: string;
  /** Merged questionnaire + template PDF for View/Download while pending. */
  investorPreviewRelativePath?: string;
};

function safeRosterSegment(raw: string): string {
  return sanitizeStoragePathSegment(raw, 64) || "investor";
}

/** Saved copy of the file sent to Dropbox (includes questionnaire pages when merged). */
export async function persistInvestorEsignPreviewPdf(params: {
  dealId: string;
  rosterId: string;
  buffer: Buffer;
  fileName: string;
}): Promise<string> {
  const dealFolder = await resolveDealStorageFolderName(params.dealId);
  const rosterFolder = safeRosterSegment(params.rosterId);
  const base = params.fileName.trim() || "esign-preview.pdf";
  const fileName = base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
  const relativePath = dealAssetsRelativePath(
    dealFolder,
    DEAL_ESIGN_PREVIEW_FOLDER,
    rosterFolder,
    fileName.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 120),
  );
  const abs = nodePath.join(getUploadsPhysicalRoot(), relativePath);
  await mkdir(nodePath.dirname(abs), { recursive: true });
  await writeFile(abs, params.buffer);
  return relativePath;
}

/** Use merged preview path on document rows so View shows questionnaire + template. */
export function applyInvestorPreviewToEsignDocuments(
  documents: DealInvestorEsignDocumentRef[],
  previewRelativePath: string | undefined,
): DealInvestorEsignDocumentRef[] {
  const rel = previewRelativePath?.trim();
  if (!rel) return documents;
  return documents.map((d) => ({
    ...d,
    templateRelativePath: rel,
  }));
}

/**
 * Creates an embedded Dropbox Sign request for the selected ready templates.
 * When the template includes the investor questionnaire and answers exist,
 * prepends a PDF of responses before the prepared template (signature page + subscription).
 */
export async function createInvestorSignatureRequestDropbox(params: {
  dealId: string;
  rosterId: string;
  toEmail: string;
  memberDisplayName?: string;
  dealName: string;
  selectedFiles: EsignTemplateFileRecord[];
  esignTarget?: InvestorEsignRowTarget | null;
  commitmentProfileId?: string;
  questionnaireAnswers?: InvestorQuestionnaireAnswersMap | null;
  w9FormData?: InvestorW9FormData | null;
  /** Stored on Dropbox metadata for webhook → `investment_signatures`. */
  investmentId?: string;
  investorId?: string;
}): Promise<CreateInvestorSignatureRequestResult | null> {
  if (!getDropboxSignConfig()) return null;

  const templateIds = params.selectedFiles
    .map((f) => f.dropboxSignTemplateId?.trim() ?? "")
    .filter(Boolean);
  if (templateIds.length === 0) {
    throw new Error("Selected documents are missing Dropbox Sign template ids");
  }

  const signerEmail = params.toEmail.trim().toLowerCase();
  const signerName = params.memberDisplayName?.trim() || signerEmail;
  const dealLabel = params.dealName.trim() || "Deal";
  const requestMetadata: Record<string, string> = {
    deal_id: params.dealId,
    roster_id: params.rosterId,
  };
  const investmentId = params.investmentId?.trim();
  const investorId = params.investorId?.trim();
  if (investmentId) requestMetadata.investment_id = investmentId;
  if (investorId) requestMetadata.investor_id = investorId;

  const assembled = await assembleInvestorSigningPdf(params);
  let investorPreviewRelativePath: string | undefined;
  if (assembled?.savePreview) {
    try {
      investorPreviewRelativePath = await persistInvestorEsignPreviewPdf({
        dealId: params.dealId,
        rosterId: params.rosterId,
        buffer: assembled.buffer,
        fileName: assembled.fileName,
      });
    } catch (err) {
      console.warn("persistInvestorEsignPreviewPdf:", err);
    }
  }

  const prefillContext = await buildEsignPrefillContext({
    dealId: params.dealId,
    esignTarget: params.esignTarget,
    memberDisplayName: params.memberDisplayName,
    memberEmail: signerEmail,
    w9Form: params.w9FormData,
    viewerUserId: params.investorId,
  });

  if (assembled?.needsCustomDropboxFile) {
    const { formFields, customFields } = await resolveInvestorEsignFormFields({
      dealId: params.dealId,
      templateId: assembled.templateId,
      answerPageCount: assembled.answerPageCount,
      esignTarget: params.esignTarget,
      questionnaireAnswers: assembled.answers,
      memberDisplayName: params.memberDisplayName,
      prefillContext,
      investorId: params.investorId,
      w9Form: params.w9FormData,
    });

    if (formFields.length === 0) {
      console.warn(
        `[esign] No sponsor template fields loaded for deal ${params.dealId}; using Dropbox template signing`,
      );
      const result = await createEmbeddedSignatureRequestWithTemplates({
        templateIds,
        signerEmail,
        signerName,
        title: `eSign — ${dealLabel}`,
        subject: `Please sign — ${dealLabel}`,
        message: `Please review and sign the documents for ${dealLabel}.`,
        metadata: requestMetadata,
        customFields,
      });
      return {
        signatureRequestId: result.signatureRequestId,
        signatureId: result.signatureId,
        signUrl: result.signUrl,
        investorPreviewRelativePath,
      };
    }

    // One merged PDF (answers + sponsor template) so Dropbox page numbers stay aligned
    // with the combined document the signer scrolls through.
    const result = await createEmbeddedSignatureRequestWithFile({
      fileBuffer: assembled.buffer,
      fileName: assembled.fileName,
      signerEmail,
      signerName,
      title: `eSign — ${dealLabel}`,
      subject: `Please sign — ${dealLabel}`,
      message: `Please review and sign the documents for ${dealLabel}.`,
      metadata: requestMetadata,
      formFieldsPerDocument: formFields,
      customFields,
      usePreexistingFields: false,
    });
    return {
      signatureRequestId: result.signatureRequestId,
      signatureId: result.signatureId,
      signUrl: result.signUrl,
      investorPreviewRelativePath,
    };
  }

  const customFields = await resolveQuestionnairePrefillCustomFields({
    ...params,
    prefillContext,
    w9Form: params.w9FormData,
  });

  const result = await createEmbeddedSignatureRequestWithTemplates({
    templateIds,
    signerEmail,
    signerName,
    title: `eSign — ${dealLabel}`,
    subject: `Please sign — ${dealLabel}`,
    message: `Please review and sign the documents for ${dealLabel}.`,
    metadata: requestMetadata,
    customFields,
  });

  return {
    signatureRequestId: result.signatureRequestId,
    signatureId: result.signatureId,
    signUrl: result.signUrl,
    investorPreviewRelativePath,
  };
}

async function resolveInvestorW9FormData(params: {
  dealId: string;
  esignTarget?: InvestorEsignRowTarget | null;
  w9FormData?: InvestorW9FormData | null;
}): Promise<InvestorW9FormData | null> {
  const fromBody = normalizeInvestorW9FormInput(params.w9FormData);
  if (fromBody) return fromBody;
  if (!params.esignTarget) return null;
  return readInvestorW9FormForTarget(params.dealId, params.esignTarget);
}

export async function buildEsignPrefillContext(params: {
  dealId: string;
  esignTarget?: InvestorEsignRowTarget | null;
  memberDisplayName?: string;
  memberEmail?: string;
  w9Form?: unknown;
  viewerUserId?: string;
}): Promise<EsignQuestionnairePrefillContext> {
  let investmentAmount = "";
  let userInvestorProfileId = "";
  if (params.esignTarget?.table === "investment") {
    const [row] = await db
      .select({
        commitmentAmount: dealInvestment.commitmentAmount,
        userInvestorProfileId: dealInvestment.userInvestorProfileId,
      })
      .from(dealInvestment)
      .where(
        and(
          eq(dealInvestment.id, params.esignTarget.id),
          eq(dealInvestment.dealId, params.dealId),
        ),
      )
      .limit(1);
    investmentAmount = String(row?.commitmentAmount ?? "").trim();
    userInvestorProfileId = String(row?.userInvestorProfileId ?? "").trim();
  }

  const w9FromBody = normalizeInvestorW9FormInput(params.w9Form);
  const w9FromTarget =
    params.esignTarget && !w9FromBody
      ? await readInvestorW9FormForTarget(params.dealId, params.esignTarget)
      : null;
  let addressParts: EsignAddressPrefillParts | null =
    addressPrefillPartsFromW9(w9FromBody ?? w9FromTarget);

  const viewerUserId = String(params.viewerUserId ?? "").trim();
  if (!addressParts && viewerUserId && userInvestorProfileId) {
    const book = await getProfileBookForUser(viewerUserId);
    addressParts = addressPrefillPartsFromProfileBook(book, userInvestorProfileId);
  }

  return {
    memberDisplayName: params.memberDisplayName?.trim(),
    memberEmail: params.memberEmail?.trim().toLowerCase(),
    investmentAmount,
    addressLine: addressParts?.addressLine,
    mailingAddressLine: addressParts?.mailingAddressLine,
    streetLine: addressParts?.streetLine,
    streetLine2: addressParts?.streetLine2,
    city: addressParts?.city,
    state: addressParts?.state,
    zip: addressParts?.zip,
    cityStateZip: addressParts?.cityStateZip,
  };
}

/** Text-merge prefill when signing via Dropbox template (unmodified PDF). */
async function resolveQuestionnairePrefillCustomFields(params: {
  dealId: string;
  selectedFiles: EsignTemplateFileRecord[];
  esignTarget?: InvestorEsignRowTarget | null;
  questionnaireAnswers?: InvestorQuestionnaireAnswersMap | null;
  memberDisplayName?: string;
  prefillContext?: EsignQuestionnairePrefillContext;
  investorId?: string;
  w9Form?: unknown;
}): Promise<DropboxSignPrefillCustomField[]> {
  if (params.selectedFiles.length !== 1) return [];

  const answers = await resolveQuestionnaireAnswersForEsign({
    dealId: params.dealId,
    esignTarget: params.esignTarget,
    investorId: params.investorId,
    answers: params.questionnaireAnswers,
    w9Form: params.w9Form,
  });
  if (!answers || !Object.keys(answers).length) return [];

  const templateId = params.selectedFiles[0].dropboxSignTemplateId?.trim();
  if (!templateId) return [];

  let templateFields: DropboxSignFormFieldPerDocument[] = [];
  try {
    templateFields = await getDropboxSignTemplateFormFieldsForEmbeddedFile(
      templateId,
      { pageOffset: 0 },
    );
  } catch (err) {
    console.warn(
      `[esign] Could not load template fields for questionnaire prefill (${templateId}):`,
      err,
    );
    return [];
  }

  const config = await getDealInvestorQuestionnaireState(params.dealId);
  const { customFields } = await applyQuestionnairePrefillToEsignFormFields({
    formFields: templateFields,
    config,
    answers,
    memberDisplayName: params.memberDisplayName,
    prefillContext: params.prefillContext,
  });
  return customFields;
}

async function resolveInvestorEsignFormFields(params: {
  dealId: string;
  templateId: string;
  /** Investor answer pages prepended before the sponsor template in the signing PDF. */
  answerPageCount: number;
  esignTarget?: InvestorEsignRowTarget | null;
  questionnaireAnswers?: InvestorQuestionnaireAnswersMap | null;
  memberDisplayName?: string;
  prefillContext?: EsignQuestionnairePrefillContext;
  investorId?: string;
  w9Form?: unknown;
}): Promise<{
  formFields: DropboxSignFormFieldPerDocument[];
  customFields: DropboxSignPrefillCustomField[];
}> {
  let formFields: DropboxSignFormFieldPerDocument[] = [];
  try {
    formFields = await getDropboxSignTemplateFormFieldsForEmbeddedFile(
      params.templateId,
      { pageOffset: params.answerPageCount },
    );
  } catch (err) {
    console.warn(
      `[esign] Could not load Dropbox template fields for ${params.templateId}:`,
      err,
    );
  }

  /** Investor signing uses only sponsor-placed fields from the Dropbox template (investor role). */

  const answers = await resolveQuestionnaireAnswersForEsign({
    dealId: params.dealId,
    esignTarget: params.esignTarget,
    investorId: params.investorId,
    answers: params.questionnaireAnswers,
    w9Form: params.w9Form,
  });
  if (!answers || !Object.keys(answers).length) {
    return { formFields, customFields: [] };
  }

  const config = await getDealInvestorQuestionnaireState(params.dealId);
  return applyQuestionnairePrefillToEsignFormFields({
    formFields,
    config,
    answers,
    memberDisplayName: params.memberDisplayName,
    prefillContext: params.prefillContext,
  });
}

/**
 * Builds the investor-facing PDF (questionnaire answers, filled W-9, template body).
 * Saved for sponsor/investor View while pending; sent to Dropbox only when structurally merged.
 */
export async function assembleInvestorSigningPdf(params: {
  dealId: string;
  selectedFiles: EsignTemplateFileRecord[];
  esignTarget?: InvestorEsignRowTarget | null;
  commitmentProfileId?: string;
  questionnaireAnswers?: InvestorQuestionnaireAnswersMap | null;
  w9FormData?: InvestorW9FormData | null;
  dealName: string;
  memberDisplayName?: string;
  investorId?: string;
}): Promise<{
  buffer: Buffer;
  fileName: string;
  templateFileName: string;
  templateId: string;
  answerPageCount: number;
  answers: InvestorQuestionnaireAnswersMap | null;
  needsCustomDropboxFile: boolean;
  savePreview: boolean;
  /** Questionnaire answers PDF merged into the signing buffer. */
  answersPdfBuffer?: Buffer;
  /** Prepared sponsor template before answer pages are merged. */
  templateSigningBuffer?: Buffer;
} | null> {
  if (params.selectedFiles.length !== 1) return null;

  const file = params.selectedFiles[0];
  if (!isPdfEsignFile(file)) return null;

  const templateId =
    file.signflowDocumentId?.trim() || file.dropboxSignTemplateId?.trim();
  if (!templateId) return null;

  const answers = await resolveQuestionnaireAnswersForEsign({
    dealId: params.dealId,
    esignTarget: params.esignTarget,
    investorId: params.investorId,
    answers: params.questionnaireAnswers,
    w9Form: params.w9FormData,
  });

  const w9Data = await resolveInvestorW9FormData({
    dealId: params.dealId,
    esignTarget: params.esignTarget,
    w9FormData: params.w9FormData,
  });

  const profileId = await resolveCommitmentProfileId(
    params.dealId,
    params.esignTarget,
    params.commitmentProfileId,
  );

  const prependQuestionnaireAnswers =
    Boolean(file.includeQuestionnaire) &&
    Boolean(answers && Object.keys(answers).length) &&
    Boolean(profileId);

  const needsCustomDropboxFile = prependQuestionnaireAnswers || Boolean(w9Data);
  const savePreview = needsCustomDropboxFile;

  const esignState = await getDealEsignTemplatesState(params.dealId);
  await ensureEsignTemplatePdfPrepared(
    params.dealId,
    file,
    esignState,
  );
  let templateSigningBuffer: Buffer = Buffer.from(
    await readEsignTemplatePdfBuffer(file.relativePath),
  );

  if (w9Data) {
    if (file.includesW9Appendix) {
      templateSigningBuffer = Buffer.from(
        await replaceW9AppendixWithFilled(templateSigningBuffer, w9Data),
      );
    } else {
      const appended = await appendW9ToPdfBuffer(templateSigningBuffer, w9Data);
      templateSigningBuffer = Buffer.from(appended.buffer);
    }
  }

  let buffer = templateSigningBuffer;
  let answerPageCount = 0;
  let answersPdfBuffer: Buffer | undefined;

  if (prependQuestionnaireAnswers && answers && profileId) {
    const config = await getDealInvestorQuestionnaireState(params.dealId);
    answersPdfBuffer = await buildInvestorQuestionnaireAnswersPdf({
      config,
      answers,
      commitmentProfileId: profileId,
      dealName: params.dealName,
      investorName: params.memberDisplayName,
    });
    answerPageCount = await countPdfPages(answersPdfBuffer);
    // Order: investor answers → questionnaire signature (template p.1) → agreement, etc.
    const merged = await prependPdfBuffers(templateSigningBuffer, [
      answersPdfBuffer,
    ]);
    if (!merged.prepended) return null;
    buffer = Buffer.from(merged.buffer);
  }

  const templateBaseName =
    file.originalName.replace(/\.pdf$/i, "") || "investment-documents";
  const suffix = prependQuestionnaireAnswers
    ? "-with-questionnaire"
    : w9Data
      ? "-with-w9"
      : "";
  return {
    buffer,
    fileName: `${templateBaseName}${suffix}.pdf`,
    templateFileName: `${templateBaseName}.pdf`,
    templateId,
    answerPageCount,
    answers,
    needsCustomDropboxFile,
    savePreview,
    ...(answersPdfBuffer ? { answersPdfBuffer } : {}),
    templateSigningBuffer,
  };
}

async function resolveCommitmentProfileId(
  dealId: string,
  target: InvestorEsignRowTarget | null | undefined,
  override?: string,
): Promise<string | null> {
  const fromOverride = override?.trim();
  if (fromOverride) return fromOverride;
  if (!target || target.table !== "investment") return null;
  const [row] = await db
    .select({ profileId: dealInvestment.profileId })
    .from(dealInvestment)
    .where(
      and(
        eq(dealInvestment.id, target.id),
        eq(dealInvestment.dealId, dealId),
      ),
    )
    .limit(1);
  const p = String(row?.profileId ?? "").trim();
  return p || null;
}

export function esignTemplateDisplayNameForFile(
  file: EsignTemplateFileRecord,
): string {
  return (
    file.templateName?.trim() ||
    file.dropboxSignTitle?.trim() ||
    file.originalName?.trim() ||
    "Document"
  );
}

export function esignDocumentsFromSelectedFiles(
  files: EsignTemplateFileRecord[],
): DealInvestorEsignDocumentRef[] {
  return files.map((f) => ({
    fileId: f.id,
    name: esignTemplateDisplayNameForFile(f),
    categoryId: f.categoryId,
    templateRelativePath: f.relativePath,
  }));
}
