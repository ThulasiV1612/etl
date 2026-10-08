import { esignSendCategoryMatchesInvestorProfile, ESIGN_UNIFIED_CATEGORY_ID } from "./esignProfileTypes.js";

export interface DealInvestorEsignDocumentRef {
  fileId: string;
  name: string;
  /** eSign template profile folder (individual, llc, …). */
  categoryId?: string;
  /** Template PDF path at send time (preview while pending). */
  templateRelativePath?: string;
  /** Relative path under uploads root after investor completes signing. */
  signedRelativePath?: string;
}

/** One Dropbox Sign request (one investor profile send). */
export interface StoredDealInvestorEsignSend {
  sentAt: string;
  viewedAt?: string | null;
  signedAt?: string | null;
  completedAt?: string | null;
  signatureRequestId?: string;
  signatureId?: string;
  /** Primary profile for this send (from template category). */
  categoryId?: string;
  /** Bumped when stored investor PDF format changes (see persistSignedPdf). */
  investorPdfVersion?: number;
  /** Fully executed PDF (investor + sponsor). Sponsor workspace only. */
  fullSignedRelativePath?: string;
  /** Sponsor notified after investor signed (sequential workflow emails). */
  sponsorNotifiedAtInvestorSigned?: string;
  /** Investor notified after sponsor counter-signed. */
  investorNotifiedAtSponsorSigned?: string;
  /** Sequential workflow: investor notified when prior signers finished and it is their turn. */
  investorNotifiedAtSignTurnAvailable?: string;
  /** Fully executed doc promoted to LP offering documents section. */
  promotedToInvestorDocumentsAt?: string;
  documents?: DealInvestorEsignDocumentRef[];
}

/** v2 — multiple profile sends on one investor row. */
export interface StoredDealInvestorEsignBundle {
  version: 2;
  sends: StoredDealInvestorEsignSend[];
}

/** @deprecated Legacy single-send shape — migrated to bundle on read. */
export interface StoredDealInvestorEsignStatus {
  sentAt: string;
  viewedAt?: string | null;
  signedAt?: string | null;
  completedAt?: string | null;
  signatureRequestId?: string;
  signatureId?: string;
  documents?: DealInvestorEsignDocumentRef[];
}

export interface DealInvestorEsignStatusApi {
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  completedAt: string | null;
  signatureRequestId: string | null;
  signatureId: string | null;
  documents: DealInvestorEsignDocumentRef[];
}

/** Per profile-type send with stage timestamps (Investors eSign status popup). */
export type DealInvestorEsignSendStatusApi = {
  categoryId: string;
  sentAt: string;
  viewedAt: string | null;
  signedAt: string | null;
  completedAt: string | null;
  signatureRequestId: string | null;
  signatureId: string | null;
  documents: DealInvestorEsignDocumentRef[];
};

export function esignBundleToSendStatusList(
  bundle: StoredDealInvestorEsignBundle,
): DealInvestorEsignSendStatusApi[] {
  return bundle.sends
    .filter((s) => s.sentAt?.trim())
    .map((send) => ({
      categoryId: primaryCategoryForSend(send),
      sentAt: send.sentAt,
      viewedAt: send.viewedAt?.trim() || null,
      signedAt: send.signedAt?.trim() || null,
      completedAt: send.completedAt?.trim() || null,
      signatureRequestId: send.signatureRequestId?.trim() || null,
      signatureId: send.signatureId?.trim() || null,
      documents: (send.documents ?? []).map((d) => {
        const sendCompleted = Boolean(send.completedAt?.trim());
        const base = {
          fileId: d.fileId,
          name: d.name,
          categoryId:
            d.categoryId?.trim() || primaryCategoryForSend(send) || undefined,
          ...(d.templateRelativePath?.trim()
            ? { templateRelativePath: d.templateRelativePath.trim() }
            : {}),
        };
        if (sendCompleted && d.signedRelativePath?.trim()) {
          return { ...base, signedRelativePath: d.signedRelativePath.trim() };
        }
        return base;
      }),
    }));
}

function parseDocumentRef(d: unknown): DealInvestorEsignDocumentRef | null {
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const doc = d as Record<string, unknown>;
  const fileId = String(doc.fileId ?? doc.file_id ?? "").trim();
  const name = String(doc.name ?? "").trim();
  if (!fileId || !name) return null;
  const signedRelativePath = String(
    doc.signedRelativePath ?? doc.signed_relative_path ?? "",
  ).trim();
  const categoryId = String(doc.categoryId ?? doc.category_id ?? "").trim();
  const templateRelativePath = String(
    doc.templateRelativePath ?? doc.template_relative_path ?? "",
  ).trim();
  return {
    fileId,
    name,
    ...(categoryId ? { categoryId } : {}),
    ...(templateRelativePath ? { templateRelativePath } : {}),
    ...(signedRelativePath ? { signedRelativePath } : {}),
  };
}

function parseSendRecord(o: Record<string, unknown>): StoredDealInvestorEsignSend | null {
  const sentAt = String(o.sentAt ?? o.sent_at ?? "").trim();
  if (!sentAt) return null;
  const documents = Array.isArray(o.documents)
    ? o.documents
        .map(parseDocumentRef)
        .filter((d): d is DealInvestorEsignDocumentRef => d != null)
    : [];
  const categoryId = String(o.categoryId ?? o.category_id ?? "").trim();
  const investorPdfVersionRaw = o.investorPdfVersion ?? o.investor_pdf_version;
  const investorPdfVersion =
    investorPdfVersionRaw != null && investorPdfVersionRaw !== ""
      ? Number(investorPdfVersionRaw)
      : undefined;
  const fullSignedRelativePath = String(
    o.fullSignedRelativePath ?? o.full_signed_relative_path ?? "",
  ).trim();
  const sponsorNotifiedAtInvestorSigned = String(
    o.sponsorNotifiedAtInvestorSigned ??
      o.sponsor_notified_at_investor_signed ??
      "",
  ).trim();
  const investorNotifiedAtSponsorSigned = String(
    o.investorNotifiedAtSponsorSigned ??
      o.investor_notified_at_sponsor_signed ??
      "",
  ).trim();
  const investorNotifiedAtSignTurnAvailable = String(
    o.investorNotifiedAtSignTurnAvailable ??
      o.investor_notified_at_sign_turn_available ??
      "",
  ).trim();
  const promotedToInvestorDocumentsAt = String(
    o.promotedToInvestorDocumentsAt ?? o.promoted_to_investor_documents_at ?? "",
  ).trim();
  return {
    sentAt,
    viewedAt: o.viewedAt ? String(o.viewedAt).trim() : null,
    signedAt: o.signedAt ? String(o.signedAt).trim() : null,
    completedAt: o.completedAt ? String(o.completedAt).trim() : null,
    signatureRequestId: o.signatureRequestId
      ? String(o.signatureRequestId).trim()
      : undefined,
    signatureId: o.signatureId ? String(o.signatureId).trim() : undefined,
    ...(categoryId ? { categoryId } : {}),
    ...(Number.isFinite(investorPdfVersion)
      ? { investorPdfVersion: investorPdfVersion as number }
      : {}),
    ...(fullSignedRelativePath ? { fullSignedRelativePath } : {}),
    ...(sponsorNotifiedAtInvestorSigned
      ? { sponsorNotifiedAtInvestorSigned }
      : {}),
    ...(investorNotifiedAtSponsorSigned
      ? { investorNotifiedAtSponsorSigned }
      : {}),
    ...(investorNotifiedAtSignTurnAvailable
      ? { investorNotifiedAtSignTurnAvailable }
      : {}),
    ...(promotedToInvestorDocumentsAt ? { promotedToInvestorDocumentsAt } : {}),
    documents,
  };
}

export function primaryCategoryForSend(
  send: StoredDealInvestorEsignSend,
): string {
  const fromSend = send.categoryId?.trim();
  if (fromSend) return fromSend;
  const fromDoc = send.documents?.find((d) => d.categoryId?.trim())?.categoryId;
  return fromDoc?.trim() ?? "";
}

export function parseEsignStatusBundle(
  raw: string | null | undefined,
): StoredDealInvestorEsignBundle | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    const o = JSON.parse(s) as Record<string, unknown>;
    if (o.version === 2 && Array.isArray(o.sends)) {
      const sends = o.sends
        .map((item) =>
          item && typeof item === "object" && !Array.isArray(item)
            ? parseSendRecord(item as Record<string, unknown>)
            : null,
        )
        .filter((x): x is StoredDealInvestorEsignSend => x != null);
      if (sends.length === 0) return null;
      return { version: 2, sends };
    }

    const legacy = parseSendRecord(o);
    if (!legacy) return null;
    return { version: 2, sends: [legacy] };
  } catch {
    return null;
  }
}

export function serializeEsignStatusBundle(
  bundle: StoredDealInvestorEsignBundle,
): string {
  return JSON.stringify(bundle);
}

export function esignCategoryFromCommitmentProfileId(
  profileId: string | null | undefined,
): string | null {
  const p = String(profileId ?? "").trim();
  if (!p) return null;
  if (p === "llc_corp_trust_etc") return "llc";
  if (
    p === "individual" ||
    p === "custodian_ira_401k" ||
    p === "joint_tenancy"
  ) {
    return p;
  }
  return null;
}

const COMMITMENT_PROFILE_LABEL: Record<string, string> = {
  individual: "Individual",
  custodian_ira_401k: "Custodian IRA or custodian based 401(k)",
  joint_tenancy: "Joint tenancy",
  llc_corp_trust_etc:
    "LLC, corp, partnership, trust, solo 401(k), or checkbook IRA",
};

/** Human-readable investor commitment profile for document titles. */
export function commitmentProfileDisplayLabel(
  profileId: string | null | undefined,
): string {
  const p = String(profileId ?? "").trim();
  if (!p) return "—";
  return COMMITMENT_PROFILE_LABEL[p] ?? p;
}

/**
 * Investors tab Signed column: workflow for one profile when `preferredCategoryId`
 * is set; otherwise prefer the newest completed send, then newest pending.
 */
export function pickWorkflowSendForColumn(
  sends: StoredDealInvestorEsignSend[],
  preferredCategoryId?: string | null,
): StoredDealInvestorEsignSend | null {
  const sorted = [...sends]
    .filter((s) => s.sentAt?.trim())
    .sort(
      (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
    );
  if (sorted.length === 0) return null;

  const cat = preferredCategoryId?.trim();
  if (cat) {
    const forCat = sorted.filter((s) =>
      esignSendCategoryMatchesInvestorProfile(primaryCategoryForSend(s), cat),
    );
    if (forCat.length === 0) return null;
    const latestCat = forCat[forCat.length - 1]!;
    if (latestCat.completedAt?.trim()) return latestCat;
    const pendingInCat = forCat.filter((s) => !s.completedAt?.trim());
    return (
      pendingInCat.find((s) => s.signatureRequestId?.trim()) ??
      pendingInCat[pendingInCat.length - 1] ??
      latestCat
    );
  }

  const completed = sorted.filter((s) => Boolean(s.completedAt?.trim()));
  if (completed.length > 0) return completed[completed.length - 1]!;

  const latest = sorted[sorted.length - 1]!;
  const pending = sorted
    .filter((s) => !s.completedAt?.trim())
    .sort(
      (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
    );
  const activePending =
    pending.find((s) => s.signatureRequestId?.trim()) ?? pending[0];
  return activePending ?? latest;
}

/** Flatten all sends for sponsor status UI and investor document lists. */
export function aggregateEsignStatusFromBundle(
  bundle: StoredDealInvestorEsignBundle,
  preferredCategoryId?: string | null,
): DealInvestorEsignStatusApi {
  const sends = [...bundle.sends].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
  );
  const documents: DealInvestorEsignDocumentRef[] = [];
  for (const send of sends) {
    const sig = send.signatureRequestId?.trim() ?? "";
    for (const d of send.documents ?? []) {
      const compositeId =
        sig && d.fileId ? `${sig}::${d.fileId}` : d.fileId;
      const sendCompleted = Boolean(send.completedAt?.trim());
      documents.push({
        ...d,
        fileId: compositeId,
        categoryId: d.categoryId?.trim() || primaryCategoryForSend(send) || undefined,
        ...(sendCompleted && d.signedRelativePath?.trim()
          ? { signedRelativePath: d.signedRelativePath.trim() }
          : sendCompleted
            ? {
                signedRelativePath: send.documents
                  ?.find((x) => x.signedRelativePath?.trim())
                  ?.signedRelativePath?.trim(),
              }
            : {}),
      });
    }
  }

  const workflow = pickWorkflowSendForColumn(sends, preferredCategoryId);
  const sentAt = sends[0]?.sentAt ?? workflow?.sentAt ?? null;
  const allComplete =
    sends.length > 0 && sends.every((s) => Boolean(s.completedAt?.trim()));
  const workflowCompleted = workflow?.completedAt?.trim() ?? null;

  return {
    sentAt,
    viewedAt: workflow?.viewedAt ?? null,
    signedAt: workflow?.signedAt ?? null,
    completedAt: workflowCompleted
      ? workflowCompleted
      : allComplete
        ? sends
            .map((s) => s.completedAt?.trim())
            .filter(Boolean)
            .sort()
            .at(-1) ?? null
        : null,
    signatureRequestId: workflow?.signatureRequestId?.trim() ?? null,
    signatureId: workflow?.signatureId?.trim() ?? null,
    documents,
  };
}

/** Active in-flight send (most recent when multiple profiles are pending). */
export function pickPendingEsignSend(
  sends: StoredDealInvestorEsignSend[],
): StoredDealInvestorEsignSend | null {
  const pending = sends
    .filter((s) => s.sentAt?.trim() && !s.completedAt?.trim())
    .sort(
      (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
    );
  return pending[0] ?? null;
}

/** Newest `sentAt` across all sends in stored JSON (or -1 when none). */
export function latestEsignSentMsFromRawJson(
  raw: string | null | undefined,
): number {
  const bundle = parseEsignStatusBundle(raw);
  if (!bundle?.sends.some((s) => s.sentAt?.trim())) return -1;
  return bundle.sends.reduce((max, s) => {
    const t = new Date(s.sentAt).getTime();
    return t > max && !Number.isNaN(t) ? t : max;
  }, -1);
}

/** Pick the row with the most recent eSign activity for Investors tab / Invest Now. */
export function pickEsignFieldsFromInvestmentRows<
  T extends { docSignedDate?: string | null; esignStatusJson?: string | null },
>(rows: T[]): Pick<T, "docSignedDate" | "esignStatusJson"> {
  let bestMs = -1;
  let docSignedDate: string | null | undefined;
  let esignStatusJson: string | null | undefined;
  for (const r of rows) {
    const ms = latestEsignSentMsFromRawJson(r.esignStatusJson);
    if (ms > bestMs) {
      bestMs = ms;
      esignStatusJson = r.esignStatusJson;
      docSignedDate = r.docSignedDate;
    }
  }
  if (bestMs >= 0) {
    return {
      docSignedDate: docSignedDate ?? null,
      esignStatusJson: esignStatusJson ?? null,
    } as Pick<T, "docSignedDate" | "esignStatusJson">;
  }
  for (const r of rows) {
    const d = r.docSignedDate?.trim();
    if (d) {
      return {
        docSignedDate: r.docSignedDate ?? null,
        esignStatusJson: r.esignStatusJson ?? null,
      } as Pick<T, "docSignedDate" | "esignStatusJson">;
    }
  }
  return {
    docSignedDate: rows[0]?.docSignedDate ?? null,
    esignStatusJson: rows[0]?.esignStatusJson ?? null,
  } as Pick<T, "docSignedDate" | "esignStatusJson">;
}

export function findEsignSendBySignatureRequestId(
  bundle: StoredDealInvestorEsignBundle,
  signatureRequestId: string,
): StoredDealInvestorEsignSend | null {
  const id = signatureRequestId.trim();
  if (!id) return null;
  return (
    bundle.sends.find((s) => s.signatureRequestId?.trim() === id) ?? null
  );
}

/** Whether a send belongs to the given eSign template profile and document set. */
export function sendMatchesCategoryAndFileIds(
  send: StoredDealInvestorEsignSend,
  categoryId: string,
  fileIds: Set<string>,
): boolean {
  const cat = categoryId.trim();
  const sendCat = primaryCategoryForSend(send);
  if (cat && sendCat && !esignSendCategoryMatchesInvestorProfile(sendCat, cat)) {
    return false;
  }

  const sameCategory =
    !send.categoryId?.trim() ||
    esignSendCategoryMatchesInvestorProfile(send.categoryId.trim(), cat) ||
    (send.documents ?? []).every(
      (d) =>
        !d.categoryId?.trim() ||
        esignSendCategoryMatchesInvestorProfile(d.categoryId.trim(), cat),
    );
  if (!sameCategory) return false;

  const docIds = (send.documents ?? [])
    .map((d) => d.fileId.trim())
    .filter(Boolean);
  return (
    docIds.length === fileIds.size &&
    docIds.every((id) => fileIds.has(id))
  );
}

/** Newest send for this investor profile template (category + template file ids). */
export function findEsignSendForCategoryAndFiles(
  bundle: StoredDealInvestorEsignBundle,
  categoryId: string,
  fileIds: Set<string>,
): StoredDealInvestorEsignSend | null {
  const matches = bundle.sends.filter((s) =>
    sendMatchesCategoryAndFileIds(s, categoryId, fileIds),
  );
  if (matches.length === 0) return null;
  return matches.sort(
    (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
  )[0]!;
}

export function esignBundleHasPending(
  bundle: StoredDealInvestorEsignBundle,
): boolean {
  return bundle.sends.some((s) => esignSendInvestorActionPending(s));
}

/** Investor portal: still needs to sign (deal/profile send scoped). */
export function esignSendInvestorActionPending(
  send: Pick<
    StoredDealInvestorEsignSend,
    "sentAt" | "signedAt" | "completedAt"
  >,
): boolean {
  return (
    Boolean(send.sentAt?.trim()) &&
    !send.signedAt?.trim() &&
    !send.completedAt?.trim()
  );
}

/** Investor portal: investor finished signing for this send. */
export function esignSendInvestorActionComplete(
  send: Pick<StoredDealInvestorEsignSend, "signedAt" | "completedAt">,
): boolean {
  return Boolean(send.signedAt?.trim() || send.completedAt?.trim());
}

/**
 * Investor signed and the signed PDF is stored — same criteria as the Documents tab
 * “Investor e signatures” section. When true, sponsor counter-sign may proceed.
 */
export function esignSendReadyForSponsorCounterSign(
  send: StoredDealInvestorEsignSend,
): boolean {
  if (!send.signedAt?.trim()) return false;
  return (send.documents ?? []).some((d) => d.signedRelativePath?.trim());
}

export function esignProfileSendsPendingForInvestor(
  sends: StoredDealInvestorEsignSend[],
): boolean {
  return sends.some((s) => esignSendInvestorActionPending(s));
}

export function esignProfileSendsCompleteForInvestor(
  sends: StoredDealInvestorEsignSend[],
): boolean {
  return (
    sends.length > 0 &&
    sends.every((s) => esignSendInvestorActionComplete(s))
  );
}

/** True when Dropbox should be polled to refresh viewed / signed / completed timestamps. */
export function esignBundleNeedsDropboxSync(
  bundle: StoredDealInvestorEsignBundle,
): boolean {
  return bundle.sends.some(
    (s) =>
      Boolean(s.sentAt?.trim()) &&
      Boolean(s.signatureRequestId?.trim()) &&
      !s.completedAt?.trim(),
  );
}

/** True when the investor signed but the signed PDF has not been stored locally yet. */
export function esignBundleNeedsStoredPdfSync(
  bundle: StoredDealInvestorEsignBundle,
): boolean {
  return bundle.sends.some((s) => {
    if (!s.signedAt?.trim() && !s.completedAt?.trim()) return false;
    return !(s.documents ?? []).some((d) => d.signedRelativePath?.trim());
  });
}

export function esignBundleIsAllCompleted(
  bundle: StoredDealInvestorEsignBundle,
): boolean {
  return (
    bundle.sends.length > 0 &&
    bundle.sends.every((s) => Boolean(s.completedAt?.trim()))
  );
}

/** True when stored investment eSign workflow is fully completed (fund approval gate). */
export function dealInvestmentEsignIsFullyCompleted(params: {
  esignStatusJson?: string | null;
  docSignedDate?: string | null;
  profileId?: string | null;
}): boolean {
  const bundle = parseEsignStatusBundle(params.esignStatusJson);
  if (bundle && bundle.sends.length > 0) {
    return esignBundleIsAllCompleted(bundle);
  }

  const categoryId = esignCategoryFromCommitmentProfileId(params.profileId);
  const api = parseEsignStatusJson(params.esignStatusJson, categoryId);
  if (api?.completedAt?.trim()) return true;

  const doc = String(params.docSignedDate ?? "").trim().toLowerCase();
  return doc === "completed";
}

export function appendEsignSendToBundle(
  bundle: StoredDealInvestorEsignBundle,
  params: {
    documents: DealInvestorEsignDocumentRef[];
    signatureRequestId?: string;
    signatureId?: string;
  },
): StoredDealInvestorEsignBundle {
  const documents = params.documents.filter(
    (d) => d.fileId.trim() && d.name.trim(),
  );
  const categoryId = primaryCategoryForSend({ documents, sentAt: "" });

  const kept = bundle.sends.filter((s) => {
    if (s.completedAt?.trim()) return true;
    const sendCat = primaryCategoryForSend(s);
    if (!sendCat || !categoryId) return sendCat !== categoryId;
    if (sendCat === categoryId) return false;
    if (
      sendCat === ESIGN_UNIFIED_CATEGORY_ID ||
      categoryId === ESIGN_UNIFIED_CATEGORY_ID
    ) {
      return false;
    }
    return true;
  });

  const newSend: StoredDealInvestorEsignSend = {
    sentAt: new Date().toISOString(),
    viewedAt: null,
    signedAt: null,
    completedAt: null,
    signatureRequestId: params.signatureRequestId?.trim() || undefined,
    signatureId: params.signatureId?.trim() || undefined,
    ...(categoryId ? { categoryId } : {}),
    documents,
  };

  return {
    version: 2,
    sends: [...kept, newSend],
  };
}

export function buildEsignStatusJsonOnSent(params: {
  documents: DealInvestorEsignDocumentRef[];
  signatureRequestId?: string;
  signatureId?: string;
}): string {
  const bundle = appendEsignSendToBundle({ version: 2, sends: [] }, params);
  return serializeEsignStatusBundle(bundle);
}

export function parseEsignStatusJson(
  raw: string | null | undefined,
  preferredCategoryId?: string | null,
): DealInvestorEsignStatusApi | null {
  const bundle = parseEsignStatusBundle(raw);
  if (!bundle?.sends.length) return null;
  return aggregateEsignStatusFromBundle(bundle, preferredCategoryId);
}

/** Investors tab Signed column label from stored eSign workflow timestamps. */
export function esignSignedColumnLabelFromApi(
  api: DealInvestorEsignStatusApi | null,
): string | null {
  if (!api?.sentAt?.trim()) return null;
  if (api.completedAt?.trim()) return "Completed";
  if (api.signedAt?.trim()) return "Signed";
  if (api.viewedAt?.trim()) return "Viewed";
  return "Sent";
}

/** @deprecated Use serializeEsignStatusBundle */
export function serializeEsignStatusJson(
  status: StoredDealInvestorEsignStatus,
): string {
  return JSON.stringify(status);
}
