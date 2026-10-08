/**
 * Shared SyndicationX transactional email chrome
 * Outlook / Edge / Gmail compatible version
 *
 * Signature layout follows a two-column style:
 *   [logo] | name / title / company / email / phone
 */

export const SX_EMAIL_PRIMARY = "#00477a";

/** Visible hyperlink / CTA color (Gmail / Outlook friendly). */
export const SX_EMAIL_LINK = "#1a73e8";

/** Primary action button */
export const SX_EMAIL_BUTTON_STYLE = `
  background-color:${SX_EMAIL_PRIMARY};
  color:#ffffff;
  padding:14px 28px;
  border-radius:8px;
  text-decoration:none;
  font-weight:600;
  font-size:15px;
  display:inline-block;
  border:0;
`;

/** Subtle secondary text */
export const SX_EMAIL_MUTED = "#64748b";

/** Page background — clean white like outreach-style emails */
export const SX_EMAIL_PAGE_BG = "#ffffff";

/**
 * IMPORTANT:
 * Use a stable PUBLIC image URL for emails.
 * Avoid hashed frontend build assets when possible.
 */
const EMAIL_LOGO_PATH =
  "https://syndicationx.com/assets/sx_logo_width_reduced-BOPxOxjB.png";

function escapeAttrUrl(u: string): string {
  return u
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailLogoSrc(): string {
  const override = process.env.EMAIL_LOGO_URL?.trim();
  return override || EMAIL_LOGO_PATH;
}

export interface SyndicationXEmailSignatureVars {
  /** Display name in signature (right column). */
  senderName?: string;
  /** Job / role line under the name. */
  senderTitle?: string;
  /** Company line (defaults to SyndicationX). */
  companyName?: string;
  /** Mailto link text. */
  senderEmail?: string;
  /** Tel link text. */
  senderPhone?: string;
}

function resolveSignatureVars(
  overrides?: SyndicationXEmailSignatureVars,
): Required<
  Pick<
    SyndicationXEmailSignatureVars,
    "senderName" | "senderTitle" | "companyName"
  >
> &
  Pick<SyndicationXEmailSignatureVars, "senderEmail" | "senderPhone"> {
  const senderName =
    overrides?.senderName?.trim() ||
    process.env.EMAIL_SENDER_NAME?.trim() ||
    process.env.SENDER_DISPLAY_NAME?.trim() ||
    "SyndicationX";
  const senderTitle =
    overrides?.senderTitle?.trim() ||
    process.env.EMAIL_SENDER_TITLE?.trim() ||
    "Investor Portal";
  const companyName =
    overrides?.companyName?.trim() ||
    process.env.EMAIL_SENDER_COMPANY?.trim() ||
    "SyndicationX";
  const senderEmail =
    overrides?.senderEmail?.trim() ||
    process.env.SENDER_EMAIL_ID?.trim() ||
    "";
  const senderPhone =
    overrides?.senderPhone?.trim() ||
    process.env.EMAIL_SENDER_PHONE?.trim() ||
    "";
  return { senderName, senderTitle, companyName, senderEmail, senderPhone };
}

/**
 * Left: SyndicationX logo · vertical rule · right: name, title, company, email, phone
 * (table layout for Outlook compatibility)
 */
export function buildSyndicationXEmailSignatureHtml(
  overrides?: SyndicationXEmailSignatureVars,
): string {
  const v = resolveSignatureVars(overrides);
  const src = emailLogoSrc();
  const name = escHtmlText(v.senderName);
  const title = escHtmlText(v.senderTitle);
  const company = escHtmlText(v.companyName);
  const email = v.senderEmail ? escHtmlText(v.senderEmail) : "";
  const phone = v.senderPhone ? escHtmlText(v.senderPhone) : "";
  const emailHref = v.senderEmail
    ? `mailto:${escapeAttrUrl(v.senderEmail)}`
    : "";
  const phoneHref = v.senderPhone
    ? `tel:${escapeAttrUrl(v.senderPhone.replace(/[^\d+]/g, ""))}`
    : "";

  const signatureLinkStyle =
    "color:#1a73e8 !important;text-decoration:underline;font-size:14px;line-height:1.45;font-family:Arial,Helvetica,sans-serif;";
  const emailRow = email
    ? `<a href="${emailHref}" style="${signatureLinkStyle}"><span style="color:#1a73e8 !important;text-decoration:underline;"><font color="#1a73e8">${email}</font></span></a><br />`
    : "";
  const phoneRow = phone
    ? `<a href="${phoneHref}" style="${signatureLinkStyle}"><span style="color:#1a73e8 !important;text-decoration:underline;"><font color="#1a73e8">${phone}</font></span></a>`
    : "";

  const logoCell = src
    ? `<img
        src="${escapeAttrUrl(src)}"
        alt="SyndicationX"
        width="140"
        border="0"
        style="display:block;width:140px;max-width:140px;height:auto;border:0;outline:none;text-decoration:none;"
      />`
    : `<span style="font-family:Georgia,Times,'Times New Roman',serif;font-size:18px;font-weight:700;color:${SX_EMAIL_PRIMARY};">SyndicationX</span>`;

  return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 0 0;border-collapse:collapse;">
  <tr>
    <td valign="middle" style="padding:0 18px 0 0;vertical-align:middle;">
      ${logoCell}
    </td>
    <td width="1" valign="stretch" style="width:1px;border-left:1px solid #d1d5db;padding:0;font-size:0;line-height:0;">&nbsp;</td>
    <td valign="middle" style="padding:0 0 0 18px;vertical-align:middle;font-family:Arial,Helvetica,sans-serif;color:#111827;">
      <div style="font-size:15px;font-weight:700;line-height:1.3;color:#111827;margin:0 0 8px 0;">${name}</div>
      <div style="border-top:1px solid #d1d5db;width:100%;max-width:220px;margin:0 0 8px 0;line-height:0;font-size:0;">&nbsp;</div>
      <div style="font-size:14px;line-height:1.45;color:#374151;margin:0;">${title}</div>
      <div style="font-size:14px;line-height:1.45;color:#374151;margin:0 0 6px 0;">${company}</div>
      ${emailRow}
      ${phoneRow}
    </td>
  </tr>
</table>`;
}

/** Plain-text counterpart for multipart emails. */
export function buildSyndicationXEmailSignatureText(
  overrides?: SyndicationXEmailSignatureVars,
): string {
  const v = resolveSignatureVars(overrides);
  const lines = [v.senderName, v.senderTitle, v.companyName];
  if (v.senderEmail) lines.push(v.senderEmail);
  if (v.senderPhone) lines.push(v.senderPhone);
  return lines.join("\n");
}

/**
 * Build logo block (signature uses a smaller inline logo; this remains for callers).
 */
export function buildSyndicationXEmailLogoImgHtml(): string {
  /*
  // PREVIOUS centered logo block
  const html = `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
  <tr>
    <td align="center" style="padding:20px 0 10px 0;">
      <img src="..." alt="SyndicationX" width="220" ... />
    </td>
  </tr>
</table>`;
  */
  const src = emailLogoSrc();
  if (!src) return "";
  return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0;">
  <tr>
    <td align="left" style="padding:0;">
      <img
        src="${escapeAttrUrl(src)}"
        alt="SyndicationX"
        width="140"
        border="0"
        style="display:block;width:140px;max-width:140px;height:auto;border:0;outline:none;text-decoration:none;"
      />
    </td>
  </tr>
</table>`;
}

/**
 * Brand header — outreach-style emails start with the body headline; no top brand bar.
 */
export function buildSyndicationXEmailBrandHeaderHtml(): string {
  /*
  // PREVIOUS brand header
  return `
<div style="margin:0 0 22px 0;padding-bottom:18px;border-bottom:1px solid #e2e8f0;">
  <span style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:${SX_EMAIL_PRIMARY};letter-spacing:-0.03em;">
    SyndicationX
  </span>
</div>`;
  */
  return "";
}

/**
 * Standard footer — two-column signature (logo | contact details).
 */
export function buildSyndicationXEmailFooterHtml(
  senderBrandEsc?: string,
): string {
  /*
  // PREVIOUS footer
  return `
<p style="font-size:14px;...">— ${senderBrandEsc}</p>
${logo}
<p style="font-size:11px;...">You received this email because of activity on SyndicationX.</p>`;
  */
  const companyName = senderBrandEsc
    ? senderBrandEsc
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
    : undefined;
  return buildSyndicationXEmailSignatureHtml(
    companyName ? { companyName } : undefined,
  );
}

/**
 * Auth footer — same signature layout (replaces “Thanks, The SyndicationX team” + logo).
 */
export function buildSyndicationXEmailAuthFooterHtml(): string {
  /*
  // PREVIOUS auth footer
  return `
<p style="...">Thanks,<br /><span>The SyndicationX team</span></p>
${logo}
<p style="...">© 2026 SyndicationX · All rights reserved</p>`;
  */
  return buildSyndicationXEmailSignatureHtml();
}
