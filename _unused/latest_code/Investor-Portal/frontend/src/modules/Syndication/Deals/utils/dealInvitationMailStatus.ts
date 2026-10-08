import type { DealInvestorRow } from "../types/deal-investors.types"

/** Optimistic mail-sent marks until GET /deals/:id/members reflects `invitationMailSent`. */
export type InvitationMailStatusByRowId = Record<string, true>

export function invitationMailSentOptimisticKeys(
  row: DealInvestorRow,
): InvitationMailStatusByRowId {
  const out: InvitationMailStatusByRowId = {}
  const rowId = row.id?.trim()
  if (rowId) out[rowId] = true
  const contactId = row.contactId?.trim().toLowerCase()
  if (contactId) out[`contact:${contactId}`] = true
  const email = row.userEmail?.trim().toLowerCase()
  if (email && email.includes("@")) out[`email:${email}`] = true
  return out
}

export function rowInvitationMailMarkedSent(
  row: DealInvestorRow,
  marks: InvitationMailStatusByRowId | undefined,
): boolean {
  if (!marks || Object.keys(marks).length === 0) return false
  const rowId = row.id?.trim()
  if (rowId && marks[rowId]) return true
  const contactId = row.contactId?.trim().toLowerCase()
  if (contactId && marks[`contact:${contactId}`]) return true
  const email = row.userEmail?.trim().toLowerCase()
  if (email && email.includes("@") && marks[`email:${email}`]) return true
  return false
}

export function applyInvitationMailSentMarks(
  rows: DealInvestorRow[],
  marks: InvitationMailStatusByRowId | undefined,
): DealInvestorRow[] {
  if (!marks || Object.keys(marks).length === 0) return rows
  return rows.map((r) => {
    if (r.invitationMailSent === true) return r
    if (!rowInvitationMailMarkedSent(r, marks)) return r
    return { ...r, invitationMailSent: true }
  })
}

export function omitInvitationMailKeys(
  prev: InvitationMailStatusByRowId,
  keys: InvitationMailStatusByRowId,
): InvitationMailStatusByRowId {
  const next = { ...prev }
  for (const k of Object.keys(keys)) delete next[k]
  return next
}
