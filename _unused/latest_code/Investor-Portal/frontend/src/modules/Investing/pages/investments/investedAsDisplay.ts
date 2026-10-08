/**
 * "Invested as" / investment profile column: saved **profile name** (My Profiles) plus
 * **commitment type** the user chose (individual, joint, entity, …) when available.
 */
import { investorProfileLabel } from "@/modules/Syndication/Deals/constants/investor-profile"
import type { DealInvestorRow } from "@/modules/Syndication/Deals/types/deal-investors.types"
import { fetchMyProfileBook } from "@/modules/Investing/pages/profiles/investingProfileBookApi"
import type { InvestmentListRow } from "./investments.types"

function commitmentTypeLabel(inv: DealInvestorRow | undefined): string {
  if (!inv) return "—"
  const pid = String(inv.profileId ?? "").trim()
  if (pid) {
    const lab = investorProfileLabel(pid)
    if (lab && lab !== "—") return lab
  }
  const sub = String(inv.entitySubtitle ?? "").trim()
  if (sub) return sub
  return "—"
}

/**
 * My Profiles **name** for this deal commitment: prefer the name **stored on the deal
 * investment** (`userInvestorProfileName`) when the API returns it; otherwise look up
 * `userInvestorProfileId` in the My Profiles book map.
 */
export function bookProfileNameFromInv(
  inv: DealInvestorRow | undefined,
  nameByUserProfileId: ReadonlyMap<string, string> | undefined,
): string {
  if (!inv) return "—"
  const onDeal = String(inv.userInvestorProfileName ?? "").trim()
  if (onDeal) return onDeal
  const bookId = String(inv.userInvestorProfileId ?? "").trim()
  if (!bookId || !nameByUserProfileId) return "—"
  return (nameByUserProfileId.get(bookId) ?? "").trim() || "—"
}

/**
 * **Profile name** for the “Profile and investment” breakdown table. Prefers the saved
 * My Profiles name, then a deal `entitySubtitle` when it is not just a duplicate of the
 * commitment type (so two “Individual” rows can show different labels such as A vs B when
 * the API sends them), then a short hint from `userInvestorProfileId` if the name is
 * not in the book.
 */
export function profileNameForInvestmentBreakdown(
  inv: DealInvestorRow,
  nameByUserProfileId: ReadonlyMap<string, string> | undefined,
): string {
  const fromBook = bookProfileNameFromInv(inv, nameByUserProfileId)
  if (fromBook && fromBook !== "—") return fromBook

  const typeLine = commitmentTypeLabel(inv)
  const sub = String(inv.entitySubtitle ?? "").trim()
  if (sub && sub !== "—") {
    const t = (typeLine || "").trim().toLowerCase()
    if (sub.toLowerCase() !== t) {
      return sub
    }
  }

  const bookId = String(inv.userInvestorProfileId ?? "").trim()
  if (bookId) {
    if (bookId.length <= 12) return `Profile (${bookId})`
    return `Profile (${bookId.slice(0, 8)}…)`
  }

  return "—"
}

/** Commitment / investor type (e.g. Individual, LLC) for this deal investor row. */
export function investorCommitmentTypeFromInv(
  inv: DealInvestorRow | undefined,
): string {
  return commitmentTypeLabel(inv)
}

/**
 * One-line label for the viewer’s deal commitment: optional **My Profiles** book name, then
 * the commitment entity kind (or API subtitle fallback).
 */
export function formatInvestedAsFromInv(
  inv: DealInvestorRow | undefined,
  nameByUserProfileId: ReadonlyMap<string, string> | undefined,
): string {
  const type = commitmentTypeLabel(inv)
  const nameRaw = bookProfileNameFromInv(inv, nameByUserProfileId)
  const name = nameRaw === "—" ? "" : nameRaw
  if (name && type && type !== "—") return `${name} — ${type}`
  if (name) return name
  if (type && type !== "—") return type
  return "—"
}

let _profileNameMapCache: { map: ReadonlyMap<string, string>; at: number } | null = null
const _PROFILE_NAME_MAP_TTL_MS = 60_000

/**
 * Fetches Investing → My Profiles and maps `user_investor_profiles.id` → display `profileName`.
 * Returns an empty map on failure so list/detail can still show commitment type.
 * Caches for a short time so the investments list and detail in the same session can share one call.
 */
export async function fetchUserInvestorProfileNameMap(): Promise<
  ReadonlyMap<string, string>
> {
  const now = Date.now()
  if (
    _profileNameMapCache &&
    now - _profileNameMapCache.at < _PROFILE_NAME_MAP_TTL_MS
  ) {
    return _profileNameMapCache.map
  }
  try {
    const snap = await fetchMyProfileBook()
    const m = new Map<string, string>()
    for (const p of snap.profiles) {
      const id = String(p.id ?? "").trim()
      if (!id) continue
      const n = String(p.profileName ?? "").trim()
      if (n) m.set(id, n)
    }
    _profileNameMapCache = { map: m, at: now }
    return m
  } catch {
    return new Map()
  }
}

/**
 * Recomputes the visible `investmentProfile` from a deal-stored profile name, then
 * `commitmentProfileId` and `userInvestorProfileId` + profile book name map.
 */
export function enrichInvestmentListRow(
  r: InvestmentListRow,
  nameByUserProfileId: ReadonlyMap<string, string>,
): InvestmentListRow {
  const onDeal = (r.userInvestorProfileName ?? "").trim()
  const bookId = (r.userInvestorProfileId ?? "").trim()
  const name =
    onDeal ||
    (bookId ? (nameByUserProfileId.get(bookId) ?? "").trim() : "")
  const kind = (r.commitmentProfileId ?? "").trim()
  const type = kind
    ? investorProfileLabel(kind)
    : (r.investmentProfile ?? "—")
  if (!onDeal && !bookId && !kind) return r
  if (name && type && type !== "—") {
    return { ...r, investmentProfile: `${name} — ${type}` }
  }
  if (name) return { ...r, investmentProfile: name }
  if (type && type !== "—")
    return { ...r, investmentProfile: type }
  return r
}
