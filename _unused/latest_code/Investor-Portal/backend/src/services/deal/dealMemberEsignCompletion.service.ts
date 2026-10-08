import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { and, eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { getDropboxSignConfig } from "../../config/dropboxSign.config.js";
import { getActiveEsignProvider } from "../../config/esignProvider.config.js";
import { getSignFlowConfig } from "../../config/signflow.config.js";
import { db } from "../../database/db.js";
import { dealInvestment } from "../../schema/deal.schema/deal-investment.schema.js";
import { dealLpInvestor } from "../../schema/deal.schema/deal-lp-investor.schema.js";
import { getUploadsPhysicalRoot } from "../../config/uploadPaths.js";
import {
  DEAL_ESIGN_COMPLETED_FOLDER,
  dealAssetsRelativePath,
  resolveDealStorageFolderName,
  sanitizeStoragePathSegment,
} from "./dealStoragePaths.service.js";
import {
  esignBundleNeedsDropboxSync,
  esignBundleNeedsStoredPdfSync,
  esignBundleToSendStatusList,
  esignCategoryFromCommitmentProfileId,
  findEsignSendBySignatureRequestId,
  parseEsignStatusBundle,
  parseEsignStatusJson,
  type DealInvestorEsignSendStatusApi,
  type StoredDealInvestorEsignBundle,
  type StoredDealInvestorEsignSend,
} from "../../constants/deal-investor-esign-status.js";
import {
  downloadSignatureRequestPdfBuffer,
  getSignatureRequestDetail,
  isDropboxSignRateLimitError,
  type DropboxSignatureRequestDetail,
  type DropboxSignatureSignerDetail,
} from "../esign/dropboxSign.service.js";
import { isEsignProviderUnreachableError } from "../esign/esignProviderErrors.js";
import {
  downloadSignFlowInvestorSignedPdfBuffer,
  downloadSignFlowSignedPdfBuffer,
  getSignFlowDocument,
  getSignFlowDocumentSummary,
  isSignFlowInvestorNotSignedError,
  signFlowDocumentInvestorHasSigned,
  signFlowSummaryInvestorHasSigned,
  type SignFlowDocumentSummary,
} from "../esign/signflow.service.js";
import {
  resolveEsignSponsorSignState,
  syncCompletedEsignDocumentsToDocumentsTab,
} from "./dealEsignDocumentsWorkspaceSync.service.js";
import { runEsignStageNotificationsForTarget } from "./dealEsignStageNotificationEmail.service.js";
import { appendEsignDocumentTrailCertificate } from "./esignDocumentTrailPdf.service.js";

function latestWorkflowIso(
  dates: Array<string | null | undefined>,
): string | null {
  let best: string | null = null;
  let bestMs = -1;
  for (const d of dates) {
    const s = d?.trim();
    if (!s) continue;
    const ms = new Date(s).getTime();
    if (!Number.isNaN(ms) && ms > bestMs) {
      bestMs = ms;
      best = s;
    }
  }
  return best;
}

/** Viewed / signed timestamps from Dropbox Sign (summary + per-signer). */
function workflowTimestampsFromDropbox(
  summary: DropboxSignatureRequestDetail,
): { viewedAt: string | null; signedAt: string | null } {
  const viewedCandidates: Array<string | null | undefined> = [
    summary.lastViewedAt,
  ];
  const signedCandidates: Array<string | null | undefined> = [
    summary.lastSignedAt,
  ];

  for (const signer of summary.signers) {
    collectSignerWorkflowTimestamps(signer, viewedCandidates, signedCandidates);
  }

  return {
    viewedAt: latestWorkflowIso(viewedCandidates),
    signedAt: latestWorkflowIso(signedCandidates),
  };
}

function collectSignerWorkflowTimestamps(
  signer: DropboxSignatureSignerDetail,
  viewedCandidates: Array<string | null | undefined>,
  signedCandidates: Array<string | null | undefined>,
): void {
  if (signer.lastViewedAt?.trim()) viewedCandidates.push(signer.lastViewedAt);
  if (signer.signedAt?.trim()) signedCandidates.push(signer.signedAt);

  const code = String(signer.statusCode ?? "").trim().toLowerCase();
  if (code === "signed") {
    if (signer.signedAt?.trim()) signedCandidates.push(signer.signedAt);
    if (signer.lastViewedAt?.trim()) viewedCandidates.push(signer.lastViewedAt);
  } else if (code === "viewed" && signer.lastViewedAt?.trim()) {
    viewedCandidates.push(signer.lastViewedAt);
  }
}
import type { DealInvestorEsignStatusApi } from "../../constants/deal-investor-esign-status.js";
import {
  enrichEsignDocumentsWithCategories,
  findEsignTemplateFile,
  getDealEsignTemplatesState,
} from "./dealEsignTemplates.service.js";
import {
  dealHasSequentialInvestorFirstEsign,
  dealHasInvestorFirstCounterSignEsign,
  evaluateDealSequentialInvestorSignAccess,
  sequentialWorkflowInvestorPortalDocsGateOpen,
} from "./dealSequentialEsignWorkflow.service.js";
import {
  findInvestorEsignTargetBySignatureRequestId,
  markDealInvestorEsignSignedOptimistic,
  readInvestorEsignStatusJson,
  resolveEsignTargetForInvestorRowId,
  updateDealInvestorEsignSend,
  type InvestorEsignRowTarget,
} from "./dealMemberEsignStatus.service.js";

const EMBED_ESIGN_SYNC_ATTEMPTS = 12;
const EMBED_ESIGN_SYNC_DELAY_MS = 1000;

export type MyEsignDocumentListItem = {
  fileId: string;
  name: string;
  url: string | null;
  status: "pending" | "signed";
  categoryId?: string;
  signatureRequestId?: string;
};

function listSignedEsignDocumentsForSend(
  send: StoredDealInvestorEsignSend,
  signatureRequestId: string,
  opts?: { preferFullSignedCopy?: boolean },
): Array<{ fileId: string; name: string; url: string | null }> {
  if (!sendHasStoredOrRecordedSignature(send)) return [];
  const docs = send.documents ?? [];
  if (docs.length === 0) return [];

  const investorPath =
    docs.find((d) => d.signedRelativePath?.trim())?.signedRelativePath?.trim() ??
    "";
  const fullPath = send.fullSignedRelativePath?.trim() ?? "";
  const sharedPath =
    opts?.preferFullSignedCopy && fullPath ? fullPath : investorPath;
  const sharedUrl = sharedPath ? uploadPublicUrl(sharedPath) : null;
  const sig = signatureRequestId.trim();

  return docs.map((d) => {
    const rel =
      (opts?.preferFullSignedCopy && fullPath ? fullPath : "") ||
      d.signedRelativePath?.trim() ||
      sharedPath;
    const url = rel ? uploadPublicUrl(rel) : sharedUrl;
    const compositeId = sig && d.fileId ? `${sig}::${d.fileId}` : d.fileId;
    return {
      fileId: compositeId,
      name: d.name,
      url: url || null,
    };
  });
}

function uploadPublicUrl(relativePath: string): string {
  const rel = relativePath.replace(/^\/+/, "").replace(/^uploads\//i, "");
  return rel ? `/uploads/${rel}` : "";
}

const ESIGN_SIGNED_FOLDER = DEAL_ESIGN_COMPLETED_FOLDER;

function safeRosterSegment(raw: string): string {
  return sanitizeStoragePathSegment(raw, 64) || "investor";
}

/** Flatten AcroForm widgets so field labels (e.g. api ids) are not visible in viewers. */
async function flattenSignedPdfBuffer(buffer: Buffer): Promise<Buffer> {
  try {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    try {
      doc.getForm().flatten();
    } catch {
      /* Dropbox PDF may already be flattened or have no form */
    }
    return Buffer.from(await doc.save());
  } catch (err) {
    console.warn("flattenSignedPdfBuffer:", err);
    return buffer;
  }
}

const INVESTOR_SIGNED_PDF_VERSION = 2;

type SignedPdfAudience = "investor" | "full";

function existingInvestorSignedRelativePath(
  send: StoredDealInvestorEsignSend | null | undefined,
): string {
  return (
    send?.documents?.find((d) => d.signedRelativePath?.trim())?.signedRelativePath?.trim() ??
    ""
  );
}

async function downloadSignedPdfBufferForAudience(
  signatureRequestId: string,
  audience: SignedPdfAudience,
): Promise<Buffer> {
  const provider = getActiveEsignProvider();
  if (provider === "signflow") {
    return audience === "full"
      ? downloadSignFlowSignedPdfBuffer(signatureRequestId)
      : downloadSignFlowInvestorSignedPdfBuffer(signatureRequestId);
  }
  return downloadSignatureRequestPdfBuffer(signatureRequestId);
}

async function persistSignedPdf(params: {
  dealId: string;
  rosterId: string;
  signatureRequestId: string;
  send?: StoredDealInvestorEsignSend | null;
  audience: SignedPdfAudience;
}): Promise<string> {
  const downloaded = await downloadSignedPdfBufferForAudience(
    params.signatureRequestId,
    params.audience,
  );
  const flattened = await flattenSignedPdfBuffer(downloaded);
  let pdf = flattened;
  const provider = getActiveEsignProvider();
  // SignFlow embeds role-appropriate certificates in provider PDFs.
  if (provider === "dropbox") {
    try {
      pdf = await appendEsignDocumentTrailCertificate(flattened, {
        dealId: params.dealId,
        signatureRequestId: params.signatureRequestId,
        send: params.send ?? null,
        audience: params.audience === "full" ? "full" : "investor",
      });
    } catch (err) {
      console.warn("appendEsignDocumentTrailCertificate:", err);
    }
  }
  const dealFolder = await resolveDealStorageFolderName(params.dealId);
  const rosterFolder = safeRosterSegment(params.rosterId);
  const filePrefix =
    params.audience === "full" ? "signed-full" : "signed-investor";
  const fileName = `${filePrefix}-${Date.now()}.pdf`;
  const relativePath = dealAssetsRelativePath(
    dealFolder,
    ESIGN_SIGNED_FOLDER,
    rosterFolder,
    fileName,
  );

  const abs = path.join(getUploadsPhysicalRoot(), relativePath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, pdf);
  return relativePath;
}

function withInvestorSignedPdfFields(
  current: StoredDealInvestorEsignSend,
  signedRelativePath: string,
): Partial<StoredDealInvestorEsignSend> {
  return {
    investorPdfVersion: INVESTOR_SIGNED_PDF_VERSION,
    documents: (current.documents ?? []).map((d) => ({
      ...d,
      signedRelativePath,
    })),
  };
}

function withFullSignedPdfFields(
  fullSignedRelativePath: string,
): Partial<StoredDealInvestorEsignSend> {
  return { fullSignedRelativePath };
}

async function persistInvestorAndFullSignedPdfs(params: {
  dealId: string;
  rosterId: string;
  signatureRequestId: string;
  send: StoredDealInvestorEsignSend;
  includeFull: boolean;
}): Promise<{ investorPath?: string; fullPath?: string }> {
  const result: { investorPath?: string; fullPath?: string } = {};
  const existingInvestor = existingInvestorSignedRelativePath(params.send);
  if (existingInvestor) {
    result.investorPath = existingInvestor;
  } else {
    try {
      result.investorPath = await persistSignedPdf({
        dealId: params.dealId,
        rosterId: params.rosterId,
        signatureRequestId: params.signatureRequestId,
        send: params.send,
        audience: "investor",
      });
    } catch (err) {
      console.warn("persistSignedPdf (investor):", err);
    }
  }

  const existingFull = params.send.fullSignedRelativePath?.trim();
  if (existingFull) {
    result.fullPath = existingFull;
    return result;
  }

  if (!params.includeFull) return result;

  try {
    result.fullPath = await persistSignedPdf({
      dealId: params.dealId,
      rosterId: params.rosterId,
      signatureRequestId: params.signatureRequestId,
      send: params.send,
      audience: "full",
    });
  } catch (err) {
    console.warn("persistSignedPdf (full):", err);
  }
  return result;
}

function esignBundleNeedsLegacyInvestorPdfRefresh(
  bundle: StoredDealInvestorEsignBundle,
): boolean {
  if (getActiveEsignProvider() !== "signflow") return false;
  return bundle.sends.some((s) => {
    if (s.investorPdfVersion === INVESTOR_SIGNED_PDF_VERSION) return false;
    if (!s.signedAt?.trim() && !s.completedAt?.trim()) return false;
    return (s.documents ?? []).some((d) => Boolean(d.signedRelativePath?.trim()));
  });
}

/** Re-download SignFlow PDF without portal cert overlay for sends stored before v2. */
async function refreshLegacySignFlowInvestorPdfIfNeeded(params: {
  dealId: string;
  target: InvestorEsignRowTarget;
  signatureRequestId: string;
  send: StoredDealInvestorEsignSend;
}): Promise<string | undefined> {
  if (getActiveEsignProvider() !== "signflow") return undefined;
  if (params.send.investorPdfVersion === INVESTOR_SIGNED_PDF_VERSION) {
    return undefined;
  }
  if (!params.send.signedAt?.trim() && !params.send.completedAt?.trim()) {
    return undefined;
  }
  const hasPath = (params.send.documents ?? []).some((d) =>
    Boolean(d.signedRelativePath?.trim()),
  );
  if (!hasPath) return undefined;

  try {
    const doc = await getSignFlowDocument(params.signatureRequestId);
    if (!signFlowDocumentInvestorHasSigned(doc)) {
      return undefined;
    }

    const signedRelativePath = await persistSignedPdf({
      dealId: params.dealId,
      rosterId: params.target.id,
      signatureRequestId: params.signatureRequestId,
      send: params.send,
      audience: "investor",
    });
    await updateDealInvestorEsignSend(
      params.dealId,
      params.target,
      params.signatureRequestId,
      (current) => ({
        ...current,
        ...withInvestorSignedPdfFields(current, signedRelativePath),
      }),
    );
    return signedRelativePath;
  } catch (err) {
    if (
      isEsignProviderUnreachableError(err) ||
      isSignFlowInvestorNotSignedError(err)
    ) {
      return undefined;
    }
    console.warn("refreshLegacySignFlowInvestorPdfIfNeeded:", err);
    return undefined;
  }
}

async function applyProgressFromDropbox(
  dealId: string,
  target: InvestorEsignRowTarget,
  signatureRequestId: string,
  opts?: { forceComplete?: boolean },
): Promise<boolean> {
  const summary = await getSignatureRequestDetail(signatureRequestId);
  const raw = await readInvestorEsignStatusJson(dealId, target);
  const bundle = parseEsignStatusBundle(raw);
  const existing = bundle
    ? findEsignSendBySignatureRequestId(bundle, signatureRequestId)
    : null;
  if (!existing?.sentAt) return false;

  const sigId = signatureRequestId.trim();
  const alreadyComplete = Boolean(existing.completedAt);
  const shouldComplete =
    opts?.forceComplete === true ||
    summary.isComplete ||
    alreadyComplete;

  if (shouldComplete && !alreadyComplete) {
    const rosterId = target.id;
    const completedAt =
      summary.completeAt ?? summary.lastSignedAt ?? new Date().toISOString();
    const pdfs = await persistInvestorAndFullSignedPdfs({
      dealId,
      rosterId,
      signatureRequestId: sigId,
      send: existing,
      includeFull: true,
    });

    await updateDealInvestorEsignSend(dealId, target, sigId, (current) => ({
      ...current,
      viewedAt: current.viewedAt ?? summary.lastViewedAt ?? completedAt,
      signedAt: summary.lastSignedAt ?? current.signedAt ?? completedAt,
      completedAt,
      signatureRequestId: sigId,
      ...(pdfs.investorPath
        ? withInvestorSignedPdfFields(current, pdfs.investorPath)
        : {}),
      ...(pdfs.fullPath ? withFullSignedPdfFields(pdfs.fullPath) : {}),
    }));
    return true;
  }

  if (shouldComplete && alreadyComplete) {
    await ensureFullSignedPdfStoredForCompletedSend(
      dealId,
      target,
      sigId,
      existing,
    );
    return true;
  }

  const dropboxProgress = workflowTimestampsFromDropbox(summary);
  const progressViewed = dropboxProgress.viewedAt?.trim() || null;
  const progressSigned = dropboxProgress.signedAt?.trim() || null;
  const signersSigned = dropboxSignersAllSigned(summary.signers);
  const hasStoredSignedPdf = (existing.documents ?? []).some((d) =>
    Boolean(d.signedRelativePath?.trim()),
  );

  if (progressViewed || progressSigned || signersSigned) {
    let signedRelativePath: string | undefined;
    if (!hasStoredSignedPdf && (signersSigned || progressSigned)) {
      try {
        signedRelativePath = await persistSignedPdf({
          dealId,
          rosterId: target.id,
          signatureRequestId: sigId,
          send: existing,
          audience: "investor",
        });
      } catch (err) {
        console.warn("persistSignedPdf (signed, not yet completed):", err);
      }
    }

    await updateDealInvestorEsignSend(dealId, target, sigId, (current) => ({
      ...current,
      viewedAt: current.viewedAt ?? progressViewed,
      signedAt: current.signedAt ?? progressSigned,
      signatureRequestId: sigId,
      ...(signedRelativePath
        ? withInvestorSignedPdfFields(current, signedRelativePath)
        : {}),
    }));
    return true;
  }

  return alreadyComplete;
}

function signFlowSignersAllSigned(
  signers: SignFlowDocumentSummary["signers"],
): boolean {
  if (!signers.length) return false;
  return signers.every((s) => {
    const code = String(s.statusCode ?? "").trim().toLowerCase();
    if (code === "signed" || code === "completed") return true;
    return Boolean(s.signedAt?.trim());
  });
}

function workflowTimestampsFromSignFlow(
  summary: SignFlowDocumentSummary,
): { viewedAt: string | null; signedAt: string | null } {
  return {
    viewedAt: summary.lastViewedAt?.trim() || null,
    signedAt: summary.investorLastSignedAt?.trim() || null,
  };
}

async function applyProgressFromSignFlow(
  dealId: string,
  target: InvestorEsignRowTarget,
  signatureRequestId: string,
  opts?: { forceComplete?: boolean },
): Promise<boolean> {
  let summary: Awaited<ReturnType<typeof getSignFlowDocumentSummary>>;
  try {
    summary = await getSignFlowDocumentSummary(signatureRequestId);
  } catch (err) {
    if (isEsignProviderUnreachableError(err)) {
      console.warn(
        "applyProgressFromSignFlow: SignFlow unreachable — start the SignFlow API or check SIGNFLOW_API_BASE_URL",
      );
      return false;
    }
    throw err;
  }
  const raw = await readInvestorEsignStatusJson(dealId, target);
  const bundle = parseEsignStatusBundle(raw);
  const existing = bundle
    ? findEsignSendBySignatureRequestId(bundle, signatureRequestId)
    : null;
  if (!existing?.sentAt) return false;

  const sigId = signatureRequestId.trim();
  const alreadyComplete = Boolean(existing.completedAt);
  const shouldComplete =
    opts?.forceComplete === true ||
    summary.isComplete ||
    alreadyComplete;

  if (shouldComplete && !alreadyComplete) {
    const rosterId = target.id;
    const completedAt = summary.lastSignedAt ?? new Date().toISOString();
    const pdfs = await persistInvestorAndFullSignedPdfs({
      dealId,
      rosterId,
      signatureRequestId: sigId,
      send: existing,
      includeFull: true,
    });

    await updateDealInvestorEsignSend(dealId, target, sigId, (current) => ({
      ...current,
      viewedAt: current.viewedAt ?? summary.lastViewedAt ?? completedAt,
      signedAt:
        summary.investorLastSignedAt ??
        current.signedAt ??
        summary.lastSignedAt ??
        completedAt,
      completedAt,
      signatureRequestId: sigId,
      ...(pdfs.investorPath
        ? withInvestorSignedPdfFields(current, pdfs.investorPath)
        : {}),
      ...(pdfs.fullPath ? withFullSignedPdfFields(pdfs.fullPath) : {}),
    }));
    return true;
  }

  if (shouldComplete && alreadyComplete) {
    await refreshLegacySignFlowInvestorPdfIfNeeded({
      dealId,
      target,
      signatureRequestId: sigId,
      send: existing,
    });
    await ensureFullSignedPdfStoredForCompletedSend(
      dealId,
      target,
      sigId,
      existing,
    );
    return true;
  }

  const signFlowProgress = workflowTimestampsFromSignFlow(summary);
  const progressViewed = signFlowProgress.viewedAt?.trim() || null;
  const progressSigned = signFlowProgress.signedAt?.trim() || null;
  const signersSigned = signFlowSignersAllSigned(summary.signers);
  const hasStoredSignedPdf = (existing.documents ?? []).some((d) =>
    Boolean(d.signedRelativePath?.trim()),
  );

  if (progressViewed || progressSigned || signersSigned) {
    let signedRelativePath: string | undefined;
    const investorSigned = signFlowSummaryInvestorHasSigned(summary);
    if (
      !hasStoredSignedPdf &&
      investorSigned &&
      (summary.isComplete || signersSigned || progressSigned)
    ) {
      try {
        signedRelativePath = await persistSignedPdf({
          dealId,
          rosterId: target.id,
          signatureRequestId: sigId,
          send: existing,
          audience: "investor",
        });
      } catch (err) {
        if (!isSignFlowInvestorNotSignedError(err)) {
          console.warn(
            "persistSignedPdf (SignFlow, signed, not yet completed):",
            err,
          );
        }
      }
    }

    await updateDealInvestorEsignSend(dealId, target, sigId, (current) => ({
      ...current,
      viewedAt: current.viewedAt ?? progressViewed,
      signedAt: investorSigned
        ? (current.signedAt ?? progressSigned)
        : (progressSigned ?? null),
      signatureRequestId: sigId,
      ...(signedRelativePath
        ? withInvestorSignedPdfFields(current, signedRelativePath)
        : {}),
    }));
    return true;
  }

  return alreadyComplete;
}

function esignProviderCanSync(): boolean {
  const provider = getActiveEsignProvider();
  if (provider === "signflow") return Boolean(getSignFlowConfig());
  if (provider === "dropbox") return Boolean(getDropboxSignConfig());
  return false;
}

async function applyProgressFromActiveProvider(
  dealId: string,
  target: InvestorEsignRowTarget,
  signatureRequestId: string,
  opts?: { forceComplete?: boolean },
): Promise<boolean> {
  if (getActiveEsignProvider() === "signflow") {
    return applyProgressFromSignFlow(dealId, target, signatureRequestId, opts);
  }
  return applyProgressFromDropbox(dealId, target, signatureRequestId, opts);
}

/** Persist fully-executed PDF for sponsor workspace after all signers complete. */
async function ensureFullSignedPdfStoredForCompletedSend(
  dealId: string,
  target: InvestorEsignRowTarget,
  signatureRequestId: string,
  existing: StoredDealInvestorEsignSend,
): Promise<boolean> {
  if (existing.fullSignedRelativePath?.trim()) return true;
  if (!existing.completedAt?.trim()) return false;

  try {
    const fullSignedRelativePath = await persistSignedPdf({
      dealId,
      rosterId: target.id,
      signatureRequestId,
      send: existing,
      audience: "full",
    });
    await updateDealInvestorEsignSend(
      dealId,
      target,
      signatureRequestId,
      (current) => ({
        ...current,
        ...withFullSignedPdfFields(fullSignedRelativePath),
      }),
    );
    return true;
  } catch (err) {
    console.warn("ensureFullSignedPdfStoredForCompletedSend:", err);
    return false;
  }
}

/** Persist signed PDF locally once the investor has signed (full completion optional). */
async function ensureSignedPdfStoredForSignedSend(
  dealId: string,
  target: InvestorEsignRowTarget,
  signatureRequestId: string,
  existing: StoredDealInvestorEsignSend,
): Promise<boolean> {
  const hasPath = (existing.documents ?? []).some((d) =>
    Boolean(d.signedRelativePath?.trim()),
  );
  if (hasPath) return true;
  if (!existing.signedAt?.trim() && !existing.completedAt?.trim()) return false;

  if (getActiveEsignProvider() === "signflow") {
    try {
      const doc = await getSignFlowDocument(signatureRequestId);
      if (!signFlowDocumentInvestorHasSigned(doc)) {
        return false;
      }
    } catch (err) {
      if (isEsignProviderUnreachableError(err)) return false;
      console.warn("ensureSignedPdfStoredForSignedSend (SignFlow check):", err);
      return false;
    }
  }

  try {
    const signedRelativePath = await persistSignedPdf({
      dealId,
      rosterId: target.id,
      signatureRequestId,
      send: existing,
      audience: "investor",
    });
    await updateDealInvestorEsignSend(
      dealId,
      target,
      signatureRequestId,
      (current) => ({
        ...current,
        ...withInvestorSignedPdfFields(current, signedRelativePath),
      }),
    );
    return true;
  } catch (err) {
    if (!isSignFlowInvestorNotSignedError(err)) {
      console.warn("ensureSignedPdfStoredForSignedSend:", err);
    }
    return false;
  }
}

/** Cap Dropbox polls per HTTP request (deal-wide investor list + portal loads). */
const MAX_ESIGN_SYNC_TARGETS_PER_REQUEST = 12;

/**
 * Refresh pending eSign rows from Dropbox before building the Investors tab list.
 */
export async function syncDealInvestorEsignStatusesForDeal(
  dealId: string,
): Promise<void> {
  const id = dealId.trim();
  if (!id) return;

  let synced = 0;

  const investments = await db
    .select({
      id: dealInvestment.id,
      esignStatusJson: dealInvestment.esignStatusJson,
    })
    .from(dealInvestment)
    .where(eq(dealInvestment.dealId, id));

  for (const row of investments) {
    if (synced >= MAX_ESIGN_SYNC_TARGETS_PER_REQUEST) return;
    const bundle = parseEsignStatusBundle(row.esignStatusJson);
    if (!bundle || !esignBundleNeedsDropboxSync(bundle)) continue;
    try {
      await syncDealInvestorEsignByTarget(id, {
        table: "investment",
        id: row.id,
      });
      synced += 1;
    } catch (err) {
      if (isDropboxSignRateLimitError(err)) return;
      if (isEsignProviderUnreachableError(err)) {
        console.warn(
          "syncDealInvestorEsignStatusesForDeal: eSign provider unreachable",
        );
        return;
      }
      throw err;
    }
  }

  const roster = await db
    .select({
      id: dealLpInvestor.id,
      esignStatusJson: dealLpInvestor.esignStatusJson,
    })
    .from(dealLpInvestor)
    .where(eq(dealLpInvestor.dealId, id));

  for (const row of roster) {
    if (synced >= MAX_ESIGN_SYNC_TARGETS_PER_REQUEST) return;
    const bundle = parseEsignStatusBundle(row.esignStatusJson);
    if (!bundle || !esignBundleNeedsDropboxSync(bundle)) continue;
    try {
      await syncDealInvestorEsignByTarget(id, { table: "lp", id: row.id });
      synced += 1;
    } catch (err) {
      if (isDropboxSignRateLimitError(err)) return;
      if (isEsignProviderUnreachableError(err)) {
        console.warn(
          "syncDealInvestorEsignStatusesForDeal: eSign provider unreachable",
        );
        return;
      }
      throw err;
    }
  }
}

/**
 * Poll Dropbox only when this commitment still has incomplete sends.
 * Safe to call from read-only document routes (uses cache + skips completed bundles).
 */
export async function maybeSyncDealInvestorEsignByTarget(
  dealId: string,
  target: InvestorEsignRowTarget,
): Promise<void> {
  const raw = await readInvestorEsignStatusJson(dealId, target);
  const bundle = parseEsignStatusBundle(raw);
  if (
    !bundle ||
    (!esignBundleNeedsDropboxSync(bundle) &&
      !esignBundleNeedsStoredPdfSync(bundle) &&
      !esignBundleNeedsLegacyInvestorPdfRefresh(bundle))
  ) {
    return;
  }
  if (!esignProviderCanSync()) return;

  try {
    await syncDealInvestorEsignByTarget(dealId, target);
  } catch (err) {
    if (isDropboxSignRateLimitError(err)) {
      console.warn("maybeSyncDealInvestorEsignByTarget: rate limited");
      return;
    }
    if (isEsignProviderUnreachableError(err)) {
      console.warn(
        "maybeSyncDealInvestorEsignByTarget: SignFlow unreachable — using last known eSign status",
      );
      return;
    }
    throw err;
  }
}

function dropboxSignersAllSigned(
  signers: DropboxSignatureRequestDetail["signers"],
): boolean {
  if (!signers.length) return false;
  return signers.every((s) => {
    const code = String(s.statusCode ?? "").trim().toLowerCase();
    if (code === "signed") return true;
    return Boolean(s.signedAt?.trim());
  });
}

/**
 * After embedded signing, poll Dropbox until the request is complete and persist
 * `completedAt` so Invest Now / Investors tab show Signed (not stuck on Pending).
 */
/** After embedded `sign` event — persist Signed (and Viewed) without requiring full request complete. */
export async function syncDealInvestorEsignSignProgress(
  dealId: string,
  target: InvestorEsignRowTarget,
  signatureRequestId?: string,
): Promise<void> {
  const id = dealId.trim();
  const sigId = signatureRequestId?.trim();
  if (!id) return;

  if (sigId) {
    await markDealInvestorEsignSignedOptimistic(id, target, sigId);
  }
  await syncDealInvestorEsignByTarget(id, target);
}

/**
 * After embedded `finish` (Invest Now Sign tab) — poll Dropbox until Completed is stored.
 */
export async function syncDealInvestorEsignAfterEmbeddedSign(
  dealId: string,
  target: InvestorEsignRowTarget,
  signatureRequestId?: string,
): Promise<void> {
  const id = dealId.trim();
  const sigId = signatureRequestId?.trim();
  if (!id) return;

  if (sigId) {
    await markDealInvestorEsignSignedOptimistic(id, target, sigId);
  }

  for (let attempt = 0; attempt < EMBED_ESIGN_SYNC_ATTEMPTS; attempt++) {
    await syncDealInvestorEsignByTarget(id, target);

    if (!sigId) return;

    const raw = await readInvestorEsignStatusJson(id, target);
    const bundle = parseEsignStatusBundle(raw);
    const send = bundle
      ? findEsignSendBySignatureRequestId(bundle, sigId)
      : null;
    if (send?.completedAt?.trim()) return;

    if (getActiveEsignProvider() === "signflow") {
      try {
        const summary = await getSignFlowDocumentSummary(sigId);
        if (
          summary.isComplete ||
          signFlowSignersAllSigned(summary.signers) ||
          signFlowSummaryInvestorHasSigned(summary)
        ) {
          await applyProgressFromSignFlow(id, target, sigId, {
            forceComplete: summary.isComplete,
          });
          await syncDealInvestorEsignByTarget(id, target);
          const rawAfter = await readInvestorEsignStatusJson(id, target);
          const bundleAfter = parseEsignStatusBundle(rawAfter);
          const sendAfter = bundleAfter
            ? findEsignSendBySignatureRequestId(bundleAfter, sigId)
            : null;
          if (sendAfter?.completedAt?.trim()) return;
        }
      } catch (err) {
        console.warn("syncDealInvestorEsignAfterEmbeddedSign (SignFlow):", err);
      }
      if (send?.signedAt?.trim()) return;
      if (attempt < EMBED_ESIGN_SYNC_ATTEMPTS - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, EMBED_ESIGN_SYNC_DELAY_MS),
        );
      }
      continue;
    }

    try {
      const summary = await getSignatureRequestDetail(sigId);
      if (summary.isComplete) {
        await applyProgressFromDropbox(id, target, sigId, {
          forceComplete: true,
        });
        return;
      }
      if (dropboxSignersAllSigned(summary.signers)) {
        await applyProgressFromDropbox(id, target, sigId, {
          forceComplete: true,
        });
        return;
      }
    } catch (err) {
      console.warn("syncDealInvestorEsignAfterEmbeddedSign:", err);
    }

    if (attempt < EMBED_ESIGN_SYNC_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, EMBED_ESIGN_SYNC_DELAY_MS));
    }
  }
}

export async function syncDealInvestorEsignByTarget(
  dealId: string,
  target: InvestorEsignRowTarget,
): Promise<boolean> {
  const raw = await readInvestorEsignStatusJson(dealId, target);
  const bundle = parseEsignStatusBundle(raw);
  if (!bundle?.sends.length) return false;

  let changed = false;
  let shouldSyncDocumentsTab = false;
  for (const send of bundle.sends) {
    const signatureRequestId = send.signatureRequestId?.trim();
    if (!signatureRequestId) continue;

    if (!send.completedAt?.trim()) {
      try {
        changed =
          (await applyProgressFromActiveProvider(
            dealId,
            target,
            signatureRequestId,
          )) || changed;
      } catch (err) {
        if (isEsignProviderUnreachableError(err)) {
          console.warn(
            "syncDealInvestorEsignByTarget: eSign provider unreachable",
          );
          return changed;
        }
        throw err;
      }
    }

    const rawFresh = await readInvestorEsignStatusJson(dealId, target);
    const bundleFresh = parseEsignStatusBundle(rawFresh);
    const sendFresh = bundleFresh
      ? findEsignSendBySignatureRequestId(bundleFresh, signatureRequestId)
      : null;
    if (sendFresh?.signedAt?.trim() || sendFresh?.completedAt?.trim()) {
      shouldSyncDocumentsTab = true;
      changed =
        (await ensureSignedPdfStoredForSignedSend(
          dealId,
          target,
          signatureRequestId,
          sendFresh,
        )) || changed;
      changed =
        (await refreshLegacySignFlowInvestorPdfIfNeeded({
          dealId,
          target,
          signatureRequestId,
          send: sendFresh,
        })) !== undefined || changed;
      if (sendFresh.completedAt?.trim()) {
        changed =
          (await ensureFullSignedPdfStoredForCompletedSend(
            dealId,
            target,
            signatureRequestId,
            sendFresh,
          )) || changed;
      }
    }
  }
  if (changed || shouldSyncDocumentsTab) {
    try {
      await syncCompletedEsignDocumentsToDocumentsTab(dealId);
    } catch (err) {
      console.warn("syncCompletedEsignDocumentsToDocumentsTab:", err);
    }
    try {
      await runEsignStageNotificationsForTarget(dealId, target);
    } catch (err) {
      console.warn("runEsignStageNotificationsForTarget:", err);
    }
  }
  return changed;
}

export async function handleDealInvestorEsignWebhook(params: {
  dealId: string;
  rosterId?: string;
  signatureRequestId: string;
  eventType: string;
  eventTime?: string;
}): Promise<void> {
  const dealId = params.dealId.trim();
  const signatureRequestId = params.signatureRequestId.trim();
  if (!dealId || !signatureRequestId) return;

  let target =
    params.rosterId?.trim() ?
      await resolveEsignTargetForInvestorRowId(dealId, params.rosterId.trim())
    : null;
  if (!target) {
    target = await findInvestorEsignTargetBySignatureRequestId(
      dealId,
      signatureRequestId,
    );
  }
  if (!target) return;

  const event = params.eventType.trim().toLowerCase();
  const eventIso =
    params.eventTime?.trim() && !Number.isNaN(Date.parse(params.eventTime))
      ? new Date(params.eventTime).toISOString()
      : new Date().toISOString();

  if (event === "document.viewed" || event === "signature_request_viewed") {
    await updateDealInvestorEsignSend(dealId, target, signatureRequestId, (current) => ({
      ...current,
      viewedAt: current.viewedAt ?? eventIso,
    }));
  }

  const forceComplete =
    event === "signature_request_all_signed" || event === "document.completed";

  if (forceComplete) {
    await applyProgressFromActiveProvider(dealId, target, signatureRequestId, {
      forceComplete: true,
    });
  }
  await syncDealInvestorEsignByTarget(dealId, target);
}

function sendHasStoredOrRecordedSignature(
  send: StoredDealInvestorEsignSend,
): boolean {
  if (send.completedAt?.trim() || send.signedAt?.trim()) return true;
  return (send.documents ?? []).some((d) => Boolean(d.signedRelativePath?.trim()));
}

/** @deprecated Prefer listSignedEsignDocumentsForSend — kept for callers expecting completedAt. */
export function listCompletedEsignDocumentsForSend(
  send: StoredDealInvestorEsignSend,
  signatureRequestId: string,
): Array<{ fileId: string; name: string; url: string | null }> {
  if (!send.completedAt?.trim()) return [];
  return listSignedEsignDocumentsForSend(send, signatureRequestId);
}

function templateFileIdFromCompositeDocId(
  fileId: string,
  signatureRequestId: string,
): string {
  const sig = signatureRequestId.trim();
  const id = fileId.trim();
  if (sig && id.startsWith(`${sig}::`)) {
    return id.slice(sig.length + 2).trim() || id;
  }
  return id;
}

function resolveEsignDocumentListUrl(
  send: StoredDealInvestorEsignSend,
  doc: { fileId: string; url: string | null },
  templates: Awaited<ReturnType<typeof getDealEsignTemplatesState>>,
): string | null {
  const direct = doc.url?.trim();
  if (direct) return uploadPublicUrl(direct) || direct;

  const sig = send.signatureRequestId?.trim() ?? "";
  const rawFileId = templateFileIdFromCompositeDocId(doc.fileId, sig);
  const sendDoc = (send.documents ?? []).find(
    (d) => d.fileId.trim() === rawFileId,
  );
  const sharedSignedPath = (send.documents ?? []).find((d) =>
    Boolean(d.signedRelativePath?.trim()),
  )?.signedRelativePath;
  const fullSignedPath = send.fullSignedRelativePath?.trim() ?? "";
  const signedRel =
    fullSignedPath ||
    sendDoc?.signedRelativePath?.trim() ||
    sharedSignedPath?.trim() ||
    "";
  if (signedRel) return uploadPublicUrl(signedRel);

  const investorSigned = sendHasStoredOrRecordedSignature(send);
  if (investorSigned) {
    return null;
  }

  const template = findEsignTemplateFile(templates, rawFileId);
  const rel =
    sendDoc?.templateRelativePath?.trim() ||
    template?.relativePath?.trim() ||
    "";
  return rel ? uploadPublicUrl(rel) : null;
}

/**
 * Documents sent for eSign on this deal — template previews while pending,
 * combined signed PDF after the investor signs (never the pre-sign preview again).
 */
export async function listMyEsignDocumentsForInvestor(
  dealId: string,
  raw: string | null,
  target?: InvestorEsignRowTarget,
): Promise<MyEsignDocumentListItem[]> {
  let statusRaw = raw;
  if (target) {
    const initial = parseEsignStatusBundle(statusRaw);
    if (initial?.sends.length) {
      for (const send of initial.sends) {
        const sig = send.signatureRequestId?.trim();
        if (!sig) continue;
        if (!send.signedAt?.trim() && !send.completedAt?.trim()) continue;
        const hasPath = (send.documents ?? []).some((d) =>
          Boolean(d.signedRelativePath?.trim()),
        );
        if (!hasPath) {
          await ensureSignedPdfStoredForSignedSend(dealId, target, sig, send);
        } else {
          await refreshLegacySignFlowInvestorPdfIfNeeded({
            dealId,
            target,
            signatureRequestId: sig,
            send,
          });
        }
      }
      statusRaw = await readInvestorEsignStatusJson(dealId, target);
    }
  }

  const bundle = parseEsignStatusBundle(statusRaw);
  if (!bundle?.sends.length) return [];

  const templates = await getDealEsignTemplatesState(dealId);
  const isSequentialQueue = await dealHasSequentialInvestorFirstEsign(dealId);
  const investorFirstCounterSign =
    await dealHasInvestorFirstCounterSignEsign(dealId);
  const allInvestorsGateOpen =
    await sequentialWorkflowInvestorPortalDocsGateOpen(dealId);
  const signTurnOpen = target
    ? (await evaluateDealSequentialInvestorSignAccess(dealId, target)).allowed
    : true;
  const out: MyEsignDocumentListItem[] = [];

  for (const send of bundle.sends) {
    const sig = send.signatureRequestId?.trim() ?? "";
    const categoryId =
      send.categoryId?.trim() ||
      send.documents?.find((d) => d.categoryId?.trim())?.categoryId?.trim() ||
      "";
    const sponsorState = investorFirstCounterSign
      ? await resolveEsignSponsorSignState(send)
      : { sponsorSigned: true, awaitingSponsorSignature: false };

    if (sendHasStoredOrRecordedSignature(send)) {
      const fullyCompleted = Boolean(send.completedAt?.trim());
      const investorSigned = Boolean(send.signedAt?.trim());
      const status =
        fullyCompleted || investorSigned ? ("signed" as const) : ("pending" as const);
      const investorCanSign = status === "pending";
      /** E-signatures tab: show this investor's signed PDF as soon as they sign. */
      const revealDoc = true;
      const canSignNow =
        investorCanSign && signTurnOpen && Boolean(sig);

      if (!revealDoc && !canSignNow) continue;

      const signed = listSignedEsignDocumentsForSend(send, sig, {
        preferFullSignedCopy: sponsorState.sponsorSigned,
      });
      for (const d of signed) {
        out.push({
          fileId: d.fileId,
          name: d.name,
          url: resolveEsignDocumentListUrl(send, d, templates),
          status,
          ...(categoryId ? { categoryId } : {}),
          ...(canSignNow && sig ? { signatureRequestId: sig } : {}),
        });
      }
      continue;
    }

    for (const d of send.documents ?? []) {
      const rawFileId = d.fileId.trim();
      const compositeId = sig && rawFileId ? `${sig}::${rawFileId}` : rawFileId;
      const template = findEsignTemplateFile(templates, rawFileId);
      const rel =
        d.templateRelativePath?.trim() ||
        template?.relativePath?.trim() ||
        "";
      const previewUrl = resolveEsignDocumentListUrl(
        send,
        { fileId: compositeId, url: rel ? uploadPublicUrl(rel) : null },
        templates,
      );
      const canSignNow = Boolean(sig) && signTurnOpen;
      if (isSequentialQueue && !allInvestorsGateOpen && !canSignNow) continue;

      out.push({
        fileId: compositeId,
        name: d.name,
        url: isSequentialQueue && !allInvestorsGateOpen ? null : previewUrl,
        status: "pending",
        ...(categoryId || d.categoryId?.trim()
          ? { categoryId: categoryId || d.categoryId?.trim() }
          : {}),
        ...(canSignNow && sig ? { signatureRequestId: sig } : {}),
      });
    }
  }

  return out;
}

export type InvestorEsignStatusWithDropboxResult = {
  status: DealInvestorEsignStatusApi | null;
  /** One entry per profile template send with sent/viewed/signed/completed timestamps. */
  sends: DealInvestorEsignSendStatusApi[];
  dropbox: DropboxSignatureRequestDetail | null;
  syncedAt: string;
};

export async function commitmentProfileIdForEsignTarget(
  dealId: string,
  target: InvestorEsignRowTarget,
): Promise<string | null> {
  if (target.table === "investment") {
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
    return row?.profileId?.trim() || null;
  }
  const [row] = await db
    .select({ profileId: dealLpInvestor.profileId })
    .from(dealLpInvestor)
    .where(
      and(eq(dealLpInvestor.id, target.id), eq(dealLpInvestor.dealId, dealId)),
    )
    .limit(1);
  return row?.profileId?.trim() || null;
}

/** Sync from Dropbox Sign, persist timestamps, return status for sponsor status popup. */
export async function getInvestorEsignStatusWithDropboxSync(
  dealId: string,
  rosterId: string,
): Promise<InvestorEsignStatusWithDropboxResult> {
  const syncedAt = new Date().toISOString();
  const id = dealId.trim();
  const target = await resolveEsignTargetForInvestorRowId(id, rosterId.trim());
  if (!target) {
    return { status: null, sends: [], dropbox: null, syncedAt };
  }

  const preferredCategoryId = esignCategoryFromCommitmentProfileId(
    await commitmentProfileIdForEsignTarget(id, target),
  );

  const rawInitial = await readInvestorEsignStatusJson(id, target);
  const bundleInitial = parseEsignStatusBundle(rawInitial);
  if (bundleInitial && esignBundleNeedsDropboxSync(bundleInitial) && esignProviderCanSync()) {
    await syncDealInvestorEsignByTarget(id, target);
  }

  const rawAfterSync = await readInvestorEsignStatusJson(id, target);
  const bundleAfterSync = parseEsignStatusBundle(rawAfterSync);
  let sends = bundleAfterSync
    ? esignBundleToSendStatusList(bundleAfterSync)
    : [];

  if (sends.length > 0) {
    sends = await Promise.all(
      sends.map(async (send) => {
        const documents = await enrichEsignDocumentsWithCategories(
          id,
          send.documents,
        );
        return { ...send, documents };
      }),
    );
  }

  let status = parseEsignStatusJson(rawAfterSync, preferredCategoryId);
  if (status?.documents?.length) {
    const documents = await enrichEsignDocumentsWithCategories(
      id,
      status.documents,
    );
    status = { ...status, documents };
  }

  let dropbox: DropboxSignatureRequestDetail | null = null;
  const requestId = status?.signatureRequestId?.trim();
  if (requestId && getDropboxSignConfig()) {
    try {
      dropbox = await getSignatureRequestDetail(requestId);
    } catch (err) {
      console.warn("getSignatureRequestDetail:", err);
    }
  }

  return { status, sends, dropbox, syncedAt };
}
