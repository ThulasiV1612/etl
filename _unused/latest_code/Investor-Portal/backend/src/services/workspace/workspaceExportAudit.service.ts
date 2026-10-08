import emailConfig, {
  getEmailBccFromEnv,
  getEmailCcFromEnv,
  outgoingMailCcBcc,
  smtpEnvelopeForSendMail,
} from "../../functions/emailconfig.js";

const SENDER_DISPLAY_NAME =
  process.env.SENDER_DISPLAY_NAME?.trim() || "SyndicationX";

export type WorkspaceExportAuditKind =
  | "contacts"
  | "members"
  | "companies"
  | "deals"
  | "deal_investors"
  | "deal_members";

export type WorkspaceExportAuditInput = {
  exporterDisplayName: string;
  exporterEmail: string;
  exporterOrgName: string;
  rowCount: number;
  exportedSampleLines?: string[];
};

export type WorkspaceExportAuditResult =
  | { status: "sent" }
  | { status: "skipped_no_recipient" }
  | { status: "failed"; error: unknown };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const EMAIL_FONT =
  "'Segoe UI',system-ui,-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif";

function copyForKind(kind: WorkspaceExportAuditKind): {
  textTitle: string;
  htmlTitle: string;
  intro: string;
  subjectEntity: string;
} {
  switch (kind) {
    case "members":
      return {
        textTitle: "Members export — SyndicationX",
        htmlTitle: "Members exported",
        intro: "A user exported the members list from the workspace.",
        subjectEntity: "Members",
      };
    case "companies":
      return {
        textTitle: "Companies export — SyndicationX",
        htmlTitle: "Companies exported",
        intro: "A user exported the company directory (customers).",
        subjectEntity: "Companies",
      };
    case "deals":
      return {
        textTitle: "Deals export — SyndicationX",
        htmlTitle: "Deals exported",
        intro: "A user exported the deals list from the workspace.",
        subjectEntity: "Deals",
      };
    case "deal_investors":
      return {
        textTitle: "Deal investors export — SyndicationX",
        htmlTitle: "Deal investors exported",
        intro: "A user exported investor rows for a deal.",
        subjectEntity: "Deal investors",
      };
    case "deal_members":
      return {
        textTitle: "Deal members export — SyndicationX",
        htmlTitle: "Deal members exported",
        intro: "A user exported deal member rows.",
        subjectEntity: "Deal members",
      };
    case "contacts":
    default:
      return {
        textTitle: "Contacts export — SyndicationX",
        htmlTitle: "Contacts exported",
        intro: "A user downloaded contacts from the workspace.",
        subjectEntity: "Contacts",
      };
  }
}

function metaRowHtml(label: string, valueHtml: string): string {
  return `<tr>
<td style="padding:14px 0;border-bottom:1px solid #f1f5f9;vertical-align:top;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr><td style="font-family:${EMAIL_FONT};font-size:12px;font-weight:600;color:#64748b;letter-spacing:0.02em;padding:0 0 4px 0;">${label}</td></tr>
<tr><td style="font-family:${EMAIL_FONT};font-size:15px;font-weight:500;color:#0f172a;line-height:1.45;padding:0;">${valueHtml}</td></tr>
</table>
</td>
</tr>`;
}

function buildBodies(
  kind: WorkspaceExportAuditKind,
  input: WorkspaceExportAuditInput,
): { text: string; html: string } {
  const { textTitle, htmlTitle, intro } = copyForKind(kind);
  const when = new Date().toISOString();

  const text = [
    textTitle,
    "",
    "Summary",
    `  Exported by:     ${input.exporterDisplayName}`,
    `  Organization:    ${input.exporterOrgName || "—"}`,
    `  Email:           ${input.exporterEmail || "(unknown)"}`,
    `  When (UTC):      ${when}`,
    `  Record count:    ${input.rowCount}`,
    "",
    "—",
    "Automated message. Do not reply.",
  ].join("\n");

  const metaRows =
    metaRowHtml("Exported by", escapeHtml(input.exporterDisplayName)) +
    metaRowHtml("Organization", escapeHtml(input.exporterOrgName || "—")) +
    metaRowHtml("Email", escapeHtml(input.exporterEmail || "(unknown)")) +
    metaRowHtml("When (UTC)", escapeHtml(when)) +
    `<tr>
<td style="padding:14px 0 0 0;vertical-align:top;border-bottom:none;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr><td style="font-family:${EMAIL_FONT};font-size:12px;font-weight:600;color:#64748b;letter-spacing:0.02em;padding:0 0 4px 0;">Records</td></tr>
<tr><td style="font-family:${EMAIL_FONT};font-size:22px;font-weight:600;color:#0f172a;line-height:1.2;padding:0;">${input.rowCount}</td></tr>
</table>
</td>
</tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="x-ua-compatible" content="ie=edge">
<title>${escapeHtml(htmlTitle)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;border-collapse:collapse;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border-collapse:collapse;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
<tr><td style="padding:28px 28px 8px 28px;border-bottom:1px solid #f1f5f9;">
<p style="margin:0;font-family:${EMAIL_FONT};font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#2463eb;">SyndicationX</p>
<h1 style="margin:8px 0 0 0;font-family:${EMAIL_FONT};font-size:20px;font-weight:600;color:#0f172a;line-height:1.25;">${escapeHtml(htmlTitle)}</h1>
<p style="margin:12px 0 0 0;font-family:${EMAIL_FONT};font-size:15px;line-height:1.55;color:#475569;">${escapeHtml(intro)}</p>
</td></tr>
<tr><td style="padding:8px 28px 4px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
${metaRows}
</table>
</td></tr>
<tr><td style="padding:0 28px 22px 28px;">
<p style="margin:0;font-family:${EMAIL_FONT};font-size:12px;line-height:1.5;color:#94a3b8;">This is an automated security audit message.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { text, html };
}

function exportAuditHasValidTo(to: string | string[]): boolean {
  if (typeof to === "string") return to.includes("@");
  return to.length > 0 && to.every((a) => a.includes("@"));
}

/** Normalize {@link getEmailBccFromEnv} into a list (export audit uses these as visible `To`). */
function emailBccEnvAsToList(): string[] {
  const v = getEmailBccFromEnv();
  if (!v) return [];
  return Array.isArray(v) ? [...v] : [v];
}

/**
 * Export audit: {@link process.env.EMAIL_BCC} addresses are always the primary `To` recipients
 * (not hidden Bcc). Optional legacy {@link process.env.SENDER_Update_EMAIL_ID} /
 * {@link process.env.CONTACTS_EXPORT_NOTIFY_EMAIL} is merged into `To` when set and not already listed.
 * If nothing resolves to a valid `To`, the send is skipped.
 */
export async function sendWorkspaceExportAuditNotification(
  kind: WorkspaceExportAuditKind,
  input: WorkspaceExportAuditInput,
): Promise<WorkspaceExportAuditResult> {
  const bccAsToList = emailBccEnvAsToList();
  const legacyTo =
    process.env.SENDER_Update_EMAIL_ID?.trim() ||
    process.env.CONTACTS_EXPORT_NOTIFY_EMAIL?.trim() ||
    "";

  const toList: string[] = [...bccAsToList];
  if (legacyTo && legacyTo.includes("@")) {
    const legacyNorm = legacyTo.toLowerCase();
    if (!toList.some((a) => a.toLowerCase() === legacyNorm)) {
      toList.push(legacyNorm);
    }
  }

  const to: string | string[] =
    toList.length === 0 ? "" : toList.length === 1 ? toList[0]! : toList;

  if (!exportAuditHasValidTo(to)) {
    return { status: "skipped_no_recipient" };
  }

  const fromAddress = process.env.SENDER_EMAIL_ID?.trim() || "";
  if (!fromAddress) {
    return {
      status: "failed",
      error: new Error("SENDER_EMAIL_ID must be set to send export notifications."),
    };
  }

  const { subjectEntity } = copyForKind(kind);
  const subject = `[SyndicationX] ${subjectEntity} exported (${input.rowCount} record${input.rowCount === 1 ? "" : "s"})`;

  /** When BCC env addresses are on `To`, do not repeat them in a `bcc` header. */
  const bccEnvUsedOnTo = bccAsToList.length > 0;
  const ccOnly = getEmailCcFromEnv();
  const envelopeExtras = bccEnvUsedOnTo
    ? ccOnly
      ? { cc: ccOnly }
      : {}
    : outgoingMailCcBcc();

  const extCc = "cc" in envelopeExtras ? envelopeExtras.cc : undefined;
  const extBcc = "bcc" in envelopeExtras ? envelopeExtras.bcc : undefined;

  try {
    const transporter = emailConfig();
    const { text, html } = buildBodies(kind, input);
    await transporter.sendMail({
      from: {
        name: SENDER_DISPLAY_NAME,
        address: fromAddress,
      },
      to,
      ...envelopeExtras,
      envelope: smtpEnvelopeForSendMail({
        fromAddress,
        to,
        cc: extCc,
        bcc: extBcc,
      }),
      subject,
      text,
      html,
    });
    return { status: "sent" };
  } catch (error: unknown) {
    console.error("sendWorkspaceExportAuditNotification:", error);
    return { status: "failed", error };
  }
}
