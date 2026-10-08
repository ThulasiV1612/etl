import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { getUploadsPhysicalRoot } from "../../config/uploadPaths.js";
import {
  DEAL_ASSETS_UPLOAD_SUBDIR,
  dealAssetsRelativePath,
  resolveDealStorageFolderName,
} from "./dealStoragePaths.service.js";
import { db } from "../../database/db.js";
import {
  addDealForm,
  type AddDealFormInsert,
  type AddDealFormRow,
} from "../../schema/deal.schema/add-deal-form.schema.js";
import { companies } from "../../schema/schema.js";
import { sanitizeInvestorSummaryHtml } from "../../utils/sanitizeInvestorSummaryHtml.js";
import { sanitizeFundingInstructionsJson } from "../../utils/sanitizeFundingInstructionsJson.js";
import { syncFundingInstructionsPdfToDocumentsTab } from "./dealFundingDocumentsWorkspaceSync.service.js";
import { sanitizeKeyHighlightsJson } from "../../utils/sanitizeKeyHighlightsJson.js";
import { encryptOfferingPreviewDealId } from "../../utils/offeringPreviewCrypto.js";
import {
  isDealStatus,
  isDealStageDraft,
  normalizeDealStageCanonical,
  normalizeDealStatus,
  offeringStatusRequiresInvestorClass,
  resolveOfferingStatusForStageChange,
  validateDealStageAndStatus,
  validateOfferingStatusChange,
} from "../../constants/deal-lifecycle/index.js";
import {
  dealEsignTemplatesFullyConfigured,
  formatIncompleteEsignTemplateNames,
  getDealEsignTemplatesState,
  listIncompleteEsignTemplates,
} from "./dealEsignTemplates.service.js";
import { listDealIdsAssignedToUser } from "./assigningDealUser.service.js";
import { listInvestorClassesByDealId } from "./dealInvestorClass.service.js";
import {
  isCloudinaryConfigured,
  isCloudinaryDeliveryUrl,
  uploadDealImageToCloudinary,
} from "../company/cloudinaryCompanyBranding.service.js";
import {
  cancelDealSaasBillingBeforeDelete,
  scheduleDealSaasBillingSync,
} from "../billing/dealBilling.service.js";
import { resolveDealStageForSaasPaymentHold } from "../billing/dealStageSaasPaymentHold.js";

const UPLOAD_SUBDIR = DEAL_ASSETS_UPLOAD_SUBDIR;

/** Autosave placeholders — multiple in-progress drafts may share these titles. */
const DEAL_NAME_UNIQUENESS_EXEMPT = new Set(["untitled deal", "pending"]);

function isDealNameUniquenessExempt(dealName: string): boolean {
  return DEAL_NAME_UNIQUENESS_EXEMPT.has(dealName.trim().toLowerCase());
}

function throwDealFormValidation(fieldErrors: DealFormFieldErrors): never {
  const err = new Error("VALIDATION") as Error & {
    fieldErrors: DealFormFieldErrors;
  };
  err.fieldErrors = fieldErrors;
  throw err;
}

async function assertDealNameUnique(params: {
  dealName: string;
  organizationId: string | null;
  excludeDealId?: string;
}): Promise<void> {
  if (isDealNameUniquenessExempt(params.dealName)) return;
  const norm = params.dealName.trim().toLowerCase();
  const conditions = [sql`lower(trim(${addDealForm.dealName})) = ${norm}`];
  if (params.organizationId) {
    conditions.push(eq(addDealForm.organizationId, params.organizationId));
  }
  if (params.excludeDealId) {
    conditions.push(ne(addDealForm.id, params.excludeDealId));
  }
  const [dup] = await db
    .select({ id: addDealForm.id })
    .from(addDealForm)
    .where(and(...conditions))
    .limit(1);
  if (dup) {
    throwDealFormValidation({
      deal_name: "A deal with this name already exists.",
    });
  }
}

function normalizeAssetImagePathSegment(p: string): string {
  return p.trim().replace(/^\/+/, "");
}

/** Dedupe by normalized segment; keep first occurrence’s trimmed string. */
function dedupeAssetImagePathSegmentsPreserveOrder(
  segments: readonly string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of segments) {
    const t = normalizeAssetImagePathSegment(raw);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(raw.trim());
  }
  return out;
}

export type DealFormFieldErrors = Partial<
  Record<
    | "deal_name"
    | "deal_stage"
    | "sec_type"
    | "owning_entity_name"
    | "property_name"
    | "zip_code"
    | "funds_required_before_gp_sign"
    | "auto_send_funding_instructions",
    string
  >
>;

export type CreateDealFormInput = {
  dealName: string;
  dealType: string;
  dealStage: string;
  secType: string;
  closeDate: string | null;
  owningEntityName: string;
  fundsRequiredBeforeGpSign: boolean | undefined;
  autoSendFundingInstructions: boolean | undefined;
  propertyName: string;
  country: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
};

/**
 * Deal stage aliases across old/new UI + DB constraint variants.
 * Normalizes incoming values to a stable DB-safe value.
 */
/** Digits only, max 5 (US-style ZIP / PIN). */
function normalizeDealZipCode(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 5);
}

function normalizeDealStage(input: string): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase();
  switch (key) {
    case "draft":
      return "draft";
    case "capital_raising":
    case "raising_capital":
      return "raising_capital";
    case "managing_asset":
    case "asset_managing":
      return "asset_managing";
    case "liquidated":
      return "liquidated";
    default:
      return raw;
  }
}

/** Candidate stage values to satisfy either old or new DB CHECK variants. */
function dealStageCandidates(input: string): string[] {
  const raw = String(input ?? "").trim();
  if (!raw) return [""];
  const key = raw.toLowerCase();
  switch (key) {
    case "draft":
      return ["draft", "Draft"];
    case "capital_raising":
    case "raising_capital":
      return ["raising_capital", "capital_raising"];
    case "managing_asset":
    case "asset_managing":
      return ["asset_managing", "managing_asset"];
    case "liquidated":
      return ["liquidated"];
    default:
      return [normalizeDealStage(raw), raw];
  }
}

function isDealStageCheckError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    code?: string;
    constraint?: string;
    message?: string;
    cause?: unknown;
  };
  const directMatch =
    e.code === "23514" &&
    e.constraint === "add_deal_form_deal_stage_check";
  if (directMatch) return true;

  const msg = String(e.message ?? "");
  if (
    msg.includes("add_deal_form_deal_stage_check") ||
    msg.includes('relation "add_deal_form" violates check constraint')
  ) {
    return true;
  }

  if (e.cause && typeof e.cause === "object") {
    const c = e.cause as {
      code?: string;
      constraint?: string;
      message?: string;
      cause?: unknown;
    };
    if (
      (c.code === "23514" &&
        c.constraint === "add_deal_form_deal_stage_check") ||
      String(c.message ?? "").includes("add_deal_form_deal_stage_check")
    ) {
      return true;
    }
    if (c.cause) return isDealStageCheckError(c.cause);
  }
  return false;
}

function validateCreateInput(
  input: CreateDealFormInput,
): DealFormFieldErrors | null {
  const errors: DealFormFieldErrors = {};
  if (!input.dealName.trim()) errors.deal_name = "Deal name is required.";
  if (!input.dealStage.trim())
    errors.deal_stage = "Deal stage is required.";
  if (!input.secType.trim()) errors.sec_type = "SEC type is required.";
  if (!input.owningEntityName.trim())
    errors.owning_entity_name = "Owning entity name is required.";
  if (!input.propertyName.trim())
    errors.property_name = "Property name is required.";
  const zip = normalizeDealZipCode(input.zipCode);
  if (zip.length > 0 && zip.length !== 5) {
    errors.zip_code = "ZIP / PIN must be exactly 5 digits.";
  }
  if (typeof input.fundsRequiredBeforeGpSign !== "boolean") {
    errors.funds_required_before_gp_sign =
      "Funds required before GP sign must be yes or no.";
  }
  if (typeof input.autoSendFundingInstructions !== "boolean") {
    errors.auto_send_funding_instructions =
      "Auto send funding instructions must be yes or no.";
  }
  return Object.keys(errors).length ? errors : null;
}

const MAX_ORIGINAL_STEM_LEN = 80;

/** Safe stem from uploaded filename (no path, no extension). */
function sanitizeOriginalStem(originalName: string): string {
  const base = path.basename(originalName || "file");
  const stem = path.basename(base, path.extname(base));
  const cleaned = stem
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_ORIGINAL_STEM_LEN);
  return cleaned.length ? cleaned : "file";
}

function safeExtension(originalName: string): string {
  const ext = path.extname(path.basename(originalName || "")).toLowerCase();
  if (!ext || !/^\.[a-z0-9]{1,12}$/.test(ext)) return "";
  return ext;
}

/**
 * Stored filename: sanitized original name + UUID + Unix ms time + extension.
 * Example: `property-front_7c9e2b1a-...._1738123456789.jpg`
 */
export function buildStoredAssetName(
  originalName: string,
  timestampMs: number,
  fileId: string,
): string {
  const stem = sanitizeOriginalStem(originalName);
  const ext = safeExtension(originalName);
  return `${stem}_${fileId}_${timestampMs}${ext}`;
}

/** Memory-upload file shape from `multer.memoryStorage()` (no dependency on @types/multer). */
export interface DealMemoryUploadFile {
  buffer: Buffer;
  originalname: string;
}

export async function saveDealAssetFiles(params: {
  files: DealMemoryUploadFile[];
  /** Optional deal id — files stored under `deal-assets/<dealName-dealId>/`. */
  dealId?: string;
  /** Gallery / asset images: upload to Cloudinary when configured; otherwise disk. */
  useCloudinaryForImages?: boolean;
}): Promise<string[]> {
  if (!params.files.length) return [];
  const useCloud =
    Boolean(params.useCloudinaryForImages) && isCloudinaryConfigured();
  if (useCloud) {
    const stored: string[] = [];
    for (const file of params.files) {
      const stem = sanitizeOriginalStem(file.originalname);
      const { secureUrl } = await uploadDealImageToCloudinary({
        dealId: params.dealId,
        buffer: file.buffer,
        labelStem: stem,
      });
      stored.push(secureUrl);
    }
    return stored;
  }
  const dealId = params.dealId?.trim() ?? "";
  const dealFolder = dealId ? await resolveDealStorageFolderName(dealId) : "";
  const uploadRoot = dealFolder
    ? path.join(getUploadsPhysicalRoot(), dealAssetsRelativePath(dealFolder))
    : path.join(getUploadsPhysicalRoot(), UPLOAD_SUBDIR);
  await mkdir(uploadRoot, { recursive: true });
  const relativePaths: string[] = [];
  const ts = Date.now();
  for (let i = 0; i < params.files.length; i += 1) {
    const file = params.files[i]!;
    const name = buildStoredAssetName(
      file.originalname,
      ts + i,
      randomUUID(),
    );
    const abs = path.join(uploadRoot, name);
    await writeFile(abs, file.buffer);
    relativePaths.push(
      dealFolder
        ? dealAssetsRelativePath(dealFolder, name)
        : `${UPLOAD_SUBDIR}/${name}`,
    );
  }
  return relativePaths;
}

export async function insertAddDealForm(
  input: CreateDealFormInput,
  assetRelativePaths: string[],
  organizationId?: string | null,
): Promise<AddDealFormRow> {
  const normalizedInput: CreateDealFormInput = {
    ...input,
    dealStage: normalizeDealStage(input.dealStage),
    zipCode: normalizeDealZipCode(input.zipCode),
  };
  const validationErrors = validateCreateInput(normalizedInput);
  if (validationErrors) throwDealFormValidation(validationErrors);

  await assertDealNameUnique({
    dealName: normalizedInput.dealName,
    organizationId: organizationId ?? null,
  });

  const baseRow: Omit<AddDealFormInsert, "dealStage"> = {
    organizationId: organizationId ?? null,
    dealName: normalizedInput.dealName.trim(),
    dealType: normalizedInput.dealType.trim(),
    secType: normalizedInput.secType.trim(),
    closeDate: normalizedInput.closeDate?.trim() || null,
    owningEntityName: normalizedInput.owningEntityName.trim(),
    fundsRequiredBeforeGpSign: normalizedInput.fundsRequiredBeforeGpSign!,
    autoSendFundingInstructions: normalizedInput.autoSendFundingInstructions!,
    propertyName: normalizedInput.propertyName.trim(),
    country: normalizedInput.country.trim(),
    addressLine1: normalizedInput.addressLine1.trim() || null,
    addressLine2: normalizedInput.addressLine2.trim() || null,
    city: normalizedInput.city.trim(),
    state: normalizedInput.state.trim() || null,
    zipCode: normalizedInput.zipCode || null,
    assetImagePath: assetRelativePaths.length
      ? assetRelativePaths.join(";")
      : null,
    offeringGalleryPaths: mergeOfferingGalleryPathsIntoStored(
      "[]",
      assetRelativePaths,
    ),
  };
  const stageHold = resolveDealStageForSaasPaymentHold({
    requestedStage: normalizedInput.dealStage,
  });
  const initialStageCanon = normalizeDealStageCanonical(stageHold.persistStage);
  const initialOfferingStatus =
    initialStageCanon != null
      ? resolveOfferingStatusForStageChange({
          nextStage: initialStageCanon,
          currentStatus: "draft_hidden",
        })
      : "draft_hidden";

  const candidates = dealStageCandidates(stageHold.persistStage);
  let lastErr: unknown = null;
  for (const stage of candidates) {
    try {
      const row: AddDealFormInsert = {
        ...baseRow,
        dealStage: stage,
        offeringStatus: initialOfferingStatus,
        pendingDealStage: stageHold.pendingDealStage,
      };
      const [created] = await db.insert(addDealForm).values(row).returning();
      if (!created) throw new Error("Insert failed");
      const token = encryptOfferingPreviewDealId(String(created.id));
      const [withPreview] = await db
        .update(addDealForm)
        .set({ offeringPreviewToken: token })
        .where(eq(addDealForm.id, created.id))
        .returning();
      const saved = withPreview ?? created;
      scheduleDealSaasBillingSync(String(saved.id));
      return saved;
    } catch (err) {
      lastErr = err;
      if (!isDealStageCheckError(err) || stage === candidates[candidates.length - 1]) {
        throw err;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Insert failed");
}

export async function listAddDealForms(): Promise<AddDealFormRow[]> {
  return db.select().from(addDealForm).orderBy(desc(addDealForm.createdAt));
}

/**
 * Who may list deals: `seesAllDeals` → every row; else → deals for the viewer’s
 * company (`organization_id` + legacy owning-entity name — `listAddDealFormsByOrganizationId`).
 */
export type DealViewerScope = {
  /** JWT subject — used for participant (assigned investor) access. */
  userId: string;
  organizationId: string | null;
  isPlatformAdmin: boolean;
  /** Syndication list/detail: all deals (platform admin, or platform_user with no org). */
  seesAllDeals: boolean;
  /** Invited deal members (`deal_participant`): only roster-linked deals. */
  assignedParticipationOnly: boolean;
  /**
   * When set, user may only see deals tied to sponsor(s) who invited or added them
   * (full sponsor roster — not organization-wide). Platform/company admins excluded upstream.
   */
  lpInvestorEmailScopedDealIds: string[] | null;
  /**
   * Syndication dashboard + GET /deals: when set, only these deals (viewer is Co-sponsor
   * on roster and has no other `deal_member` roles). Company/platform admins excluded upstream.
   */
  coSponsorDashboardDealIds: string[] | null;
  /**
   * Investing Mode (and LP-email-scoped viewers): apply CRM Contacts Visibility
   * (`show_offerings_visibility`) even for Lead / Admin / Co / company roles.
   * Syndicating workspace lists skip this so sponsors still see every org deal.
   */
  enforceContactOfferingVisibility: boolean;
};

export async function listAddDealFormsForViewer(
  scope: DealViewerScope,
): Promise<AddDealFormRow[]> {
  if (scope.lpInvestorEmailScopedDealIds != null) {
    return listAddDealFormsByIds(scope.lpInvestorEmailScopedDealIds);
  }
  if (scope.coSponsorDashboardDealIds?.length) {
    return listAddDealFormsByIds(scope.coSponsorDashboardDealIds);
  }
  if (scope.assignedParticipationOnly) {
    const ids = await listDealIdsAssignedToUser(scope.userId);
    if (ids.length === 0) return [];
    return listAddDealFormsByIds(ids);
  }
  if (scope.seesAllDeals) {
    return db.select().from(addDealForm).orderBy(desc(addDealForm.createdAt));
  }
  if (!scope.organizationId) {
    return [];
  }
  return listAddDealFormsByOrganizationId(scope.organizationId);
}

/** Load deal rows by primary key (e.g. deals linked via `assigning_deal_user`). */
export async function listAddDealFormsByIds(
  ids: string[],
): Promise<AddDealFormRow[]> {
  const unique = [...new Set(ids.map((id) => String(id ?? "").trim()))].filter(
    Boolean,
  );
  if (unique.length === 0) return [];
  return db
    .select()
    .from(addDealForm)
    .where(inArray(addDealForm.id, unique));
}

export async function listAddDealFormsByOrganizationId(
  organizationId: string,
): Promise<AddDealFormRow[]> {
  const [company] = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, organizationId))
    .limit(1);
  const nameKey = company?.name?.trim().toLowerCase() ?? "";

  if (!nameKey) {
    return db
      .select()
      .from(addDealForm)
      .where(eq(addDealForm.organizationId, organizationId))
      .orderBy(desc(addDealForm.createdAt));
  }

  return db
    .select()
    .from(addDealForm)
    .where(
      or(
        eq(addDealForm.organizationId, organizationId),
        and(
          isNull(addDealForm.organizationId),
          sql`lower(trim(${addDealForm.owningEntityName})) = ${nameKey}`,
        ),
      ),
    )
    .orderBy(desc(addDealForm.createdAt));
}

/** True if the deal row is visible under that company (FK or legacy name match). */
export async function isAddDealFormInOrganizationScope(
  row: AddDealFormRow,
  organizationId: string,
): Promise<boolean> {
  if (row.organizationId === organizationId) return true;
  if (row.organizationId != null) return false;
  const [company] = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, organizationId))
    .limit(1);
  const cn = company?.name?.trim().toLowerCase() ?? "";
  if (!cn) return false;
  const on = row.owningEntityName?.trim().toLowerCase() ?? "";
  return on === cn;
}

export async function getAddDealFormById(
  id: string,
): Promise<AddDealFormRow | undefined> {
  const rows = await db
    .select()
    .from(addDealForm)
    .where(eq(addDealForm.id, id))
    .limit(1);
  return rows[0];
}

/** Persists preview token when missing (legacy deals). Idempotent. */
export async function ensureDealOfferingPreviewTokenStored(
  dealId: string,
): Promise<AddDealFormRow | undefined> {
  const trimmed = String(dealId ?? "").trim();
  if (!trimmed) return undefined;
  const row = await getAddDealFormById(trimmed);
  if (!row) return undefined;
  if (row.offeringPreviewToken?.trim()) return row;
  const token = encryptOfferingPreviewDealId(trimmed);
  const [updated] = await db
    .update(addDealForm)
    .set({ offeringPreviewToken: token })
    .where(eq(addDealForm.id, trimmed))
    .returning();
  return updated;
}

/** Deletes the deal row; child tables use `onDelete: "cascade"` where applicable. */
export async function deleteAddDealFormById(id: string): Promise<boolean> {
  const trimmed = String(id ?? "").trim();
  if (!trimmed) return false;
  await cancelDealSaasBillingBeforeDelete(trimmed);
  const removed = await db
    .delete(addDealForm)
    .where(eq(addDealForm.id, trimmed))
    .returning({ id: addDealForm.id });
  return removed.length > 0;
}

export async function updateDealInvestorSummaryById(
  id: string,
  rawHtml: string,
): Promise<AddDealFormRow | undefined> {
  const existing = await getAddDealFormById(id);
  if (!existing) return undefined;
  const cleaned = sanitizeInvestorSummaryHtml(rawHtml);
  const toStore = cleaned.trim() === "" ? null : cleaned;
  const [updated] = await db
    .update(addDealForm)
    .set({ investorSummaryHtml: toStore })
    .where(eq(addDealForm.id, id))
    .returning();
  return updated;
}

export async function updateDealGalleryCoverById(
  id: string,
  galleryCoverImageUrl: string | null,
): Promise<AddDealFormRow | undefined> {
  const existing = await getAddDealFormById(id);
  if (!existing) return undefined;
  const [updated] = await db
    .update(addDealForm)
    .set({ galleryCoverImageUrl })
    .where(eq(addDealForm.id, id))
    .returning();
  return updated;
}

export async function updateDealArchivedById(
  id: string,
  archived: boolean,
): Promise<AddDealFormRow | undefined> {
  const existing = await getAddDealFormById(id);
  if (!existing) return undefined;
  const [updated] = await db
    .update(addDealForm)
    .set({ archived })
    .where(eq(addDealForm.id, id))
    .returning();
  if (updated) scheduleDealSaasBillingSync(String(updated.id));
  return updated;
}

export async function updateDealAnnouncementById(
  id: string,
  title: string | null,
  message: string | null,
): Promise<AddDealFormRow | undefined> {
  const existing = await getAddDealFormById(id);
  if (!existing) return undefined;
  const [updated] = await db
    .update(addDealForm)
    .set({
      dealAnnouncementTitle: title,
      dealAnnouncementMessage: message,
    })
    .where(eq(addDealForm.id, id))
    .returning();
  return updated;
}

export type OfferingOverviewFieldErrors = Partial<
  Record<"offering_status", string>
>;

function throwOfferingOverviewValidation(
  fieldErrors: OfferingOverviewFieldErrors,
): never {
  const err = new Error("VALIDATION") as Error & {
    fieldErrors: OfferingOverviewFieldErrors;
  };
  err.fieldErrors = fieldErrors;
  throw err;
}

async function assertOfferingStatusChangeAllowed(params: {
  dealId: string;
  dealStage: string;
  previousOfferingStatus: string;
  nextOfferingStatus: string;
}): Promise<void> {
  const v = validateOfferingStatusChange(params);
  if (!v.ok) {
    throwOfferingOverviewValidation({ offering_status: v.message });
  }
  const prev = normalizeDealStatus(params.previousOfferingStatus);
  const next = normalizeDealStatus(params.nextOfferingStatus);
  if (next !== "open_investment" || prev === "open_investment") return;

  const esignState = await getDealEsignTemplatesState(params.dealId);
  if (!dealEsignTemplatesFullyConfigured(esignState)) {
    const incomplete = listIncompleteEsignTemplates(esignState);
    const detail =
      incomplete.length > 0
        ? ` Finish setup for: ${formatIncompleteEsignTemplateNames(incomplete)}.`
        : " Upload at least one PDF template and complete field placement in the e-sign editor.";
    throwOfferingOverviewValidation({
      offering_status:
        `E-sign templates are not configured for this deal.${detail} Open the template, place signature fields for the investor profiles you support, and click Save template before enabling Open to Investment.`,
    });
  }
}

const OFFERING_VISIBILITY_WHITELIST = new Set([
  "show_on_dashboard",
  "show_on_deal_investors_dashboard",
  "only_visible_with_link",
]);

/** Accept legacy DB/API values and normalize before validate. */
function canonicalOfferingVisibility(v: string): string {
  const t = String(v ?? "").trim();
  switch (t) {
    case "eligible_investors":
      return "show_on_dashboard";
    case "link_only":
    case "hidden":
      return "only_visible_with_link";
    default:
      return t;
  }
}

const MAX_INTERNAL_NAME_LEN = 500;
const MAX_DEAL_TYPE_LEN = 120;
const MAX_OVERVIEW_ASSET_IDS = 80;
const MAX_OVERVIEW_ASSET_IDS_JSON_LEN = 32000;
const MAX_OFFERING_GALLERY_PATHS = 40;
const MAX_OFFERING_GALLERY_PATH_LEN = 500;
const MAX_OFFERING_GALLERY_JSON_LEN = 32000;

/** Upload-relative disk path or Cloudinary `https://res.cloudinary.com/...` delivery URL. */
function isValidDealImageStoredPath(t: string): boolean {
  if (!t || t.includes("..")) return false;
  if (t.length > MAX_OFFERING_GALLERY_PATH_LEN) return false;
  if (isCloudinaryDeliveryUrl(t)) return true;
  return /^[\w./-]+$/.test(t);
}

/** Parse stored JSON array; invalid → []. */
export function parseStoredOfferingOverviewAssetIds(
  raw: string | null | undefined,
): string[] {
  if (!raw?.trim()) return [];
  try {
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    const out: string[] = [];
    for (const x of p) {
      if (typeof x !== "string") continue;
      const t = x.trim();
      if (!t || t.length > 220) continue;
      if (!/^[a-zA-Z0-9_.-]+$/.test(t)) continue;
      out.push(t);
      if (out.length >= MAX_OVERVIEW_ASSET_IDS) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Parse stored JSON array of upload-relative paths for offering gallery; invalid → []. */
export function parseStoredOfferingGalleryPaths(
  raw: string | null | undefined,
): string[] {
  if (!raw?.trim()) return [];
  try {
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    const out: string[] = [];
    for (const x of p) {
      if (typeof x !== "string") continue;
      const t = x.trim().replace(/^\/+/, "");
      if (!t || !isValidDealImageStoredPath(t)) continue;
      out.push(t);
      if (out.length >= MAX_OFFERING_GALLERY_PATHS) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Append new upload-relative paths to stored gallery JSON; dedupe, preserve order, cap length. */
export function mergeOfferingGalleryPathsIntoStored(
  existingRaw: string | null | undefined,
  append: string[],
): string {
  const cur = parseStoredOfferingGalleryPaths(existingRaw);
  const seen = new Set(cur);
  for (const p of append) {
    const t = p.trim().replace(/^\/+/, "");
    if (!t || seen.has(t)) continue;
    if (!isValidDealImageStoredPath(t)) continue;
    seen.add(t);
    cur.push(t);
    if (cur.length >= MAX_OFFERING_GALLERY_PATHS) break;
  }
  return JSON.stringify(cur);
}

export function normalizeOfferingGalleryPathsFromBody(
  raw: unknown,
): { ok: true; paths: string[] } | { ok: false; message: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, paths: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, message: "offering_gallery_paths must be an array." };
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") {
      return { ok: false, message: "Each gallery path must be a string." };
    }
    const t = x.trim().replace(/^\/+/, "");
    if (!t) {
      return { ok: false, message: "Gallery path cannot be empty." };
    }
    if (seen.has(t)) continue;
    if (!isValidDealImageStoredPath(t)) {
      return { ok: false, message: "Invalid gallery path." };
    }
    seen.add(t);
    out.push(t);
    if (out.length > MAX_OFFERING_GALLERY_PATHS) {
      return { ok: false, message: "Too many gallery images." };
    }
  }
  const json = JSON.stringify(out);
  if (json.length > MAX_OFFERING_GALLERY_JSON_LEN) {
    return { ok: false, message: "Gallery list is too large." };
  }
  return { ok: true, paths: out };
}

export function normalizeOverviewAssetIdsFromBody(
  raw: unknown,
): { ok: true; ids: string[] } | { ok: false; message: string } {
  if (raw === undefined || raw === null) return { ok: true, ids: [] };
  let list: unknown[];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw.trim() || "[]");
      list = Array.isArray(p) ? p : [];
    } catch {
      return { ok: false, message: "offering_overview_asset_ids must be a JSON array." };
    }
  } else {
    return { ok: false, message: "offering_overview_asset_ids must be an array." };
  }
  const out: string[] = [];
  for (const x of list) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (!t || t.length > 220) continue;
    if (!/^[a-zA-Z0-9_.-]+$/.test(t)) continue;
    out.push(t);
    if (out.length >= MAX_OVERVIEW_ASSET_IDS) break;
  }
  const json = JSON.stringify(out);
  if (json.length > MAX_OVERVIEW_ASSET_IDS_JSON_LEN) {
    return { ok: false, message: "Too many assets selected." };
  }
  return { ok: true, ids: out };
}

export type OfferingOverviewPatchInput = {
  offeringStatus?: string;
  offeringVisibility?: string;
  showOnInvestbase?: boolean;
  dealName?: string;
  internalName?: string;
  dealType?: string;
  /** JSON array string for `offering_overview_asset_ids` column */
  offeringOverviewAssetIdsJson?: string;
  /** Investor class id for offering overview / public offering economics */
  offeringOverviewClassId?: string | null;
};

const OFFERING_OVERVIEW_CLASS_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizeOfferingOverviewPatch(
  patch: OfferingOverviewPatchInput,
): { ok: true; set: OfferingOverviewPatchInput } | { ok: false; message: string } {
  const out: OfferingOverviewPatchInput = {};
  if (patch.offeringStatus !== undefined) {
    const v = String(patch.offeringStatus ?? "").trim();
    if (!isDealStatus(v)) {
      return { ok: false, message: "Invalid offering status." };
    }
    out.offeringStatus = v;
  }
  if (patch.offeringVisibility !== undefined) {
    const v = canonicalOfferingVisibility(String(patch.offeringVisibility ?? ""));
    if (!OFFERING_VISIBILITY_WHITELIST.has(v)) {
      return { ok: false, message: "Invalid offering visibility." };
    }
    out.offeringVisibility = v;
  }
  if (patch.showOnInvestbase !== undefined) {
    if (typeof patch.showOnInvestbase !== "boolean") {
      return { ok: false, message: "show_on_investbase must be a boolean." };
    }
    out.showOnInvestbase = patch.showOnInvestbase;
  }
  if (patch.dealName !== undefined) {
    const v = String(patch.dealName ?? "").trim();
    if (!v) {
      return { ok: false, message: "Offering name cannot be empty." };
    }
    if (v.length > 500) {
      return { ok: false, message: "Offering name is too long." };
    }
    out.dealName = v;
  }
  if (patch.internalName !== undefined) {
    const v = String(patch.internalName ?? "").trim().slice(0, MAX_INTERNAL_NAME_LEN);
    out.internalName = v;
  }
  if (patch.dealType !== undefined) {
    const v = String(patch.dealType ?? "").trim().slice(0, MAX_DEAL_TYPE_LEN);
    out.dealType = v;
  }
  if (patch.offeringOverviewAssetIdsJson !== undefined) {
    const j = String(patch.offeringOverviewAssetIdsJson ?? "").trim();
    if (j.length > MAX_OVERVIEW_ASSET_IDS_JSON_LEN) {
      return { ok: false, message: "Asset selection payload is too large." };
    }
    try {
      const p = JSON.parse(j) as unknown;
      if (!Array.isArray(p)) {
        return { ok: false, message: "offering_overview_asset_ids must be a JSON array." };
      }
    } catch {
      return { ok: false, message: "offering_overview_asset_ids must be valid JSON." };
    }
    out.offeringOverviewAssetIdsJson = j;
  }
  if (patch.offeringOverviewClassId !== undefined) {
    if (patch.offeringOverviewClassId === null) {
      out.offeringOverviewClassId = null;
    } else {
      const v = String(patch.offeringOverviewClassId ?? "").trim();
      if (!v) {
        out.offeringOverviewClassId = null;
      } else if (!OFFERING_OVERVIEW_CLASS_ID_UUID_RE.test(v)) {
        if (offeringStatusRequiresInvestorClass(out.offeringStatus)) {
          return {
            ok: false,
            message: "Create a class to change the deal status",
          };
        }
        return { ok: false, message: "Invalid offering overview class id." };
      } else {
        out.offeringOverviewClassId = v;
      }
    }
  }
  if (Object.keys(out).length === 0) {
    return { ok: false, message: "No valid fields to update." };
  }
  return { ok: true, set: out };
}

export async function updateDealOfferingOverviewById(
  id: string,
  patch: OfferingOverviewPatchInput,
): Promise<AddDealFormRow | undefined> {
  const existing = await getAddDealFormById(id);
  if (!existing) return undefined;
  if (patch.offeringStatus !== undefined) {
    const nextStatus = normalizeDealStatus(patch.offeringStatus);
    const prevStatus = normalizeDealStatus(existing.offeringStatus);
    if (
      nextStatus &&
      nextStatus !== prevStatus &&
      offeringStatusRequiresInvestorClass(nextStatus)
    ) {
      const classes = await listInvestorClassesByDealId(id);
      if (classes.length === 0) {
        throwOfferingOverviewValidation({
          offering_status: "Create a class to change the deal status",
        });
      }
    }
    await assertOfferingStatusChangeAllowed({
      dealId: id,
      dealStage: existing.dealStage,
      previousOfferingStatus: existing.offeringStatus,
      nextOfferingStatus: patch.offeringStatus,
    });
  }
  if (patch.dealName !== undefined) {
    await assertDealNameUnique({
      dealName: patch.dealName,
      organizationId: existing.organizationId ?? null,
      excludeDealId: id,
    });
  }

  let promotedDealStage: string | undefined;
  let pendingDealStage: string | null | undefined;
  if (patch.offeringStatus !== undefined) {
    const nextStatus = normalizeDealStatus(patch.offeringStatus);
    if (
      nextStatus === "open_investment" &&
      isDealStageDraft(existing.dealStage)
    ) {
      const classes = await listInvestorClassesByDealId(id);
      if (classes.length === 0) {
        throwOfferingOverviewValidation({
          offering_status:
            "Add at least one investor class before opening to investment.",
        });
      }
      const stageHold = resolveDealStageForSaasPaymentHold({
        requestedStage: normalizeDealStage("capital_raising"),
        existing,
      });
      if (isDealStageDraft(stageHold.persistStage)) {
        pendingDealStage = stageHold.pendingDealStage;
      } else {
        promotedDealStage = stageHold.persistStage;
        pendingDealStage = null;
      }
    }
  }

  const [updated] = await db
    .update(addDealForm)
    .set({
      ...(patch.offeringStatus !== undefined
        ? { offeringStatus: patch.offeringStatus }
        : {}),
      ...(promotedDealStage !== undefined
        ? { dealStage: promotedDealStage }
        : {}),
      ...(pendingDealStage !== undefined
        ? { pendingDealStage }
        : {}),
      ...(patch.offeringVisibility !== undefined
        ? { offeringVisibility: patch.offeringVisibility }
        : {}),
      ...(patch.showOnInvestbase !== undefined
        ? { showOnInvestbase: patch.showOnInvestbase }
        : {}),
      ...(patch.dealName !== undefined ? { dealName: patch.dealName } : {}),
      ...(patch.internalName !== undefined
        ? { internalName: patch.internalName }
        : {}),
      ...(patch.dealType !== undefined ? { dealType: patch.dealType } : {}),
      ...(patch.offeringOverviewAssetIdsJson !== undefined
        ? { offeringOverviewAssetIds: patch.offeringOverviewAssetIdsJson }
        : {}),
      ...(patch.offeringOverviewClassId !== undefined
        ? { offeringOverviewClassId: patch.offeringOverviewClassId }
        : {}),
    })
    .where(eq(addDealForm.id, id))
    .returning();
  if (updated && promotedDealStage !== undefined) {
    scheduleDealSaasBillingSync(String(updated.id));
  }
  return updated;
}

export async function updateDealOfferingGalleryPathsById(
  id: string,
  paths: string[],
): Promise<AddDealFormRow | undefined> {
  const existing = await getAddDealFormById(id);
  if (!existing) return undefined;
  const normalized = normalizeOfferingGalleryPathsFromBody(paths);
  if (!normalized.ok) return undefined;
  const deduped = dedupeAssetImagePathSegmentsPreserveOrder(normalized.paths);
  const json = JSON.stringify(deduped);
  const assetImagePath = deduped.length > 0 ? deduped.join(";") : null;
  const [updated] = await db
    .update(addDealForm)
    .set({ offeringGalleryPaths: json, assetImagePath })
    .where(eq(addDealForm.id, id))
    .returning();
  return updated;
}

/** Save new gallery files and merge paths into `asset_image_path` and `offering_gallery_paths`. */
export async function appendDealGalleryUploadsById(
  id: string,
  newRelativePaths: string[],
): Promise<AddDealFormRow | undefined> {
  if (newRelativePaths.length === 0) return getAddDealFormById(id);
  const existing = await getAddDealFormById(id);
  if (!existing) return undefined;
  const normSeg = (p: string) => p.trim().replace(/^\/+/, "");
  const already = new Set(
    (existing.assetImagePath?.split(";").filter(Boolean) ?? []).map((p) =>
      normSeg(p),
    ),
  );
  const uniqueNew: string[] = [];
  const seenNew = new Set<string>();
  for (const p of newRelativePaths) {
    const t = normSeg(p);
    if (!t || already.has(t) || seenNew.has(t)) continue;
    seenNew.add(t);
    uniqueNew.push(p.trim());
  }
  if (uniqueNew.length === 0) return existing;
  const prevPaths = existing.assetImagePath?.split(";").filter(Boolean) ?? [];
  const mergedPaths = [...prevPaths, ...uniqueNew];
  const assetImagePath = mergedPaths.join(";");
  const offeringGalleryPaths = mergeOfferingGalleryPathsIntoStored(
    existing.offeringGalleryPaths,
    uniqueNew,
  );
  const [updated] = await db
    .update(addDealForm)
    .set({ assetImagePath, offeringGalleryPaths })
    .where(eq(addDealForm.id, id))
    .returning();
  return updated;
}

export async function updateDealKeyHighlightsById(
  id: string,
  rawJson: string,
): Promise<AddDealFormRow | undefined> {
  const existing = await getAddDealFormById(id);
  if (!existing) return undefined;
  const normalized = sanitizeKeyHighlightsJson(rawJson);
  /** Always store a string (e.g. `[]`) so reads always round-trip; avoid NULL vs "" ambiguity. */
  const [updated] = await db
    .update(addDealForm)
    .set({ keyHighlightsJson: normalized })
    .where(eq(addDealForm.id, id))
    .returning();
  return updated;
}

export async function updateDealFundingInstructionsById(
  id: string,
  rawJson: string,
): Promise<AddDealFormRow | undefined> {
  const existing = await getAddDealFormById(id);
  if (!existing) return undefined;
  const normalized = sanitizeFundingInstructionsJson(rawJson);
  const [updated] = await db
    .update(addDealForm)
    .set({ fundingInstructionsJson: normalized })
    .where(eq(addDealForm.id, id))
    .returning();
  if (!updated) return undefined;
  await syncFundingInstructionsPdfToDocumentsTab({
    dealId: id,
    fundingInstructionsJson: normalized,
    dealName: existing.dealName,
  });
  return getAddDealFormById(id) ?? updated;
}

export async function updateDealOfferingInvestorPreviewById(
  id: string,
  canonicalJson: string,
): Promise<AddDealFormRow | undefined> {
  const existing = await getAddDealFormById(id);
  if (!existing) return undefined;
  const [updated] = await db
    .update(addDealForm)
    .set({ offeringInvestorPreviewJson: canonicalJson })
    .where(eq(addDealForm.id, id))
    .returning();
  return updated;
}

export async function updateAddDealFormById(
  id: string,
  input: CreateDealFormInput,
  newAssetRelativePaths: string[],
  options?: {
    organizationId?: string | null;
    /**
     * When present (edit-deal wizard PUT), these segments replace the previous
     * `asset_image_path` base before new multipart uploads are appended.
     */
    replaceAssetImageBase?: string[];
  },
): Promise<AddDealFormRow | undefined> {
  const existing = await getAddDealFormById(id);
  if (!existing) return undefined;

  const normalizedInput: CreateDealFormInput = {
    ...input,
    dealStage: normalizeDealStage(input.dealStage),
    zipCode: normalizeDealZipCode(input.zipCode),
  };
  const validationErrors = validateCreateInput(normalizedInput);
  if (validationErrors) throwDealFormValidation(validationErrors);

  const orgForUniqueness =
    existing.organizationId ?? options?.organizationId ?? null;
  await assertDealNameUnique({
    dealName: normalizedInput.dealName,
    organizationId: orgForUniqueness,
    excludeDealId: id,
  });

  const useReplaceBase = options?.replaceAssetImageBase !== undefined;
  const prevPaths = existing.assetImagePath?.split(";").filter(Boolean) ?? [];
  const baseSegments = useReplaceBase
    ? dedupeAssetImagePathSegmentsPreserveOrder(
        options!.replaceAssetImageBase ?? [],
      )
    : dedupeAssetImagePathSegmentsPreserveOrder(prevPaths);
  const mergedList = dedupeAssetImagePathSegmentsPreserveOrder([
    ...baseSegments,
    ...newAssetRelativePaths,
  ]);

  const assetImagePath =
    mergedList.length > 0
      ? mergedList.join(";")
      : useReplaceBase
        ? null
        : existing.assetImagePath;

  let offeringGalleryPaths: string;
  if (useReplaceBase) {
    const mergedSet = new Set(
      mergedList.map((p) => normalizeAssetImagePathSegment(p)),
    );
    const existingGallery = parseStoredOfferingGalleryPaths(
      existing.offeringGalleryPaths,
    );
    const filtered = existingGallery.filter((p) =>
      mergedSet.has(normalizeAssetImagePathSegment(p)),
    );
    offeringGalleryPaths =
      newAssetRelativePaths.length > 0
        ? mergeOfferingGalleryPathsIntoStored(
            JSON.stringify(filtered),
            newAssetRelativePaths,
          )
        : JSON.stringify(filtered);
  } else {
    offeringGalleryPaths =
      newAssetRelativePaths.length > 0
        ? mergeOfferingGalleryPathsIntoStored(
            existing.offeringGalleryPaths,
            newAssetRelativePaths,
          )
        : existing.offeringGalleryPaths;
  }

  const backfillOrg =
    !existing.organizationId && options?.organizationId
      ? { organizationId: options.organizationId }
      : {};

  const stageHold = resolveDealStageForSaasPaymentHold({
    requestedStage: normalizedInput.dealStage,
    existing,
  });
  const prevStageCanon = normalizeDealStageCanonical(existing.dealStage);
  const nextStageCanon = normalizeDealStageCanonical(stageHold.persistStage);
  const stageChanged =
    prevStageCanon != null &&
    nextStageCanon != null &&
    prevStageCanon !== nextStageCanon;
  const offeringStatusOnStageChange =
    stageChanged && nextStageCanon != null
      ? resolveOfferingStatusForStageChange({
          nextStage: nextStageCanon,
          currentStatus: existing.offeringStatus,
        })
      : undefined;

  const baseSet = {
    ...backfillOrg,
    dealName: normalizedInput.dealName.trim(),
    dealType: normalizedInput.dealType.trim(),
    secType: normalizedInput.secType.trim(),
    closeDate: normalizedInput.closeDate?.trim() || null,
    owningEntityName: normalizedInput.owningEntityName.trim(),
    fundsRequiredBeforeGpSign: normalizedInput.fundsRequiredBeforeGpSign!,
    autoSendFundingInstructions: normalizedInput.autoSendFundingInstructions!,
    propertyName: normalizedInput.propertyName.trim(),
    country: normalizedInput.country.trim(),
    addressLine1: normalizedInput.addressLine1.trim() || null,
    addressLine2: normalizedInput.addressLine2.trim() || null,
    city: normalizedInput.city.trim(),
    state: normalizedInput.state.trim() || null,
    zipCode: normalizedInput.zipCode || null,
    assetImagePath,
    offeringGalleryPaths,
    ...(offeringStatusOnStageChange != null
      ? { offeringStatus: offeringStatusOnStageChange }
      : {}),
    pendingDealStage: stageHold.pendingDealStage,
  };
  const candidates = dealStageCandidates(stageHold.persistStage);
  let lastErr: unknown = null;
  for (const stage of candidates) {
    try {
      const [updated] = await db
        .update(addDealForm)
        .set({
          ...baseSet,
          dealStage: stage,
        })
        .where(eq(addDealForm.id, id))
        .returning();
      if (updated) scheduleDealSaasBillingSync(String(updated.id));
      return updated;
    } catch (err) {
      lastErr = err;
      if (!isDealStageCheckError(err) || stage === candidates[candidates.length - 1]) {
        throw err;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Update failed");
}
