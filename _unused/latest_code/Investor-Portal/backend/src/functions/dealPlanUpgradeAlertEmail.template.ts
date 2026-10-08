import {
  buildSyndicationXEmailBrandHeaderHtml,
  buildSyndicationXEmailFooterHtml,
  buildSyndicationXEmailSignatureText,
  SX_EMAIL_BUTTON_STYLE,
  SX_EMAIL_MUTED,
  SX_EMAIL_PAGE_BG,
} from "./emailSyndicationXLayout.js";

export interface DealPlanUpgradeAlertTemplateVars {
  dealName: string;
  currentPlanLabel: string;
  nextPlanLabel: string;
  portalBillingUrl: string;
  senderBrand: string;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildDealPlanUpgradeAlertEmailText(
  v: DealPlanUpgradeAlertTemplateVars,
): string {
  const lines = [
    `Upgrade billing for ${v.dealName} · SyndicationX`,
    "",
    "Hello,",
    "",
    `The raise for ${v.dealName} is now above ${v.currentPlanLabel}. SyndicationX selected ${v.nextPlanLabel}.`,
    "Upgrade billing for this deal so it stays open to view and edit.",
    v.portalBillingUrl
      ? `Upgrade billing: ${v.portalBillingUrl}`
      : "Sign in to SyndicationX → Settings → Billing to upgrade.",
    "",
    buildSyndicationXEmailSignatureText({ companyName: v.senderBrand }),
  ];
  return lines.join("\n");
}

export function buildDealPlanUpgradeAlertEmailHtml(
  v: DealPlanUpgradeAlertTemplateVars,
): string {
  const deal = escHtml(v.dealName);
  const current = escHtml(v.currentPlanLabel);
  const next = escHtml(v.nextPlanLabel);
  const brand = escHtml(v.senderBrand);
  const url = v.portalBillingUrl;
  const href = escHtml(url);
  const buttonBlock = url
    ? `<div style="margin:24px 0;">
  <a href="${href}" style="${SX_EMAIL_BUTTON_STYLE}">Upgrade billing</a>
</div>`
    : `<p style="font-size:14px;line-height:1.6;color:${SX_EMAIL_MUTED};font-family:Arial,Helvetica,sans-serif;">Sign in to SyndicationX, open Settings → Billing, and upgrade this deal.</p>`;

  const header = buildSyndicationXEmailBrandHeaderHtml();
  const footer = buildSyndicationXEmailFooterHtml(brand);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Upgrade billing · SyndicationX</title>
</head>
<body style="margin:0;padding:0;background:${SX_EMAIL_PAGE_BG};font-family:Arial,Helvetica,sans-serif;color:#111827;">
<div style="max-width:560px;margin:0 auto;padding:28px 20px;">
  ${header}
  <h1 style="color:#111827;font-size:26px;line-height:1.25;margin:0 0 18px 0;font-family:Arial,Helvetica,sans-serif;font-weight:700;">Deal plan upgrade needed</h1>
  <p style="font-size:16px;line-height:1.6;color:#111827;margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;">The raise for <strong>${deal}</strong> is now above <strong>${current}</strong>. SyndicationX selected <strong>${next}</strong>.</p>
  <p style="font-size:16px;line-height:1.6;color:#111827;margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;">Upgrade billing for this deal so it stays open to view and edit.</p>
  ${buttonBlock}
  ${footer}
</div>
</body>
</html>`;
}
