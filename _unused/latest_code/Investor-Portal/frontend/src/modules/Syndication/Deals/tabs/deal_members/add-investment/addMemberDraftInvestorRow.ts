import { formatInvestorSignedColumn } from "../../../../../../common/utils/formatDateDisplay"
import { formatMemberUsername } from "../../../../usermanagement/memberAdminShared"
import { DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER } from "../../../api/dealsApi"
import type { DealInvestorClass } from "../../../types/deal-investor-class.types"
import type { DealInvestorRow } from "../../../types/deal-investors.types"
import {
  investorProfileLabel,
  investorRoleLabel,
} from "../../../constants/investor-profile"
import {
  addMemberDraftHasContent,
  loadAddMemberDraft,
} from "./addMemberFormDraftStorage"
import type { AddInvestmentFormValues } from "./add_deal_member_types"
import { formatInvestorClassTableLabel } from "../../../utils/investorClassOverviewFields"

function memberNameFromContactId(id: string): string {
  const m: Record<string, string> = {
    rebecca_duffy: "Rebecca Duffy",
    nigam_family: "Nigam Family LLC",
    j_smith: "J. Smith",
  }
  return m[id] || id || "—"
}

function userFromContactId(contactId: string): {
  userDisplayName: string
  userEmail: string
} {
  const m: Record<string, { userDisplayName: string; userEmail: string }> = {
    rebecca_duffy: {
      userDisplayName: "rduffy",
      userEmail: "rebecca.duffy@example.com",
    },
    nigam_family: {
      userDisplayName: "anigam",
      userEmail: "contact@nigamfamily.com",
    },
    j_smith: {
      userDisplayName: "jsmith",
      userEmail: "j.smith@example.com",
    },
  }
  return m[contactId] ?? { userDisplayName: "—", userEmail: "—" }
}

function formatSignedDateDisplay(iso: string): string {
  return formatInvestorSignedColumn(iso)
}

function formatCommittedFromForm(v: AddInvestmentFormValues): string {
  const raw = [v.commitmentAmount, ...v.extraContributionAmounts]
  const nums = raw
    .map((s) => parseFloat(String(s).replace(/[^0-9.-]/g, "")))
    .filter((n) => Number.isFinite(n))
  if (nums.length === 0) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(0)
  }
  const sum = nums.reduce((a, b) => a + b, 0)
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(sum)
}

function resolveInvestorClassLabelForRow(
  formValue: string,
  classes: DealInvestorClass[],
): string {
  return formatInvestorClassTableLabel(formValue, classes)
}

export function addInvestmentFormToRow(
  v: AddInvestmentFormValues,
  dealId: string,
): DealInvestorRow {
  const fallback = userFromContactId(v.contactId)
  const displayName =
    v.contactDisplayName?.trim() || memberNameFromContactId(v.contactId)
  const userEmail = v.contactEmail?.trim() || fallback.userEmail
  const userDisplayName =
    v.contactUsername !== undefined
      ? formatMemberUsername(v.contactUsername)
      : fallback.userDisplayName
  return {
    id: `inv-${dealId}-${Date.now()}`,
    displayName,
    entitySubtitle: investorProfileLabel(v.profileId),
    userDisplayName,
    userEmail,
    investorClass: v.investorClass || "—",
    investorRole: investorRoleLabel(v.investorRole),
    status: v.status || "—",
    committed: formatCommittedFromForm(v),
    signedDate: formatSignedDateDisplay(v.docSignedDate),
    fundedDate: "—",
    selfAccredited: "—",
    verifiedAccLabel: "Not Started",
    addedByDisplayName: "—",
    fundApproved: v.fundApproved ?? false,
  }
}

export const ADD_MEMBER_DRAFT_ROW_ID = "__add_member_draft__"

/** Session draft row, backend autosave placeholder, or API “Draft” display name. */
export function investorRowShowsDraftBadge(row: DealInvestorRow): boolean {
  if (row.id === ADD_MEMBER_DRAFT_ROW_ID) return true
  if (
    (row.contactId ?? "").trim() === DEAL_INVESTMENT_AUTOSAVE_CONTACT_PLACEHOLDER
  )
    return true
  if (String(row.displayName ?? "").trim().toLowerCase() === "draft") return true
  return false
}

export function buildAddMemberDraftInvestorRow(
  dealId: string,
  investorClasses: DealInvestorClass[],
): DealInvestorRow | null {
  const d = loadAddMemberDraft(dealId)
  if (!d || !addMemberDraftHasContent(d)) return null
  const valuesForDisplay: AddInvestmentFormValues = {
    ...d.form,
    investorClass: resolveInvestorClassLabelForRow(
      d.form.investorClass,
      investorClasses,
    ),
  }
  const row = addInvestmentFormToRow(valuesForDisplay, dealId)
  return {
    ...row,
    id: ADD_MEMBER_DRAFT_ROW_ID,
    status: "Draft",
    verifiedAccLabel: "Draft",
    contactId: d.form.contactId,
    profileId: d.form.profileId,
    offeringId: d.form.offeringId,
    commitmentAmountRaw: d.form.commitmentAmount,
    extraContributionAmounts: [...d.form.extraContributionAmounts],
    docSignedDateIso: d.form.docSignedDate,
  }
}
