import emailConfig, {
  outgoingMailCcBcc,
  smtpEnvelopeForSendMail,
} from "../../functions/emailconfig.js";
import {
  buildDealFundApprovedEmailHtml,
  buildDealFundApprovedEmailText,
} from "../../functions/dealFundApprovedEmail.template.js";
import { getAddDealFormById } from "./dealForm.service.js";
import { buildDealMemberInviteLandingUrl } from "./dealMemberInviteToken.service.js";
import { resolveEmailForContactMemberId } from "./dealMemberInvitationEmail.service.js";

const SENDER_DISPLAY_NAME =
  process.env.SENDER_DISPLAY_NAME?.trim() || "SyndicationX";

function defaultSubject(dealName: string): string {
  const custom = process.env.DEAL_FUND_APPROVED_SUBJECT?.trim();
  if (custom) return custom.replace(/\{dealName\}/g, dealName);
  return `Fund approved for ${dealName}`;
}

export async function sendDealFundApprovedNotification(input: {
  dealId: string
  contactId: string
  contactDisplayName: string
}): Promise<void> {
  const dealId = input.dealId.trim();
  const contactId = input.contactId.trim();
  if (!dealId || !contactId) return;

  const to = await resolveEmailForContactMemberId(contactId);
  if (!to) {
    console.warn(
      "sendDealFundApprovedNotification: no email for contact",
      contactId,
    );
    return;
  }

  const deal = await getAddDealFormById(dealId);
  const dealName = deal?.dealName?.trim() || "this deal";
  const investorDisplayName = input.contactDisplayName.trim();
  const portalUrl =
    (await buildDealMemberInviteLandingUrl(dealId, to)) || "";

  try {
    const transporter = emailConfig();
    const fromAddress = process.env.SENDER_EMAIL_ID?.trim() || "";
    if (!fromAddress) {
      console.warn(
        "sendDealFundApprovedNotification: SENDER_EMAIL_ID not set",
      );
      return;
    }

    const ccBcc = outgoingMailCcBcc();
    const vars = {
      dealName,
      investorDisplayName,
      investorEmail: to,
      portalDealUrl: portalUrl,
      senderBrand: SENDER_DISPLAY_NAME,
    };

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
      subject: defaultSubject(dealName),
      text: buildDealFundApprovedEmailText(vars),
      html: buildDealFundApprovedEmailHtml(vars),
    });
  } catch (error: unknown) {
    console.warn("sendDealFundApprovedNotification: send failed", error);
  }
}
