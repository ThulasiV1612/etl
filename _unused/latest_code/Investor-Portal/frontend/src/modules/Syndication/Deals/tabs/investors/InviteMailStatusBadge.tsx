import { Loader2, Mail, MailCheck } from "lucide-react"
import type { DealInvestorRow } from "../../types/deal-investors.types"

import "../../deal-investors-tab.css"

/**
 * Investors / Members table: shows whether the deal invitation email was already sent.
 */
export function InviteMailStatusBadge({
  row,
  sending = false,
}: {
  row: DealInvestorRow
  sending?: boolean
}) {
  if (row.id === "add_member_draft") {
    return <span className="deal_inv_mail_status_muted">—</span>
  }
  if (sending) {
    return (
      <span
        className="deal_inv_mail_status_badge deal_inv_mail_status_badge--sending"
        title="Sending invitation email"
        role="status"
      >
        <Loader2
          size={14}
          strokeWidth={2}
          className="deal_inv_mail_status_icon deal_inv_mail_status_spin"
          aria-hidden
        />
        Sending…
      </span>
    )
  }
  const sent = row.invitationMailSent === true
  if (sent) {
    return (
      <span
        className="deal_inv_mail_status_badge deal_inv_mail_status_badge--sent"
        title="Send invitation: yes (email on add)"
      >
        <MailCheck size={14} strokeWidth={2} className="deal_inv_mail_status_icon" aria-hidden />
        Email sent
      </span>
    )
  }
  return (
    <span
      className="deal_inv_mail_status_badge deal_inv_mail_status_badge--not_sent"
      title="Send invitation: no"
    >
      <Mail size={14} strokeWidth={2} className="deal_inv_mail_status_icon" aria-hidden />
      Not sent
    </span>
  )
}
