import { getSignFlowPublicConfig } from "../../config/signflow.config.js";
import {
  buildSignFlowEditorUrl,
  countSignFlowPdfPages,
  createSignFlowDraftFromPdf,
  ensureSignFlowEmbedRecipients,
  getSignFlowDocument,
  normalizeSignFlowFieldRecipientIds,
  patchSignFlowDocument,
  resolveSignFlowInvestorRecipientId,
  resolveSignFlowSponsorRecipientId,
  type SignFlowField,
} from "../esign/signflow.service.js";
import {
  esignDocumentAlignedTextFieldSize,
  getInvestorQuestionnaireSignatureSignFlowFields,
  isQuestionnaireSignatureFieldLabel,
  loadInvestorQuestionnaireSignaturePagePdf,
} from "./esignPdfMerge.service.js";
import { inferSigningWorkflowFromSignFlowDocument, resolveSigningWorkflowFromTemplateFile } from "./dealEsignSigningWorkflow.service.js";
import {
  ensureEsignTemplatePdfPrepared,
  findEsignTemplateFile,
  getDealEsignTemplatesState,
  isPdfEsignFile,
  readEsignTemplatePdfBuffer,
  type EsignTemplateFileRecord,
  type EsignTemplatesJson,
  type SignflowInvestorDataFieldBinding,
} from "./dealEsignTemplates.service.js";
import { eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { addDealForm } from "../../schema/deal.schema/add-deal-form.schema.js";
import {
  fetchAutoPlacedOnboardingFields,
  replaceAutoPlacedSubscriptionFields,
} from "../onboarding/onboardingFieldsPython.service.js";
import { isOnboardingFieldsServiceConfigured } from "../../config/onboardingFields.config.js";
import { getEsignW9PageCount } from "./investorW9Form.service.js";
import { computePdfPageFingerprints } from "./esignPdfPageMap.service.js";
import {
  ALL_SIGNFLOW_PROFILE_TYPES,
  portalProfileIdToSignFlowProfileType,
  type SignFlowProfileType,
} from "../../constants/esignProfileTypes.js";
import {
  ESIGN_LABEL_TO_PROFILE_KEY,
  getEsignInvestorDataField,
  normalizeEsignFieldLabel,
} from "./esignInvestorDataFieldCatalog.js";

function hasStoredSignflowTemplateFields(file: EsignTemplateFileRecord): boolean {
  return (file.signflowTemplateFields?.length ?? 0) > 0;
}

/** Skip auto-placement / preset seeding once the draft was seeded or saved. */
function shouldSkipTemplateFieldSeeding(file: EsignTemplateFileRecord): boolean {
  return (
    file.signflowStatus === "ready" ||
    hasStoredSignflowTemplateFields(file) ||
    Boolean(file.signflowFieldsSeededAt?.trim())
  );
}

async function markSignFlowFieldsSeeded(
  dealId: string,
  state: EsignTemplatesJson,
  file: EsignTemplateFileRecord,
): Promise<void> {
  if (file.signflowFieldsSeededAt?.trim()) return;
  file.signflowFieldsSeededAt = new Date().toISOString();
  await persistEsignTemplatesJson(dealId, state);
}

async function captureSignFlowTemplateFieldsForStorage(
  dealId: string,
  file: EsignTemplateFileRecord,
  doc: Awaited<ReturnType<typeof getSignFlowDocument>>,
): Promise<SignFlowField[]> {
  const state = await getDealEsignTemplatesState(dealId);
  await ensureEsignTemplatePdfPrepared(dealId, file, state);
  const pdfBuffer = await readEsignTemplatePdfBuffer(file.relativePath);
  const hashes = await computePdfPageFingerprints(pdfBuffer);
  const normalized = normalizeSignFlowFieldRecipientIds(
    doc,
    (doc.fields ?? []) as SignFlowField[],
  ) as SignFlowField[];

  return normalized.map((field) => {
    const templatePage = Math.max(
      1,
      Math.floor(Number(field.templatePage ?? field.page) || 1),
    );
    return {
      ...field,
      templatePage,
      pageHash: field.pageHash?.trim() || hashes[templatePage - 1],
    };
  });
}

/**
 * Restore sponsor-saved fields onto the SignFlow document only when the live
 * document has no fields (e.g. SignFlow cleared them). Never overwrite a live
 * layout — otherwise deleted fields reappear after the editor reloads.
 */
async function ensureSignFlowTemplateFieldsFromRecord(
  documentId: string,
  file: EsignTemplateFileRecord,
): Promise<void> {
  const stored = file.signflowTemplateFields;
  if (!stored?.length) return;

  const doc = await getSignFlowDocument(documentId);
  const live = (doc.fields ?? []) as SignFlowField[];
  if (live.length > 0) return;

  const normalizedStored = normalizeSignFlowFieldRecipientIds(
    doc,
    stored,
  ) as SignFlowField[];

  await patchSignFlowDocument(documentId, {
    fields: normalizedStored,
  });
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

async function applyTemplateSigningWorkflowToSignFlowDoc(
  file: EsignTemplateFileRecord,
  documentId: string,
): Promise<void> {
  const { workflowType, signingOrder } =
    resolveSigningWorkflowFromTemplateFile(file);
  const { syncSignflowTemplateSigningWorkflow } = await import(
    "./dealEsignSigningWorkflow.service.js"
  );
  await syncSignflowTemplateSigningWorkflow(
    documentId,
    workflowType,
    signingOrder,
  );
}

function normalizeQuestionnaireSignatureFieldLabel(label: string): string {
  return String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

async function ensureSignFlowQuestionnaireSignatureFields(
  documentId: string,
  includeQuestionnaire: boolean,
): Promise<void> {
  if (!includeQuestionnaire) return;

  await loadInvestorQuestionnaireSignaturePagePdf();

  const doc = await getSignFlowDocument(documentId);
  const existing = doc.fields ?? [];
  const investorRecipientId = resolveSignFlowInvestorRecipientId(doc);
  const preset = getInvestorQuestionnaireSignatureSignFlowFields(
    investorRecipientId,
    0,
  );

  const otherFields = normalizeSignFlowFieldRecipientIds(
    doc,
    existing.filter(
      (field) =>
        Math.max(1, Math.floor(Number(field.page) || 1)) !== 1 ||
        !isQuestionnaireSignatureFieldLabel(String(field.label ?? "")),
    ),
  );

  const normalizedPreset = normalizeSignFlowFieldRecipientIds(doc, preset);
  const existingQuestionnaire = existing.filter(
    (field) =>
      Math.max(1, Math.floor(Number(field.page) || 1)) === 1 &&
      isQuestionnaireSignatureFieldLabel(String(field.label ?? "")),
  );

  const questionnaireFieldsMatch =
    existingQuestionnaire.length === normalizedPreset.length &&
    normalizedPreset.every((field) => {
      const match = existingQuestionnaire.find(
        (existingField) =>
          normalizeQuestionnaireSignatureFieldLabel(
            String(existingField.label ?? ""),
          ) ===
          normalizeQuestionnaireSignatureFieldLabel(String(field.label ?? "")),
      );
      if (!match) return false;
      return (
        Math.abs(Number(match.x) - Number(field.x)) < 0.05 &&
        Math.abs(Number(match.y) - Number(field.y)) < 0.05 &&
        Math.abs(Number(match.width) - Number(field.width)) < 0.05 &&
        Math.abs(Number(match.height) - Number(field.height)) < 0.05
      );
    });

  if (questionnaireFieldsMatch) return;

  await patchSignFlowDocument(documentId, {
    fields: [...otherFields, ...normalizedPreset],
  });
}

/** Remove questionnaire signature fields when the sponsor did not include questionnaire. */
async function stripQuestionnaireSignatureFieldsIfDisabled(
  documentId: string,
  includeQuestionnaire: boolean,
): Promise<void> {
  if (includeQuestionnaire) return;

  const doc = await getSignFlowDocument(documentId);
  const existing = doc.fields ?? [];
  const filtered = existing.filter((field) => {
    const page = Math.max(1, Math.floor(Number(field.page) || 1));
    if (page !== 1) return true;
    return !isQuestionnaireSignatureFieldLabel(String(field.label ?? ""));
  });

  if (filtered.length === existing.length) return;

  await patchSignFlowDocument(documentId, {
    fields: normalizeSignFlowFieldRecipientIds(doc, filtered),
  });
}

/** Auto-place investor + sponsor fields on each PDF page via Python service. */
function signFlowFieldsPlacementChanged(
  before: SignFlowField[],
  after: SignFlowField[],
): boolean {
  if (before.length !== after.length) return true;
  const norm = (fields: SignFlowField[]) =>
    fields
      .map((field) => ({
        label: String(field.label ?? "").trim().toLowerCase(),
        page: Math.max(1, Math.floor(Number(field.page) || 1)),
        x: Math.round(Number(field.x) * 10) / 10,
        y: Math.round(Number(field.y) * 10) / 10,
        w: Math.round(Number(field.width) * 10) / 10,
        h: Math.round(Number(field.height) * 10) / 10,
        recipientId: String(field.recipientId ?? "").trim(),
      }))
      .sort((a, b) =>
        `${a.page}|${a.label}|${a.x}|${a.y}`.localeCompare(
          `${b.page}|${b.label}|${b.x}|${b.y}`,
        ),
      );

  return JSON.stringify(norm(before)) !== JSON.stringify(norm(after));
}

async function ensureAutoPlacedOnboardingFields(
  documentId: string,
  pageCount: number,
  pdfBuffer: Buffer,
  includeQuestionnaire: boolean,
  includesW9Appendix: boolean,
): Promise<void> {
  const doc = await getSignFlowDocument(documentId);
  const w9PageCount = includesW9Appendix ? await getEsignW9PageCount() : 0;
  const autoPlaced = await fetchAutoPlacedOnboardingFields({
    pageCount,
    pdfBuffer,
    includeQuestionnaire,
    includesW9Appendix,
    w9PageCount,
    investorRecipientId: resolveSignFlowInvestorRecipientId(doc),
    sponsorRecipientId: resolveSignFlowSponsorRecipientId(doc),
  });

  const existing = doc.fields ?? [];
  const w9StartPage =
    includesW9Appendix && w9PageCount > 0
      ? Math.max(1, pageCount - w9PageCount + 1)
      : null;

  const withoutW9OrStale = existing.filter((field) => {
    const page = Math.max(1, Math.floor(Number(field.page) || 1));
    if (w9StartPage != null && page >= w9StartPage) return false;
    return true;
  });

  const merged = replaceAutoPlacedSubscriptionFields(withoutW9OrStale, autoPlaced);
  const normalizedMerged = normalizeSignFlowFieldRecipientIds(
    doc,
    merged,
  ) as SignFlowField[];
  const normalizedExisting = normalizeSignFlowFieldRecipientIds(
    doc,
    existing as SignFlowField[],
  ) as SignFlowField[];

  if (!signFlowFieldsPlacementChanged(normalizedExisting, normalizedMerged)) {
    return;
  }

  if (!autoPlaced.length && isOnboardingFieldsServiceConfigured()) {
    console.warn(
      "[esign] Python field placement returned no fields — removed stale auto-placed subscription fields",
    );
  }

  await patchSignFlowDocument(documentId, {
    fields: normalizedMerged,
  });
}

export async function startDealEsignSignflowTemplateDraft(params: {
  dealId: string;
  fileId: string;
  title?: string;
}): Promise<{
  file: EsignTemplateFileRecord;
  editUrl: string;
  templateId: string;
  expiresAt: number;
  provider: "signflow";
  embedApiKey: string | null;
  appBaseUrl: string;
  testMode: boolean;
}> {
  const publicCfg = getSignFlowPublicConfig();
  if (!publicCfg.configured || !publicCfg.appBaseUrl) {
    throw new Error(
      "SignFlow is not configured. Set SIGNFLOW_API_BASE_URL and SIGNFLOW_API_KEY in backend/.env",
    );
  }

  const state = await getDealEsignTemplatesState(params.dealId);
  const file = findEsignTemplateFile(state, params.fileId);
  if (!file) throw new Error("eSign template file not found");
  if (!isPdfEsignFile(file)) {
    throw new Error(
      "Only PDF documents can be configured for eSign. Convert Word files to PDF before uploading.",
    );
  }

  const title =
    params.title?.trim() ||
    file.templateName?.trim() ||
    file.signflowTitle?.trim() ||
    file.dropboxSignTitle?.trim() ||
    file.originalName.replace(/\.pdf$/i, "") ||
    "Deal eSign template";

  const existingDocId = file.signflowDocumentId?.trim() ?? "";
  const canResumeExisting =
    existingDocId &&
    (file.signflowStatus === "draft" || file.signflowStatus === "ready");

  await ensureEsignTemplatePdfPrepared(params.dealId, file, state);
  const fileBuffer = await readEsignTemplatePdfBuffer(file.relativePath);
  const pdfPageCount = await countSignFlowPdfPages(fileBuffer);

  if (canResumeExisting) {
    await ensureSignFlowEmbedRecipients(existingDocId);
    await stripQuestionnaireSignatureFieldsIfDisabled(
      existingDocId,
      Boolean(file.includeQuestionnaire),
    );
    // After the first seed, trust the live SignFlow document. Re-running
    // auto-place / questionnaire presets would bring deleted fields back.
    if (shouldSkipTemplateFieldSeeding(file)) {
      await ensureSignFlowTemplateFieldsFromRecord(existingDocId, file);
    } else {
      const resumeDoc = await getSignFlowDocument(existingDocId);
      if ((resumeDoc.fields?.length ?? 0) > 0) {
        // Already placed (including legacy drafts before signflowFieldsSeededAt).
        await markSignFlowFieldsSeeded(params.dealId, state, file);
      } else {
        await ensureSignFlowQuestionnaireSignatureFields(
          existingDocId,
          Boolean(file.includeQuestionnaire),
        );
        const resumePageCount = Math.max(
          1,
          Number(resumeDoc.pages) || pdfPageCount,
        );
        await ensureAutoPlacedOnboardingFields(
          existingDocId,
          resumePageCount,
          fileBuffer,
          Boolean(file.includeQuestionnaire),
          Boolean(file.includesW9Appendix),
        );
        await markSignFlowFieldsSeeded(params.dealId, state, file);
      }
    }
    await applyTemplateSigningWorkflowToSignFlowDoc(file, existingDocId);
    return {
      file,
      editUrl: buildSignFlowEditorUrl(existingDocId),
      templateId: existingDocId,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      provider: "signflow",
      embedApiKey: publicCfg.embedApiKey,
      appBaseUrl: publicCfg.appBaseUrl,
      testMode: publicCfg.testMode,
    };
  }

  let documentId = existingDocId;
  if (documentId) {
    try {
      const existing = await getSignFlowDocument(documentId);
      if (!existing.fileUrl?.trim()) {
        documentId = "";
        delete file.signflowDocumentId;
        delete file.signflowStatus;
      } else {
        const storedPages = Math.max(1, Number(existing.pages) || 1);
        if (pdfPageCount > storedPages) {
          await patchSignFlowDocument(documentId, { pages: pdfPageCount });
        }
      }
    } catch {
      documentId = "";
      delete file.signflowDocumentId;
      delete file.signflowStatus;
    }
  }

  if (!documentId) {
    const draft = await createSignFlowDraftFromPdf({
      title,
      pdfBuffer: fileBuffer,
      fileName: file.originalName,
      pages: pdfPageCount,
    });
    documentId = draft.documentId;
    file.signflowDocumentId = documentId;
    file.signflowStatus = "draft";
    file.signflowTitle = title;
    file.esignProvider = "signflow";
    await persistEsignTemplatesJson(params.dealId, state);
  }

  await ensureSignFlowEmbedRecipients(documentId);
  await stripQuestionnaireSignatureFieldsIfDisabled(
    documentId,
    Boolean(file.includeQuestionnaire),
  );
  await ensureSignFlowQuestionnaireSignatureFields(
    documentId,
    Boolean(file.includeQuestionnaire),
  );
  await ensureAutoPlacedOnboardingFields(
    documentId,
    pdfPageCount,
    fileBuffer,
    Boolean(file.includeQuestionnaire),
    Boolean(file.includesW9Appendix),
  );
  await markSignFlowFieldsSeeded(params.dealId, state, file);
  await applyTemplateSigningWorkflowToSignFlowDoc(file, documentId);

  return {
    file,
    editUrl: buildSignFlowEditorUrl(documentId),
    templateId: documentId,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    provider: "signflow",
    embedApiKey: publicCfg.embedApiKey,
    appBaseUrl: publicCfg.appBaseUrl,
    testMode: publicCfg.testMode,
  };
}

export async function completeDealEsignSignflowTemplate(params: {
  dealId: string;
  fileId: string;
  signflowDocumentId: string;
  title?: string;
}): Promise<EsignTemplateFileRecord> {
  const state = await getDealEsignTemplatesState(params.dealId);
  const file = findEsignTemplateFile(state, params.fileId);
  if (!file) throw new Error("eSign template file not found");

  const documentId = params.signflowDocumentId.trim();
  if (!documentId) throw new Error("signflowDocumentId is required");

  const doc = await getSignFlowDocument(documentId);
  const hasFields = (doc.fields?.length ?? 0) > 0;
  if (!hasFields) {
    throw new Error(
      "Add at least one signature field in the SignFlow editor before saving this template.",
    );
  }

  file.signflowDocumentId = documentId;
  file.signflowStatus = "ready";
  file.signflowSavedAt = new Date().toISOString();
  file.esignProvider = "signflow";
  const captured = await captureSignFlowTemplateFieldsForStorage(
    params.dealId,
    file,
    doc,
  );
  const withBindings = applySignflowInvestorDataFieldBindings(
    captured,
    file.signflowInvestorDataFieldBindings,
  );
  file.signflowTemplateFields = withBindings;
  file.signflowInvestorDataFieldBindings = withBindings
    .filter((field) => Boolean(field.dataKey?.trim()))
    .map((field) => ({
      dataKey: String(field.dataKey).trim(),
      esignLabel: String(field.label ?? "").trim() || "Field",
      profileTypes: (field.profileTypes?.length
        ? field.profileTypes
        : ALL_SIGNFLOW_PROFILE_TYPES) as string[],
      page: Math.max(1, Math.floor(Number(field.templatePage ?? field.page) || 1)),
      x: Number(field.x) || 0,
      y: Number(field.y) || 0,
    }));
  if (params.title?.trim()) file.signflowTitle = params.title.trim();

  const inferred = inferSigningWorkflowFromSignFlowDocument(doc);
  if (inferred.workflowType) {
    file.signflowWorkflowType = inferred.workflowType;
  }
  if (inferred.signingOrder) {
    file.signflowSigningOrder = inferred.signingOrder;
  }

  await persistEsignTemplatesJson(params.dealId, state);
  return file;
}

function resolveRequestedSignFlowProfileTypes(
  profileIds: string[] | undefined,
): SignFlowProfileType[] {
  const unique = new Set<SignFlowProfileType>();
  for (const raw of profileIds ?? []) {
    const mapped = portalProfileIdToSignFlowProfileType(raw);
    if (mapped) unique.add(mapped);
  }
  // No selection (or all cleared upstream) → field applies to every profile.
  if (unique.size === 0) return [...ALL_SIGNFLOW_PROFILE_TYPES];
  return [...unique];
}

function placementKey(page: number, x: number, y: number, label: string): string {
  return [
    Math.max(1, Math.floor(page) || 1),
    Math.round(Number(x) * 10) / 10,
    Math.round(Number(y) * 10) / 10,
    String(label ?? "").trim().toLowerCase(),
  ].join("|");
}

function bindingMatchesField(
  binding: SignflowInvestorDataFieldBinding,
  field: SignFlowField,
): boolean {
  return (
    placementKey(binding.page, binding.x, binding.y, binding.esignLabel) ===
    placementKey(
      Number(field.templatePage ?? field.page) || 1,
      Number(field.x) || 0,
      Number(field.y) || 0,
      String(field.label ?? ""),
    )
  );
}

/** Re-apply SynX bindings so profile scope + dataKey survive SignFlow embed saves. */
export function applySignflowInvestorDataFieldBindings(
  fields: SignFlowField[],
  bindings: SignflowInvestorDataFieldBinding[] | undefined,
): SignFlowField[] {
  return fields.map((field) => {
    const match =
      bindings?.find((binding) => bindingMatchesField(binding, field)) ??
      bindings?.find((binding) => {
        const fieldDataKey =
          field.dataKey?.trim() ||
          ESIGN_LABEL_TO_PROFILE_KEY[
            normalizeEsignFieldLabel(String(field.label ?? ""))
          ];
        if (fieldDataKey && binding.dataKey === fieldDataKey) return true;
        return (
          binding.esignLabel.trim().toLowerCase() ===
          String(field.label ?? "").trim().toLowerCase()
        );
      });

    const dataKey =
      field.dataKey?.trim() ||
      match?.dataKey?.trim() ||
      ESIGN_LABEL_TO_PROFILE_KEY[
        normalizeEsignFieldLabel(String(field.label ?? ""))
      ] ||
      undefined;

    const profileTypes =
      field.profileTypes?.length
        ? field.profileTypes
        : match?.profileTypes?.length
          ? (match.profileTypes as SignFlowProfileType[])
          : undefined;

    return {
      ...field,
      ...(dataKey ? { dataKey } : {}),
      ...(profileTypes?.length ? { profileTypes } : {}),
      // Catalog fields must stay required so investors see them in the field count.
      ...(dataKey ? { required: true } : {}),
    };
  });
}

/**
 * Append an investor data text/date field to the SignFlow draft so the sponsor
 * can place auto-fill fields while configuring the template.
 */
export async function addDealEsignSignflowInvestorDataField(params: {
  dealId: string;
  fileId: string;
  fieldKey: string;
  /** Portal profile ids (individual, joint_tenancy, …). Empty = all profiles. */
  profileIds?: string[];
}): Promise<{
  field: SignFlowField;
  fieldCount: number;
  esignLabel: string;
  label: string;
}> {
  const state = await getDealEsignTemplatesState(params.dealId);
  const file = findEsignTemplateFile(state, params.fileId);
  if (!file) throw new Error("eSign template file not found");

  const documentId = file.signflowDocumentId?.trim();
  if (!documentId) {
    throw new Error("Open the SignFlow template editor before adding fields");
  }

  const catalog = getEsignInvestorDataField(params.fieldKey);
  if (!catalog) {
    throw new Error("Unknown investor data field");
  }

  const requestedTypes = resolveRequestedSignFlowProfileTypes(params.profileIds);
  if ((params.profileIds?.length ?? 0) > 0) {
    const mappedOnly = new Set<SignFlowProfileType>();
    for (const raw of params.profileIds ?? []) {
      const mapped = portalProfileIdToSignFlowProfileType(raw);
      if (mapped) mappedOnly.add(mapped);
    }
    if (mappedOnly.size === 0) {
      throw new Error("Select at least one valid investor profile");
    }
  }
  const profileTypes = requestedTypes;

  const doc = await getSignFlowDocument(documentId);
  const existing = (doc.fields ?? []) as SignFlowField[];
  const investorRecipientId = resolveSignFlowInvestorRecipientId(doc);
  const sponsorRecipientId = resolveSignFlowSponsorRecipientId(doc);

  let maxY = 18;
  for (const field of existing) {
    const page = Math.max(1, Math.floor(Number(field.page) || 1));
    if (page !== 1) continue;
    const y = Number(field.y) || 0;
    const h = Number(field.height) || 0;
    maxY = Math.max(maxY, y + h);
  }

  const textSize = esignDocumentAlignedTextFieldSize(
    catalog.signFlowType === "date" ? "date" : "text",
  );
  const nextField: SignFlowField = {
    type: catalog.signFlowType,
    label: catalog.esignLabel,
    x: 12,
    y: Math.min(88, maxY + 3),
    width: textSize.width,
    height: textSize.height,
    page: 1,
    recipientId: investorRecipientId,
    // Required so SignFlow includes the field in the investor's remaining-field count.
    required: true,
    dataKey: catalog.key,
    profileTypes,
  };

  const toAppend: SignFlowField[] = [nextField];

  /** SignFlow embed keeps Save disabled until both parties have at least one field. */
  const hasSponsorField = existing.some((field) => {
    const rid = String(field.recipientId ?? "").trim();
    return rid === sponsorRecipientId || rid === "rec_sponsor" || rid === "rec_2";
  });
  if (!hasSponsorField) {
    toAppend.push({
      type: "signature",
      label: "Sponsor Signature",
      x: 55,
      y: Math.min(90, maxY + 10),
      width: 36,
      height: 8,
      page: 1,
      recipientId: sponsorRecipientId,
      required: true,
    });
  }

  const merged = normalizeSignFlowFieldRecipientIds(doc, [
    ...existing,
    ...toAppend,
  ]) as SignFlowField[];

  await patchSignFlowDocument(documentId, { fields: merged });

  const binding: SignflowInvestorDataFieldBinding = {
    dataKey: catalog.key,
    esignLabel: catalog.esignLabel,
    profileTypes,
    page: nextField.page,
    x: nextField.x,
    y: nextField.y,
  };
  file.signflowInvestorDataFieldBindings = [
    ...(file.signflowInvestorDataFieldBindings ?? []),
    binding,
  ];
  // Keep the saved snapshot in sync so investors see new fields even before
  // the sponsor clicks Save template again.
  file.signflowTemplateFields = applySignflowInvestorDataFieldBindings(
    merged.map((field) => ({
      ...field,
      templatePage: Math.max(
        1,
        Math.floor(Number(field.templatePage ?? field.page) || 1),
      ),
    })),
    file.signflowInvestorDataFieldBindings,
  );
  await persistEsignTemplatesJson(params.dealId, state);

  return {
    field: nextField,
    fieldCount: merged.length,
    esignLabel: nextField.label,
    label: catalog.label,
  };
}
