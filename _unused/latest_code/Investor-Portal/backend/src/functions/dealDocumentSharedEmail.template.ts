import {
  buildSyndicationXEmailBrandHeaderHtml,
  buildSyndicationXEmailFooterHtml,
  buildSyndicationXEmailSignatureText,
  SX_EMAIL_MUTED,
  SX_EMAIL_PAGE_BG,
  SX_EMAIL_LINK,
} from "./emailSyndicationXLayout.js";

export interface DealDocumentSharedTemplateVars {
  dealName: string;
  memberDisplayName: string;
  memberEmail: string;
  documentNames: string[];
  senderBrand: string;
  /** Absolute portal sign-in URL (FRONTEND_URL / SIGNIN_PAGE_URL). */
  loginUrl: string;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function documentListHtml(names: string[]): string {
  if (names.length === 0) {
    return "<p>A document on this deal was shared with you.</p>";
  }
  const items = names
    .map((n) => `<li style="margin:0 0 6px;">${escHtml(n)}</li>`)
    .join("");
  return `<ul style="margin:8px 0 0;padding-left:20px;">${items}</ul>`;
}

function documentListText(names: string[]): string {
  if (names.length === 0) return "A document on this deal was shared with you.";
  return names.map((n) => `• ${n}`).join("\n");
}

export function buildDealDocumentSharedEmailText(
  v: DealDocumentSharedTemplateVars,
): string {
  const lines = [
    `A document has been shared with you — ${v.dealName} · SyndicationX`,
    "",
    v.memberDisplayName ? `Hello ${v.memberDisplayName},` : "Hello,",
    "",
    "A document has been shared with you:",
    documentListText(v.documentNames),
    "",
    "To open the deal and view your documents, click here.",
    "",
    `This message was sent to: ${v.memberEmail}`,
    "",
    buildSyndicationXEmailSignatureText({ companyName: v.senderBrand }),
  ];
  return lines.join("\n");
}

export function buildDealDocumentSharedEmailHtml(
  v: DealDocumentSharedTemplateVars,
): string {
  const greeting = v.memberDisplayName
    ? `Hello ${escHtml(v.memberDisplayName)},`
    : "Hello,";
  const deal = escHtml(v.dealName);
  const email = escHtml(v.memberEmail);
  const brand = escHtml(v.senderBrand);
  const brandHeader = buildSyndicationXEmailBrandHeaderHtml();
  const footer = buildSyndicationXEmailFooterHtml(brand);
  const docWord = v.documentNames.length === 1 ? "document" : "documents";
  const verb = v.documentNames.length === 1 ? "was" : "were";
  const loginUrl = (v.loginUrl ?? "").trim();
  const loginHref = loginUrl ? escHtml(loginUrl) : "";
  const clickHere = loginHref
    ? `<a href="${loginHref}" style="color:${SX_EMAIL_LINK};font-weight:700;text-decoration:underline;">click here</a>`
    : "click here";
  const loginBlock = `<p style="font-size:15px;line-height:1.6;color:#374151;margin:20px 0 0 0;">
    To open the deal and view your documents, ${clickHere}.
  </p>`;

  /*
  // PREVIOUS card chrome template retained for reference — replaced with outreach-style layout
  */

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>A document has been shared with you</title>
</head>
<body style="margin:0;padding:0;background:${SX_EMAIL_PAGE_BG};font-family:Arial,Helvetica,sans-serif;color:#111827;">
<div style="max-width:560px;margin:0 auto;padding:28px 20px;">
  ${brandHeader}
  <h1 style="color:#111827;font-size:26px;line-height:1.25;margin:0 0 18px 0;font-weight:700;">A document has been shared with you</h1>
  <p style="font-size:16px;line-height:1.6;margin:0 0 12px 0;">${greeting}</p>
  <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 8px 0;">
    The following ${docWord} on <strong>${deal}</strong> ${verb} shared with you:
  </p>
  ${documentListHtml(v.documentNames)}
  ${loginBlock}
  <p style="font-size:13px;line-height:1.5;color:${SX_EMAIL_MUTED};margin:20px 0 0 0;">
    This message was sent to <strong style="color:#374151;">${email}</strong>.
  </p>
  ${footer}
</div>
</body>
</html>`;
}
