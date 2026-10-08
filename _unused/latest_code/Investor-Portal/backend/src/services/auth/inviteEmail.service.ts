import emailConfig, {
  outgoingMailCcBcc,
  smtpEnvelopeForSendMail,
} from "../../functions/emailconfig.js";
import {
  buildInviteCompanyMembershipEmailHtml,
  buildInviteCompanyMembershipEmailText,
} from "../../functions/inviteCompanyMembershipEmail.template.js";
import {
  buildInviteSignupEmailHtml,
  buildInviteSignupEmailText,
} from "../../functions/inviteSignupEmail.template.js";

function frontendOrigin(): string {
  const raw =
    process.env.FRONTEND_URL?.trim() || process.env.BASE_URL?.trim() || "";
  return raw.replace(/\/$/, "");
}

const SENDER_DISPLAY_NAME =
  process.env.SENDER_DISPLAY_NAME?.trim() || "SyndicationX";

export async function sendInviteSignupEmail(
  toEmail: string,
  signupUrl: string,
  expiresDescription: string,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const to = toEmail.trim().toLowerCase();
  if (!to || !to.includes("@")) {
    return { ok: false, error: new Error("Invalid invitee email address") };
  }

  try {
    const transporter = emailConfig();
    const fromAddress = process.env.SENDER_EMAIL_ID?.trim() || "";
    if (!fromAddress) {
      return {
        ok: false,
        error: new Error(
          "SENDER_EMAIL_ID must be set (From address for invite emails).",
        ),
      };
    }

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
      subject: "You're invited to SyndicationX",
      text: buildInviteSignupEmailText(to, signupUrl, expiresDescription),
      html: buildInviteSignupEmailHtml(to, signupUrl, expiresDescription),
    });
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error };
  }
}

/** Notifies an existing portal user they were added to another company workspace. */
export async function sendInviteCompanyMembershipEmail(
  toEmail: string,
  companyName: string,
  roleLabel: string,
  opts?: { signupUrl?: string | null; needsSignup?: boolean },
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const to = toEmail.trim().toLowerCase();
  if (!to || !to.includes("@")) {
    return { ok: false, error: new Error("Invalid invitee email address") };
  }

  const origin = frontendOrigin();
  if (!origin) {
    return {
      ok: false,
      error: new Error(
        "FRONTEND_URL (or BASE_URL) is not configured on the server.",
      ),
    };
  }

  const needsSignup = Boolean(opts?.needsSignup);
  const portalUrl =
    (needsSignup && opts?.signupUrl?.trim()) || `${origin}/signin`;

  try {
    const transporter = emailConfig();
    const fromAddress = process.env.SENDER_EMAIL_ID?.trim() || "";
    if (!fromAddress) {
      return {
        ok: false,
        error: new Error(
          "SENDER_EMAIL_ID must be set (From address for invite emails).",
        ),
      };
    }

    const ccBcc = outgoingMailCcBcc();
    const company = companyName.trim() || "your organization";
    const role = roleLabel.trim() || "member";
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
      subject: needsSignup
        ? `Invitation to ${company} on SyndicationX`
        : `Access to ${company} on SyndicationX`,
      text: buildInviteCompanyMembershipEmailText(
        to,
        company,
        role,
        portalUrl,
        needsSignup,
      ),
      html: buildInviteCompanyMembershipEmailHtml(
        to,
        company,
        role,
        portalUrl,
        needsSignup,
      ),
    });
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error };
  }
}
