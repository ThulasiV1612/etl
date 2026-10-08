import {
  buildSyndicationXEmailBrandHeaderHtml,
  buildSyndicationXEmailFooterHtml,
  buildSyndicationXEmailSignatureText,
  SX_EMAIL_BUTTON_STYLE,
  SX_EMAIL_MUTED,
  SX_EMAIL_PAGE_BG,
} from "./emailSyndicationXLayout.js";

export interface DealFundApprovedTemplateVars {
  dealName: string;
  investorDisplayName: string;
  investorEmail: string;
  portalDealUrl: string;
  senderBrand: string;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildDealFundApprovedEmailText(
  v: DealFundApprovedTemplateVars,
): string {
  const lines = [
    `Fund approved — ${v.dealName} · SyndicationX`,
    "",
    v.investorDisplayName ? `Hello ${v.investorDisplayName},` : "Hello,",
    "",
    `The sponsor has approved the fund for your investment in ${v.dealName}.`,
    v.portalDealUrl
      ? `View the deal on SyndicationX: ${v.portalDealUrl}`
      : "Sign in to SyndicationX to view details.",
    "",
    `This message was sent to: ${v.investorEmail}`,
    "",
    buildSyndicationXEmailSignatureText({ companyName: v.senderBrand }),
  ];
  return lines.join("\n");
}

export function buildDealFundApprovedEmailHtml(
  v: DealFundApprovedTemplateVars,
): string {
  const deal = escHtml(v.dealName);
  const name = escHtml(v.investorDisplayName || "there");
  const email = escHtml(v.investorEmail);
  const brand = escHtml(v.senderBrand);
  const url = v.portalDealUrl;
  const href = escHtml(url);
  const buttonBlock = url
    ? `<div style="margin:24px 0;">
  <a href="${href}" style="${SX_EMAIL_BUTTON_STYLE}">View deal on SyndicationX</a>
</div>`
    : `<p style="font-size:14px;line-height:1.6;color:${SX_EMAIL_MUTED};font-family:Arial,Helvetica,sans-serif;">Sign in to SyndicationX to view this deal.</p>`;

  const header = buildSyndicationXEmailBrandHeaderHtml();
  const footer = buildSyndicationXEmailFooterHtml(brand);

  /*
  // PREVIOUS card chrome template retained for reference — replaced with outreach-style layout
  */

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Fund approved · SyndicationX</title>
</head>
<body style="margin:0;padding:0;background:${SX_EMAIL_PAGE_BG};font-family:Arial,Helvetica,sans-serif;color:#111827;">
<div style="max-width:560px;margin:0 auto;padding:28px 20px;">
  ${header}
  <h1 style="color:#111827;font-size:26px;line-height:1.25;margin:0 0 18px 0;font-family:Arial,Helvetica,sans-serif;font-weight:700;">Fund approved</h1>
  <p style="font-size:16px;line-height:1.6;color:#111827;margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;">Hello ${name},</p>
  <p style="font-size:16px;line-height:1.6;color:#111827;margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;">The sponsor has approved the fund for your investment in <strong>${deal}</strong>. Open SyndicationX to review documents and next steps.</p>
  ${buttonBlock}
  <p style="font-size:13px;line-height:1.5;color:${SX_EMAIL_MUTED};margin:20px 0 0 0;font-family:Arial,Helvetica,sans-serif;">This message was sent to <strong style="color:#374151;">${email}</strong>.</p>
  ${footer}
</div>
</body>
</html>`;
}
