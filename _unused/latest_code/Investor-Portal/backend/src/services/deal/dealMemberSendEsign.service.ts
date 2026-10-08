import emailConfig, {
  outgoingMailCcBcc,
  smtpEnvelopeForSendMail,
} from "../../functions/emailconfig.js";
import {
  buildDealMemberSendEsignEmailHtml,
  buildDealMemberSendEsignEmailText,
} from "../../functions/dealMemberSendEsign.template.js";
import { getActiveEsignProvider } from "../../config/esignProvider.config.js";
import { getAddDealFormById } from "./dealForm.service.js";
import { buildDealMemberInviteLandingUrl } from "./dealMemberInviteToken.service.js";
import {
  applyInvestorPreviewToEsignDocuments,
  createInvestorSignatureRequestDropbox,
  type CreateInvestorSignatureRequestResult,
} from "./dealMemberSendEsignDropbox.service.js";
import { createInvestorSignatureRequestSignflow } from "./dealMemberSendEsignSignflow.service.js";
import type { EsignTemplateFileRecord } from "./dealEsignTemplates.service.js";
import type { InvestorEsignRowTarget } from "./dealMemberEsignStatus.service.js";
import type { InvestorQuestionnaireAnswersMap } from "./investorQuestionnaireAnswers.service.js";
import type { InvestorW9FormData } from "./investorW9Form.service.js";

const SENDER_DISPLAY_NAME = process.env.SENDER_DISPLAY_NAME?.trim() || "SyndicationX";

export type { CreateInvestorSignatureRequestResult };

export async function createInvestorSignatureRequest(params: {
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
  investmentId?: string;
  investorId?: string;
}): Promise<CreateInvestorSignatureRequestResult | null> {
  const provider = getActiveEsignProvider();
  if (provider === "signflow") {
    return createInvestorSignatureRequestSignflow(params);
  }
  if (provider === "dropbox") {
    return createInvestorSignatureRequestDropbox(params);
  }
  return null;
}

export { applyInvestorPreviewToEsignDocuments };

export {
  esignDocumentsFromSelectedFiles,
  esignTemplateDisplayNameForFile,
} from "./dealMemberSendEsignDropbox.service.js";

export async function sendDealMemberSendEsignEmail(params: {
  dealId: string;
  toEmail: string;
  memberDisplayName?: string;
  documentNames?: string[];
}): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const to = params.toEmail.trim().toLowerCase();
  if (!to.includes("@")) {
    return { ok: false, error: new Error("Invalid recipient email") };
  }

  const deal = await getAddDealFormById(params.dealId);
  const dealName = deal?.dealName?.trim() || "this deal";
  const memberDisplayName = params.memberDisplayName?.trim() || "";
  const portalUrl =
    (await buildDealMemberInviteLandingUrl(params.dealId, to)) || "";

  try {
    const transporter = emailConfig();
    const fromAddress = process.env.SENDER_EMAIL_ID?.trim() || "";
    if (!fromAddress) {
      return {
        ok: false,
        error: new Error("SENDER_EMAIL_ID is not configured"),
      };
    }

    const subject =
      process.env.DEAL_MEMBER_ESIGN_SUBJECT?.trim()?.replace(/\{dealName\}/g, dealName) ||
      `eSign documents ready — ${dealName}`;
    const documentNames = (params.documentNames ?? [])
      .map((n) => n.trim())
      .filter(Boolean);
    const templateVars = {
      dealName,
      memberDisplayName,
      memberEmail: to,
      portalDealUrl: portalUrl,
      senderBrand: SENDER_DISPLAY_NAME,
      documentNames,
    };
    const ccBcc = outgoingMailCcBcc();
    await transporter.sendMail({
      from: {
        name: SENDER_DISPLAY_NAME,
        address: fromAddress,
      },
      to,
      ...ccBcc,
      envelope: smtpEnvelopeForSendMail({
        fromAddress,
        to,
        cc: ccBcc.cc,
        bcc: ccBcc.bcc,
      }),
      subject,
      text: buildDealMemberSendEsignEmailText(templateVars),
      html: buildDealMemberSendEsignEmailHtml(templateVars),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}
