import {
  buildSyndicationXEmailBrandHeaderHtml,
  buildSyndicationXEmailFooterHtml,
  buildSyndicationXEmailSignatureText,
  SX_EMAIL_BUTTON_STYLE,
  SX_EMAIL_MUTED,
  SX_EMAIL_PAGE_BG,
} from "./emailSyndicationXLayout.js";

export type DealInvitationSource = "investor" | "deal_member";

export interface DealMemberInvitationTemplateVars {
  dealName: string;
  memberDisplayName: string;
  memberEmail: string;
  /** Absolute URL to open this deal in SyndicationX (from FRONTEND_URL / BASE_URL). */
  portalDealUrl: string;
  /** Product / org line, e.g. from SENDER_DISPLAY_NAME */
  senderBrand: string;
  /**
   * `investor` — email triggered from the Investors tab (framed as an **investor**).
   * `deal_member` — from Deal members tab; copy includes `dealMemberRoleLabel` from that tab’s Role.
   */
  invitationSource: DealInvitationSource;
  /**
   * Human-readable deal role(s) e.g. “Sponsor, Investor” — set when `invitationSource` is
   * `deal_member` (from row Role column).
   */
  dealMemberRoleLabel: string;
  /** True when this invited email already has a portal account. */
  accountExists?: boolean;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function roleLine(v: DealMemberInvitationTemplateVars): string {
  const existingDealMember = Boolean(v.accountExists) && v.invitationSource === "deal_member";
  if (existingDealMember) {
    const r = (v.dealMemberRoleLabel ?? "").trim();
    if (!r || r === "—") {
      return "An account already exists for this email. Sign in to SyndicationX to open this deal and continue.";
    }
    return `An account already exists for this email. You’ve been invited to this deal with role ${r}. Sign in to SyndicationX to open the deal and continue.`;
  }
  if (v.invitationSource !== "deal_member") return "";
  const r = (v.dealMemberRoleLabel ?? "").trim();
  if (!r || r === "—") {
    return "You’ve been invited in a deal team role. Sign in to SyndicationX to view this deal and next steps.";
  }
  return `You’ve been invited to this deal with the following role: ${r}. Sign in to SyndicationX to view the offering and next steps.`;
}

function investorLine(): string {
  return "You’ve been invited to participate in this deal as an investor. Sign in to SyndicationX to view the offering and next steps.";
}

/** Plain-text body: Investors tab = investor; Deal members tab = includes role from that tab. */
export function buildDealMemberInvitationEmailText(
  v: DealMemberInvitationTemplateVars,
): string {
  const bodyIntro = v.invitationSource === "investor" ? investorLine() : roleLine(v);
  const lines = [
    `You're invited — ${v.dealName} · SyndicationX`,
    "",
    v.memberDisplayName ? `Hello ${v.memberDisplayName},` : "Hello,",
    "",
    bodyIntro,
    v.portalDealUrl
      ? `Open in SyndicationX: ${v.portalDealUrl}`
      : "Sign in to SyndicationX to view details.",
    "",
    `This message was sent to: ${v.memberEmail}`,
    "",
    buildSyndicationXEmailSignatureText({ companyName: v.senderBrand }),
  ];
  return lines.join("\n");
}

/** HTML body for investor invitation / deal team invitation emails. */
export function buildDealMemberInvitationEmailHtml(
  v: DealMemberInvitationTemplateVars,
): string {
  const deal = escHtml(v.dealName);
  const name = escHtml(v.memberDisplayName || "there");
  const email = escHtml(v.memberEmail);
  const brand = escHtml(v.senderBrand);
  const url = v.portalDealUrl;
  const href = escHtml(url);
  const buttonBlock = url
    ? `<div style="margin:24px 0;">
  <a href="${href}" style="${SX_EMAIL_BUTTON_STYLE}">Open in SyndicationX</a>
</div>`
    : `<p style="font-size:14px;line-height:1.6;color:${SX_EMAIL_MUTED};font-family:Arial,Helvetica,sans-serif;">Sign in to SyndicationX to view this deal.</p>`;

  const isInvestor = v.invitationSource === "investor";
  const existingDealMember = Boolean(v.accountExists) && !isInvestor;
  const pageTitle = isInvestor ? "Invitation — Invest" : "Invitation — Deal team";
  const h1 = existingDealMember
    ? "Sign in to open this deal"
    : isInvestor
      ? "You’re invited to invest"
      : "You’re invited to the deal team";
  const bodyPara = isInvestor
    ? `<p style="font-size:16px;line-height:1.6;color:#111827;margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;">Great news — <strong>${deal}</strong> is ready for you <strong>as an investor</strong>. Use SyndicationX to review the offering, documents, and next steps.</p>`
    : (() => {
        const r = (v.dealMemberRoleLabel ?? "").trim();
        if (existingDealMember) {
          if (!r || r === "—") {
            return `<p style="font-size:16px;line-height:1.6;color:#111827;margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;">An account already exists for <strong>${email}</strong>. You’ve been added to <strong>${deal}</strong> as part of the <strong>deal team</strong>. Sign in to open the deal and continue.</p>`;
          }
          const roleEsc = escHtml(r);
          return `<p style="font-size:16px;line-height:1.6;color:#111827;margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;">An account already exists for <strong>${email}</strong>. You’ve been invited to <strong>${deal}</strong> with role <strong>${roleEsc}</strong>. Sign in to open the deal and continue.</p>`;
        }
        if (!r || r === "—") {
          return `<p style="font-size:16px;line-height:1.6;color:#111827;margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;">You’ve been added to <strong>${deal}</strong> as part of the <strong>deal team</strong>. Sign in to SyndicationX to see the workspace and what’s needed from you.</p>`;
        }
        const roleEsc = escHtml(r);
        return `<p style="font-size:16px;line-height:1.6;color:#111827;margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;">You’ve been invited to <strong>${deal}</strong> with role <strong>${roleEsc}</strong>. Sign in to SyndicationX to open the deal and collaborate.</p>`;
      })();

  const brandHeader = buildSyndicationXEmailBrandHeaderHtml();
  const footer = buildSyndicationXEmailFooterHtml(brand);

  /*
  // PREVIOUS card chrome template retained for reference — replaced with outreach-style layout
  */

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(pageTitle)}</title>
</head>
<body style="margin:0;padding:0;background:${SX_EMAIL_PAGE_BG};font-family:Arial,Helvetica,sans-serif;color:#111827;">
<div style="max-width:560px;margin:0 auto;padding:28px 20px;">
  ${brandHeader}
  <h1 style="color:#111827;font-size:26px;line-height:1.25;margin:0 0 18px 0;font-family:Arial,Helvetica,sans-serif;font-weight:700;">${h1}</h1>
  <p style="font-size:16px;line-height:1.6;color:#111827;margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;">Hello ${name},</p>
  ${bodyPara}
  ${buttonBlock}
  <p style="font-size:13px;line-height:1.5;color:${SX_EMAIL_MUTED};margin:20px 0 0 0;font-family:Arial,Helvetica,sans-serif;">This message was sent to <strong style="color:#374151;">${email}</strong>.</p>
  ${footer}
</div>
</body>
</html>`;
}
