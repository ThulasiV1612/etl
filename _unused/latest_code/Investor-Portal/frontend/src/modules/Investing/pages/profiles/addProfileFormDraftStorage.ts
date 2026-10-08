/** Default list label when the wizard has no display name yet (autosave). */
export const AUTOSAVE_DEFAULT_PROFILE_NAME = "Untitled profile"

const STORAGE_KEY = "portal_add_profile_wizard_draft"

/** Fired after `saveAddProfileDraft` / `clearAddProfileDraft` so the profiles list can refresh the draft row. */
export const ADD_PROFILE_DRAFT_UPDATED_EVENT =
  "investor-portal:add-profile-draft-updated"

/** Fired after a profile is autosaved to the API so the profiles table can refetch (if mounted). */
export const PROFILE_BOOK_REFETCH_EVENT = "investor-portal:profile-book-refetch"

export function notifyProfileBookRefetch(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(PROFILE_BOOK_REFETCH_EVENT))
}

export interface AddProfileFormDraft {
  /** Serializable add-profile wizard `FormState`. */
  form: Record<string, unknown>
  step: number
  /** Set after first successful backend autosave; subsequent saves use PUT. */
  backendProfileId?: string | null
}

export function loadAddProfileDraft(): AddProfileFormDraft | null {
  if (typeof sessionStorage === "undefined") return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw?.trim()) return null
    const p = JSON.parse(raw) as Partial<AddProfileFormDraft> & {
      form?: Record<string, unknown>
      backend_profile_id?: string
    }
    if (p == null || typeof p !== "object") return null
    if (!p.form || typeof p.form !== "object") return null
    const step = typeof p.step === "number" && p.step >= 1 ? Math.trunc(p.step) : 1
    const rawBid = p.backendProfileId ?? p.backend_profile_id
    const backendProfileId =
      typeof rawBid === "string" && rawBid.trim() ? rawBid.trim() : null
    return {
      step,
      form: p.form,
      ...(backendProfileId ? { backendProfileId } : {}),
    }
  } catch {
    return null
  }
}

let draftListNotifyTimer: ReturnType<typeof setTimeout> | null = null

function notifyDraftUpdated(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(ADD_PROFILE_DRAFT_UPDATED_EVENT))
}

function scheduleDebouncedDraftListNotify(): void {
  if (typeof window === "undefined") return
  if (draftListNotifyTimer) clearTimeout(draftListNotifyTimer)
  draftListNotifyTimer = setTimeout(() => {
    draftListNotifyTimer = null
    notifyDraftUpdated()
  }, 900)
}

export const ADD_PROFILE_WIZARD_STEP_KEY = "__wizardStep"

/** Step index stored inside `profileWizardState` for API-backed draft resume. */
export function readWizardStepFromSavedForm(
  form: Record<string, unknown> | null | undefined,
): number | null {
  if (!form || typeof form !== "object") return null
  const raw = form[ADD_PROFILE_WIZARD_STEP_KEY]
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null
  const step = Math.trunc(raw)
  return step >= 1 ? step : null
}

export function stripWizardStepMeta(
  form: Record<string, unknown>,
): Record<string, unknown> {
  if (!(ADD_PROFILE_WIZARD_STEP_KEY in form)) return form
  const next = { ...form }
  delete next[ADD_PROFILE_WIZARD_STEP_KEY]
  return next
}

export function saveAddProfileDraft(draft: AddProfileFormDraft): void {
  const form = stripWizardStepMeta(draft.form)
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...draft, form }))
  } catch {
    /* quota / private mode */
  }
  scheduleDebouncedDraftListNotify()
}

export function clearAddProfileDraft(): void {
  if (draftListNotifyTimer) {
    clearTimeout(draftListNotifyTimer)
    draftListNotifyTimer = null
  }
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  notifyDraftUpdated()
}

function isNonEmpty(s: unknown): boolean {
  return String(s ?? "").trim().length > 0
}

/** True if the draft differs from empty defaults (worth restoring). */
export function addProfileDraftHasContent(d: AddProfileFormDraft): boolean {
  if (d.step > 1) return true
  const f = d.form
  if (isNonEmpty(f.profileType)) return true
  if (isNonEmpty(f.firstName)) return true
  if (isNonEmpty(f.middleName)) return true
  if (isNonEmpty(f.lastName)) return true
  if (isNonEmpty(f.email1)) return true
  if (isNonEmpty(f.ssn)) return true
  if (isNonEmpty(f.firstName2)) return true
  if (isNonEmpty(f.lastName2)) return true
  if (isNonEmpty(f.entityLegalName)) return true
  if (isNonEmpty(f.legalIraName)) return true
  if (isNonEmpty(f.entitySubType)) return true
  if (isNonEmpty(f.custodianIra)) return true
  if (isNonEmpty(f.distributionMethod) && f.distributionMethod !== "ach") return true
  if (isNonEmpty(f.achRoutingNumber)) return true
  if (isNonEmpty(f.achAccountNumber)) return true
  if (isNonEmpty(f.bankAccountQuery)) return true
  if (isNonEmpty(f.checkPayeeName)) return true
  if (isNonEmpty(f.taxAddressId)) return true
  if (isNonEmpty(f.mailingAddressId)) return true
  if (isNonEmpty(f.beneficiaryPickId)) return true
  if (f.beneficiary && typeof f.beneficiary === "object") return true
  return false
}

/** Best-effort display name from stored wizard JSON (for the session draft list row). */
export function addProfileDraftDisplayName(form: Record<string, unknown>): string {
  const profileType = String(form.profileType ?? "").trim()
  if (profileType === "Entity") {
    if (form.custodianIra === "yes" && isNonEmpty(form.legalIraName)) {
      return String(form.legalIraName).trim()
    }
    const name = String(form.entityLegalName ?? "").trim()
    const sub = String(form.entitySubType ?? "").trim()
    if (name && sub) return `${name} (${sub})`
    return name || sub || AUTOSAVE_DEFAULT_PROFILE_NAME
  }
  if (profileType === "Joint tenancy") {
    const a = [form.firstName, form.middleName, form.lastName]
      .map((s) => String(s ?? "").trim())
      .filter(Boolean)
      .join(" ")
    const b = [form.firstName2, form.middleName2, form.lastName2]
      .map((s) => String(s ?? "").trim())
      .filter(Boolean)
      .join(" ")
    if (a && b) return `${a} & ${b}`
    return a || b || AUTOSAVE_DEFAULT_PROFILE_NAME
  }
  const individual = [form.firstName, form.middleName, form.lastName]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(" ")
  return individual || AUTOSAVE_DEFAULT_PROFILE_NAME
}
