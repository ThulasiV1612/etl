import { and, desc, eq } from "drizzle-orm";
import {
  type InvestmentSignatureStatus,
  mapEsignWebhookEventToInvestmentSignatureStatus,
  maxInvestmentSignatureStatus,
} from "../../constants/investment-signature-status.js";
import { db } from "../../database/db.js";
import { dealInvestment } from "../../schema/deal.schema/deal-investment.schema.js";
import { dealLpInvestor } from "../../schema/deal.schema/deal-lp-investor.schema.js";
import { investmentSignatures } from "../../schema/deal.schema/investment-signatures.schema.js";
import type { InvestorEsignRowTarget } from "../deal/dealMemberEsignStatus.service.js";

export type InvestmentSignStatusApi = {
  status: InvestmentSignatureStatus;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  completed_at: string | null;
  signature_request_id: string | null;
};

function isoOrNull(d: Date | null | undefined): string | null {
  if (!d) return null;
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return null;
  return d.toISOString();
}

function serializeDropboxResponse(
  existing: string | null | undefined,
  patch: Record<string, unknown>,
): string {
  let prior: Record<string, unknown> = {};
  if (existing?.trim()) {
    try {
      const parsed = JSON.parse(existing) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        prior = parsed as Record<string, unknown>;
      }
    } catch {
      prior = { previousRaw: existing };
    }
  }
  return JSON.stringify({
    ...prior,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

/** Resolve `deal_investment.id` for an eSign roster target (Invest Now). */
export async function resolveInvestmentIdForEsignTarget(
  dealId: string,
  target: InvestorEsignRowTarget,
): Promise<string | null> {
  if (target.table === "investment") return target.id.trim() || null;

  const [lp] = await db
    .select({
      contactMemberId: dealLpInvestor.contactMemberId,
    })
    .from(dealLpInvestor)
    .where(
      and(
        eq(dealLpInvestor.id, target.id),
        eq(dealLpInvestor.dealId, dealId),
      ),
    )
    .limit(1);

  const contactId = String(lp?.contactMemberId ?? "").trim();
  if (!contactId) return null;

  const rows = await db
    .select({ id: dealInvestment.id })
    .from(dealInvestment)
    .where(
      and(
        eq(dealInvestment.dealId, dealId),
        eq(dealInvestment.contactId, contactId),
      ),
    )
    .orderBy(desc(dealInvestment.createdAt))
    .limit(1);

  return rows[0]?.id?.trim() || null;
}

export async function findInvestmentSignatureByRequestId(
  signatureRequestId: string,
) {
  const sigId = signatureRequestId.trim();
  if (!sigId) return null;

  const [row] = await db
    .select()
    .from(investmentSignatures)
    .where(eq(investmentSignatures.signatureRequestId, sigId))
    .limit(1);

  return row ?? null;
}

export async function findLatestInvestmentSignatureForInvestment(
  investmentId: string,
) {
  const id = investmentId.trim();
  if (!id) return null;

  const [row] = await db
    .select()
    .from(investmentSignatures)
    .where(eq(investmentSignatures.investmentId, id))
    .orderBy(desc(investmentSignatures.sentAt), desc(investmentSignatures.createdAt))
    .limit(1);

  return row ?? null;
}

export function toInvestmentSignStatusApi(
  row: typeof investmentSignatures.$inferSelect,
): InvestmentSignStatusApi {
  const statusRaw = String(row.status ?? "").trim();
  const status: InvestmentSignatureStatus =
    statusRaw === "Viewed" ||
    statusRaw === "Signed" ||
    statusRaw === "Completed"
      ? statusRaw
      : "Sent";

  return {
    status,
    sent_at: isoOrNull(row.sentAt),
    viewed_at: isoOrNull(row.viewedAt),
    signed_at: isoOrNull(row.signedAt),
    completed_at: isoOrNull(row.completedAt),
    signature_request_id: row.signatureRequestId?.trim() || null,
  };
}

/** Persist a new Dropbox Sign request when Invest Now (or sponsor send) creates one. */
export async function recordInvestmentSignatureOnCreate(params: {
  investmentId: string;
  investorId: string;
  signatureRequestId: string;
  signUrl?: string | null;
  dropboxResponse?: unknown;
}): Promise<void> {
  const investmentId = params.investmentId.trim();
  const signatureRequestId = params.signatureRequestId.trim();
  if (!investmentId || !signatureRequestId) return;

  const now = new Date();
  const dropboxResponse = serializeDropboxResponse(null, {
    source: "create",
    payload: params.dropboxResponse ?? null,
  });

  const existing = await findInvestmentSignatureByRequestId(signatureRequestId);
  if (existing) {
    await db
      .update(investmentSignatures)
      .set({
        signUrl: params.signUrl?.trim() || existing.signUrl,
        dropboxResponse: serializeDropboxResponse(existing.dropboxResponse, {
          source: "create_refresh",
          payload: params.dropboxResponse ?? null,
        }),
        updatedAt: now,
      })
      .where(eq(investmentSignatures.id, existing.id));
    return;
  }

  await db.insert(investmentSignatures).values({
    investmentId,
    investorId: params.investorId.trim(),
    signatureRequestId,
    status: "Sent",
    signUrl: params.signUrl?.trim() || null,
    sentAt: now,
    dropboxResponse,
    createdAt: now,
    updatedAt: now,
  });
}

/** Apply a verified eSign webhook event to `investment_signatures`. */
export async function applyInvestmentSignatureWebhookEvent(params: {
  signatureRequestId: string;
  eventType: string;
  webhookPayload: unknown;
  eventTime?: string;
}): Promise<{ updated: boolean; investmentId: string | null }> {
  const signatureRequestId = params.signatureRequestId.trim();
  const mapped = mapEsignWebhookEventToInvestmentSignatureStatus(params.eventType);
  if (!signatureRequestId || !mapped) {
    return { updated: false, investmentId: null };
  }

  const row = await findInvestmentSignatureByRequestId(signatureRequestId);
  if (!row) {
    console.warn(
      "[investment_signatures] webhook: no row for signature_request_id",
      signatureRequestId,
      params.eventType,
    );
    return { updated: false, investmentId: null };
  }

  const currentStatus = toInvestmentSignStatusApi(row).status;
  const nextStatus = maxInvestmentSignatureStatus(currentStatus, mapped);
  const now = new Date();
  const eventIso =
    params.eventTime?.trim() && !Number.isNaN(Date.parse(params.eventTime))
      ? new Date(params.eventTime).toISOString()
      : now.toISOString();

  const patch: Partial<typeof investmentSignatures.$inferInsert> = {
    status: nextStatus,
    dropboxResponse: serializeDropboxResponse(row.dropboxResponse, {
      lastEventType: params.eventType,
      lastEventTime: eventIso,
      lastWebhook: params.webhookPayload,
    }),
    updatedAt: now,
  };

  if (mapped === "Sent" && !row.sentAt) {
    patch.sentAt = now;
  }
  if (
    (mapped === "Viewed" || mapped === "Signed" || mapped === "Completed") &&
    !row.viewedAt
  ) {
    patch.viewedAt = new Date(eventIso);
  }
  if (
    (mapped === "Signed" || mapped === "Completed") &&
    !row.signedAt
  ) {
    patch.signedAt = new Date(eventIso);
  }
  if (mapped === "Completed" && !row.completedAt) {
    patch.completedAt = new Date(eventIso);
  }

  await db
    .update(investmentSignatures)
    .set(patch)
    .where(eq(investmentSignatures.id, row.id));

  return { updated: true, investmentId: row.investmentId };
}

export async function getInvestmentSignStatus(
  investmentId: string,
): Promise<InvestmentSignStatusApi | null> {
  const row = await findLatestInvestmentSignatureForInvestment(investmentId);
  if (!row) return null;
  return toInvestmentSignStatusApi(row);
}
