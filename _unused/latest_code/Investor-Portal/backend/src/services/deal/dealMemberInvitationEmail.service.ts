import { eq, sql } from "drizzle-orm";
import emailConfig, {
  outgoingMailCcBcc,
  smtpEnvelopeForSendMail,
} from "../../functions/emailconfig.js";
import {
  type DealInvitationSource,
  buildDealMemberInvitationEmailHtml,
  buildDealMemberInvitationEmailText,
} from "../../functions/dealMemberInvitationEmail.template.js";
import { db } from "../../database/db.js";
import { users } from "../../schema/auth.schema/signin.js";
import { contact } from "../../schema/contact.schema.js";
import { getAddDealFormById } from "./dealForm.service.js";
import { buildDealMemberInviteLandingUrl } from "./dealMemberInviteToken.service.js";

const SENDER_DISPLAY_NAME =
  process.env.SENDER_DISPLAY_NAME?.trim() || "SyndicationX";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function defaultSubject(
  dealName: string,
  source: DealInvitationSource,
  dealMemberRoleLabel: string,
  accountExists: boolean,
): string {
  const custom = process.env.DEAL_MEMBER_INVITE_SUBJECT?.trim();
  if (custom) return custom.replace(/\{dealName\}/g, dealName);
  if (accountExists && source !== "investor") {
    const r = dealMemberRoleLabel.trim();
    if (r && r !== "—") {
      return `You were added to ${dealName} as ${r} — sign in`;
    }
    return `You were added to ${dealName} — sign in`;
  }
  if (source === "investor") {
    return `You're invited to ${dealName} as an investor`;
  }
  const r = dealMemberRoleLabel.trim();
  if (r && r !== "—") {
    return `You're invited to ${dealName} — ${r}`;
  }
  return `You're invited to ${dealName} (deal team)`;
}

/**
 * Resolves an email for a `contact_id` / portal user id stored on `deal_investment`.
 */
function normalizeRecipientEmail(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").trim().toLowerCase();
  return t.includes("@") ? t : null;
}

export async function resolveEmailForContactMemberId(
  contactMemberId: string,
  contactEmailFallback?: string | null,
): Promise<string | null> {
  const fromClient = normalizeRecipientEmail(contactEmailFallback);
  if (fromClient) return fromClient;

  const id = contactMemberId.trim();
  if (!id) return null;
  const asEmail = normalizeRecipientEmail(id);
  if (asEmail) return asEmail;
  if (!UUID_RE.test(id)) return null;

  const [u] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  const fromUser = normalizeRecipientEmail(u?.email);
  if (fromUser) return fromUser;

  const [c] = await db
    .select({ email: contact.email })
    .from(contact)
    .where(eq(contact.id, id))
    .limit(1);
  const fromContact = normalizeRecipientEmail(c?.email);
  if (fromContact) return fromContact;

  return null;
}

export interface SendDealMemberInvitationParams {
  dealId: string
  toEmail: string
  memberDisplayName?: string
  /**
   * `investor` — from Investors tab; `deal_member` — from Deal members (email names the tab Role).
   */
  invitationSource: DealInvitationSource
  /** Shown in subject/body when `invitationSource` is `deal_member`. */
  dealMemberRoleLabel: string
}

export async function sendDealMemberInvitationEmail(
  params: SendDealMemberInvitationParams,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const to = params.toEmail.trim().toLowerCase();
  if (!to.includes("@")) {
    return { ok: false, error: new Error("Invalid recipient email") };
  }

  const deal = await getAddDealFormById(params.dealId);
  const dealName = deal?.dealName?.trim() || "this deal";
  const memberDisplayName = params.memberDisplayName?.trim() || "";
  const invitationSource = params.invitationSource;
  const dealMemberRoleLabel = (params.dealMemberRoleLabel ?? "").trim();
  const portalUrl =
    (await buildDealMemberInviteLandingUrl(params.dealId, to)) || "";
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(trim(${users.email})) = ${to}`)
    .limit(1);
  const accountExists = Boolean(existingUser);

  try {
    const transporter = emailConfig();
    const fromAddress = process.env.SENDER_EMAIL_ID?.trim() || "";
    if (!fromAddress) {
      return {
        ok: false,
        error: new Error(
          "SENDER_EMAIL_ID must be set (configure SMTP in .env.local).",
        ),
      };
    }

    const ccBcc = outgoingMailCcBcc();
    const html = buildDealMemberInvitationEmailHtml({
      dealName,
      memberDisplayName,
      memberEmail: to,
      portalDealUrl: portalUrl,
      senderBrand: SENDER_DISPLAY_NAME,
      invitationSource,
      dealMemberRoleLabel,
      accountExists,
    });
    const text = buildDealMemberInvitationEmailText({
      dealName,
      memberDisplayName,
      memberEmail: to,
      portalDealUrl: portalUrl,
      senderBrand: SENDER_DISPLAY_NAME,
      invitationSource,
      dealMemberRoleLabel,
      accountExists,
    });

    await transporter.sendMail({
      from: {
        name: SENDER_DISPLAY_NAME,
        address: fromAddress,
      },
      to,
      ...ccBcc,
      envelope: smtpEnvelopeForSendMail({
        fromAddress,
        to,
        cc: ccBcc.cc,
        bcc: ccBcc.bcc,
      }),
      subject: defaultSubject(
        dealName,
        invitationSource,
        dealMemberRoleLabel,
        accountExists,
      ),
      text,
      html,
    });
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error };
  }
}

/** After saving an investment: notify the investor by email when the form asked for it. */
export async function sendDealMemberInviteForInvestmentIfRequested(input: {
  dealId: string
  contactId: string
  contactDisplayName: string
  sendInvitationMail: string
  dealMemberRole?: string
  /** From Add Member / investment form when the UI already has the address. */
  contactEmail?: string | null
  /**
   * `deal_member` when saving via Deal Members (`deal_member` upsert);
   * `investor` for LP Investors tab / investor-framed invites.
   */
  invitationSource?: DealInvitationSource
}): Promise<void> {
  if (String(input.sendInvitationMail).toLowerCase() !== "yes") return;
  const to = await resolveEmailForContactMemberId(
    input.contactId,
    input.contactEmail,
  );
  if (!to) {
    console.warn(
      "sendDealMemberInviteForInvestmentIfRequested: no email for contact",
      input.contactId,
    );
    return;
  }
  const rawRole = String(input.dealMemberRole ?? "").trim();
  const invitationSource =
    input.invitationSource ??
    (rawRole ? "deal_member" : "investor");
  const result = await sendDealMemberInvitationEmail({
    dealId: input.dealId,
    toEmail: to,
    memberDisplayName: input.contactDisplayName,
    invitationSource,
    dealMemberRoleLabel:
      invitationSource === "deal_member" ? rawRole : "",
  });
  if (!result.ok) {
    console.warn(
      "sendDealMemberInviteForInvestmentIfRequested: send failed",
      result.error,
    );
    return;
  }
  const { markDealMemberInvitationMailSent } = await import(
    "./dealMember.service.js"
  );
  await markDealMemberInvitationMailSent(input.dealId, {
    contactMemberId: input.contactId,
    toEmail: to,
  });
}
