import emailConfig, {
  outgoingMailCcBcc,
  smtpEnvelopeForSendMail,
} from "../../functions/emailconfig.js";
import {
  buildSignupSuccessEmailHtml,
  buildSignupSuccessEmailText,
} from "../../functions/signupSuccessEmail.template.js";

const SENDER_DISPLAY_NAME =
  process.env.SENDER_DISPLAY_NAME?.trim() || "SyndicationX";

/** Origin for building `/signin` when `SIGNIN_PAGE_URL` is not set. */
function frontendBaseUrl(): string {
  const candidates = [
    process.env.FRONTEND_URL,
    process.env.BASE_URL,
    process.env.APP_URL,
    process.env.CLIENT_URL,
    process.env.PUBLIC_APP_URL,
    process.env.VITE_BASE_URL,
  ];
  for (const raw of candidates) {
    const t = String(raw ?? "").trim();
    if (t) return t.replace(/\/$/, "");
  }
  return "";
}

/** Full sign-in page URL for the email button (optional override of origin + /signin). */
function resolvedSignInPageUrl(): string {
  const explicit =
    process.env.SIGNIN_PAGE_URL?.trim() ||
    process.env.PORTAL_SIGNIN_URL?.trim() ||
    "";
  if (explicit) return explicit.replace(/\/$/, "");
  const origin = frontendBaseUrl();
  if (!origin) return "";
  return `${origin}/signin`;
}

function greetingNameFromParts(firstName: string, lastName: string): string {
  const parts = [firstName.trim(), lastName.trim()].filter(Boolean);
  if (parts.length === 0) return "there";
  return parts.join(" ");
}

export async function sendSignupSuccessEmail(input: {
  toEmail: string;
  firstName: string;
  lastName: string;
}): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const to = input.toEmail.trim().toLowerCase();
  if (!to || !to.includes("@")) {
    return { ok: false, error: new Error("Invalid recipient email") };
  }

  const fromAddress = process.env.SENDER_EMAIL_ID?.trim() || "";
  if (!fromAddress) {
    return {
      ok: false,
      error: new Error(
        "SENDER_EMAIL_ID must be set (From address for transactional email).",
      ),
    };
  }

  const signInUrl = resolvedSignInPageUrl();
  if (!signInUrl) {
    return {
      ok: false,
      error: new Error(
        "Set SIGNIN_PAGE_URL to the full portal sign-in URL, or set FRONTEND_URL / BASE_URL / APP_URL so the signup confirmation email can link to sign-in.",
      ),
    };
  }
  const greetingName = greetingNameFromParts(input.firstName, input.lastName);

  try {
    const transporter = emailConfig();
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
      subject: "Signup successful",
      text: buildSignupSuccessEmailText({
        greetingName,
        signInUrl,
        recipientEmail: to,
      }),
      html: buildSignupSuccessEmailHtml({
        greetingName,
        signInUrl,
        recipientEmail: to,
      }),
    });
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error };
  }
}
