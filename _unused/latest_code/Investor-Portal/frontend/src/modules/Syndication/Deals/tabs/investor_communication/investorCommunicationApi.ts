import { portalAuthHeaders } from "../../../../../common/auth/portalAuthHeaders"
import { getApiV1Base } from "../../../../../common/utils/apiBaseUrl"
import { isDisplayableEmail } from "../../../../../common/utils/displayEmail"
import {
  emailTemplateHtmlToPlainText,
  parseEmailInput,
} from "../../../../../common/features/send-mail"
import type { DealMailRecipient } from "./dealMailRecipients"
import type {
  InvestorCommunicationMailRow,
  InvestorCommunicationRecipient,
  InvestorCommunicationRecipientGroup,
} from "./investor-communication.types"

function authHeaders(): HeadersInit {
  return portalAuthHeaders()
}

function normalizeRecipient(raw: unknown): InvestorCommunicationRecipient | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const email = String(o.email ?? "").trim()
  const requiresRelease =
    o.requiresCosponsorRelease === true ||
    o.requires_cosponsor_release === true
  if (requiresRelease) return null
  const unavailable =
    email.toLowerCase() === "email unavailable" || email.toLowerCase() === "unavailable"
  if (!email.includes("@") && !unavailable && !o.addedByUserId && !o.sourceRowId)
    return null
  const groupsRaw = Array.isArray(o.groups) ? o.groups : []
  const groups = groupsRaw
    .map((g) => String(g).trim())
    .filter(
      (g): g is InvestorCommunicationRecipientGroup =>
        g === "investor" || g === "deal_member",
    )
  return {
    id: String(o.id ?? email).trim() || email || "held",
    displayName: String(o.displayName ?? o.display_name ?? email).trim() || email || "Investor",
    email,
    groups: groups.length > 0 ? groups : ["investor"],
    roleLabel: String(o.roleLabel ?? o.role_label ?? "—").trim() || "—",
    classKind:
      String(o.classKind ?? o.class_kind ?? "").trim().toLowerCase() === "gp"
        ? "gp"
        : String(o.classKind ?? o.class_kind ?? "").trim().toLowerCase() === "lp"
          ? "lp"
          : undefined,
    addedByUserId: String(o.addedByUserId ?? o.added_by_user_id ?? "").trim() || undefined,
    sponsorEmail: String(o.sponsorEmail ?? o.sponsor_email ?? "").trim() || undefined,
    addedByIsCoSponsor:
      o.addedByIsCoSponsor === true || o.added_by_is_co_sponsor === true || undefined,
    requiresCosponsorRelease: requiresRelease || undefined,
  }
}

function normalizeRecipientUsers(raw: unknown): InvestorCommunicationRecipient[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { recipientUsers?: unknown })?.recipientUsers)
      ? (raw as { recipientUsers: unknown[] }).recipientUsers
      : []
  return list
    .map(normalizeRecipient)
    .filter((r): r is InvestorCommunicationRecipient => r != null)
}

function normalizeMailRow(raw: unknown): InvestorCommunicationMailRow | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const id = String(o.id ?? "").trim()
  if (!id) return null
  const statusRaw = String(o.status ?? o.mail_status ?? "not_sent").trim()
  const status =
    statusRaw === "sent" || statusRaw === "failed" || statusRaw === "not_sent"
      ? statusRaw
      : "not_sent"
  const recipientUsers = normalizeRecipientUsers(
    o.recipientUsers ?? o.recipient_users,
  ).filter((r) => !r.requiresCosponsorRelease)
  const emails = new Set<string>()
  let hiddenDelivered = 0
  for (const r of recipientUsers) {
    const email = r.email.trim().toLowerCase()
    if (isDisplayableEmail(email)) {
      emails.add(email)
      continue
    }
    if (r.classKind === "gp") continue
    hiddenDelivered += 1
  }
  const recipientCount = emails.size + hiddenDelivered
  const sentTo = String(o.sentTo ?? o.sent_to ?? "").trim()
  const rawRecipients = Array.isArray(o.recipientUsers)
    ? o.recipientUsers
    : Array.isArray(o.recipient_users)
      ? o.recipient_users
      : []
  return {
    id,
    subject: String(o.subject ?? "").trim() || "—",
    sendFrom: String(o.sendFrom ?? o.send_from ?? o.sender_name ?? "").trim() || "—",
    senderId: String(o.senderId ?? o.sender_id ?? "").trim() || undefined,
    sentTo: sentTo || (recipientCount > 0 ? `${recipientCount} recipients` : "—"),
    recipientCount,
    recipientUsers,
    sentAt: String(o.sentAt ?? o.sent_at ?? "").trim() || new Date().toISOString(),
    status,
    templateId: String(o.templateId ?? o.template_id ?? "").trim() || null,
    heldForCosponsorRelease:
      o.heldForCosponsorRelease === true ||
      o.held_for_cosponsor_release === true ||
      rawRecipients.some((item) => {
        if (!item || typeof item !== "object") return false
        const rec = item as Record<string, unknown>
        return (
          rec.requiresCosponsorRelease === true ||
          rec.requires_cosponsor_release === true ||
          rec.heldLpReleasePending === true ||
          rec.held_lp_release_pending === true
        )
      }),
  }
}

export async function fetchDealInvestorCommunicationMails(
  dealId: string,
): Promise<{
  mails: InvestorCommunicationMailRow[]
  viewerCoSponsorEmailIntercept: "yes" | "no" | null
}> {
  const empty = {
    mails: [] as InvestorCommunicationMailRow[],
    viewerCoSponsorEmailIntercept: null as "yes" | "no" | null,
  }
  const base = getApiV1Base()
  if (!base || !dealId.trim()) return empty
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId.trim())}/investor-communication/mails`,
      { headers: { ...authHeaders() }, credentials: "include" },
    )
    const data = (await res.json().catch(() => ({}))) as {
      mails?: unknown
      viewerCoSponsorEmailIntercept?: unknown
    }
    if (!res.ok) return empty
    const interceptRaw = String(
      data.viewerCoSponsorEmailIntercept ?? "",
    )
      .trim()
      .toLowerCase()
    const viewerCoSponsorEmailIntercept =
      interceptRaw === "no" ? "no" : interceptRaw === "yes" ? "yes" : null
    if (!Array.isArray(data.mails)) {
      return { mails: [], viewerCoSponsorEmailIntercept }
    }
    return {
      viewerCoSponsorEmailIntercept,
      mails: data.mails
        .map(normalizeMailRow)
        .filter((r): r is InvestorCommunicationMailRow => r != null),
    }
  } catch {
    return empty
  }
}

export type PostDealInvestorCommunicationMailResult =
  | { ok: true; mail: InvestorCommunicationMailRow }
  | { ok: false; message: string; mail?: InvestorCommunicationMailRow }

export async function postDealInvestorCommunicationMail(params: {
  dealId: string
  templateId: string
  subject: string
  bodyHtml: string
  ccRaw?: string
  recipientUsers: DealMailRecipient[]
  deliveryEmails?: string[]
}): Promise<PostDealInvestorCommunicationMailResult> {
  const base = getApiV1Base()
  if (!base) {
    return { ok: false, message: "API is not configured." }
  }
  const cc = parseEmailInput(params.ccRaw ?? "")
  const bodyText = emailTemplateHtmlToPlainText(params.bodyHtml)
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(params.dealId.trim())}/investor-communication/mails`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          templateId: params.templateId,
          subject: params.subject,
          bodyHtml: params.bodyHtml,
          bodyText,
          cc,
          deliveryEmails: params.deliveryEmails ?? [],
          recipientUsers: params.recipientUsers.map((r) => ({
            id: r.id,
            displayName: r.displayName,
            email: r.email,
            groups: r.groups,
            roleLabel: r.roleLabel,
            classKind: r.classKind,
            requiresCosponsorRelease: r.requiresCosponsorRelease,
            includeCoSponsorOnSend: r.includeCoSponsorOnSend,
            sponsorName: r.sponsorName,
            sponsorEmail: r.sponsorEmail,
            sourceRowId: r.sourceRowId,
            sourceKind: r.sourceKind,
            addedByUserId: r.addedByUserId,
            addedByIsCoSponsor: r.addedByIsCoSponsor,
          })),
        }),
      },
    )
    const data = (await res.json().catch(() => ({}))) as {
      message?: unknown
      mail?: unknown
      sent?: unknown
    }
    const mail = normalizeMailRow(data.mail)
    if (!res.ok || data.sent === false) {
      return {
        ok: false,
        message:
          data.message != null ? String(data.message) : "Could not send email.",
        mail: mail ?? undefined,
      }
    }
    if (!mail) {
      return { ok: false, message: "Email sent but log response was invalid." }
    }
    return { ok: true, mail }
  } catch {
    return { ok: false, message: "Unable to connect. Try again later." }
  }
}

export async function deleteDealInvestorCommunicationMail(
  dealId: string,
  mailId: string,
): Promise<boolean> {
  const base = getApiV1Base()
  if (!base || !dealId.trim() || !mailId.trim()) return false
  try {
    const res = await fetch(
      `${base}/deals/${encodeURIComponent(dealId.trim())}/investor-communication/mails/${encodeURIComponent(mailId.trim())}`,
      {
        method: "DELETE",
        headers: { ...authHeaders() },
        credentials: "include",
      },
    )
    return res.ok
  } catch {
    return false
  }
}
