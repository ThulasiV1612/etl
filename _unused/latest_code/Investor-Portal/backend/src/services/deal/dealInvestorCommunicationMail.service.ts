import { and, desc, eq, inArray } from "drizzle-orm";
import emailConfig, {
  getEmailBccFromEnv,
  smtpEnvelopeForSendMail,
} from "../../functions/emailconfig.js";
import { db } from "../../database/db.js";
import { users } from "../../schema/auth.schema/signin.js";
import {
  investorCommunicationLogs,
  type DealInvestorCommunicationRecipient,
  type DealInvestorCommunicationRecipientsStored,
} from "../../schema/deal.schema/deal-investor-communication-mail.schema.js";
import { getUserDisplayNameById } from "../contact/contact.service.js";
import { applyInvestorCommunicationDeliveryRouting, loadUnredactedDealInvestors } from "./dealInvestorCommunicationRouting.service.js";
import { getViewerCoSponsorEmailIntercept } from "./dealCoSponsorEmailIntercept.service.js";
import {
  isPortalUserCoSponsorOnDeal,
  isPortalUserLeadOrAdminSponsorOnDeal,
  listEquivalentPortalUserIdsForUser,
} from "./dealMemberScope.service.js";

export type DealInvestorCommunicationMailStatus =
  | "sent"
  | "not_sent"
  | "failed";

export interface DealInvestorCommunicationMailApiRow {
  id: string;
  subject: string;
  sendFrom: string;
  senderId: string;
  sentTo: string;
  recipientCount: number;
  recipientUsers: DealInvestorCommunicationRecipient[];
  sentAt: string;
  status: DealInvestorCommunicationMailStatus;
  templateId: string | null;
  heldForCosponsorRelease: boolean;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeMailStatus(raw: string): DealInvestorCommunicationMailStatus {
  const s = raw.trim().toLowerCase();
  if (s === "sent" || s === "failed" || s === "not_sent") return s;
  return "not_sent";
}

function isUsableSentEmail(raw: unknown): boolean {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!email.includes("@")) return false;
  if (email === "email unavailable") return false;
  return true;
}

/** Unique people/addresses that actually received this mail. */
function uniqueSentEmailCount(
  recipients: DealInvestorCommunicationRecipient[],
): number {
  const emails = new Set<string>();
  let hiddenDelivered = 0;
  for (const r of recipients) {
    if (r.requiresCosponsorRelease === true) continue;
    if (isUsableSentEmail(r.email)) {
      emails.add(String(r.email).trim().toLowerCase());
      continue;
    }
    if (r.heldLpReleasePending === true) continue;
    if (r.addedByIsCoSponsor === true && r.classKind !== "gp") {
      hiddenDelivered += 1;
    }
  }
  return emails.size + hiddenDelivered;
}

function withSentToCount(
  row: DealInvestorCommunicationMailApiRow,
): DealInvestorCommunicationMailApiRow {
  const recipientCount = uniqueSentEmailCount(row.recipientUsers);
  return {
    ...row,
    recipientCount,
    sentTo: formatSentToLabel(recipientCount),
  };
}

function isHeldUnsentCoSponsorLp(
  r: DealInvestorCommunicationRecipient,
): boolean {
  return r.requiresCosponsorRelease === true;
}

function isCoSponsorLpRecipient(
  r: DealInvestorCommunicationRecipient,
  coSponsorAdderIds: Set<string>,
): boolean {
  if (r.classKind === "gp") return false;
  if (r.addedByIsCoSponsor === true) return true;
  const adder = String(r.addedByUserId ?? "").trim().toLowerCase();
  return Boolean(adder && coSponsorAdderIds.has(adder));
}

function redactCoSponsorLpEmails(
  recipients: DealInvestorCommunicationRecipient[],
  coSponsorAdderIds: Set<string>,
): DealInvestorCommunicationRecipient[] {
  return recipients.map((r) => {
    if (!isCoSponsorLpRecipient(r, coSponsorAdderIds)) return r;
    const name = String(r.displayName ?? "").trim();
    return {
      ...r,
      email: "Email unavailable",
      displayName: name.includes("@") ? "Investor" : name || "Investor",
    };
  });
}

async function coSponsorAdderIdSet(
  dealId: string,
  recipients: DealInvestorCommunicationRecipient[],
): Promise<Set<string>> {
  const ids = [
    ...new Set(
      recipients
        .map((r) => String(r.addedByUserId ?? "").trim())
        .filter((id) => UUID_RE.test(id)),
    ),
  ];
  const out = new Set<string>();
  await Promise.all(
    ids.map(async (id) => {
      if (await isPortalUserCoSponsorOnDeal(dealId, id)) {
        out.add(id.toLowerCase());
      }
    }),
  );
  return out;
}

async function presentMailRowToLeadOrAdmin(
  dealId: string,
  row: DealInvestorCommunicationMailApiRow,
): Promise<DealInvestorCommunicationMailApiRow> {
  const recipientUsers = redactCoSponsorLpEmails(
    row.recipientUsers.filter((r) => !isHeldUnsentCoSponsorLp(r)),
    await coSponsorAdderIdSet(dealId, row.recipientUsers),
  );
  return {
    ...row,
    recipientUsers,
    recipientCount: uniqueSentEmailCount(recipientUsers),
    sentTo: formatSentToLabel(uniqueSentEmailCount(recipientUsers)),
  };
}

function recipientsVisibleAsSent(
  recipients: DealInvestorCommunicationRecipient[],
): DealInvestorCommunicationRecipient[] {
  return recipients.filter((r) => {
    if (r.requiresCosponsorRelease === true) return false;
    if (isUsableSentEmail(r.email) || r.heldLpReleasePending === true) return true;
    return r.addedByIsCoSponsor === true && r.classKind !== "gp";
  });
}

function parseStoredRecipientPayload(raw: unknown): {
  users: DealInvestorCommunicationRecipient[];
  deliveryEmails: string[];
} {
  if (Array.isArray(raw)) {
    return { users: raw as DealInvestorCommunicationRecipient[], deliveryEmails: [] };
  }
  if (raw && typeof raw === "object") {
    const o = raw as {
      users?: unknown;
      deliveryEmails?: unknown;
    };
    const users = Array.isArray(o.users)
      ? (o.users as DealInvestorCommunicationRecipient[])
      : [];
    const deliveryEmails = Array.isArray(o.deliveryEmails)
      ? o.deliveryEmails
          .map((e) => String(e ?? "").trim().toLowerCase())
          .filter((e) => e.includes("@"))
      : [];
    return { users, deliveryEmails };
  }
  return { users: [], deliveryEmails: [] };
}

function formatSentToLabel(sentCount: number): string {
  if (sentCount <= 0) return "—";
  if (sentCount === 1) return "1 recipient";
  return `${sentCount} recipients`;
}

function mapRowToApi(
  row: typeof investorCommunicationLogs.$inferSelect,
): DealInvestorCommunicationMailApiRow {
  const stored = parseStoredRecipientPayload(row.recipientUsers);
  const senderName = row.senderName?.trim() || "—";
  const sentAt = row.sentAt ?? row.createdAt;
  return withSentToCount({
    id: row.id,
    subject: row.subject?.trim() || "—",
    sendFrom: senderName,
    senderId: String(row.senderId ?? "").trim(),
    sentTo: "",
    recipientCount: 0,
    recipientUsers: recipientsVisibleAsSent(stored.users),
    sentAt: sentAt.toISOString(),
    status: normalizeMailStatus(row.mailStatus),
    templateId: row.templateId ? String(row.templateId) : null,
    heldForCosponsorRelease:
      stored.users.some(
        (r) =>
          r.requiresCosponsorRelease === true ||
          r.heldLpReleasePending === true,
      ),
  });
}

export async function listDealInvestorCommunicationMails(
  dealId: string,
  viewerUserId?: string,
): Promise<DealInvestorCommunicationMailApiRow[]> {
  const rows = await db
    .select()
    .from(investorCommunicationLogs)
    .where(eq(investorCommunicationLogs.dealId, dealId))
    .orderBy(
      desc(investorCommunicationLogs.sentAt),
      desc(investorCommunicationLogs.createdAt),
    );
  const mapped = rows.map(mapRowToApi);
  const viewer = String(viewerUserId ?? "").trim();
  if (!viewer) return mapped;

  if (await isPortalUserCoSponsorOnDeal(dealId, viewer)) {
    return scopeMailsForCoSponsorViewer(dealId, mapped, viewer);
  }

  const hideCoSponsorLpEmails = await isPortalUserLeadOrAdminSponsorOnDeal(
    dealId,
    viewer,
  );
  if (!hideCoSponsorLpEmails) return mapped;
  return Promise.all(
    mapped.map((row) => presentMailRowToLeadOrAdmin(dealId, row)),
  );
}

function recipientOwnedByCoSponsor(
  r: DealInvestorCommunicationRecipient,
  ownerIds: Set<string>,
  ownerEmails: Set<string>,
  myInvestorIds: Set<string>,
  myInvestorEmails: Set<string>,
): boolean {
  const sid = sourceRowIdFromStoredRecipient(r).toLowerCase();
  if (sid && myInvestorIds.has(sid)) return true;
  const uid = String(r.addedByUserId ?? "").trim().toLowerCase();
  if (uid && ownerIds.has(uid) && r.classKind !== "gp") return true;
  const sponsor = String(r.sponsorEmail ?? "").trim().toLowerCase();
  if (sponsor.includes("@") && ownerEmails.has(sponsor) && r.classKind !== "gp") {
    return true;
  }
  const own = usableRecipientEmail(r.email);
  if (own && myInvestorEmails.has(own) && r.classKind !== "gp") return true;
  if (
    own &&
    ownerEmails.has(own) &&
    (r.classKind === "gp" || r.heldLpReleasePending === true)
  ) {
    return true;
  }
  return false;
}

function usableRecipientEmail(raw: unknown): string {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!email.includes("@")) return "";
  if (email === "email unavailable") return "";
  return email;
}

function sourceRowIdFromStoredRecipient(
  r: DealInvestorCommunicationRecipient,
): string {
  const explicit = String(r.sourceRowId ?? "").trim();
  if (explicit) return explicit;
  const id = String(r.id ?? "").trim();
  const m = /^(?:investor|member)-([0-9a-f-]{36})/i.exec(id);
  return m?.[1] ?? "";
}

function applyInvestorEmailsToRecipients(
  recipients: DealInvestorCommunicationRecipient[],
  byId: Map<string, string>,
  byName: Map<string, string>,
): DealInvestorCommunicationRecipient[] {
  if (recipients.length === 0) return recipients;
  return recipients.map((r) => {
    if (usableRecipientEmail(r.email)) return r;
    const rowId = sourceRowIdFromStoredRecipient(r).toLowerCase();
    const fromId = rowId ? byId.get(rowId) : undefined;
    const fromName = byName.get(
      String(r.displayName ?? "").trim().toLowerCase(),
    );
    const email = fromId || fromName || "";
    if (!email) return r;
    return { ...r, email };
  });
}

async function scopeMailsForCoSponsorViewer(
  dealId: string,
  mails: DealInvestorCommunicationMailApiRow[],
  viewerUserId: string,
): Promise<DealInvestorCommunicationMailApiRow[]> {
  const equivIds = await listEquivalentPortalUserIdsForUser(viewerUserId);
  const ownerIds = new Set(
    equivIds.map((id) => id.trim().toLowerCase()).filter(Boolean),
  );
  ownerIds.add(viewerUserId.trim().toLowerCase());
  const ownerEmails = new Set<string>();
  const uuidIds = [...ownerIds].filter((id) => UUID_RE.test(id));
  if (uuidIds.length > 0) {
    const actors = await db
      .select({ email: users.email })
      .from(users)
      .where(inArray(users.id, uuidIds));
    for (const actor of actors) {
      const email = String(actor.email ?? "").trim().toLowerCase();
      if (email.includes("@")) ownerEmails.add(email);
    }
  }

  const investors = await loadUnredactedDealInvestors(dealId, viewerUserId);
  const intercept = await getViewerCoSponsorEmailIntercept(
    dealId,
    viewerUserId,
  );
  const investorsHeld = intercept === "no";
  const emailById = new Map<string, string>();
  const emailByName = new Map<string, string>();
  const myInvestorIds = new Set<string>();
  const myInvestorEmails = new Set<string>();
  for (const inv of investors) {
    const adder = String(
      (inv as { addedByUserId?: string }).addedByUserId ?? "",
    )
      .trim()
      .toLowerCase();
    const adderEmail = usableRecipientEmail(
      (inv as { addedByEmail?: string }).addedByEmail,
    );
    const ownedByViewer =
      (adder && ownerIds.has(adder)) ||
      (adderEmail && ownerEmails.has(adderEmail));
    const id = String(inv.id ?? "").trim().toLowerCase();
    const email = usableRecipientEmail(inv.userEmail);
    if (ownedByViewer) {
      if (id) myInvestorIds.add(id);
      if (email) myInvestorEmails.add(email);
    }
    if (!email) continue;
    if (id) emailById.set(id, email);
    const name = String(inv.displayName ?? inv.userDisplayName ?? "")
      .trim()
      .toLowerCase();
    if (name) emailByName.set(name, email);
  }

  const out: DealInvestorCommunicationMailApiRow[] = [];
  for (const row of mails) {
    const mine = row.recipientUsers.filter((r) =>
      recipientOwnedByCoSponsor(
        r,
        ownerIds,
        ownerEmails,
        myInvestorIds,
        myInvestorEmails,
      ),
    );
    const sentByMe = ownerIds.has(
      String(row.senderId ?? "").trim().toLowerCase(),
    );
    if (mine.length === 0 && !sentByMe && !row.heldForCosponsorRelease) {
      continue;
    }
    const myInvestors = mine.filter((r) => r.classKind !== "gp");
    const scoped = myInvestors.length > 0
      ? myInvestors
      : sentByMe
        ? row.recipientUsers.filter((r) => r.classKind !== "gp")
        : mine;
    const recipientUsers = recipientsVisibleAsSent(
      applyInvestorEmailsToRecipients(scoped, emailById, emailByName),
    );
    const pendingRelease = Boolean(
      !sentByMe &&
        (investorsHeld ||
          recipientUsers.some(
            (r) =>
              r.requiresCosponsorRelease === true ||
              r.heldLpReleasePending === true,
          )),
    );
    const visibleRecipients = pendingRelease ? [] : recipientUsers;
    out.push(
      withSentToCount({
        ...row,
        recipientUsers: visibleRecipients,
        recipientCount: 0,
        sentTo: "",
        status: pendingRelease ? "not_sent" : row.status,
        heldForCosponsorRelease: pendingRelease,
      }),
    );
  }
  return out;
}

function parseRecipientUsers(
  raw: unknown,
): DealInvestorCommunicationRecipient[] {
  if (!Array.isArray(raw)) return [];
  const out: DealInvestorCommunicationRecipient[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const email = String(o.email ?? "").trim().toLowerCase();
    const sponsorEmail = String(o.sponsorEmail ?? o.sponsor_email ?? "")
      .trim()
      .toLowerCase();
    const requiresCosponsorRelease =
      o.requiresCosponsorRelease === true ||
      o.requires_cosponsor_release === true;
    const addedByIsCoSponsor =
      o.addedByIsCoSponsor === true || o.added_by_is_co_sponsor === true;
    const sourceRowId = String(o.sourceRowId ?? o.source_row_id ?? "").trim();
    if (
      !email.includes("@") &&
      !sourceRowId &&
      !(
        sponsorEmail.includes("@") &&
        (requiresCosponsorRelease || addedByIsCoSponsor)
      )
    ) {
      continue;
    }
    const groupsRaw = Array.isArray(o.groups) ? o.groups : [];
    const groups = groupsRaw
      .map((g) => String(g).trim())
      .filter(
        (g): g is "investor" | "deal_member" =>
          g === "investor" || g === "deal_member",
      );
    const classKindRaw = String(o.classKind ?? o.class_kind ?? "")
      .trim()
      .toLowerCase();
    const sourceKindRaw = String(o.sourceKind ?? o.source_kind ?? "")
      .trim()
      .toLowerCase();
    const addedByUserId = String(o.addedByUserId ?? o.added_by_user_id ?? "")
      .trim();
    out.push({
      id: String(o.id ?? (email || sponsorEmail)).trim() || email || sponsorEmail,
      displayName: String(o.displayName ?? email).trim() || email || "Investor",
      email,
      groups: groups.length > 0 ? groups : ["investor"],
      roleLabel: String(o.roleLabel ?? "").trim() || undefined,
      classKind: classKindRaw === "gp" || classKindRaw === "lp" ? classKindRaw : undefined,
      requiresCosponsorRelease: requiresCosponsorRelease || undefined,
      sponsorName: String(o.sponsorName ?? o.sponsor_name ?? "").trim() || undefined,
      sponsorEmail: sponsorEmail.includes("@") ? sponsorEmail : undefined,
      sourceRowId: sourceRowId || undefined,
      sourceKind:
        sourceKindRaw === "member" || sourceKindRaw === "investor"
          ? sourceKindRaw
          : undefined,
      addedByUserId: addedByUserId || undefined,
      addedByIsCoSponsor: addedByIsCoSponsor || undefined,
    });
  }
  const byId = new Map<string, DealInvestorCommunicationRecipient>();
  for (const r of out) {
    const key = r.id || r.email;
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, r);
      continue;
    }
    for (const g of r.groups) {
      if (!existing.groups.includes(g)) existing.groups.push(g);
    }
  }
  return [...byId.values()];
}

function normalizeAddressList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [
    ...new Set(
      v.map((x) => String(x).trim()).filter((x) => x.includes("@")),
    ),
  ];
}

async function resolveSenderEmail(userId: string): Promise<string> {
  const [actor] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const email = actor?.email?.trim() ?? "";
  return email.includes("@") ? email : "";
}

export interface SendDealInvestorCommunicationMailInput {
  dealId: string;
  senderId: string;
  templateId?: string | null;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  cc?: string[];
  recipientUsers: DealInvestorCommunicationRecipient[];
  deliveryEmails?: string[];
}

export async function sendDealInvestorCommunicationMail(
  input: SendDealInvestorCommunicationMailInput,
): Promise<
  | { ok: true; row: DealInvestorCommunicationMailApiRow }
  | { ok: false; message: string; row?: DealInvestorCommunicationMailApiRow }
> {
  const parsed = parseRecipientUsers(input.recipientUsers);
  const routed = await applyInvestorCommunicationDeliveryRouting({
    dealId: input.dealId,
    senderId: input.senderId,
    recipients: parsed,
  });
  const recipients = routed.recipients;
  const clientDelivery = normalizeAddressList(input.deliveryEmails);
  const deliveryEmails =
    routed.deliveryEmails.length > 0
      ? routed.deliveryEmails
      : clientDelivery.length > 0
        ? clientDelivery
        : [
            ...new Set(
              recipients.flatMap((r) => {
                if (r.requiresCosponsorRelease && r.sponsorEmail?.includes("@"))
                  return [r.sponsorEmail];
                if (r.email.includes("@")) return [r.email];
                return [];
              }),
            ),
          ];
  const subject = input.subject.trim();
  const senderEmail = await resolveSenderEmail(input.senderId);
  const senderName = await getUserDisplayNameById(input.senderId);
  const cc = normalizeAddressList(input.cc);
  const now = new Date();

  const templateId =
    input.templateId && UUID_RE.test(input.templateId.trim())
      ? input.templateId.trim()
      : null;

  async function insertLog(mailStatus: DealInvestorCommunicationMailStatus) {
    const [inserted] = await db
      .insert(investorCommunicationLogs)
      .values({
        dealId: input.dealId,
        templateId,
        senderId: input.senderId,
        senderName: senderName || senderEmail || "—",
        subject: subject || "—",
        recipientUsers: {
          users: recipients,
          deliveryEmails,
        } satisfies DealInvestorCommunicationRecipientsStored,
        mailStatus,
        sentAt: mailStatus === "sent" ? now : null,
      })
      .returning();
    return inserted ? mapRowToApi(inserted) : null;
  }

  async function presentLoggedRow(
    row: DealInvestorCommunicationMailApiRow | null,
  ): Promise<DealInvestorCommunicationMailApiRow | null> {
    if (!row) return null;
    if (
      await isPortalUserLeadOrAdminSponsorOnDeal(input.dealId, input.senderId)
    ) {
      return presentMailRowToLeadOrAdmin(input.dealId, row);
    }
    return row;
  }

  if (deliveryEmails.length === 0) {
    return { ok: false, message: "At least one valid recipient is required" };
  }
  if (!subject) {
    return { ok: false, message: "Email subject is required" };
  }
  if (!senderEmail) {
    return { ok: false, message: "Sender user email is required" };
  }

  const configuredSenderAddress = String(process.env.SENDER_EMAIL_ID ?? "").trim();
  if (!configuredSenderAddress.includes("@")) {
    return {
      ok: false,
      message: "Sender email is not configured on server",
    };
  }

  const envBccRaw = getEmailBccFromEnv();
  const envBcc = Array.isArray(envBccRaw)
    ? envBccRaw.map((x) => String(x).trim()).filter((x) => x.includes("@"))
    : envBccRaw
      ? String(envBccRaw)
          .split(",")
          .map((x) => x.trim())
          .filter((x) => x.includes("@"))
      : [];
  const senderNorm = senderEmail.toLowerCase();
  const headerTo = [senderEmail];
  const bcc = [
    ...new Set(
      [...deliveryEmails, ...envBcc].filter(
        (addr) => addr.toLowerCase() !== senderNorm,
      ),
    ),
  ];

  try {
    const transporter = emailConfig();
    await transporter.sendMail({
      from: senderEmail,
      to: headerTo,
      ...(cc.length > 0 ? { cc } : {}),
      ...(bcc.length > 0 ? { bcc } : {}),
      replyTo: senderEmail,
      subject,
      html: input.bodyHtml || "<p></p>",
      text: input.bodyText || "",
      envelope: smtpEnvelopeForSendMail({
        fromAddress: configuredSenderAddress,
        to: headerTo,
        ...(cc.length > 0 ? { cc } : {}),
        ...(bcc.length > 0 ? { bcc } : {}),
      }),
    });
    const row = await presentLoggedRow(await insertLog("sent"));
    if (!row) {
      return { ok: false, message: "Email sent but log could not be saved" };
    }
    return { ok: true, row };
  } catch (err) {
    console.error("sendDealInvestorCommunicationMail:", err);
    const row = await presentLoggedRow(await insertLog("failed"));
    const detail =
      err instanceof Error && err.message.trim()
        ? err.message.trim()
        : "Could not send email";
    return {
      ok: false,
      message: detail,
      row: row ?? undefined,
    };
  }
}

export async function deleteDealInvestorCommunicationMail(
  dealId: string,
  mailId: string,
): Promise<boolean> {
  const result = await db
    .delete(investorCommunicationLogs)
    .where(
      and(
        eq(investorCommunicationLogs.id, mailId),
        eq(investorCommunicationLogs.dealId, dealId),
      ),
    )
    .returning({ id: investorCommunicationLogs.id });
  return result.length > 0;
}
