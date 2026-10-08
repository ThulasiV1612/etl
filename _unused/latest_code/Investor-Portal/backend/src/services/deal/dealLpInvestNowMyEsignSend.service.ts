import {
  findEsignSendForCategoryAndFiles,
  parseEsignStatusBundle,
} from "../../constants/deal-investor-esign-status.js";
import { getActiveEsignProvider } from "../../config/esignProvider.config.js";
import { ESIGN_UNIFIED_CATEGORY_ID } from "../../constants/esignProfileTypes.js";
import { isEsignProviderUnreachableError } from "../esign/esignProviderErrors.js";
import { getAddDealFormById } from "./dealForm.service.js";
import {
  dealHasEsignTemplateDocuments,
  getDealEsignTemplatesState,
  isEsignTemplateReady,
  type EsignTemplateFileRecord,
} from "./dealEsignTemplates.service.js";
import {
  normalizeInvestorQuestionnaireAnswersInput,
  saveInvestorQuestionnaireAnswersForTarget,
} from "./investorQuestionnaireAnswers.service.js";
import { normalizeInvestorW9FormInput } from "./investorW9Form.service.js";
import { enrichQuestionnaireAnswersFromInvestorProfile } from "./investorProfileQuestionnairePrefill.service.js";
import {
  findInvestorEsignTargetForInvestNowCommitment,
  markDealInvestorEsignPending,
  readInvestorEsignStatusJson,
} from "./dealMemberEsignStatus.service.js";
import {
  recordInvestmentSignatureOnCreate,
  resolveInvestmentIdForEsignTarget,
} from "../investment/investmentSignature.service.js";
import {
  applyInvestorPreviewToEsignDocuments,
  createInvestorSignatureRequest,
  esignDocumentsFromSelectedFiles,
  esignTemplateDisplayNameForFile,
} from "./dealMemberSendEsign.service.js";
import { resolveEsignFilesForInvestorProfile } from "./dealEsignProfileTemplate.service.js";

const LP_COMMITMENT_PROFILE_IDS = new Set([
  "individual",
  "custodian_ira_401k",
  "joint_tenancy",
  "llc_corp_trust_etc",
]);

function esignCategoryFromProfileId(profileId: string): string | null {
  const p = profileId.trim();
  if (!p || !LP_COMMITMENT_PROFILE_IDS.has(p)) return null;
  if (p === "llc_corp_trust_etc") return "llc";
  return p;
}

export type SendMyInvestNowEsignResult =
  | {
      ok: true;
      alreadySent: boolean;
      alreadyCompleted: boolean;
      signatureRequestId: string | null;
      investmentId: string | null;
      documentNames: string[];
    }
  | { ok: false; message: string };

async function ensureInvestmentSignatureTracked(params: {
  dealId: string;
  target: { table: "investment" | "lp"; id: string };
  viewerUserId: string;
  signatureRequestId: string;
  signUrl?: string | null;
  dropboxResponse?: unknown;
}): Promise<string | null> {
  const investmentId = await resolveInvestmentIdForEsignTarget(
    params.dealId,
    params.target,
  );
  if (!investmentId) return null;

  await recordInvestmentSignatureOnCreate({
    investmentId,
    investorId: params.viewerUserId,
    signatureRequestId: params.signatureRequestId,
    signUrl: params.signUrl,
    dropboxResponse: params.dropboxResponse,
  });
  return investmentId;
}

async function resolveInvestNowEsignTarget(
  dealId: string,
  params: {
    email: string;
    viewerUserId: string;
    profileId: string;
    userInvestorProfileId?: string | null;
    investmentId?: string | null;
  },
) {
  const scoped = {
    email: params.email,
    userId: params.viewerUserId,
    profileId: params.profileId,
    userInvestorProfileId: params.userInvestorProfileId,
    investmentId: params.investmentId,
  };
  let target = await findInvestorEsignTargetForInvestNowCommitment(
    dealId,
    scoped,
  );
  if (!target && params.investmentId?.trim()) {
    target = await findInvestorEsignTargetForInvestNowCommitment(dealId, {
      email: params.email,
      userId: params.viewerUserId,
      profileId: params.profileId,
      userInvestorProfileId: params.userInvestorProfileId,
    });
  }
  return target;
}

/**
 * Creates a Dropbox Sign request for the signed-in investor's profile template
 * during Invest Now (no sponsor action required).
 */
export async function sendMyInvestNowEsignIfNeeded(params: {
  dealId: string;
  viewerEmail: string;
  viewerUserId: string;
  profileId: string;
  userInvestorProfileId?: string | null;
  investmentId?: string | null;
  memberDisplayName?: string;
  questionnaireAnswers?: Record<string, string> | null;
  w9Form?: unknown;
}): Promise<SendMyInvestNowEsignResult> {
  const dealId = params.dealId.trim();
  const email = params.viewerEmail.trim().toLowerCase();
  const categoryId = esignCategoryFromProfileId(params.profileId);
  if (!categoryId) {
    return { ok: false, message: "Invalid investor profile for eSign" };
  }

  if (!getActiveEsignProvider()) {
    return {
      ok: false,
      message:
        "eSign is not configured on this deal yet. Contact your sponsor.",
    };
  }

  const esignState = await getDealEsignTemplatesState(dealId);
  if (!dealHasEsignTemplateDocuments(esignState)) {
    return {
      ok: false,
      message:
        "No eSign documents are uploaded for this deal yet. Contact your sponsor.",
    };
  }

  let selectedFiles: EsignTemplateFileRecord[];
  try {
    selectedFiles = await resolveEsignFilesForInvestorProfile(
      esignState.files,
      params.profileId,
    );
  } catch (err) {
    if (isEsignProviderUnreachableError(err)) {
      return {
        ok: false,
        message:
          "The eSign service is temporarily unavailable. Ask your sponsor to ensure SignFlow is running, then try again.",
      };
    }
    throw err;
  }
  if (selectedFiles.length === 0) {
    const hasUnified = esignState.files.some(
      (f) => f.categoryId === ESIGN_UNIFIED_CATEGORY_ID,
    );
    const anyReady = esignState.files.some((f) => isEsignTemplateReady(f));
    if (hasUnified && !anyReady) {
      return {
        ok: false,
        message:
          "The eSign template is not ready yet. Ask your sponsor to finish saving the template in the eSign editor.",
      };
    }
    return {
      ok: false,
      message:
        "No eSign fields are configured for your investor profile on this deal. Ask your sponsor to add fields for your profile in the eSign template editor.",
    };
  }

  const sendCategoryId = selectedFiles[0]!.categoryId.trim() || categoryId;

  const target = await resolveInvestNowEsignTarget(dealId, {
    email,
    viewerUserId: params.viewerUserId,
    profileId: params.profileId,
    userInvestorProfileId: params.userInvestorProfileId,
    investmentId: params.investmentId,
  });
  if (!target) {
    const hasInvestmentRow =
      Boolean(params.investmentId?.trim()) ||
      Boolean(params.userInvestorProfileId?.trim());
    return {
      ok: false,
      message: hasInvestmentRow
        ? "Enter your investment amount on the previous step, then return to sign documents."
        : "Save your investment commitment first, then return to sign documents.",
    };
  }

  const raw = await readInvestorEsignStatusJson(dealId, target);
  const bundle = parseEsignStatusBundle(raw);
  const investmentIdForTarget = await resolveInvestmentIdForEsignTarget(
    dealId,
    target,
  );

  const selectedIds = new Set(selectedFiles.map((f) => f.id));
  const existingSend = bundle
    ? findEsignSendForCategoryAndFiles(bundle, sendCategoryId, selectedIds)
    : null;

  if (existingSend?.sentAt?.trim()) {
    const sigId = existingSend.signatureRequestId?.trim() ?? "";
    const completed = Boolean(existingSend.completedAt?.trim());
    if (sigId) {
      await ensureInvestmentSignatureTracked({
        dealId,
        target,
        viewerUserId: params.viewerUserId,
        signatureRequestId: sigId,
      });
    }
    return {
      ok: true,
      alreadySent: true,
      alreadyCompleted: completed,
      signatureRequestId: sigId || null,
      investmentId: investmentIdForTarget,
      documentNames: selectedFiles.map((f) => esignTemplateDisplayNameForFile(f)),
    };
  }

  const deal = await getAddDealFormById(dealId);
  const dealName = deal?.dealName?.trim() || "Deal";
  const rosterId = target.id;

  const questionnaireAnswers = await enrichQuestionnaireAnswersFromInvestorProfile({
    viewerUserId: params.viewerUserId,
    userInvestorProfileId: params.userInvestorProfileId,
    answers: normalizeInvestorQuestionnaireAnswersInput(
      params.questionnaireAnswers,
    ),
    dealId,
  });
  if (questionnaireAnswers) {
    try {
      await saveInvestorQuestionnaireAnswersForTarget(
        dealId,
        target,
        questionnaireAnswers,
      );
    } catch (err) {
      console.warn("saveInvestorQuestionnaireAnswersForTarget (Invest Now eSign):", err);
    }
  }

  let signatureRequestId: string | undefined;
  let signatureId: string | undefined;
  let investorPreviewRelativePath: string | undefined;
  let createResult: Awaited<
    ReturnType<typeof createInvestorSignatureRequest>
  > = null;
  try {
    const sig = await createInvestorSignatureRequest({
      dealId,
      rosterId,
      toEmail: email,
      memberDisplayName: params.memberDisplayName?.trim() || undefined,
      dealName,
      selectedFiles,
      esignTarget: target,
      commitmentProfileId: params.profileId,
      questionnaireAnswers,
      w9FormData: normalizeInvestorW9FormInput(params.w9Form) ?? undefined,
      investmentId: investmentIdForTarget ?? undefined,
      investorId: params.viewerUserId,
    });
    if (!sig) {
      const provider = getActiveEsignProvider();
      return {
        ok: false,
        message:
          provider === "signflow"
            ? "Could not create a SignFlow signing request. Confirm the template is saved and SignFlow is running."
            : "Could not create an eSign signature request.",
      };
    }
    createResult = sig;
    signatureRequestId = sig.signatureRequestId;
    signatureId = sig.signatureId;
    investorPreviewRelativePath = sig.investorPreviewRelativePath;
  } catch (err) {
    if (isEsignProviderUnreachableError(err)) {
      return {
        ok: false,
        message:
          "The eSign service is temporarily unavailable. Ask your sponsor to ensure SignFlow is running, then try again.",
      };
    }
    const msg =
      err instanceof Error
        ? err.message
        : "Could not create eSign signature request";
    return { ok: false, message: msg };
  }

  await markDealInvestorEsignPending(dealId, {
    target,
    rosterId,
    toEmail: email,
    documents: applyInvestorPreviewToEsignDocuments(
      esignDocumentsFromSelectedFiles(selectedFiles),
      investorPreviewRelativePath,
    ),
    signatureRequestId,
    signatureId,
  });

  try {
    const { notifySequentialInvestorsSignTurnAvailable } = await import(
      "./dealEsignStageNotificationEmail.service.js"
    );
    await notifySequentialInvestorsSignTurnAvailable(dealId);
  } catch (err) {
    console.warn("notifySequentialInvestorsSignTurnAvailable (Invest Now send):", err);
  }

  let trackedInvestmentId = investmentIdForTarget;
  if (signatureRequestId) {
    trackedInvestmentId =
      (await ensureInvestmentSignatureTracked({
        dealId,
        target,
        viewerUserId: params.viewerUserId,
        signatureRequestId,
        signUrl: createResult?.signUrl,
        dropboxResponse: createResult,
      })) ?? investmentIdForTarget;
  }

  return {
    ok: true,
    alreadySent: false,
    alreadyCompleted: false,
    signatureRequestId: signatureRequestId ?? null,
    investmentId: trackedInvestmentId,
    documentNames: selectedFiles.map((f) => esignTemplateDisplayNameForFile(f)),
  };
}
