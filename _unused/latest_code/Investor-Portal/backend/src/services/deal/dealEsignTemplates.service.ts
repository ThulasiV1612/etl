import { randomUUID } from "node:crypto";
import { access, constants as fsConstants, mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import { getActiveEsignProvider } from "../../config/esignProvider.config.js";
import type { DealInvestorEsignDocumentRef } from "../../constants/deal-investor-esign-status.js";
import { getUploadsPhysicalRoot } from "../../config/uploadPaths.js";
import {
  DEAL_ASSETS_UPLOAD_SUBDIR,
  DEAL_ESIGN_TEMPLATES_FOLDER,
  dealAssetsAbsoluteDir,
  dealAssetsRelativePath,
  resolveDealStorageFolderName,
} from "./dealStoragePaths.service.js";
import { db } from "../../database/db.js";
import { addDealForm } from "../../schema/deal.schema/add-deal-form.schema.js";
import { PDFDocument } from "pdf-lib";
import {
  appendW9ToPdfBuffer,
  ESIGN_QUESTIONNAIRE_PAGE_LAYOUT_VERSION,
  isPdfFileName,
  isPdfUploadFile,
  prependInvestorQuestionnaireSignaturePage,
} from "./esignPdfMerge.service.js";
import { ESIGN_UNIFIED_CATEGORY_ID } from "../../constants/esignProfileTypes.js";
import {
  DEFAULT_ESIGN_SIGNFLOW_SIGNING_ORDER,
  DEFAULT_ESIGN_SIGNFLOW_WORKFLOW_TYPE,
  normalizeEsignSignflowSigningOrder,
  normalizeEsignSignflowWorkflowType,
  type EsignSignflowSigningOrder,
  type EsignSignflowWorkflowType,
} from "../../constants/esignSigningWorkflow.js";
import type { SignFlowField } from "../esign/signflow.service.js";
import {
  buildStoredAssetName,
  type DealMemoryUploadFile,
} from "./dealForm.service.js";

const UPLOAD_SUBDIR = DEAL_ASSETS_UPLOAD_SUBDIR;
const ESIGN_FOLDER = DEAL_ESIGN_TEMPLATES_FOLDER;

/** Dropbox Sign template lifecycle stored alongside the uploaded file metadata. */
export type DropboxSignTemplateStatus = "none" | "draft" | "ready";

export type EsignProviderName = "dropbox" | "signflow";

export type EsignTemplateFileRecord = {
  id: string;
  categoryId: string;
  relativePath: string;
  originalName: string;
  uploadedAt: string;
  /** Sponsor-defined display name for this template. */
  templateName?: string;
  /** When true, prepends investor questionnaire signature page (text only) as page 1. */
  includeQuestionnaire?: boolean;
  /** True when page 1 is the investor questionnaire signature page. */
  includesQuestionnairePage?: boolean;
  /** Questionnaire page 1 PDF layout revision (see ESIGN_QUESTIONNAIRE_PAGE_LAYOUT_VERSION). */
  questionnairePageLayoutVersion?: number;
  /** True when the stored PDF includes the appendix W-9 form. */
  includesW9Appendix?: boolean;
  /** Active eSign provider for this template record. */
  esignProvider?: EsignProviderName;
  /** Dropbox Sign template id after embedded draft is created or saved. */
  dropboxSignTemplateId?: string;
  dropboxSignStatus?: DropboxSignTemplateStatus;
  dropboxSignTitle?: string;
  dropboxSignSavedAt?: string;
  /** SignFlow draft/template document id. */
  signflowDocumentId?: string;
  signflowStatus?: DropboxSignTemplateStatus;
  signflowTitle?: string;
  signflowSavedAt?: string;
  /** SignFlow signing workflow — parallel or sequential. */
  signflowWorkflowType?: EsignSignflowWorkflowType;
  /** When sequential — who signs first. */
  signflowSigningOrder?: EsignSignflowSigningOrder;
  /** Sponsor-placed SignFlow fields snapshot (persisted when template is saved). */
  signflowTemplateFields?: SignFlowField[];
  /**
   * SynX-side bindings for sponsor-added investor data fields.
   * Survives SignFlow embed saves that may strip custom props like dataKey/profileTypes.
   */
  signflowInvestorDataFieldBindings?: SignflowInvestorDataFieldBinding[];
  /**
   * Set after the first auto-place / questionnaire seed onto the SignFlow draft.
   * Resume must not re-seed once this is set, or deleted fields reappear.
   */
  signflowFieldsSeededAt?: string;
};

/** Binding for a sponsor-placed investor data field (Choose field panel). */
export type SignflowInvestorDataFieldBinding = {
  dataKey: string;
  esignLabel: string;
  profileTypes: string[];
  page: number;
  x: number;
  y: number;
};

export function resolveEsignTemplateProvider(
  file: EsignTemplateFileRecord,
  activeProvider?: EsignProviderName | null,
): EsignProviderName {
  if (file.esignProvider) return file.esignProvider;
  if (activeProvider) return activeProvider;
  if (file.signflowDocumentId?.trim()) return "signflow";
  if (file.dropboxSignTemplateId?.trim()) return "dropbox";
  return "signflow";
}

export function resolveEsignTemplateExternalId(
  file: EsignTemplateFileRecord,
  activeProvider?: EsignProviderName | null,
): string | undefined {
  const provider = resolveEsignTemplateProvider(file, activeProvider);
  if (provider === "signflow") {
    return file.signflowDocumentId?.trim() || file.dropboxSignTemplateId?.trim();
  }
  return file.dropboxSignTemplateId?.trim() || file.signflowDocumentId?.trim();
}

export function resolveEsignTemplateStatus(
  file: EsignTemplateFileRecord,
  activeProvider?: EsignProviderName | null,
): DropboxSignTemplateStatus {
  const provider = resolveEsignTemplateProvider(file, activeProvider);
  if (provider === "signflow") {
    return file.signflowStatus ?? file.dropboxSignStatus ?? "none";
  }
  return file.dropboxSignStatus ?? file.signflowStatus ?? "none";
}

export function isEsignTemplateReady(
  file: EsignTemplateFileRecord,
  activeProvider?: EsignProviderName | null,
): boolean {
  return (
    resolveEsignTemplateStatus(file, activeProvider) === "ready" &&
    Boolean(resolveEsignTemplateExternalId(file, activeProvider))
  );
}

export type EsignTemplateUploadMeta = {
  templateName?: string;
  includeQuestionnaire?: boolean;
  signflowWorkflowType?: EsignSignflowWorkflowType;
  signflowSigningOrder?: EsignSignflowSigningOrder;
};

export type EsignTemplatesJson = {
  v: 1;
  files: EsignTemplateFileRecord[];
};

function safeCategorySegment(raw: string): string {
  const t = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return t || "general";
}

export function parseEsignTemplatesJson(
  raw: string | null | undefined,
): EsignTemplatesJson {
  if (!raw?.trim()) return { v: 1, files: [] };
  try {
    const parsed = JSON.parse(raw) as {
      v?: number;
      files?: EsignTemplateFileRecord[];
    };
    const files = Array.isArray(parsed.files)
      ? parsed.files.filter(
          (f) =>
            f &&
            typeof f.id === "string" &&
            typeof f.categoryId === "string" &&
            typeof f.relativePath === "string",
        )
      : [];
    return { v: 1, files };
  } catch {
    return { v: 1, files: [] };
  }
}

export async function getDealEsignTemplatesState(
  dealId: string,
): Promise<EsignTemplatesJson> {
  const [row] = await db
    .select({ esignTemplatesJson: addDealForm.esignTemplatesJson })
    .from(addDealForm)
    .where(eq(addDealForm.id, dealId))
    .limit(1);
  return parseEsignTemplatesJson(row?.esignTemplatesJson);
}

export function dealHasEsignTemplateDocuments(state: EsignTemplatesJson): boolean {
  return state.files.length > 0;
}

/** Every uploaded template has field setup complete for the active eSign provider. */
export function dealEsignTemplatesFullyConfigured(
  state: EsignTemplatesJson,
): boolean {
  if (state.files.length === 0) return false;
  const provider = getActiveEsignProvider();
  return state.files.every((f) => isEsignTemplateReady(f, provider));
}

export function listIncompleteEsignTemplates(
  state: EsignTemplatesJson,
): EsignTemplateFileRecord[] {
  const provider = getActiveEsignProvider();
  return state.files.filter((f) => !isEsignTemplateReady(f, provider));
}

export function formatIncompleteEsignTemplateNames(
  files: EsignTemplateFileRecord[],
): string {
  return files
    .map((f) => f.templateName?.trim() || f.originalName?.trim() || "Untitled template")
    .join(", ");
}

export function isPdfEsignFile(record: EsignTemplateFileRecord): boolean {
  return (
    isPdfFileName(record.originalName) ||
    isPdfFileName(record.relativePath)
  );
}

export function resolveEsignTemplateAbsolutePath(relativePath: string): string {
  const rel = relativePath.replace(/^\/+/, "").replace(/^uploads\//i, "");
  return path.join(getUploadsPhysicalRoot(), rel);
}

export const ESIGN_TEMPLATE_PDF_MISSING_MESSAGE =
  "Template PDF was not found on the server. Remove this template and upload it again.";

/** Read an on-disk eSign template PDF or throw a user-facing error when missing. */
export async function readEsignTemplatePdfBuffer(
  relativePath: string,
): Promise<Buffer> {
  const absPath = resolveEsignTemplateAbsolutePath(relativePath);
  try {
    await access(absPath, fsConstants.R_OK);
  } catch {
    throw new Error(ESIGN_TEMPLATE_PDF_MISSING_MESSAGE);
  }
  return readFile(absPath);
}

export function findEsignTemplateFile(
  state: EsignTemplatesJson,
  fileId: string,
): EsignTemplateFileRecord | undefined {
  return state.files.find((f) => f.id === fileId);
}

/** Attach profile category ids from deal templates when missing on stored status. */
export async function enrichEsignDocumentsWithCategories(
  dealId: string,
  documents: Array<{
    fileId: string;
    name: string;
    categoryId?: string;
    templateRelativePath?: string;
    signedRelativePath?: string;
  }>,
): Promise<DealInvestorEsignDocumentRef[]> {
  const state = await getDealEsignTemplatesState(dealId);
  return documents.map((d) => {
    const template = findEsignTemplateFile(state, d.fileId);
    const categoryId =
      d.categoryId?.trim() || template?.categoryId?.trim() || undefined;
    const templateRelativePath =
      d.templateRelativePath?.trim() ||
      template?.relativePath?.trim() ||
      undefined;
    return {
      fileId: d.fileId,
      name: d.name,
      ...(categoryId ? { categoryId } : {}),
      ...(templateRelativePath ? { templateRelativePath } : {}),
      ...(d.signedRelativePath ? { signedRelativePath: d.signedRelativePath } : {}),
    };
  });
}

/**
 * Ensures page 1 is the investor questionnaire signature page (top-aligned image).
 */
export async function ensureEsignTemplatePdfIncludesQuestionnaire(
  dealId: string,
  file: EsignTemplateFileRecord,
  state?: EsignTemplatesJson,
): Promise<{ file: EsignTemplateFileRecord; absolutePath: string }> {
  const absPath = resolveEsignTemplateAbsolutePath(file.relativePath);
  if (!isPdfEsignFile(file) || !file.includeQuestionnaire) {
    return { file, absolutePath: absPath };
  }

  const layoutVersion = file.questionnairePageLayoutVersion ?? 0;
  const layoutCurrent =
    layoutVersion >= ESIGN_QUESTIONNAIRE_PAGE_LAYOUT_VERSION &&
    Boolean(file.includesQuestionnairePage);
  if (layoutCurrent) {
    return { file, absolutePath: absPath };
  }

  const currentState = state ?? (await getDealEsignTemplatesState(dealId));
  const fileBuffer = await readEsignTemplatePdfBuffer(file.relativePath);
  const doc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
  const pageCount = doc.getPageCount();

  let tailPdf: Buffer;
  if (pageCount > 1) {
    const tail = await PDFDocument.create();
    const tailPages = await tail.copyPages(
      doc,
      doc.getPageIndices().slice(1),
    );
    for (const page of tailPages) tail.addPage(page);
    tailPdf = Buffer.from(await tail.save());
  } else if (file.includesQuestionnairePage) {
    const empty = await PDFDocument.create();
    tailPdf = Buffer.from(await empty.save());
  } else {
    tailPdf = fileBuffer;
  }

  const merged = await prependInvestorQuestionnaireSignaturePage(tailPdf);
  if (merged.prepended) {
    await writeFile(absPath, merged.buffer);
    file.includesQuestionnairePage = true;
    file.questionnairePageLayoutVersion = ESIGN_QUESTIONNAIRE_PAGE_LAYOUT_VERSION;
    if (file.dropboxSignTemplateId) {
      delete file.dropboxSignTemplateId;
      delete file.dropboxSignStatus;
      delete file.dropboxSignSavedAt;
    }
    await persistEsignTemplatesJson(dealId, currentState);
  }
  return { file, absolutePath: absPath };
}

/**
 * Ensures the on-disk PDF includes the appendix W-9 when missing. Updates metadata when merged.
 */
export async function ensureEsignTemplatePdfIncludesW9(
  dealId: string,
  file: EsignTemplateFileRecord,
  state?: EsignTemplatesJson,
): Promise<{ file: EsignTemplateFileRecord; absolutePath: string }> {
  const absPath = resolveEsignTemplateAbsolutePath(file.relativePath);
  if (!isPdfEsignFile(file) || file.includesW9Appendix) {
    return { file, absolutePath: absPath };
  }

  const currentState = state ?? (await getDealEsignTemplatesState(dealId));
  const fileBuffer = await readEsignTemplatePdfBuffer(file.relativePath);
  const merged = await appendW9ToPdfBuffer(fileBuffer);
  if (merged.w9Appended) {
    await writeFile(absPath, merged.buffer);
    file.includesW9Appendix = true;
    await persistEsignTemplatesJson(dealId, currentState);
  }
  return { file, absolutePath: absPath };
}

/** Questionnaire page 1 (when enabled), main document, then W-9 appendix when applicable. */
export async function ensureEsignTemplatePdfPrepared(
  dealId: string,
  file: EsignTemplateFileRecord,
  state?: EsignTemplatesJson,
): Promise<{ file: EsignTemplateFileRecord; absolutePath: string }> {
  const currentState = state ?? (await getDealEsignTemplatesState(dealId));
  const withQuestionnaire = await ensureEsignTemplatePdfIncludesQuestionnaire(
    dealId,
    file,
    currentState,
  );
  return ensureEsignTemplatePdfIncludesW9(
    dealId,
    withQuestionnaire.file,
    currentState,
  );
}

async function persistEsignTemplatesJson(
  dealId: string,
  state: EsignTemplatesJson,
): Promise<void> {
  await db
    .update(addDealForm)
    .set({ esignTemplatesJson: JSON.stringify(state) })
    .where(eq(addDealForm.id, dealId));
}

export function parseEsignTemplateUploadMeta(
  raw: unknown,
  fileCount: number,
): EsignTemplateUploadMeta[] {
  if (!raw) return Array.from({ length: fileCount }, () => ({}));
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return Array.from({ length: fileCount }, () => ({}));
    }
  }
  if (!Array.isArray(parsed)) return Array.from({ length: fileCount }, () => ({}));
  return Array.from({ length: fileCount }, (_, i) => {
    const item = parsed[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) return {};
    const o = item as Record<string, unknown>;
    const templateName = String(o.templateName ?? o.template_name ?? "").trim();
    const q = o.includeQuestionnaire ?? o.include_questionnaire;
    const includeQuestionnaire =
      q === true ||
      q === "true" ||
      q === "1" ||
      q === 1;
    const workflowType =
      normalizeEsignSignflowWorkflowType(
        o.signflowWorkflowType ?? o.signflow_workflow_type,
      ) ?? undefined;
    const signingOrder =
      normalizeEsignSignflowSigningOrder(
        o.signflowSigningOrder ?? o.signflow_signing_order,
      ) ?? undefined;
    return {
      templateName: templateName || undefined,
      includeQuestionnaire: includeQuestionnaire || undefined,
      signflowWorkflowType: workflowType,
      signflowSigningOrder: signingOrder,
    };
  });
}

/** Thrown when upload violates one-document-per-profile-type limit. */
export class EsignTemplateUploadLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EsignTemplateUploadLimitError";
  }
}

export async function saveDealEsignTemplateFiles(params: {
  dealId: string;
  categoryId: string;
  files: DealMemoryUploadFile[];
  meta?: EsignTemplateUploadMeta[];
}): Promise<EsignTemplateFileRecord[]> {
  if (!params.files.length) return [];
  if (params.files.length > 1) {
    throw new EsignTemplateUploadLimitError(
      "Only one file can be uploaded per profile type.",
    );
  }
  const existingState = await getDealEsignTemplatesState(params.dealId);
  const hasUnified = existingState.files.some(
    (f) => f.categoryId === ESIGN_UNIFIED_CATEGORY_ID,
  );
  const hasLegacy = existingState.files.some(
    (f) => f.categoryId !== ESIGN_UNIFIED_CATEGORY_ID,
  );

  if (params.categoryId === ESIGN_UNIFIED_CATEGORY_ID) {
    if (existingState.files.length > 0) {
      throw new EsignTemplateUploadLimitError(
        "This deal already has an eSign template. Remove it before uploading another.",
      );
    }
  } else if (hasUnified) {
    throw new EsignTemplateUploadLimitError(
      "This deal uses a unified eSign template for all investor profiles. Remove it before uploading profile-specific templates.",
    );
  } else if (
    existingState.files.some((f) => f.categoryId === params.categoryId)
  ) {
    throw new EsignTemplateUploadLimitError(
      "This profile type already has a template. Remove the existing document before uploading another.",
    );
  }
  const dealFolder = await resolveDealStorageFolderName(params.dealId);
  const categoryFolder = safeCategorySegment(params.categoryId);
  const uploadRoot = dealAssetsAbsoluteDir(
    dealFolder,
    ESIGN_FOLDER,
    categoryFolder,
  );
  await mkdir(uploadRoot, { recursive: true });

  const added: EsignTemplateFileRecord[] = [];
  const ts = Date.now();
  for (let i = 0; i < params.files.length; i += 1) {
    const file = params.files[i]!;
    const storedName = buildStoredAssetName(
      file.originalname,
      ts + i,
      randomUUID(),
    );
    const abs = path.join(uploadRoot, storedName);
    const uploadMeta = params.meta?.[i] ?? {};
    let bytes = file.buffer;
    let includesW9Appendix = false;
    let includesQuestionnairePage = false;
    if (isPdfUploadFile(file)) {
      if (uploadMeta.includeQuestionnaire) {
        const questionnaire = await prependInvestorQuestionnaireSignaturePage(
          bytes,
        );
        bytes = questionnaire.buffer;
        includesQuestionnairePage = questionnaire.prepended;
      }
      const merged = await appendW9ToPdfBuffer(bytes);
      bytes = merged.buffer;
      includesW9Appendix = merged.w9Appended;
    }
    await writeFile(abs, bytes);
    const relativePath = dealAssetsRelativePath(
      dealFolder,
      ESIGN_FOLDER,
      categoryFolder,
      storedName,
    );
    const templateName =
      uploadMeta.templateName?.trim() ||
      (file.originalname.trim() || storedName).replace(/\.[^.]+$/i, "").trim();
    added.push({
      id: randomUUID(),
      categoryId: params.categoryId,
      relativePath,
      originalName: file.originalname.trim() || storedName,
      uploadedAt: new Date().toISOString(),
      templateName: templateName || undefined,
      includeQuestionnaire: Boolean(uploadMeta.includeQuestionnaire),
      includesQuestionnairePage: includesQuestionnairePage || undefined,
      questionnairePageLayoutVersion: includesQuestionnairePage
        ? ESIGN_QUESTIONNAIRE_PAGE_LAYOUT_VERSION
        : undefined,
      includesW9Appendix: includesW9Appendix || undefined,
      dropboxSignTitle: templateName || undefined,
      signflowWorkflowType:
        uploadMeta.signflowWorkflowType ?? DEFAULT_ESIGN_SIGNFLOW_WORKFLOW_TYPE,
      signflowSigningOrder:
        uploadMeta.signflowSigningOrder ?? DEFAULT_ESIGN_SIGNFLOW_SIGNING_ORDER,
    });
  }

  const state = await getDealEsignTemplatesState(params.dealId);
  state.files.push(...added);
  await persistEsignTemplatesJson(params.dealId, state);
  return added;
}

/** Thrown when rename is attempted on a template that is not ready. */
export class EsignTemplateRenameNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EsignTemplateRenameNotAllowedError";
  }
}

/** Thrown when template name is empty. */
export class EsignTemplateNameRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EsignTemplateNameRequiredError";
  }
}

/**
 * Updates display name for a ready eSign template (lead sponsor).
 * Does not reopen Dropbox Sign field editor.
 */
export async function updateDealEsignTemplateName(
  dealId: string,
  fileId: string,
  templateName: string,
): Promise<EsignTemplateFileRecord | null> {
  const name = templateName.trim();
  if (!name) {
    throw new EsignTemplateNameRequiredError("Template name is required");
  }

  const state = await getDealEsignTemplatesState(dealId);
  const file = findEsignTemplateFile(state, fileId);
  if (!file) return null;

  if (!isEsignTemplateReady(file)) {
    throw new EsignTemplateRenameNotAllowedError(
      "Only ready templates can be renamed here. Use Edit to finish template setup first.",
    );
  }

  file.templateName = name;
  file.dropboxSignTitle = name;
  await persistEsignTemplatesJson(dealId, state);
  return file;
}

/**
 * Updates SignFlow signing workflow for a template (draft or ready).
 */
export async function updateDealEsignTemplateSigningWorkflow(
  dealId: string,
  fileId: string,
  settings: {
    signflowWorkflowType?: EsignSignflowWorkflowType;
    signflowSigningOrder?: EsignSignflowSigningOrder;
  },
): Promise<EsignTemplateFileRecord | null> {
  const state = await getDealEsignTemplatesState(dealId);
  const file = findEsignTemplateFile(state, fileId);
  if (!file) return null;

  const workflowType =
    settings.signflowWorkflowType ??
    normalizeEsignSignflowWorkflowType(file.signflowWorkflowType) ??
    DEFAULT_ESIGN_SIGNFLOW_WORKFLOW_TYPE;
  const signingOrder =
    settings.signflowSigningOrder ??
    normalizeEsignSignflowSigningOrder(file.signflowSigningOrder) ??
    DEFAULT_ESIGN_SIGNFLOW_SIGNING_ORDER;

  file.signflowWorkflowType = workflowType;
  file.signflowSigningOrder = signingOrder;
  await persistEsignTemplatesJson(dealId, state);

  const documentId = file.signflowDocumentId?.trim();
  if (documentId) {
    const { syncSignflowTemplateSigningWorkflow } = await import(
      "./dealEsignSigningWorkflow.service.js"
    );
    await syncSignflowTemplateSigningWorkflow(
      documentId,
      workflowType,
      signingOrder,
    );
  }

  return file;
}

export async function removeDealEsignTemplateFile(
  dealId: string,
  fileId: string,
): Promise<boolean> {
  const state = await getDealEsignTemplatesState(dealId);
  const before = state.files.length;
  state.files = state.files.filter((f) => f.id !== fileId);
  if (state.files.length === before) return false;
  await persistEsignTemplatesJson(dealId, state);
  return true;
}

export function groupEsignFilesByCategory(
  state: EsignTemplatesJson,
): Record<string, EsignTemplateFileRecord[]> {
  const out: Record<string, EsignTemplateFileRecord[]> = {};
  for (const f of state.files) {
    if (!out[f.categoryId]) out[f.categoryId] = [];
    out[f.categoryId]!.push(f);
  }
  return out;
}

export function parseSendEsignFileIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const id = x.trim();
    if (!id) continue;
    out.push(id);
    if (out.length >= 50) break;
  }
  return out;
}

export function findUnifiedEsignTemplate(
  state: EsignTemplatesJson,
): EsignTemplateFileRecord | undefined {
  return state.files.find((f) => f.categoryId === "all_profiles");
}

export function dealUsesUnifiedEsignTemplate(state: EsignTemplatesJson): boolean {
  return Boolean(findUnifiedEsignTemplate(state));
}

export { ESIGN_UNIFIED_CATEGORY_ID } from "../../constants/esignProfileTypes.js";

export function resolveEsignFilesByIds(
  state: EsignTemplatesJson,
  fileIds: string[],
): EsignTemplateFileRecord[] {
  if (fileIds.length === 0) return [];
  const wanted = new Set(fileIds);
  return state.files.filter((f) => wanted.has(f.id));
}
