import { getActiveEsignProvider } from "../../config/esignProvider.config.js";
import { getSignFlowPublicConfig } from "../../config/signflow.config.js";
import {
  findEsignSendBySignatureRequestId,
  esignSendReadyForSponsorCounterSign,
  parseEsignStatusBundle,
} from "../../constants/deal-investor-esign-status.js";
import { getDealEsignDropboxSignPublicConfig } from "./dealEsignDropboxSign.service.js";
import {
  assignSignFlowDocumentSponsorSigner,
  listDealSponsorSignerOptions,
  resolveDealMemberSignerByRowId,
  type DealMemberSignerOption,
} from "./dealEsignSigningWorkflow.service.js";
import { esignSignatureRequestVisibleInDocumentsTab } from "./dealEsignDocumentsWorkspaceSync.service.js";
import {
  buildSignFlowSignerEmbedUrl,
  createSignFlowSponsorEmbedSigningSession,
  evaluateSignFlowRecipientSignAccess,
  getSignFlowDocument,
  signFlowAnySponsorHasSigned,
  signFlowCounterSignRequiresInvestorSigned,
  signFlowInvestorPhaseComplete,
  signFlowTemplateHasSponsorFields,
} from "../esign/signflow.service.js";
import { syncDealInvestorEsignByTarget } from "./dealMemberEsignCompletion.service.js";
import {
  findInvestorEsignContextBySignatureRequestId,
  readInvestorEsignStatusJson,
} from "./dealMemberEsignStatus.service.js";
import {
  isPortalUserLeadOrAdminSponsorOnDeal,
  isPortalUserSponsorOnDeal,
} from "./dealMemberScope.service.js";
import { getEmbeddedSignUrl, getFirstSignatureIdFromRequest } from "../esign/dropboxSign.service.js";

/** True when sponsor counter-sign must wait for investor signature (sequential investor-first). */
async function sponsorCounterSignRequiresInvestorSigned(
  signatureRequestId: string,
): Promise<boolean> {
  const sigId = signatureRequestId.trim();
  if (!sigId) return true;
  try {
    const doc = await getSignFlowDocument(sigId);
    return signFlowCounterSignRequiresInvestorSigned(doc);
  } catch {
    return true;
  }
}

export type DealSponsorEsignSignSessionResult =
  | {
      ok: true;
      alreadyCompleted: boolean;
      needsSignerSelection?: boolean;
      provider: "signflow" | "dropbox";
      signUrl: string | null;
      clientId: string | null;
      testMode: boolean;
      configured: boolean;
      signatureRequestId: string;
      embedApiKey?: string | null;
      appBaseUrl?: string | null;
      documentId?: string | null;
      canAssignSigner: boolean;
      signerOptions: DealMemberSignerOption[];
      assignedSignerEmail: string;
      assignedSignerName: string;
    }
  | {
      ok: false;
      code:
        | "not_found"
        | "not_configured"
        | "forbidden"
        | "not_ready"
        | "waiting_for_prior_signer";
      message: string;
      waitingFor?: "sponsor" | "investor";
    };

async function resolveSponsorSignerForSession(params: {
  dealId: string;
  sponsorUserId: string;
  sponsorEmail: string;
  assigneeMemberRowId?: string;
}): Promise<
  | { ok: true; signer: { email: string; name: string } }
  | { ok: false; code: "forbidden" | "not_found"; message: string }
> {
  const dealId = params.dealId.trim();
  const sponsorEmail = params.sponsorEmail.trim().toLowerCase();
  const assigneeId = params.assigneeMemberRowId?.trim();

  if (assigneeId) {
    const canAssign = await isPortalUserLeadOrAdminSponsorOnDeal(
      dealId,
      params.sponsorUserId,
    );
    if (!canAssign) {
      return {
        ok: false,
        code: "forbidden",
        message: "Only the lead sponsor or admin sponsor can assign who signs",
      };
    }
    const assignee = await resolveDealMemberSignerByRowId(dealId, assigneeId);
    if (!assignee) {
      return {
        ok: false,
        code: "not_found",
        message: "Selected deal member cannot sign this document",
      };
    }
    return { ok: true, signer: assignee };
  }

  const options = await listDealSponsorSignerOptions(dealId);
  const self = options.find((o) => o.email === sponsorEmail);
  if (self) {
    return { ok: true, signer: { email: self.email, name: self.name } };
  }

  const leadDefault = options[0];
  if (leadDefault) {
    return {
      ok: true,
      signer: { email: leadDefault.email, name: leadDefault.name },
    };
  }

  return {
    ok: false,
    code: "not_found",
    message: "No sponsor signer is available for this deal",
  };
}

/**
 * Embedded sign session for sponsor counter-signature on investor-completed eSign docs.
 */
export async function getDealSponsorEsignSignSession(params: {
  dealId: string;
  sponsorUserId: string;
  sponsorEmail: string;
  signatureRequestId: string;
  assigneeMemberRowId?: string;
}): Promise<DealSponsorEsignSignSessionResult> {
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
  const sigId = params.signatureRequestId.trim();
  let assigneeMemberRowId = params.assigneeMemberRowId?.trim() ?? "";
  if (!dealId || !sigId) {
    return {
      ok: false,
      code: "not_found",
      message: "Missing deal or signature request",
    };
  }

  const isSponsor = await isPortalUserSponsorOnDeal(dealId, params.sponsorUserId);
  if (!isSponsor) {
    return {
      ok: false,
      code: "forbidden",
      message: "Only deal sponsors can counter-sign investor eSign documents",
    };
  }

  const context = await findInvestorEsignContextBySignatureRequestId(sigId);
  if (!context || context.dealId !== dealId) {
    return {
      ok: false,
      code: "not_found",
      message: "eSign document not found on this deal",
    };
  }

  const rawBeforeSync = await readInvestorEsignStatusJson(dealId, context.target);
  const bundleBeforeSync = parseEsignStatusBundle(rawBeforeSync);
  const sendBeforeSync = bundleBeforeSync
    ? findEsignSendBySignatureRequestId(bundleBeforeSync, sigId)
    : null;
  const visibleInDocumentsTab =
    await esignSignatureRequestVisibleInDocumentsTab(dealId, sigId);
  const portalInvestorSigned =
    visibleInDocumentsTab ||
    (sendBeforeSync != null &&
      esignSendReadyForSponsorCounterSign(sendBeforeSync));

  try {
    await syncDealInvestorEsignByTarget(dealId, context.target);
  } catch (err) {
    console.warn("getDealSponsorEsignSignSession pre-sync:", err);
  }

  const raw = await readInvestorEsignStatusJson(dealId, context.target);
  const bundle = parseEsignStatusBundle(raw);
  const send = bundle
    ? findEsignSendBySignatureRequestId(bundle, sigId)
    : null;
  if (!send?.sentAt?.trim()) {
    return {
      ok: false,
      code: "not_ready",
      message: "This eSign request has not been sent yet",
    };
  }

  const portalReadyForSponsor =
    portalInvestorSigned ||
    visibleInDocumentsTab ||
    esignSendReadyForSponsorCounterSign(send);

  let investorSigned = portalReadyForSponsor;
  let requiresInvestorFirst = false;

  if (!portalReadyForSponsor) {
    investorSigned = esignSendReadyForSponsorCounterSign(send);
    requiresInvestorFirst =
      provider !== "signflow"
        ? true
        : await sponsorCounterSignRequiresInvestorSigned(sigId);

    if (provider === "signflow") {
      try {
        const liveDoc = await getSignFlowDocument(sigId);
        investorSigned =
          investorSigned || signFlowInvestorPhaseComplete(liveDoc);
        requiresInvestorFirst =
          signFlowCounterSignRequiresInvestorSigned(liveDoc);
        if (investorSigned) {
          await syncDealInvestorEsignByTarget(dealId, context.target);
        }
      } catch (err) {
        console.warn("getDealSponsorEsignSignSession investor sign check:", err);
      }
    }
  }

  if (!portalReadyForSponsor && !investorSigned && requiresInvestorFirst) {
    return {
      ok: false,
      code: "waiting_for_prior_signer",
      message:
        "At least one investor must sign first. Sponsor signing will open after an investor completes their signature.",
      waitingFor: "investor",
    };
  }

  if (send.completedAt?.trim()) {
    let sponsorStillPending = false;
    if (provider === "signflow") {
      try {
        const liveDoc = await getSignFlowDocument(sigId);
        sponsorStillPending =
          signFlowTemplateHasSponsorFields(liveDoc) &&
          !signFlowAnySponsorHasSigned(liveDoc);
      } catch (err) {
        console.warn("getDealSponsorEsignSignSession completion check:", err);
      }
    }
    if (!sponsorStillPending) {
      const canAssign = await isPortalUserLeadOrAdminSponsorOnDeal(
        dealId,
        params.sponsorUserId,
      );
      const signerOptions = canAssign
        ? await listDealSponsorSignerOptions(dealId)
        : [];
      return {
        ok: true,
        alreadyCompleted: true,
        provider: provider ?? "dropbox",
        signUrl: null,
        clientId: provider === "signflow" ? null : dropboxCfg.clientId,
        testMode:
          provider === "signflow" ? signFlowCfg.testMode : dropboxCfg.testMode,
        configured: true,
        signatureRequestId: sigId,
        embedApiKey: provider === "signflow" ? signFlowCfg.embedApiKey : null,
        appBaseUrl: provider === "signflow" ? signFlowCfg.appBaseUrl : null,
        documentId: sigId,
        canAssignSigner: canAssign,
        signerOptions,
        assignedSignerEmail: "",
        assignedSignerName: "",
      };
    }
  }

  const canAssign = await isPortalUserLeadOrAdminSponsorOnDeal(
    dealId,
    params.sponsorUserId,
  );
  const signerOptions = canAssign
    ? await listDealSponsorSignerOptions(dealId)
    : [];

  if (canAssign && !assigneeMemberRowId) {
    if (signerOptions.length === 1) {
      assigneeMemberRowId = signerOptions[0]!.rowId;
    } else if (signerOptions.length > 1) {
      return {
        ok: true,
        alreadyCompleted: false,
        needsSignerSelection: true,
        provider: provider ?? "dropbox",
        signUrl: null,
        clientId: provider === "signflow" ? null : dropboxCfg.clientId,
        testMode:
          provider === "signflow" ? signFlowCfg.testMode : dropboxCfg.testMode,
        configured: true,
        signatureRequestId: sigId,
        embedApiKey: provider === "signflow" ? signFlowCfg.embedApiKey : null,
        appBaseUrl: provider === "signflow" ? signFlowCfg.appBaseUrl : null,
        documentId: sigId,
        canAssignSigner: true,
        signerOptions,
        assignedSignerEmail: "",
        assignedSignerName: "",
      };
    }
  }

  const signerResolved = await resolveSponsorSignerForSession({
    dealId,
    sponsorUserId: params.sponsorUserId,
    sponsorEmail: params.sponsorEmail,
    assigneeMemberRowId: assigneeMemberRowId || undefined,
  });
  if (!signerResolved.ok) {
    return {
      ok: false,
      code: signerResolved.code,
      message: signerResolved.message,
    };
  }
  const signer = signerResolved.signer;

  if (provider === "signflow") {
    try {
      const liveDoc = await getSignFlowDocument(sigId);
      if (!signFlowTemplateHasSponsorFields(liveDoc)) {
        return {
          ok: false,
          code: "not_ready",
          message: "This document does not require a sponsor signature",
        };
      }

      const investorHasCompletedSignature =
        portalReadyForSponsor || investorSigned;

      const sponsorOnDoc = (liveDoc.recipients ?? []).find((r) => {
        const role = String(r.role ?? "").trim().toLowerCase();
        return role === "seller" || role.includes("sponsor");
      });
      const signerEmail = signer.email.trim().toLowerCase();
      const signerName = signer.name.trim() || signerEmail;
      const needsSponsorAssign =
        String(sponsorOnDoc?.email ?? "").trim().toLowerCase() !== signerEmail ||
        String(sponsorOnDoc?.name ?? "").trim() !== signerName;

      let docForSession = liveDoc;
      if (needsSponsorAssign) {
        const patched = await assignSignFlowDocumentSponsorSigner(sigId, signer);
        if (!patched) {
          return {
            ok: false,
            code: "not_ready",
            message: "Could not assign sponsor signer on this SignFlow document",
          };
        }
        docForSession = await getSignFlowDocument(sigId);
      }

      const sponsorRecipient = (docForSession.recipients ?? []).find((r) => {
        const role = String(r.role ?? "").trim().toLowerCase();
        return role === "seller" || role.includes("sponsor");
      });
      const access = evaluateSignFlowRecipientSignAccess(
        docForSession,
        signer.email,
        { investorHasCompletedSignature },
      );
      if (!access.allowed && !portalReadyForSponsor) {
        return {
          ok: false,
          code: "waiting_for_prior_signer",
          message: access.message,
          waitingFor: access.waitingFor,
        };
      }

      let signUrl = buildSignFlowSignerEmbedUrl(sigId);
      try {
        const session = await createSignFlowSponsorEmbedSigningSession({
          documentId: sigId,
          recipientEmail: signer.email,
          recipientId: sponsorRecipient?.id?.trim(),
          investorPhaseComplete: investorHasCompletedSignature,
        });
        signUrl = session.signUrl;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (
          !portalReadyForSponsor &&
          (message.includes("WAITING_FOR_PRIOR_SIGNER") ||
            message.toLowerCase().includes("investor must sign"))
        ) {
          return {
            ok: false,
            code: "waiting_for_prior_signer",
            message: message.replace(/^WAITING_FOR_PRIOR_SIGNER:\s*/i, "").trim(),
            waitingFor: "investor",
          };
        }
        console.warn("createSignFlowEmbedSigningSession (sponsor):", err);
        return {
          ok: false,
          code: "not_ready",
          message: portalReadyForSponsor
            ? "Could not open sponsor signing. Confirm SignFlow is running and try again."
            : "Could not load sponsor signing session",
        };
      }

      return {
        ok: true,
        alreadyCompleted: false,
        provider: "signflow",
        signUrl,
        clientId: null,
        testMode: signFlowCfg.testMode,
        configured: signFlowCfg.configured,
        signatureRequestId: sigId,
        embedApiKey: signFlowCfg.embedApiKey,
        appBaseUrl: signFlowCfg.appBaseUrl,
        documentId: sigId,
        canAssignSigner: canAssign,
        signerOptions,
        assignedSignerEmail: signer.email,
        assignedSignerName: signer.name,
      };
    } catch (err) {
      console.warn("getDealSponsorEsignSignSession signflow prep:", err);
      return {
        ok: false,
        code: "not_ready",
        message: "Could not prepare sponsor signing session",
      };
    }
  }

  const signatureId = await getFirstSignatureIdFromRequest(sigId);
  if (!signatureId) {
    return {
      ok: false,
      code: "not_ready",
      message: "Could not resolve sponsor signing session",
    };
  }

  try {
    const { signUrl } = await getEmbeddedSignUrl(signatureId);
    return {
      ok: true,
      alreadyCompleted: false,
      provider: "dropbox",
      signUrl,
      clientId: dropboxCfg.clientId,
      testMode: dropboxCfg.testMode,
      configured: dropboxCfg.configured,
      signatureRequestId: sigId,
      canAssignSigner: canAssign,
      signerOptions,
      assignedSignerEmail: signer.email,
      assignedSignerName: signer.name,
    };
  } catch (err) {
    console.warn("getDealSponsorEsignSignSession dropbox:", err);
    return {
      ok: false,
      code: "not_ready",
      message: "Could not load sponsor signing session",
    };
  }
}
