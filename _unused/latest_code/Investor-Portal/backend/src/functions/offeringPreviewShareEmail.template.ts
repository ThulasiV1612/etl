import {
  buildSyndicationXEmailBrandHeaderHtml,
  buildSyndicationXEmailFooterHtml,
  buildSyndicationXEmailSignatureText,
  SX_EMAIL_BUTTON_STYLE,
  SX_EMAIL_MUTED,
  SX_EMAIL_PAGE_BG,
} from "./emailSyndicationXLayout.js";

export interface OfferingPreviewShareTemplateVars {
  dealName: string;
  /** Public offering preview URL (no login). */
  previewUrl: string;
  senderBrand: string;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildOfferingPreviewShareEmailText(
  v: OfferingPreviewShareTemplateVars,
): string {
  const lines = [
    `Offering preview: ${v.dealName} · SyndicationX`,
    "",
    "View this investment offering (no sign-in required):",
    v.previewUrl,
    "",
    buildSyndicationXEmailSignatureText({ companyName: v.senderBrand }),
  ];
  return lines.join("\n");
}

export function buildOfferingPreviewShareEmailHtml(
  v: OfferingPreviewShareTemplateVars,
): string {
  const name = escHtml(v.dealName);
  const href = escHtml(v.previewUrl);
  const brand = escHtml(v.senderBrand);
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
<title>Offering preview · SyndicationX</title>
</head>
<body style="margin:0;padding:0;background:${SX_EMAIL_PAGE_BG};font-family:Arial,Helvetica,sans-serif;color:#111827;">
<div style="max-width:560px;margin:0 auto;padding:28px 20px;">
  ${header}
  <h1 style="color:#111827;font-size:26px;line-height:1.25;margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-weight:700;">Offering preview</h1>
  <p style="font-size:16px;line-height:1.6;color:#111827;margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;">You’ve been shared access to review <strong>${name}</strong>. Open the link below — no SyndicationX account required for this preview.</p>
  <div style="margin:24px 0;">
    <a href="${href}" style="${SX_EMAIL_BUTTON_STYLE}">View offering</a>
  </div>
  <p style="font-size:12px;line-height:1.45;color:${SX_EMAIL_MUTED};margin:0;font-family:Arial,Helvetica,sans-serif;word-break:break-all;">${href}</p>
  ${footer}
</div>
</body>
</html>`;
}
