import {
  buildSyndicationXEmailAuthFooterHtml,
  buildSyndicationXEmailBrandHeaderHtml,
  SX_EMAIL_BUTTON_STYLE,
  SX_EMAIL_PAGE_BG,
} from "./emailSyndicationXLayout.js";

function escAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/** HTML body for the password-reset email (inline styles for common clients). */
export function buildResetPasswordEmailHtml(resetLink: string): string {
  const safeHref = escAttr(resetLink);
  const header = buildSyndicationXEmailBrandHeaderHtml();
  const authFooter = buildSyndicationXEmailAuthFooterHtml();

  /*
  // PREVIOUS card chrome template retained for reference — replaced with outreach-style layout
  */

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reset password · SyndicationX</title>
</head>
<body style="margin:0;padding:0;background:${SX_EMAIL_PAGE_BG};font-family:Arial,Helvetica,sans-serif;color:#111827;">
<div style="max-width:560px;margin:0 auto;padding:28px 20px;">
  ${header}
  <h1 style="color:#111827;font-size:26px;line-height:1.25;margin:0 0 20px 0;font-family:Arial,Helvetica,sans-serif;font-weight:700;">Reset your password</h1>
  <p style="font-size:16px;line-height:1.6;color:#111827;margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;">We received a request to reset the password for your SyndicationX account. Use the button below to choose a new password.</p>
  <div style="margin:24px 0;">
    <a href="${safeHref}" style="${SX_EMAIL_BUTTON_STYLE}">Reset password</a>
  </div>
  <p style="font-size:15px;line-height:1.6;color:#374151;margin:0;font-family:Arial,Helvetica,sans-serif;">This link expires in <strong>1 hour</strong>. If you didn’t ask for this, you can safely ignore this email.</p>
  ${authFooter}
</div>
</body>
</html>`;
}
