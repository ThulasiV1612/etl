import type { DropdownSelectOption } from "@/common/components/dropdown-select"
import { DealsCreateDropdownSelect } from "@/modules/Syndication/Deals/components/DealsCreateDropdownSelect"
import "@/modules/Syndication/Deals/components/deals-create-dropdown.css"
import type { LpBookProfileFilterRow } from "@/modules/Syndication/Deals/utils/lpInvestNowSavedProfileOptions"
import { InvestNowFormField, InvestNowReadonlyField } from "./InvestNowFormField"
import { InvestNowStepLayout } from "./InvestNowStepLayout"

export interface InvestNowInvestorStepProps {
  profileOptions: DropdownSelectOption[]
  savedUserProfileId: string
  onSavedProfileChange: (id: string) => void
  investmentClassOptions: DropdownSelectOption[]
  selectedInvestorClassId: string
  onInvestorClassChange: (classId: string) => void
  classesLoading: boolean
  sponsorLabel: string
  loading: boolean
  disabled: boolean
  bookLoading: boolean
  error?: string
  fieldErrors?: Partial<
    Record<"profile" | "investmentClass" | "sponsor", string>
  >
  onAddProfile?: () => void
}

export function InvestNowInvestorStep({
  profileOptions,
  savedUserProfileId,
  onSavedProfileChange,
  investmentClassOptions,
  selectedInvestorClassId,
  onInvestorClassChange,
  classesLoading,
  sponsorLabel,
  loading,
  disabled,
  bookLoading,
  error,
  fieldErrors = {},
  onAddProfile,
}: InvestNowInvestorStepProps) {
  const profileFieldId = "invest-now-profile"
  const classFieldId = "invest-now-investment-class"
  const titleId = "invest-now-step-investor-title"

  return (
    <InvestNowStepLayout
      titleId={titleId}
      title="Investor"
      hint="Select the investor profile and investment class you want to invest in, as well as the primary sponsor you are investing with."
      error={error}
    >
      <InvestNowFormField
        id={profileFieldId}
        label="Profile"
        required
        error={fieldErrors.profile}
      >
        <DealsCreateDropdownSelect
          id={profileFieldId}
          options={profileOptions}
          value={savedUserProfileId}
          onChange={onSavedProfileChange}
          placeholder={bookLoading ? "Loading profiles…" : "Select profile"}
          ariaLabel="Profile"
          invalid={Boolean(fieldErrors.profile)}
          disabled={disabled || loading || bookLoading}
          header={
            onAddProfile
              ? { label: "+ Add Profile", onClick: onAddProfile }
              : undefined
          }
        />
      </InvestNowFormField>

      <InvestNowFormField
        id={classFieldId}
        label="Investment class"
        required
        error={fieldErrors.investmentClass}
      >
        <DealsCreateDropdownSelect
          id={classFieldId}
          options={investmentClassOptions}
          value={selectedInvestorClassId}
          onChange={onInvestorClassChange}
          placeholder={
            classesLoading
              ? "Loading investment classes…"
              : investmentClassOptions.length === 0
                ? "No investment classes available for investor onboarding"
                : "Select investment class"
          }
          ariaLabel="Investment class"
          invalid={Boolean(fieldErrors.investmentClass)}
          disabled={
            disabled || loading || classesLoading || investmentClassOptions.length === 0
          }
        />
      </InvestNowFormField>

      <InvestNowReadonlyField
        label="Sponsor"
        required
        value={sponsorLabel}
        emphasis
        error={fieldErrors.sponsor}
      />
    </InvestNowStepLayout>
  )
}

export type { LpBookProfileFilterRow }
