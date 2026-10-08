import {
  buildSyndicationXEmailBrandHeaderHtml,
  buildSyndicationXEmailFooterHtml,
  buildSyndicationXEmailSignatureText,
  SX_EMAIL_BUTTON_STYLE,
  SX_EMAIL_MUTED,
  SX_EMAIL_PAGE_BG,
} from "./emailSyndicationXLayout.js";

export interface DealMemberSendEsignTemplateVars {
  dealName: string;
  memberDisplayName: string;
  memberEmail: string;
  /** Deal-invite onboarding URL (`/deal-invite?token=…`) — same as investor invitation emails. */
  portalDealUrl: string;
  senderBrand: string;
  documentNames?: string[];
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildDealMemberSendEsignEmailHtml(
  v: DealMemberSendEsignTemplateVars,
): string {
  const name = v.memberDisplayName.trim() || "there";
  const deal = escHtml(v.dealName.trim() || "this deal");
  const portalUrl = escHtml(v.portalDealUrl.trim());
  const brandPlain = v.senderBrand.trim() || "SyndicationX";
  const brand = escHtml(brandPlain);
  const cta = portalUrl
    ? `<div style="margin:24px 0;">
         <a href="${portalUrl}" style="${SX_EMAIL_BUTTON_STYLE}">Continue investor onboarding</a>
       </div>`
    : "";
  const docNames = (v.documentNames ?? []).map((n) => n.trim()).filter(Boolean);
  const docsBlock =
    docNames.length > 0
      ? `<ul style="margin:0 0 16px;padding-left:1.25em;">${docNames
          .map((n) => `<li style="margin:0 0 6px;">${escHtml(n)}</li>`)
          .join("")}</ul>`
      : "";

  /*
  // PREVIOUS nested-table card chrome retained for reference — replaced with outreach-style layout
  */

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>eSign ready · SyndicationX</title>
</head>
<body style="margin:0;padding:0;background:${SX_EMAIL_PAGE_BG};font-family:Arial,Helvetica,sans-serif;color:#111827;">
<div style="max-width:560px;margin:0 auto;padding:28px 20px;">
  ${buildSyndicationXEmailBrandHeaderHtml()}
  <h1 style="color:#111827;font-size:26px;line-height:1.25;margin:0 0 18px 0;font-weight:700;">Your eSign documents are ready</h1>
  <p style="font-size:16px;line-height:1.6;margin:0 0 12px 0;">Hi ${escHtml(name)},</p>
  <p style="font-size:16px;line-height:1.6;margin:0 0 16px 0;">
    Your eSign documents for <strong>${deal}</strong> are ready. Sign in to ${brand} to continue investor onboarding — review your commitment, complete questionnaires, and sign when you reach the documents step.
  </p>
  ${docsBlock}
  ${cta}
  <p style="margin:20px 0 0;font-size:13px;color:${SX_EMAIL_MUTED};">
    If you have questions, contact your sponsor.
  </p>
  ${buildSyndicationXEmailFooterHtml(brandPlain)}
</div>
</body>
</html>`;
}

export function buildDealMemberSendEsignEmailText(
  v: DealMemberSendEsignTemplateVars,
): string {
  const name = v.memberDisplayName.trim() || "there";
  const deal = v.dealName.trim() || "this deal";
  const url = v.portalDealUrl.trim();
  const docNames = (v.documentNames ?? []).map((n) => n.trim()).filter(Boolean);
  const lines = [
    `Hi ${name},`,
    "",
    `Your eSign documents for ${deal} are ready. Sign in to ${v.senderBrand.trim() || "SyndicationX"} to continue investor onboarding and complete signing when you reach the documents step.`,
  ];
  if (docNames.length > 0) {
    lines.push("", "Documents:");
    for (const n of docNames) lines.push(`- ${n}`);
  }
  if (url) lines.push("", `Continue investor onboarding: ${url}`);
  lines.push(
    "",
    "If you have questions, contact your sponsor.",
    "",
    buildSyndicationXEmailSignatureText({
      companyName: v.senderBrand.trim() || "SyndicationX",
    }),
  );
  return lines.join("\n");
}
