import {
  DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER,
  isLpInvestorRole,
} from "../../../constants/investor-profile"
import type { AddInvestmentFormValues } from "./add_deal_member_types"

/** Fired after `saveAddMemberDraft` / `clearAddMemberDraft` so UIs can refresh draft rows. */
export const ADD_MEMBER_DRAFT_UPDATED_EVENT = "investor-portal:add-member-draft-updated"

export interface AddMemberFormDraft {
  form: AddInvestmentFormValues
  step: 1 | 2
  /** Set after first successful backend autosave; subsequent saves use PUT (`deal_investment`). */
  backendInvestmentId?: string | null
  /** Set after first successful LP autosave from Investors tab; subsequent saves use PUT (`deal_lp_investor`). */
  backendLpInvestorId?: string | null
}

function storageKey(dealId: string): string {
  const safe = dealId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80)
  return `portal_add_member_draft_${safe}`
}

export function loadAddMemberDraft(dealId: string): AddMemberFormDraft | null {
  try {
    const raw = sessionStorage.getItem(storageKey(dealId))
    if (!raw?.trim()) return null
    const p = JSON.parse(raw) as Partial<AddMemberFormDraft> & {
      form?: Partial<AddInvestmentFormValues>
      backend_investment_id?: string
      backend_lp_investor_id?: string
    }
    if (p == null || typeof p !== "object" || !p.form || typeof p.form !== "object")
      return null
    const step = p.step === 2 ? 2 : 1
    const rawBid = p.backendInvestmentId ?? p.backend_investment_id
    let backendInvestmentId =
      typeof rawBid === "string" && rawBid.trim()
        ? rawBid.trim()
        : null
    const rawLp = p.backendLpInvestorId ?? p.backend_lp_investor_id
    const backendLpInvestorId =
      typeof rawLp === "string" && rawLp.trim() ? rawLp.trim() : null
    const form = p.form as AddInvestmentFormValues
    /** Older drafts stored `deal_investment.id` while add-investor uses LP roster PUT. */
    if (isLpInvestorRole(form.investorRole)) backendInvestmentId = null
    return {
      step,
      form,
      ...(backendInvestmentId ? { backendInvestmentId } : {}),
      ...(backendLpInvestorId ? { backendLpInvestorId } : {}),
    }
  } catch {
    return null
  }
}

function notifyDraftUpdated(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(ADD_MEMBER_DRAFT_UPDATED_EVENT))
}

export function saveAddMemberDraft(
  dealId: string,
  draft: AddMemberFormDraft,
): void {
  try {
    sessionStorage.setItem(storageKey(dealId), JSON.stringify(draft))
  } catch {
    /* quota / private mode */
  }
  notifyDraftUpdated()
}

export function clearAddMemberDraft(dealId: string): void {
  try {
    sessionStorage.removeItem(storageKey(dealId))
  } catch {
    /* ignore */
  }
  notifyDraftUpdated()
}

function isNonEmpty(s: string | undefined): boolean {
  return String(s ?? "").trim().length > 0
}

/** True if the draft is worth restoring (user entered something beyond defaults). */
export function addMemberDraftHasContent(d: AddMemberFormDraft): boolean {
  const f = d.form
  if (isNonEmpty(f.contactId)) return true
  if (isNonEmpty(f.profileId)) return true
  if (isNonEmpty(f.investorRole)) return true
  if (isNonEmpty(f.status)) return true
  if (isNonEmpty(f.investorClass)) return true
  if (isNonEmpty(f.docSignedDate)) return true
  if (isNonEmpty(f.commitmentAmount)) return true
  if (f.extraContributionAmounts?.some((x) => isNonEmpty(x))) return true
  if (isNonEmpty(f.documentFileName ?? undefined)) return true
  if (f.sendInvitationMail === "yes") return true
  return false
}

/**
 * Debounced POST/PUT autosave should not run for role-only or empty-contact drafts — that
 * creates a server-side investment row (and Members draft noise) before a member is chosen.
 */
export function addMemberDraftEligibleForBackendAutosave(
  d: AddMemberFormDraft,
): boolean {
  if (!addMemberDraftHasContent(d)) return false
  const cid = String(d.form.contactId ?? "").trim()
  if (!cid) return false
  if (cid === DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER) return false
  return true
}

function normalizeContactKey(raw: string | undefined): string {
  return String(raw ?? "").trim().toLowerCase()
}

/**
 * After autosave — or whenever the roster already lists this contact — appending the session
 * draft row would duplicate the same person. Match by investment id and by contact id (IDs
 * can differ between `deal_investment.id` and merged list rows).
 */
export function isAddMemberSessionDraftRedundantWithApiRows(
  dealId: string,
  apiRows: { id: string; contactId?: string }[],
): boolean {
  const draft = loadAddMemberDraft(dealId)
  if (!draft || !addMemberDraftHasContent(draft)) return false

  const invBid = draft.backendInvestmentId?.trim()
  if (invBid && apiRows.some((r) => String(r.id) === invBid)) return true
  const lpBid = draft.backendLpInvestorId?.trim()
  if (lpBid && apiRows.some((r) => String(r.id) === lpBid)) return true

  const draftCid = normalizeContactKey(draft.form.contactId)
  if (
    !draftCid ||
    draftCid === normalizeContactKey(DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER)
  )
    return false

  return apiRows.some((r) => {
    const rc = normalizeContactKey(r.contactId)
    return Boolean(rc && rc === draftCid)
  })
}
