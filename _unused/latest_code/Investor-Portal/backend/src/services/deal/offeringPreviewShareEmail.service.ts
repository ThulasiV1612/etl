import emailConfig, {
  outgoingMailCcBcc,
  smtpEnvelopeForSendMail,
} from "../../functions/emailconfig.js";
import {
  buildOfferingPreviewShareEmailHtml,
  buildOfferingPreviewShareEmailText,
} from "../../functions/offeringPreviewShareEmail.template.js";
import { encryptOfferingPreviewDealId } from "../../utils/offeringPreviewCrypto.js";
import {
  mintOfferingPreviewSponsorRef,
  publicOfferingPreviewUrlWithRef,
} from "./offeringPreviewSponsorRef.service.js";
import { isPortalUserSponsorOnDeal } from "./dealMemberScope.service.js";
import { getAddDealFormById } from "./dealForm.service.js";

const SENDER_DISPLAY_NAME =
  process.env.SENDER_DISPLAY_NAME?.trim() || "SyndicationX";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export const OFFERING_PREVIEW_SHARE_MAX_RECIPIENTS = 40;

function dedupeEmails(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const e = raw.trim().toLowerCase()
    if (!e || seen.has(e)) continue
    seen.add(e)
    out.push(e)
  }
  return out
}

function publicOfferingPreviewUrl(
  previewToken: string,
  sponsorRef?: string | null,
): string {
  return publicOfferingPreviewUrlWithRef(previewToken, sponsorRef);
}

function subjectForDeal(dealName: string): string {
  const custom = process.env.OFFERING_PREVIEW_SHARE_SUBJECT?.trim()
  if (custom) return custom.replace(/\{dealName\}/g, dealName)
  return `Offering preview: ${dealName}`
}

export async function sendOfferingPreviewShareEmails(input: {
  dealId: string
  emails: string[]
  sharingUserId?: string
}): Promise<{
  previewUrl: string
  sent: number
  failures: { email: string; message: string }[]
}> {
  const dealId = input.dealId.trim()
  const deal = await getAddDealFormById(dealId)
  if (!deal) {
    throw new Error("Deal not found")
  }
  const dealName = deal.dealName?.trim() || "Offering"

  const normalized = dedupeEmails(input.emails)
  if (normalized.length === 0) {
    throw new Error("No valid email addresses.")
  }
  if (normalized.length > OFFERING_PREVIEW_SHARE_MAX_RECIPIENTS) {
    throw new Error(
      `At most ${OFFERING_PREVIEW_SHARE_MAX_RECIPIENTS} recipients per request.`,
    )
  }

  let previewUrl: string
  try {
    const token = encryptOfferingPreviewDealId(dealId)
    let sponsorRef: string | null = null
    const sharerId = String(input.sharingUserId ?? "").trim()
    if (sharerId && (await isPortalUserSponsorOnDeal(dealId, sharerId))) {
      sponsorRef = await mintOfferingPreviewSponsorRef(dealId, sharerId)
    }
    previewUrl = publicOfferingPreviewUrl(token, sponsorRef)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      msg.includes("OFFERING_PREVIEW_SECRET")
        ? "Preview link encryption is not configured on the server."
        : msg,
    )
  }

  const fromAddress = process.env.SENDER_EMAIL_ID?.trim() || ""
  if (!fromAddress) {
    throw new Error(
      "SENDER_EMAIL_ID must be set (configure SMTP in environment).",
    )
  }

  const transporter = emailConfig()
  const ccBcc = outgoingMailCcBcc()
  const text = buildOfferingPreviewShareEmailText({
    dealName,
    previewUrl,
    senderBrand: SENDER_DISPLAY_NAME,
  })
  const html = buildOfferingPreviewShareEmailHtml({
    dealName,
    previewUrl,
    senderBrand: SENDER_DISPLAY_NAME,
  })
  const subject = subjectForDeal(dealName)

  const failures: { email: string; message: string }[] = []
  let sent = 0

  for (const to of normalized) {
    if (!EMAIL_RE.test(to)) {
      failures.push({ email: to, message: "Invalid email address." })
      continue
    }
    try {
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
        subject,
        text,
        html,
      })
      sent += 1
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Could not send email."
      failures.push({ email: to, message })
    }
  }

  return { previewUrl, sent, failures }
}
