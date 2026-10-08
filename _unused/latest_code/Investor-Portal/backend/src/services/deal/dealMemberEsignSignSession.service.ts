import { and, eq } from "drizzle-orm";
import { getActiveEsignProvider } from "../../config/esignProvider.config.js";
import { getSignFlowPublicConfig } from "../../config/signflow.config.js";
import {
  findEsignSendBySignatureRequestId,
  parseEsignStatusBundle,
  pickPendingEsignSend,
} from "../../constants/deal-investor-esign-status.js";
import { portalProfileIdToSignFlowProfileType } from "../../constants/esignProfileTypes.js";
import { db } from "../../database/db.js";
import { dealInvestment } from "../../schema/deal.schema/deal-investment.schema.js";
import { getDealEsignDropboxSignPublicConfig } from "./dealEsignDropboxSign.service.js";
import {
  createSignFlowEmbedSigningSession,
  evaluateSignFlowRecipientSignAccess,
  getSignFlowDocument,
  mapSignFlowEmbedSessionError,
  resolveSignFlowInvestorRecipientId,
} from "../esign/signflow.service.js";
import {
  findInvestorEsignTargetForInvestNowCommitment,
  investorEsignTargetHasPositiveCommitment,
  markDealInvestorEsignViewed,
  readInvestorEsignStatusJson,
  resolveInvestorEsignTargetForSignedInInvestor,
  type InvestNowEsignTargetOpts,
  type InvestorEsignRowTarget,
} from "./dealMemberEsignStatus.service.js";
import {
  getEmbeddedSignUrl,
  getFirstSignatureIdFromRequest,
} from "../esign/dropboxSign.service.js";

import { sendMyInvestNowEsignIfNeeded } from "./dealLpInvestNowMyEsignSend.service.js";
import { evaluateDealSequentialInvestorSignAccess } from "./dealSequentialEsignWorkflow.service.js";

export type DealMyEsignSignSessionResult =
  | {
      ok: true;
      alreadyCompleted: boolean;
      provider: "signflow" | "dropbox";
      signUrl: string | null;
      clientId: string | null;
      testMode: boolean;
      configured: boolean;
      signatureRequestId?: string | null;
      embedApiKey?: string | null;
      appBaseUrl?: string | null;
      documentId?: string | null;
    }
  | { ok: false; code: "not_found" | "not_pending" | "not_configured" | "waiting_for_prior_signer"; message: string; waitingFor?: "sponsor" | "investor" | "prior_investor" };

async function resolveSignatureIdForSend(
  send: { signatureId?: string; signatureRequestId?: string },
): Promise<string | null> {
  const stored = send.signatureId?.trim();
  if (stored) return stored;

  const requestId = send.signatureRequestId?.trim();
  if (!requestId) return null;
  return getFirstSignatureIdFromRequest(requestId);
}

/**
 * Fresh embedded sign session for the signed-in investor (portal iframe flow).
 */
export async function getDealMyEsignSignSession(params: {
  dealId: string;
  email: string;
  userId: string;
  signatureRequestId?: string;
} & Pick<
  InvestNowEsignTargetOpts,
  "userInvestorProfileId" | "investmentId" | "profileId"
>): Promise<DealMyEsignSignSessionResult> {
  const provider = getActiveEsignProvider();
  const signFlowCfg = getSignFlowPublicConfig();
  const dropboxCfg = getDealEsignDropboxSignPublicConfig();

  if (!provider) {
    return {
      ok: false,
      code: "not_configured",
      message: "eSign is not configured on the server",
    };
  }

  const dealId = params.dealId.trim();
  const email = params.email.trim().toLowerCase();
  const userId = params.userId;

  const scopeOpts: InvestNowEsignTargetOpts = {
    email,
    userId,
    userInvestorProfileId: params.userInvestorProfileId,
    investmentId: params.investmentId,
    profileId: params.profileId,
  };

  let target: InvestorEsignRowTarget | null =
    await resolveInvestorEsignTargetForSignedInInvestor(dealId, scopeOpts);

  const commitmentTarget = await findInvestorEsignTargetForInvestNowCommitment(
    dealId,
    scopeOpts,
  );

  if (!target) {
    return {
      ok: false,
      code: "not_found",
      message: "No eSign request found for your account on this deal",
    };
  }

  if (!(await investorEsignTargetHasPositiveCommitment(dealId, target))) {
    return {
      ok: false,
      code: "not_found",
      message:
        "Commit an investment amount on this deal before signing eSign documents",
    };
  }

  let raw = await readInvestorEsignStatusJson(dealId, target);
  let bundle = parseEsignStatusBundle(raw);
  if (!bundle?.sends.length && commitmentTarget) {
    let profileId = String(params.profileId ?? "").trim();
    let userInvestorProfileId = String(
      params.userInvestorProfileId ?? "",
    ).trim();
    if (commitmentTarget.table === "investment") {
      const [invProfile] = await db
        .select({
          profileId: dealInvestment.profileId,
          userInvestorProfileId: dealInvestment.userInvestorProfileId,
        })
        .from(dealInvestment)
        .where(
          and(
            eq(dealInvestment.id, commitmentTarget.id),
            eq(dealInvestment.dealId, dealId),
          ),
        )
        .limit(1);
      if (!profileId) {
        profileId = String(invProfile?.profileId ?? "").trim();
      }
      if (!userInvestorProfileId) {
        userInvestorProfileId = String(
          invProfile?.userInvestorProfileId ?? "",
        ).trim();
      }
    }
    if (profileId) {
      const sent = await sendMyInvestNowEsignIfNeeded({
        dealId,
        viewerEmail: email,
        viewerUserId: userId,
        profileId,
        userInvestorProfileId: userInvestorProfileId || undefined,
        investmentId:
          commitmentTarget.table === "investment"
            ? commitmentTarget.id
            : undefined,
      });
      if (sent.ok && commitmentTarget) {
        target = commitmentTarget;
        raw = await readInvestorEsignStatusJson(dealId, target);
        bundle = parseEsignStatusBundle(raw);
      }
    }
  }

  if (!bundle?.sends.length) {
    return {
      ok: false,
      code: "not_pending",
      message: "No pending eSign documents for this deal",
    };
  }

  const requestedId = params.signatureRequestId?.trim();
  let send = requestedId
    ? findEsignSendBySignatureRequestId(bundle, requestedId)
    : pickPendingEsignSend(bundle.sends);

  if (!send?.sentAt) {
    return {
      ok: false,
      code: "not_pending",
      message: "No pending eSign documents for this deal",
    };
  }

  const sigId = send.signatureRequestId?.trim() ?? "";

  const sequentialAccess = await evaluateDealSequentialInvestorSignAccess(
    dealId,
    target,
  );
  if (!sequentialAccess.allowed) {
    return {
      ok: false,
      code: "waiting_for_prior_signer",
      message: sequentialAccess.message,
      waitingFor: "prior_investor",
    };
  }

  if (send.completedAt?.trim()) {
    return {
      ok: true,
      alreadyCompleted: true,
      provider: provider ?? "dropbox",
      signUrl: null,
      clientId: provider === "signflow" ? null : dropboxCfg.clientId,
      testMode:
        provider === "signflow" ? signFlowCfg.testMode : dropboxCfg.testMode,
      configured: true,
      signatureRequestId: sigId || null,
      embedApiKey: provider === "signflow" ? signFlowCfg.embedApiKey : null,
      appBaseUrl: provider === "signflow" ? signFlowCfg.appBaseUrl : null,
      documentId: sigId || null,
    };
  }

  if (provider === "signflow") {
    if (!sigId) {
      return {
        ok: false,
        code: "not_pending",
        message: "Could not resolve your SignFlow signing session. Ask your sponsor to resend.",
      };
    }
    if (sigId && target) {
      await markDealInvestorEsignViewed(params.dealId, target, sigId);
    }

    let liveDoc;
    try {
      liveDoc = await getSignFlowDocument(sigId);
    } catch (err) {
      console.warn("getSignFlowDocument (sign session):", err);
      const mapped = mapSignFlowEmbedSessionError(err, signFlowCfg.baseUrl);
      return {
        ok: false,
        code: mapped.code,
        message: mapped.message,
        ...(mapped.waitingFor ? { waitingFor: mapped.waitingFor } : {}),
      };
    }

    const access = evaluateSignFlowRecipientSignAccess(liveDoc, email);
    if (!access.allowed) {
      return {
        ok: false,
        code: "waiting_for_prior_signer",
        message: access.message,
        waitingFor: access.waitingFor,
      };
    }

    try {
      let resolvedCommitmentProfileId = String(params.profileId ?? "").trim();
      if (
        !resolvedCommitmentProfileId &&
        commitmentTarget?.table === "investment"
      ) {
        const [invProfile] = await db
          .select({ profileId: dealInvestment.profileId })
          .from(dealInvestment)
          .where(
            and(
              eq(dealInvestment.id, commitmentTarget.id),
              eq(dealInvestment.dealId, dealId),
            ),
          )
          .limit(1);
        resolvedCommitmentProfileId = String(invProfile?.profileId ?? "").trim();
      }
      const investorProfileType = portalProfileIdToSignFlowProfileType(
        resolvedCommitmentProfileId,
      );
      const investorRecipientId = resolveSignFlowInvestorRecipientId(liveDoc);
      const session = await createSignFlowEmbedSigningSession({
        documentId: sigId,
        recipientEmail: email,
        recipientId: investorRecipientId,
        ...(investorProfileType
          ? { profileType: investorProfileType }
          : {}),
      });
      return {
        ok: true,
        alreadyCompleted: false,
        provider: "signflow",
        signUrl: session.signUrl,
        clientId: null,
        testMode: signFlowCfg.testMode,
        configured: signFlowCfg.configured,
        signatureRequestId: sigId,
        embedApiKey: signFlowCfg.embedApiKey,
        appBaseUrl: signFlowCfg.appBaseUrl,
        documentId: sigId,
      };
    } catch (err) {
      console.warn("createSignFlowEmbedSigningSession:", err);
      const mapped = mapSignFlowEmbedSessionError(err, signFlowCfg.baseUrl);
      return {
        ok: false,
        code: mapped.code,
        message: mapped.message,
        ...(mapped.waitingFor ? { waitingFor: mapped.waitingFor } : {}),
      };
    }
  }

  const signatureId = await resolveSignatureIdForSend(send);
  if (!signatureId) {
    return {
      ok: false,
      code: "not_pending",
      message: "Could not resolve your eSign signing session. Ask your sponsor to resend.",
    };
  }

  try {
    const { signUrl } = await getEmbeddedSignUrl(signatureId);
    if (sigId && target) {
      await markDealInvestorEsignViewed(params.dealId, target, sigId);
    }
    return {
      ok: true,
      alreadyCompleted: false,
      provider: "dropbox",
      signUrl,
      clientId: dropboxCfg.clientId,
      testMode: dropboxCfg.testMode,
      configured: dropboxCfg.configured,
      signatureRequestId: sigId || null,
    };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Could not load signing session";
    return { ok: false, code: "not_pending", message: msg };
  }
}
