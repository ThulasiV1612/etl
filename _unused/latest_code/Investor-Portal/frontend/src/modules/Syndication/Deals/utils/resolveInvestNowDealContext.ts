import {

  investorProfileLabel,

  isLeadSponsorRole,

} from "../constants/investor-profile"

import type { DealInvestorClass } from "../types/deal-investor-class.types"

import type {

  DealInvestorRow,

  DealMembersPayload,

} from "../types/deal-investors.types"

import {
  investorOnboardingSelectableClasses,
  isLpInvestorClass,
} from "./investorClassOverviewFields"

import type { LpInvestNowPrefill } from "./prefillLpInvestNowFields"



function memberRowIsLeadSponsor(row: DealInvestorRow): boolean {

  if (isLeadSponsorRole(row.investorRole)) return true

  return (row.memberRoleLabels ?? []).some((label) =>

    isLeadSponsorRole(label),

  )

}



function rosterPersonDisplayName(row: DealInvestorRow): string {

  const display = row.displayName?.trim()

  if (display && display !== "—" && display !== "Draft") return display

  const user = row.userDisplayName?.trim()

  if (user && user !== "—") return user

  return ""

}



function leadSponsorNameFromMembers(members: DealInvestorRow[]): string {

  const lead = members.find((m) => memberRowIsLeadSponsor(m))

  if (!lead) return ""

  return rosterPersonDisplayName(lead)

}



/** Primary sponsor label shown read-only on Invest now step 1 (lead sponsor person name). */

export function resolveInvestNowSponsorLabel(

  _deal: { owningEntityName?: string | null } | null | undefined,

  members: DealInvestorRow[],

): string {

  return leadSponsorNameFromMembers(members) || "—"

}



/** Prefer API `leadSponsorDisplayName`, then resolve from roster rows. */

export function pickInvestNowLeadSponsorDisplayName(

  membersPayload: Pick<DealMembersPayload, "members" | "leadSponsorDisplayName">,

): string {

  const fromApi = membersPayload.leadSponsorDisplayName?.trim()

  if (fromApi && fromApi !== "—") return fromApi

  return resolveInvestNowSponsorLabel(null, membersPayload.members)

}



/** Lead sponsor unless a valid referring preview link supplied a sponsor name. */

export function pickInvestNowSponsorDisplayName(

  membersPayload: Pick<DealMembersPayload, "members" | "leadSponsorDisplayName">,

  options?: {

    referringSponsorDisplayName?: string | null

  },

): string {

  const fromReferral = options?.referringSponsorDisplayName?.trim()

  if (fromReferral && fromReferral !== "—") return fromReferral

  return pickInvestNowLeadSponsorDisplayName(membersPayload)

}



/** Investor class name prefilled for this deal (LP class when available). */

export function resolveInvestNowInvestmentClassLabel(

  classes: DealInvestorClass[],

  _prefill: LpInvestNowPrefill | null,

  viewerInvestorClass?: string,

): string {

  const fromViewer = viewerInvestorClass?.trim()

  if (fromViewer) return fromViewer

  const lpClass = classes.find((c) => isLpInvestorClass(c))

  if (lpClass?.name?.trim()) return lpClass.name.trim()

  if (classes[0]?.name?.trim()) return classes[0].name.trim()

  return "—"

}



/** Maps stored investor class (id or legacy name) to a deal class id. */

export function resolveDealInvestorClassId(

  classes: DealInvestorClass[],

  stored?: string | null,

): string {

  const raw = stored?.trim() ?? ""

  if (!raw) return ""

  const byId = classes.find((c) => c.id === raw)

  if (byId) return byId.id

  const lower = raw.toLowerCase()

  const byName = classes.find((c) => c.name.trim().toLowerCase() === lower)

  return byName?.id ?? ""

}



/** Default class selection for Invest Now (saved row, roster, or sole class). */

export function investNowDefaultInvestorClassId(

  classes: DealInvestorClass[],

  options?: { viewerInvestorClass?: string; savedInvestorClass?: string },

): string {

  const selectable = investorOnboardingSelectableClasses(classes)

  const fromSaved = resolveDealInvestorClassId(

    selectable,

    options?.savedInvestorClass,

  )

  if (fromSaved) return fromSaved

  const fromViewer = resolveDealInvestorClassId(

    selectable,

    options?.viewerInvestorClass,

  )

  if (fromViewer) return fromViewer

  if (selectable.length === 1) return selectable[0]!.id

  return ""

}



function custodianIraFromProfileWizardState(

  profileWizardState: unknown,

): boolean {

  if (profileWizardState == null) return false

  let parsed: Record<string, unknown> | null = null

  if (typeof profileWizardState === "string") {

    try {

      const raw = JSON.parse(profileWizardState) as unknown

      if (raw && typeof raw === "object" && !Array.isArray(raw)) {

        parsed = raw as Record<string, unknown>

      }

    } catch {

      return false

    }

  } else if (

    typeof profileWizardState === "object" &&

    !Array.isArray(profileWizardState)

  ) {

    parsed = profileWizardState as Record<string, unknown>

  }

  if (!parsed) return false

  const v = String(

    parsed.custodianIra ?? parsed.custodian_ira ?? "",

  )

    .trim()

    .toLowerCase()

  return v === "yes" || v === "true" || v === "1"

}



/**

 * Maps saved book profile type (+ wizard snapshot) to commitment `profile_id`

 * used for eSign template category and questionnaire visibility.

 */

export function commitmentProfileIdFromBookProfileType(

  profileType: string,

  profileWizardState?: unknown,

): string {

  const raw = profileType.trim()

  const t = raw.toLowerCase()

  if (!t || t === "—") return ""

  if (t === "individual") return "individual"

  if (t === "joint tenancy" || t === "joint_tenancy") return "joint_tenancy"

  if (

    raw === "__entity_custodian_ira_401k__" ||

    (t.includes("custodian") && (t.includes("ira") || t.includes("401")))

  ) {

    return "custodian_ira_401k"

  }

  if (

    t === "entity" ||

    raw === "__entity_llc_corp_trust_etc__" ||

    t.includes("llc") ||

    t.includes("corp") ||

    t.includes("trust")

  ) {

    if (custodianIraFromProfileWizardState(profileWizardState)) {

      return "custodian_ira_401k"

    }

    return "llc_corp_trust_etc"

  }

  return ""

}



/** Resolve commitment profile id from a profile-book list row. */

export function commitmentProfileIdFromBookProfile(profile: {

  profileType: string

  profileWizardState?: unknown

}): string {

  return commitmentProfileIdFromBookProfileType(

    profile.profileType,

    profile.profileWizardState,

  )

}



/** Human-readable profile type for tables and Invest Now (uses wizard state for Entity rows). */

export function bookProfileTypeDisplayLabel(profile: {

  profileType: string

  profileWizardState?: unknown

}): string {

  const commitmentId = commitmentProfileIdFromBookProfile(profile)

  if (commitmentId) return investorProfileLabel(commitmentId)

  return profile.profileType?.trim() || "—"

}


