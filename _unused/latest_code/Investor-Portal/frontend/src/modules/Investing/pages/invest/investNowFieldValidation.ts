import { questionnaireFieldSelector } from "@/common/utils/formValidationFocus"
import { ssnItinFieldError } from "@/common/tax/usSsnItin"
import type { InvestorProfileListRow } from "@/modules/Investing/pages/profiles/investor-profiles.types"
import {
  ALL_SAVED_PROFILES_IN_USE_ON_DEAL_MSG,
  CHOSEN_PROFILE_ALREADY_USED_MSG,
  availableBookProfilesForCommitmentType,
  lpProfileUseKey,
} from "@/modules/Syndication/Deals/utils/lpInvestNowProfileBlocking"
import {
  NO_SAVED_PROFILES_FOR_INVESTOR_TYPE_MSG,
  filterBookProfilesByCommitmentKind,
} from "@/modules/Syndication/Deals/utils/lpInvestNowSavedProfileOptions"
import { parseMoneyDigits } from "@/modules/Syndication/Deals/utils/offeringMoneyFormat"
import type { DealInvestorClass } from "@/modules/Syndication/Deals/types/deal-investor-class.types"
import { investorOnboardingSelectableClasses } from "@/modules/Syndication/Deals/utils/investorClassOverviewFields"
import type { InvestNowW9FormValues } from "./investNowW9.types"

export type InvestNowFieldErrors = Record<string, string>

export const INVEST_NOW_FIELD = {
  profile: "profile",
  investmentClass: "investmentClass",
  sponsor: "sponsor",
  amount: "amount",
  fundingMethod: "fundingMethod",
  w9Name: "w9-name",
  w9Address: "w9-address",
  w9Ssn: "w9-ssn",
} as const

export function investNowFieldErrorKeys(errors: InvestNowFieldErrors): string[] {
  return Object.keys(errors).filter((k) => Boolean(errors[k]?.trim()))
}

export function hasInvestNowFieldErrors(errors: InvestNowFieldErrors): boolean {
  return investNowFieldErrorKeys(errors).length > 0
}

export function firstInvestNowFieldError(
  errors: InvestNowFieldErrors,
): string | null {
  const key = investNowFieldErrorKeys(errors)[0]
  return key ? errors[key] : null
}

export function investNowFieldPreferSelector(fieldKey: string): string | null {
  switch (fieldKey) {
    case INVEST_NOW_FIELD.profile:
      return "#invest-now-profile"
    case INVEST_NOW_FIELD.investmentClass:
      return "#invest-now-investment-class"
    case INVEST_NOW_FIELD.amount:
      return "#invest-now-amount"
    case INVEST_NOW_FIELD.fundingMethod:
      return "#invest-now-funding-method"
    case INVEST_NOW_FIELD.w9Name:
      return "#invest-now-w9-name"
    case INVEST_NOW_FIELD.w9Address:
      return "#invest-now-w9-address"
    case INVEST_NOW_FIELD.w9Ssn:
      return "#invest-now-w9-ssn"
    default:
      return fieldKey.trim() ? questionnaireFieldSelector(fieldKey) : null
  }
}

export function validateInvestNowInvestorFields({
  bookLoading,
  savedUserProfileId,
  profileId,
  bookProfileRows,
  blockedProfileKeys,
  selectedInvestorClassId,
  investorClasses,
  sponsorLabel,
}: {
  bookLoading: boolean
  savedUserProfileId: string
  profileId: string
  bookProfileRows: InvestorProfileListRow[]
  blockedProfileKeys: Set<string>
  selectedInvestorClassId: string
  investorClasses: DealInvestorClass[]
  sponsorLabel: string
}): { fieldErrors: InvestNowFieldErrors; stepError: string | null } {
  if (bookLoading) {
    return { fieldErrors: {}, stepError: "Loading your saved profiles…" }
  }

  const fieldErrors: InvestNowFieldErrors = {}

  if (!savedUserProfileId.trim()) {
    fieldErrors[INVEST_NOW_FIELD.profile] = "Select a profile"
  } else if (!profileId.trim()) {
    fieldErrors[INVEST_NOW_FIELD.profile] =
      "This profile type cannot be used for this deal"
  } else {
    const matching = filterBookProfilesByCommitmentKind(bookProfileRows, profileId)
    if (matching.length === 0) {
      fieldErrors[INVEST_NOW_FIELD.profile] = NO_SAVED_PROFILES_FOR_INVESTOR_TYPE_MSG
    } else {
      const available = availableBookProfilesForCommitmentType(
        profileId,
        bookProfileRows,
        blockedProfileKeys,
      )
      if (available.length === 0) {
        fieldErrors[INVEST_NOW_FIELD.profile] = ALL_SAVED_PROFILES_IN_USE_ON_DEAL_MSG
      } else {
        const k = lpProfileUseKey(profileId.trim(), savedUserProfileId)
        if (blockedProfileKeys.has(k)) {
          fieldErrors[INVEST_NOW_FIELD.profile] = CHOSEN_PROFILE_ALREADY_USED_MSG
        }
      }
    }
  }

  const selectableClasses = investorOnboardingSelectableClasses(investorClasses)

  if (!selectedInvestorClassId.trim()) {
    fieldErrors[INVEST_NOW_FIELD.investmentClass] =
      selectableClasses.length === 0
        ? "No investment classes are configured for investor onboarding on this deal"
        : "Select an investment class"
  } else if (
    !selectableClasses.some((c) => c.id === selectedInvestorClassId.trim())
  ) {
    fieldErrors[INVEST_NOW_FIELD.investmentClass] =
      "Selected investment class is not available for investor onboarding"
  }
  if (!sponsorLabel.trim() || sponsorLabel === "—") {
    fieldErrors[INVEST_NOW_FIELD.sponsor] =
      "Sponsor information is not available for this deal"
  }

  return { fieldErrors, stepError: null }
}

export const INVEST_NOW_BELOW_MINIMUM_AMOUNT_NOTICE =
  "Invested amount is less than the minimum amount. The sponsor needs to approve the investment."

export function investNowBelowMinimumAmountNotice({
  amount,
  minimumInvestmentAmount,
}: {
  amount: string
  minimumInvestmentAmount: number | null
}): string | null {
  if (minimumInvestmentAmount == null) return null
  const n = parseMoneyDigits(String(amount).trim())
  if (!Number.isFinite(n) || n <= 0) return null
  if (n >= minimumInvestmentAmount) return null
  return INVEST_NOW_BELOW_MINIMUM_AMOUNT_NOTICE
}

export function validateInvestNowInvestmentFields({
  amount,
  fundingMethod,
}: {
  amount: string
  fundingMethod: string
  investorClasses?: DealInvestorClass[]
  selectedInvestorClassId?: string
  minimumInvestmentAmount?: number | null
}): InvestNowFieldErrors {
  const fieldErrors: InvestNowFieldErrors = {}
  const n = parseMoneyDigits(String(amount).trim())

  if (!Number.isFinite(n) || n <= 0) {
    fieldErrors[INVEST_NOW_FIELD.amount] =
      "Enter an investment amount greater than 0"
  }

  if (!fundingMethod.trim()) {
    fieldErrors[INVEST_NOW_FIELD.fundingMethod] = "Select a funding method"
  }

  return fieldErrors
}

export function validateInvestNowW9Fields(
  values: InvestNowW9FormValues,
): InvestNowFieldErrors {
  const fieldErrors: InvestNowFieldErrors = {}

  if (!values.name.trim()) {
    fieldErrors[INVEST_NOW_FIELD.w9Name] =
      "Enter your name as shown on your income tax return"
  }

  const hasLine = Boolean(values.addressLine.trim())
  const hasParts =
    Boolean(values.street1.trim()) &&
    Boolean(values.city.trim()) &&
    Boolean(values.state.trim()) &&
    Boolean(values.zip.trim())
  if (!hasLine && !hasParts) {
    fieldErrors[INVEST_NOW_FIELD.w9Address] = "Enter your address"
  }

  const ssnErr = ssnItinFieldError(values.ssn, {
    required: true,
    requiredMessage: "Enter your Social Security Number",
  })
  if (ssnErr) {
    fieldErrors[INVEST_NOW_FIELD.w9Ssn] = ssnErr
  }

  return fieldErrors
}
