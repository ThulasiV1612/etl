import { Loader2, RotateCcw, Save } from "lucide-react"
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { focusFirstFormErrorAfterUpdate } from "@/common/utils/scrollToFirstFormError"
import { toast } from "../../../../../common/components/Toast"
import {
  patchDealFundingInstructions,
  fetchDealById,
  type DealDetailApi,
} from "../../api/dealsApi"
import { applyOfferingInvestorPreviewJsonFromServer } from "../../utils/offeringPreviewServerState"
import {
  applyFundingInformationDocumentsSectionFromPreview,
  hasFundingInformationDocumentsSection,
  parseDocumentSectionsFromPreviewJson,
} from "../../utils/offeringPreviewDocSections"
import { CheckPaymentDetailsForm } from "./CheckPaymentDetailsForm"
import { InvestmentFeeFields } from "./InvestmentFeeFields"
import { WireTransferDetailsForm } from "./WireTransferDetailsForm"
import {
  cloneFundingInstructions,
  fundingInstructionsEqual,
  fundingInstructionsFromStoredJson,
  serializeFundingInstructions,
  type FundingInstructionsState,
} from "./fundingInstructions"
import {
  fundingInstructionsFieldErrorsActive,
  fundingInstructionsFieldErrorsFromApiMessage,
  validateFundingInstructionsForm,
  type FundingInstructionsFieldErrors,
} from "./fundingInstructionsValidation"

type FundingToggleProps = {
  checked: boolean
  onChange: (next: boolean) => void
  id: string
  labelId: string
}

function FundingToggle({ checked, onChange, id, labelId }: FundingToggleProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      className={`deal_fi_toggle${checked ? " deal_fi_toggle_on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="deal_fi_toggle_track" aria-hidden>
        <span className="deal_fi_toggle_thumb" />
      </span>
    </button>
  )
}

type FundingInfoSectionProps = {
  dealId: string
  initialStoredJson?: string | null
  onSaved?: (deal: DealDetailApi) => void
}

export function FundingInfoSection({
  dealId,
  initialStoredJson,
  onSaved,
}: FundingInfoSectionProps) {
  const baseId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [form, setForm] = useState<FundingInstructionsState>(() =>
    fundingInstructionsFromStoredJson(initialStoredJson),
  )
  const [savedSnapshot, setSavedSnapshot] = useState<FundingInstructionsState>(
    () => cloneFundingInstructions(fundingInstructionsFromStoredJson(initialStoredJson)),
  )
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FundingInstructionsFieldErrors>(
    {},
  )

  useEffect(() => {
    const next = fundingInstructionsFromStoredJson(initialStoredJson)
    setForm(next)
    setSavedSnapshot(cloneFundingInstructions(next))
    setFieldErrors({})
  }, [dealId, initialStoredJson])

  const isDirty = useMemo(
    () => !fundingInstructionsEqual(form, savedSnapshot),
    [form, savedSnapshot],
  )

  const patchForm = useCallback(
    (partial: Partial<FundingInstructionsState>) => {
      setForm((prev) => ({ ...prev, ...partial }))
      if ("achRoutingNumber" in partial) {
        setFieldErrors((e) => ({ ...e, achRoutingNumber: undefined }))
      }
      if ("routingNumber" in partial) {
        setFieldErrors((e) => ({ ...e, wireRoutingNumber: undefined }))
      }
    },
    [],
  )

  const handleSave = useCallback(async () => {
    if (saving) return
    const validationErrors = validateFundingInstructionsForm(form)
    if (fundingInstructionsFieldErrorsActive(validationErrors)) {
      setFieldErrors(validationErrors)
      focusFirstFormErrorAfterUpdate({ container: rootRef.current })
      return
    }
    setFieldErrors({})
    setSaving(true)
    try {
      const result = await patchDealFundingInstructions(
        dealId,
        serializeFundingInstructions(form),
      )
      if (!result.ok) {
        const apiFieldErrors = fundingInstructionsFieldErrorsFromApiMessage(
          result.message,
        )
        if (fundingInstructionsFieldErrorsActive(apiFieldErrors)) {
          setFieldErrors(apiFieldErrors)
          focusFirstFormErrorAfterUpdate({ container: rootRef.current })
        } else {
          toast.error(result.message)
        }
        return
      }
      onSaved?.(result.deal)
      let previewJson = result.deal.offeringInvestorPreviewJson ?? null
      applyOfferingInvestorPreviewJsonFromServer(dealId, previewJson)

      let documentsSynced = applyFundingInformationDocumentsSectionFromPreview(
        dealId,
        previewJson,
      )
      if (
        !documentsSynced &&
        !hasFundingInformationDocumentsSection(
          parseDocumentSectionsFromPreviewJson(previewJson),
        )
      ) {
        try {
          const refreshed = await fetchDealById(dealId)
          if (refreshed.offeringInvestorPreviewJson) {
            previewJson = refreshed.offeringInvestorPreviewJson
            applyOfferingInvestorPreviewJsonFromServer(dealId, previewJson)
            documentsSynced = applyFundingInformationDocumentsSectionFromPreview(
              dealId,
              previewJson,
            )
            if (documentsSynced) {
              onSaved?.(refreshed)
            }
          }
        } catch {
          /* funding instructions saved; documents sync will retry on next save */
        }
      }

      const fromApi = result.deal.fundingInstructionsJson?.trim() ?? ""
      const rawForForm =
        fromApi !== "" ? fromApi : serializeFundingInstructions(form)
      const next = fundingInstructionsFromStoredJson(rawForForm)
      setForm(next)
      setSavedSnapshot(cloneFundingInstructions(next))
      toast.success("Funding info saved.")
    } finally {
      setSaving(false)
    }
  }, [dealId, form, saving, onSaved])

  const handleReset = useCallback(() => {
    setForm(cloneFundingInstructions(savedSnapshot))
    setFieldErrors({})
  }, [savedSnapshot])

  const achTitleId = `${baseId}-ach-title`
  const wireTitleId = `${baseId}-wire-title`
  const checksTitleId = `${baseId}-checks-title`
  const feeTitleId = `${baseId}-fee-title`

  return (
    <div ref={rootRef} className="deal_fi_root">
      <div className="deal_fi_stack">
        {/* ACH payments */}
        <section className="deal_fi_card" aria-labelledby={achTitleId}>
          <div className="deal_fi_card_main">
            <FundingToggle
              id={`${baseId}-ach-switch`}
              labelId={achTitleId}
              checked={form.achEnabled}
              onChange={(achEnabled) => patchForm({ achEnabled })}
            />
            <div className="deal_fi_card_body">
              <div className="deal_fi_title_row">
                <h3 className="deal_fi_card_title" id={achTitleId}>
                  ACH payments
                </h3>
                <span className="deal_fi_badge deal_fi_badge_recommended">
                  Recommended
                </span>
              </div>
              <p className="deal_fi_desc">
                Our system will generate a PDF of these instructions for your
                LPs. You can also upload your own PDF in Offering documents.
              </p>
              {form.achEnabled ? (
                <>
                  <WireTransferDetailsForm
                    baseId={`${baseId}-ach`}
                    receivingBank={form.achReceivingBank}
                    onReceivingBankChange={(achReceivingBank) =>
                      patchForm({ achReceivingBank })
                    }
                    bankAddress={form.achBankAddress}
                    onBankAddressChange={(achBankAddress) =>
                      patchForm({ achBankAddress })
                    }
                    routingNumber={form.achRoutingNumber}
                    onRoutingNumberChange={(achRoutingNumber) =>
                      patchForm({ achRoutingNumber })
                    }
                    routingNumberError={fieldErrors.achRoutingNumber}
                    accountNumber={form.achAccountNumber}
                    onAccountNumberChange={(achAccountNumber) =>
                      patchForm({ achAccountNumber })
                    }
                    accountType={form.achAccountType}
                    onAccountTypeChange={(achAccountType) =>
                      patchForm({ achAccountType })
                    }
                    beneficiaryAccountName={form.achBeneficiaryAccountName}
                    onBeneficiaryAccountNameChange={(achBeneficiaryAccountName) =>
                      patchForm({ achBeneficiaryAccountName })
                    }
                    beneficiaryAddress={form.achBeneficiaryAddress}
                    onBeneficiaryAddressChange={(achBeneficiaryAddress) =>
                      patchForm({ achBeneficiaryAddress })
                    }
                    reference={form.achReference}
                    onReferenceChange={(achReference) =>
                      patchForm({ achReference })
                    }
                    otherInstructions={form.achOtherInstructions}
                    onOtherInstructionsChange={(achOtherInstructions) =>
                      patchForm({ achOtherInstructions })
                    }
                  />
                  <p className="deal_fi_footnote">
                    When no ACH instructions have been provided, LPs will be
                    asked to contact their sponsor for ACH details.
                  </p>
                </>
              ) : null}
            </div>
          </div>
        </section>

        {/* Wire */}
        <section className="deal_fi_card" aria-labelledby={wireTitleId}>
          <div className="deal_fi_card_main">
            <FundingToggle
              id={`${baseId}-wire-switch`}
              labelId={wireTitleId}
              checked={form.wireEnabled}
              onChange={(wireEnabled) => patchForm({ wireEnabled })}
            />
            <div className="deal_fi_card_body">
              <h3 className="deal_fi_card_title" id={wireTitleId}>
                Wire transfers
              </h3>
              <p className="deal_fi_desc">
                Our system will generate a PDF of these instructions for your
                LPs. You can also upload your own PDF in Offering documents.
              </p>
              {form.wireEnabled ? (
                <>
                  <WireTransferDetailsForm
                    baseId={`${baseId}-wire`}
                    receivingBank={form.receivingBank}
                    onReceivingBankChange={(receivingBank) =>
                      patchForm({ receivingBank })
                    }
                    bankAddress={form.bankAddress}
                    onBankAddressChange={(bankAddress) =>
                      patchForm({ bankAddress })
                    }
                    routingNumber={form.routingNumber}
                    onRoutingNumberChange={(routingNumber) =>
                      patchForm({ routingNumber })
                    }
                    routingNumberError={fieldErrors.wireRoutingNumber}
                    accountNumber={form.accountNumber}
                    onAccountNumberChange={(accountNumber) =>
                      patchForm({ accountNumber })
                    }
                    accountType={form.accountType}
                    onAccountTypeChange={(accountType) =>
                      patchForm({ accountType })
                    }
                    beneficiaryAccountName={form.beneficiaryAccountName}
                    onBeneficiaryAccountNameChange={(beneficiaryAccountName) =>
                      patchForm({ beneficiaryAccountName })
                    }
                    beneficiaryAddress={form.beneficiaryAddress}
                    onBeneficiaryAddressChange={(beneficiaryAddress) =>
                      patchForm({ beneficiaryAddress })
                    }
                    reference={form.wireReference}
                    onReferenceChange={(wireReference) =>
                      patchForm({ wireReference })
                    }
                    otherInstructions={form.wireOtherInstructions}
                    onOtherInstructionsChange={(wireOtherInstructions) =>
                      patchForm({ wireOtherInstructions })
                    }
                  />
                  <p className="deal_fi_footnote">
                    When no wire instructions have been provided, LPs will be
                    asked to contact their sponsor for wire details.
                  </p>
                </>
              ) : null}
            </div>
          </div>
        </section>

        {/* Checks */}
        <section className="deal_fi_card" aria-labelledby={checksTitleId}>
          <div className="deal_fi_card_main">
            <FundingToggle
              id={`${baseId}-checks-switch`}
              labelId={checksTitleId}
              checked={form.checksEnabled}
              onChange={(checksEnabled) => patchForm({ checksEnabled })}
            />
            <div className="deal_fi_card_body">
              <h3 className="deal_fi_card_title" id={checksTitleId}>
                Checks
              </h3>
              <p className="deal_fi_desc">
                Enter instructions for mailing a check. This is not recommended
                for most use cases.
              </p>
              {form.checksEnabled ? (
                <CheckPaymentDetailsForm
                  baseId={`${baseId}-check`}
                  mailingAddress={form.checkMailingAddress}
                  onMailingAddressChange={(checkMailingAddress) =>
                    patchForm({ checkMailingAddress })
                  }
                  beneficiary={form.checkBeneficiary}
                  onBeneficiaryChange={(checkBeneficiary) =>
                    patchForm({ checkBeneficiary })
                  }
                  beneficiaryAddress={form.checkBeneficiaryAddress}
                  onBeneficiaryAddressChange={(checkBeneficiaryAddress) =>
                    patchForm({ checkBeneficiaryAddress })
                  }
                  memo={form.checkMemo}
                  onMemoChange={(checkMemo) => patchForm({ checkMemo })}
                  otherInstructions={form.checkOtherInstructions}
                  onOtherInstructionsChange={(checkOtherInstructions) =>
                    patchForm({ checkOtherInstructions })
                  }
                />
              ) : null}
            </div>
          </div>
        </section>

        {/* Investment fee */}
        <section className="deal_fi_card" aria-labelledby={feeTitleId}>
          <div className="deal_fi_card_main deal_fi_card_main_no_toggle">
            <div className="deal_fi_card_body deal_fi_card_body_full">
              <h3 className="deal_fi_card_title" id={feeTitleId}>
                Investment fee (advanced)
              </h3>
              <p className="deal_fi_desc">
                Configure an additional fee charged to the investor upon funding
                the investment. This is not for use as an acquisition fee.
              </p>
              <InvestmentFeeFields
                baseId={`${baseId}-fee`}
                investmentFeeMethod={form.investmentFeeMethod}
                onInvestmentFeeMethodChange={(investmentFeeMethod) =>
                  patchForm({ investmentFeeMethod })
                }
                feeHandlingMethod={form.feeHandlingMethod}
                onFeeHandlingMethodChange={(feeHandlingMethod) =>
                  patchForm({ feeHandlingMethod })
                }
                feeAmount={form.feeAmount}
                onFeeAmountChange={(feeAmount) => patchForm({ feeAmount })}
              />
            </div>
          </div>
        </section>
      </div>

      <div className="deal_kh_footer deal_fi_footer um_modal_actions add_contact_modal_actions">
        <button
          type="button"
          className="um_btn_secondary"
          disabled={!isDirty || saving}
          onClick={handleReset}
        >
          <RotateCcw size={17} strokeWidth={2} aria-hidden />
          Reset
        </button>
        <div className="add_contact_modal_actions_trailing">
          <button
            type="button"
            className="um_btn_primary"
            disabled={!isDirty || saving}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <>
                <Loader2
                  size={18}
                  strokeWidth={2}
                  className="deal_offering_btn_spin"
                  aria-hidden
                />
                Saving…
              </>
            ) : (
              <>
                <Save size={18} strokeWidth={2} aria-hidden />
                Save
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
