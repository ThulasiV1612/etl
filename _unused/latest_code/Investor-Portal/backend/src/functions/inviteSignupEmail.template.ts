import {
  buildSyndicationXEmailAuthFooterHtml,
  buildSyndicationXEmailBrandHeaderHtml,
  buildSyndicationXEmailSignatureText,
  SX_EMAIL_BUTTON_STYLE,
  SX_EMAIL_MUTED,
  SX_EMAIL_PAGE_BG,
  SX_EMAIL_PRIMARY,
} from "./emailSyndicationXLayout.js";

function humanizeInviteExpiry(expiresIn: string): string {
  const m = /^(\d+)\s*d$/i.exec(expiresIn.trim());
  if (m) {
    const n = Number.parseInt(m[1], 10);
    if (Number.isFinite(n)) return `${n} day${n === 1 ? "" : "s"}`;
  }
  return expiresIn;
}

function escAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function escHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Plain-text body for the invite email (deliverability / plain clients). */
export function buildInviteSignupEmailText(
  inviteeEmail: string,
  signupLink: string,
  expiresDescription: string,
): string {
  const human = humanizeInviteExpiry(expiresDescription);
  return [
    "You're invited to SyndicationX",
    "",
    "An administrator invited you to create your account. Open this link to accept and complete registration:",
    signupLink,
    "",
    `This link expires in ${human}. If you did not expect this email, you can ignore it.`,
    "",
    `This invitation was sent to: ${inviteeEmail}`,
    "",
    buildSyndicationXEmailSignatureText(),
  ].join("\n");
}

/** HTML body for the invite / signup confirmation email. */
export function buildInviteSignupEmailHtml(
  inviteeEmail: string,
  signupLink: string,
  expiresDescription: string,
): string {
  const human = humanizeInviteExpiry(expiresDescription);
  const escHuman = escHtmlText(human);
  const escEmail = escHtmlText(inviteeEmail);
  const safeHref = escAttr(signupLink);
  const header = buildSyndicationXEmailBrandHeaderHtml();
  const authFooter = buildSyndicationXEmailAuthFooterHtml();

  /*
  // PREVIOUS card chrome template
  return `<!DOCTYPE html>...
  <body style="...background:#f4f6f8;...">
  <div style="max-width:600px;...border-radius:12px;border:1px solid #e2e8f0;box-shadow:...">
    ${header}
    <h1>...</h1>
    ...
    ${authFooter}
  </div></body></html>`;
  */

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>You're invited · SyndicationX</title>
</head>
<body style="margin:0;padding:0;background:${SX_EMAIL_PAGE_BG};font-family:Arial,Helvetica,sans-serif;color:#111827;">
<div style="max-width:560px;margin:0 auto;padding:28px 20px;">
  ${header}
  <h1 style="color:#111827;font-size:26px;line-height:1.25;margin:0 0 20px 0;font-family:Arial,Helvetica,sans-serif;font-weight:700;">You're invited to SyndicationX</h1>
  <p style="font-size:16px;line-height:1.6;color:#111827;margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;">Your administrator has invited you to join the SyndicationX investor portal. Create your account to collaborate on deals, manage documents, and participate in investor activities.</p>
  <div style="margin:24px 0;">
    <a href="${safeHref}" style="${SX_EMAIL_BUTTON_STYLE}">Accept invitation</a>
  </div>
  <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;">This secure link expires in <strong>${escHuman}</strong>. If you didn’t expect this message, you can ignore it.</p>
  <p style="font-size:13px;line-height:1.5;color:${SX_EMAIL_MUTED};margin:0;font-family:Arial,Helvetica,sans-serif;">Sent to <strong style="color:#374151;">${escEmail}</strong></p>
  ${authFooter}
</div>
</body>
</html>`;
}
