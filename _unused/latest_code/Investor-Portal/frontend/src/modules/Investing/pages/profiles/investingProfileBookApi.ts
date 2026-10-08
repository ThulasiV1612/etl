import { SESSION_BEARER_KEY } from "@/common/auth/sessionKeys"
import { getApiV1Base } from "@/common/utils/apiBaseUrl"
import type { AddressFormDraft, SavedAddress } from "./address.types"
import type { BeneficiaryDraft } from "./AddBeneficiaryModal"
import type {
  InvestorProfileDistributionBank,
  InvestorProfileListRow,
  NewInvestorProfilePayload,
  UpdateInvestorProfilePayload,
} from "./investor-profiles.types"

function authJsonHeaders(): HeadersInit {
  const token =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem(SESSION_BEARER_KEY)
      : null
  const h: HeadersInit = { "Content-Type": "application/json" }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

function authGetHeaders(): HeadersInit {
  const token =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem(SESSION_BEARER_KEY)
      : null
  const h: HeadersInit = {}
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text()
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { message: raw.replace(/\s+/g, " ").trim().slice(0, 200) }
  }
}

function errMsg(data: Record<string, unknown>, res: Response): string {
  const m = data.message
  if (typeof m === "string" && m.trim()) return m.trim()
  return `Request failed (${res.status})`
}

function strField(r: Record<string, unknown>, camel: string, snake: string): string {
  const v = r[camel] ?? r[snake]
  return typeof v === "string" ? v.trim() : ""
}

function normalizeDistributionBank(raw: unknown): InvestorProfileDistributionBank | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined
  const b = raw as Record<string, unknown>
  return {
    distributionMethod: strField(b, "distributionMethod", "distribution_method"),
    achRoutingNumber: strField(b, "achRoutingNumber", "ach_routing_number"),
    achAccountNumber: strField(b, "achAccountNumber", "ach_account_number"),
    achBankAddress: strField(b, "achBankAddress", "ach_bank_address"),
    achBankName: strField(b, "achBankName", "ach_bank_name"),
    achBankAccountType: strField(b, "achBankAccountType", "ach_bank_account_type"),
    bankAccountQuery: strField(b, "bankAccountQuery", "bank_account_query"),
    checkPayeeName: strField(b, "checkPayeeName", "check_payee_name"),
    checkMailingAddressId: strField(b, "checkMailingAddressId", "check_mailing_address_id"),
  }
}

/** Coerce a profile row from JSON (snake or camel) into `InvestorProfileListRow` shape. */
export function normalizeInvestorProfileListRow(
  raw: unknown,
): InvestorProfileListRow {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      id: "",
      profileName: "—",
      profileType: "—",
      addedBy: "—",
      investmentsCount: 0,
      dateCreated: "—",
    }
  }
  const r = raw as Record<string, unknown>
  const rawN =
    typeof r.investmentsCount === "number" && Number.isFinite(r.investmentsCount)
      ? r.investmentsCount
      : typeof r.investments_count === "number" &&
          Number.isFinite(r.investments_count)
        ? r.investments_count
        : 0
  const n = Math.max(0, Math.trunc(Number(rawN) || 0))
  return {
    id: String(r.id ?? "").trim() || "—",
    profileName: String(r.profileName ?? r.profile_name ?? "").trim() || "—",
    profileType: String(r.profileType ?? r.profile_type ?? "").trim() || "—",
    addedBy: String(r.addedBy ?? r.added_by ?? "").trim() || "—",
    investmentsCount: n,
    dateCreated: String(
      r.dateCreated ?? r.date_created ?? r.created_at ?? "",
    ).trim() || "—",
    archived: Boolean(r.archived),
    isDraft: Boolean(r.isDraft ?? r.is_draft),
    lastEditReason:
      (r.lastEditReason ?? r.last_edit_reason) != null
        ? String(r.lastEditReason ?? r.last_edit_reason)
        : null,
    profileWizardState: r.profileWizardState ?? r.profile_wizard_state ?? r.form_snapshot,
    distributionBank: normalizeDistributionBank(r.distributionBank ?? r.distribution_bank),
  }
}

export type ProfileBookSnapshot = {
  profiles: InvestorProfileListRow[]
  beneficiaries: (BeneficiaryDraft & { id: string; archived?: boolean })[]
  addresses: SavedAddress[]
}

export async function fetchMyProfileBook(): Promise<ProfileBookSnapshot> {
  const base = getApiV1Base()
  if (!base) throw new Error("API base URL is not configured (VITE_BASE_URL).")
  const res = await fetch(`${base}/investing/my-profile-book`, {
    method: "GET",
    headers: authGetHeaders(),
    credentials: "include",
  })
  const data = await readJson(res)
  if (!res.ok) throw new Error(errMsg(data, res))
  const profiles = data.profiles
  const beneficiaries = data.beneficiaries
  const addresses = data.addresses
  if (!Array.isArray(profiles) || !Array.isArray(beneficiaries) || !Array.isArray(addresses)) {
    throw new Error("Invalid response from server.")
  }
  return {
    profiles: profiles.map((p) => normalizeInvestorProfileListRow(p)),
    beneficiaries: beneficiaries as ProfileBookSnapshot["beneficiaries"],
    addresses: addresses as SavedAddress[],
  }
}

export async function postInvestorProfile(
  body: NewInvestorProfilePayload,
): Promise<InvestorProfileListRow> {
  const base = getApiV1Base()
  if (!base) throw new Error("API base URL is not configured (VITE_BASE_URL).")
  const res = await fetch(`${base}/investing/my-profile-book/profiles`, {
    method: "POST",
    headers: authJsonHeaders(),
    body: JSON.stringify({
      profileName: body.profileName,
      profileType: body.profileType,
      profileWizardState: body.profileWizardState,
      ...(body.autosave ? { autosave: true } : {}),
    }),
    credentials: "include",
  })
  const data = await readJson(res)
  if (!res.ok) throw new Error(errMsg(data, res))
  const profile = data.profile
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new Error("Invalid response from server.")
  }
  return normalizeInvestorProfileListRow(profile)
}

export async function putInvestorProfile(
  id: string,
  body: UpdateInvestorProfilePayload,
): Promise<InvestorProfileListRow> {
  const base = getApiV1Base()
  if (!base) throw new Error("API base URL is not configured (VITE_BASE_URL).")
  const res = await fetch(
    `${base}/investing/my-profile-book/profiles/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        profileName: body.profileName,
        profileType: body.profileType,
        ...(body.lastEditReason != null ? { lastEditReason: body.lastEditReason } : {}),
        profileWizardState: body.profileWizardState,
        ...(body.autosave ? { autosave: true } : {}),
        ...(body.isDraft === false ? { isDraft: false } : {}),
        ...(body.isDraft === true ? { isDraft: true } : {}),
      }),
      credentials: "include",
    },
  )
  const data = await readJson(res)
  if (!res.ok) throw new Error(errMsg(data, res))
  const profile = data.profile
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new Error("Invalid response from server.")
  }
  return normalizeInvestorProfileListRow(profile)
}

export async function patchInvestorProfileArchived(
  id: string,
  archived: boolean,
): Promise<InvestorProfileListRow> {
  const base = getApiV1Base()
  if (!base) throw new Error("API base URL is not configured (VITE_BASE_URL).")
  const res = await fetch(
    `${base}/investing/my-profile-book/profiles/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: authJsonHeaders(),
      body: JSON.stringify({ archived }),
      credentials: "include",
    },
  )
  const data = await readJson(res)
  if (!res.ok) throw new Error(errMsg(data, res))
  const profile = data.profile
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new Error("Invalid response from server.")
  }
  return normalizeInvestorProfileListRow(profile)
}

export async function deleteInvestorProfile(id: string): Promise<void> {
  const base = getApiV1Base()
  if (!base) throw new Error("API base URL is not configured (VITE_BASE_URL).")
  const res = await fetch(
    `${base}/investing/my-profile-book/profiles/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: authJsonHeaders(),
      credentials: "include",
    },
  )
  const data = await readJson(res)
  if (!res.ok) throw new Error(errMsg(data, res))
}

export async function postBeneficiary(
  body: BeneficiaryDraft,
): Promise<BeneficiaryDraft & { id: string; archived?: boolean }> {
  const base = getApiV1Base()
  if (!base) throw new Error("API base URL is not configured (VITE_BASE_URL).")
  const res = await fetch(`${base}/investing/my-profile-book/beneficiaries`, {
    method: "POST",
    headers: authJsonHeaders(),
    body: JSON.stringify({
      fullName: body.fullName,
      relationship: body.relationship,
      taxId: body.taxId,
      phone: body.phone,
      email: body.email,
      addressQuery: body.addressQuery,
    }),
    credentials: "include",
  })
  const data = await readJson(res)
  if (!res.ok) throw new Error(errMsg(data, res))
  const beneficiary = data.beneficiary
  if (!beneficiary || typeof beneficiary !== "object" || Array.isArray(beneficiary)) {
    throw new Error("Invalid response from server.")
  }
  return beneficiary as BeneficiaryDraft & { id: string; archived?: boolean }
}

export async function putBeneficiary(
  id: string,
  body: BeneficiaryDraft,
): Promise<BeneficiaryDraft & { id: string; archived?: boolean }> {
  const base = getApiV1Base()
  if (!base) throw new Error("API base URL is not configured (VITE_BASE_URL).")
  const res = await fetch(
    `${base}/investing/my-profile-book/beneficiaries/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        fullName: body.fullName,
        relationship: body.relationship,
        taxId: body.taxId,
        phone: body.phone,
        email: body.email,
        addressQuery: body.addressQuery,
      }),
      credentials: "include",
    },
  )
  const data = await readJson(res)
  if (!res.ok) throw new Error(errMsg(data, res))
  const beneficiary = data.beneficiary
  if (!beneficiary || typeof beneficiary !== "object" || Array.isArray(beneficiary)) {
    throw new Error("Invalid response from server.")
  }
  return beneficiary as BeneficiaryDraft & { id: string; archived?: boolean }
}

export async function patchBeneficiaryArchived(
  id: string,
  archived: boolean,
): Promise<BeneficiaryDraft & { id: string; archived?: boolean }> {
  const base = getApiV1Base()
  if (!base) throw new Error("API base URL is not configured (VITE_BASE_URL).")
  const res = await fetch(
    `${base}/investing/my-profile-book/beneficiaries/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: authJsonHeaders(),
      body: JSON.stringify({ archived }),
      credentials: "include",
    },
  )
  const data = await readJson(res)
  if (!res.ok) throw new Error(errMsg(data, res))
  const beneficiary = data.beneficiary
  if (!beneficiary || typeof beneficiary !== "object" || Array.isArray(beneficiary)) {
    throw new Error("Invalid response from server.")
  }
  return beneficiary as BeneficiaryDraft & { id: string; archived?: boolean }
}

export async function postSavedAddress(
  body: AddressFormDraft,
): Promise<SavedAddress> {
  const base = getApiV1Base()
  if (!base) throw new Error("API base URL is not configured (VITE_BASE_URL).")
  const res = await fetch(`${base}/investing/my-profile-book/addresses`, {
    method: "POST",
    headers: authJsonHeaders(),
    body: JSON.stringify({
      fullNameOrCompany: body.fullNameOrCompany,
      country: body.country,
      street1: body.street1,
      street2: body.street2,
      city: body.city,
      state: body.state,
      zip: body.zip,
      checkMemo: body.checkMemo,
      distributionNote: body.distributionNote,
    }),
    credentials: "include",
  })
  const data = await readJson(res)
  if (!res.ok) throw new Error(errMsg(data, res))
  const address = data.address
  if (!address || typeof address !== "object" || Array.isArray(address)) {
    throw new Error("Invalid response from server.")
  }
  return address as SavedAddress
}

export async function putSavedAddress(
  id: string,
  body: AddressFormDraft,
): Promise<SavedAddress> {
  const base = getApiV1Base()
  if (!base) throw new Error("API base URL is not configured (VITE_BASE_URL).")
  const res = await fetch(
    `${base}/investing/my-profile-book/addresses/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: authJsonHeaders(),
      body: JSON.stringify({
        fullNameOrCompany: body.fullNameOrCompany,
        country: body.country,
        street1: body.street1,
        street2: body.street2,
        city: body.city,
        state: body.state,
        zip: body.zip,
        checkMemo: body.checkMemo,
        distributionNote: body.distributionNote,
      }),
      credentials: "include",
    },
  )
  const data = await readJson(res)
  if (!res.ok) throw new Error(errMsg(data, res))
  const address = data.address
  if (!address || typeof address !== "object" || Array.isArray(address)) {
    throw new Error("Invalid response from server.")
  }
  return address as SavedAddress
}

export async function patchSavedAddressArchived(
  id: string,
  archived: boolean,
): Promise<SavedAddress> {
  const base = getApiV1Base()
  if (!base) throw new Error("API base URL is not configured (VITE_BASE_URL).")
  const res = await fetch(
    `${base}/investing/my-profile-book/addresses/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: authJsonHeaders(),
      body: JSON.stringify({ archived }),
      credentials: "include",
    },
  )
  const data = await readJson(res)
  if (!res.ok) throw new Error(errMsg(data, res))
  const address = data.address
  if (!address || typeof address !== "object" || Array.isArray(address)) {
    throw new Error("Invalid response from server.")
  }
  return address as SavedAddress
}
