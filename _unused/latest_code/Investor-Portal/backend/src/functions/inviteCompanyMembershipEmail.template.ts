import {
  buildSyndicationXEmailAuthFooterHtml,
  buildSyndicationXEmailBrandHeaderHtml,
  buildSyndicationXEmailSignatureText,
  SX_EMAIL_BUTTON_STYLE,
  SX_EMAIL_MUTED,
  SX_EMAIL_PAGE_BG,
} from "./emailSyndicationXLayout.js";

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

export function buildInviteCompanyMembershipEmailText(
  inviteeEmail: string,
  companyName: string,
  roleLabel: string,
  portalUrl: string,
  needsSignup: boolean,
): string {
  const lines = needsSignup
    ? [
        `You've been invited to ${companyName} on SyndicationX`,
        "",
        `An administrator added you as ${roleLabel} for ${companyName}.`,
        "Complete your account registration, then sign in to access this organization:",
        portalUrl,
      ]
    : [
        `You've been added to ${companyName} on SyndicationX`,
        "",
        `An administrator added you as ${roleLabel} for ${companyName}.`,
        "Sign in to access this organization:",
        portalUrl,
      ];
  return [
    ...lines,
    "",
    `This message was sent to: ${inviteeEmail}`,
    "",
    buildSyndicationXEmailSignatureText(),
  ].join("\n");
}

export function buildInviteCompanyMembershipEmailHtml(
  inviteeEmail: string,
  companyName: string,
  roleLabel: string,
  portalUrl: string,
  needsSignup: boolean,
): string {
  const escCompany = escHtmlText(companyName);
  const escRole = escHtmlText(roleLabel);
  const escEmail = escHtmlText(inviteeEmail);
  const safeHref = escAttr(portalUrl);
  const header = buildSyndicationXEmailBrandHeaderHtml();
  const authFooter = buildSyndicationXEmailAuthFooterHtml();
  const title = needsSignup
    ? `You're invited to ${escCompany}`
    : `You've been added to ${escCompany}`;
  const lead = needsSignup
    ? `An administrator added you as <strong>${escRole}</strong> for <strong>${escCompany}</strong>. Complete registration, then use the portal to access this organization.`
    : `An administrator added you as <strong>${escRole}</strong> for <strong>${escCompany}</strong>. Sign in to access deals and member tools for this organization.`;
  const cta = needsSignup ? "Complete registration" : "Sign in";

  /*
  // PREVIOUS card chrome template retained for reference — replaced with outreach-style layout
  */

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} · SyndicationX</title>
</head>
<body style="margin:0;padding:0;background:${SX_EMAIL_PAGE_BG};font-family:Arial,Helvetica,sans-serif;color:#111827;">
<div style="max-width:560px;margin:0 auto;padding:28px 20px;">
  ${header}
  <h1 style="color:#111827;font-size:26px;line-height:1.25;margin:0 0 20px 0;font-family:Arial,Helvetica,sans-serif;font-weight:700;">${title}</h1>
  <p style="font-size:16px;line-height:1.6;color:#111827;margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;">${lead}</p>
  <div style="margin:24px 0;">
    <a href="${safeHref}" style="${SX_EMAIL_BUTTON_STYLE}">${cta}</a>
  </div>
  <p style="font-size:13px;line-height:1.5;color:${SX_EMAIL_MUTED};margin:0;font-family:Arial,Helvetica,sans-serif;">Sent to <strong style="color:#374151;">${escEmail}</strong></p>
  ${authFooter}
</div>
</body>
</html>`;
}
