import { type ReactNode } from "react"
import {
  FormTooltip,
  MandatoryFieldMark,
} from "../../../../common/components/form-tooltip/FormTooltip"
// import { SEC_TYPE_OPTIONS } from "../../../../common/components/constants/sec-type-options"
import { SEC_TYPE_OPTIONS } from "../constants/sec-type-options";
import {
  DEAL_FORM_TYPE_OPTIONS,
  DEAL_STAGE_CHOICES,
  type DealStepDraft,
  type YesNo,
} from "../types/deals.types"
import { YesNoCardRadioGroup } from "../../../../common/components/YesNoCardRadioGroup/YesNoCardRadioGroup"
import { RadioPillGroup } from "../../../../common/components/radio-pill-group/RadioPillGroup"
import { FieldInfoHeading } from "../tabs/offering_details/FieldInfoHeading"
import { DealsCreateDropdownSelect } from "./DealsCreateDropdownSelect"
import "./deal-step-form.css"

const DEAL_TYPE_DROPDOWN_OPTIONS = [
  { value: "", label: "Select type…" },
  ...DEAL_FORM_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
]

interface DealStepFormProps {
  draft: DealStepDraft
  errors: Partial<Record<keyof DealStepDraft, string>>
  onChange: (patch: Partial<DealStepDraft>) => void
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="deals_create_field_error">{message}</p>
}

function YesNoRadios({
  name,
  titleId,
  label,
  infoContent,
  value,
  onChange,
  error,
  noIsCommon,
  yesIsCommon,
  required: isRequired,
}: {
  name: string
  titleId: string
  label: string
  infoContent: ReactNode
  value: YesNo | ""
  onChange: (v: YesNo) => void
  error?: string
  noIsCommon?: boolean
  yesIsCommon?: boolean
  required?: boolean
}) {
  return (
    <fieldset className="deal_step_fieldset">
      <legend className="deal_step_sr_legend">
        {label}
        {isRequired ? ", required" : ""}. Choose Yes or No.
      </legend>
      <FieldInfoHeading
        titleId={titleId}
        label={label}
        required={isRequired}
        infoContent={infoContent}
      />
      <YesNoCardRadioGroup
        className="deal_step_yesno_cards"
        name={name}
        value={value}
        onChange={onChange}
        yesIsCommon={yesIsCommon}
        noIsCommon={noIsCommon}
        ariaLabelledBy={titleId}
      />
      <FieldError message={error} />
    </fieldset>
  )
}

export function DealStepForm({ draft, errors, onChange }: DealStepFormProps) {
  const selectedDealType = DEAL_FORM_TYPE_OPTIONS.find(
    (o) => o.value === draft.dealType,
  )
  const dealTypeInfoText = selectedDealType?.infoText

  return (
    <section
      className="deals_create_card"
      aria-labelledby="create-step-deal"
    >
      <h2 id="create-step-deal" className="deals_create_section_title deals_create_step_card_title">
        Deal
      </h2>
      <div className="deals_create_fields deal_step_grid">
        <div className="deals_create_label_full deal_step_owning_block">
          <FieldInfoHeading
            titleId="deal-name-heading"
            label="Deal name"
            required
            infoContent={
              <p>
                The name shown to your team and investors for this deal. You
                can change it later where allowed.
              </p>
            }
          />
          <input
            id="deal-name-input"
            className="deals_create_input"
            value={draft.dealName}
            onChange={(e) => onChange({ dealName: e.target.value })}
            aria-labelledby="deal-name-heading"
            aria-invalid={Boolean(errors.dealName)}
          />
          <FieldError message={errors.dealName} />
        </div>

        <div className="deals_create_label deal_step_deal_type_wrap">
          <div className="deal_step_deal_type_label_row">
            <label className="deal_step_deal_type_label" htmlFor="deal-type-select">
              Deal type
            </label>
            <FormTooltip
              label="About deal type"
              content={
                <p>
                  {dealTypeInfoText ??
                    "Choose the category that best describes this syndication. More detail may appear for certain types."}
                </p>
              }
            />
          </div>
          <DealsCreateDropdownSelect
            id="deal-type-select"
            options={DEAL_TYPE_DROPDOWN_OPTIONS}
            value={draft.dealType}
            onChange={(v) => onChange({ dealType: v })}
            placeholder="Select type…"
          />
        </div>

        <fieldset className="deal_step_fieldset deals_create_label_full">
          <legend className="deal_step_sr_legend">
            Deal stage, required. Select one option.
          </legend>
          <FieldInfoHeading
            titleId="deal-stage-heading"
            label="Deal stage"
            required
            infoContent={
              <ul className="field_info_list">
                {DEAL_STAGE_CHOICES.map((opt) => (
                  <li key={opt.value}>
                    <strong>{opt.label}</strong> — {opt.hint}
                  </li>
                ))}
              </ul>
            }
          />
          <RadioPillGroup
            name="dealStage"
            className="deal_step_stage_pills"
            value={draft.dealStage}
            options={DEAL_STAGE_CHOICES}
            ariaLabelledBy="deal-stage-heading"
            onChange={(dealStage) => onChange({ dealStage })}
          />
          <FieldError message={errors.dealStage} />
        </fieldset>

        <label className="deals_create_label deals_create_label_full">
          <span className="form_label_toolbar">
            <span className="form_label_inline_row">
              <span>SEC type</span>
              <MandatoryFieldMark />
            </span>
            <FormTooltip
              label="About SEC type"
              content={
                <p>
                  Choose how this offering is registered or exempt under SEC
                  rules (for example Reg D, Reg A, or 506(c)). If unsure, consult
                  your counsel.
                </p>
              }
            />
          </span>
          <DealsCreateDropdownSelect
            options={[...SEC_TYPE_OPTIONS]}
            value={draft.secType}
            onChange={(v) => onChange({ secType: v })}
            placeholder="Select SEC type…"
            invalid={Boolean(errors.secType)}
          />
          <FieldError message={errors.secType} />
        </label>

        <label className="deals_create_label deal_step_close_date_wrap">
          <span className="form_label_toolbar">
            <span>Close date</span>
            <FormTooltip
              label="About close date"
              content={
                <p>
                  Select the target or expected closing date for this deal, if
                  known. You can leave it blank and update later.
                </p>
              }
            />
          </span>
          <input
            type="date"
            className="deals_create_input"
            value={draft.closeDate}
            onChange={(e) => onChange({ closeDate: e.target.value })}
            aria-describedby="close-date-hint"
          />
          <span id="close-date-hint" className="deal_step_date_hint">
            Select a date
          </span>
        </label>

        <div className="deals_create_label_full deal_step_owning_block">
          <FieldInfoHeading
            titleId="deal-owning-entity-heading"
            label="Owning entity name"
            required
            infoContent={
              <p>
                If your entity has not been set up yet, you may enter a
                placeholder name. This can be updated later.
              </p>
            }
          />
          <input
            id="deal-owning-entity-input"
            className="deals_create_input"
            value={draft.owningEntityName}
            onChange={(e) => onChange({ owningEntityName: e.target.value })}
            placeholder="e.g. Deal name LLC"
            aria-labelledby="deal-owning-entity-heading"
            aria-invalid={Boolean(errors.owningEntityName)}
          />
          <FieldError message={errors.owningEntityName} />
        </div>

        <div className="deals_create_label_full deal_step_ruled_section">
          <YesNoRadios
            name="fundsBeforeGp"
            titleId="deal-funds-before-gp-heading"
            required
            label="Funds must be received before GP countersigns"
            infoContent={
              <p>
                Send wire instructions & confirm wire only after investors sign
                their subscription documents.
              </p>
            }
            value={draft.fundsBeforeGpCountersigns}
            onChange={(v) => onChange({ fundsBeforeGpCountersigns: v })}
            error={errors.fundsBeforeGpCountersigns}
            noIsCommon
          />
        </div>

        <div className="deals_create_label_full deal_step_ruled_section">
          <YesNoRadios
            name="autoFundingAfterGp"
            titleId="deal-auto-funding-gp-heading"
            required
            label="Automatically send funding instructions after GP countersigns"
            infoContent={
              <p>
                When enabled, investors receive funding instructions
                automatically after their subscription documents are
                countersigned by the GP.
              </p>
            }
            value={draft.autoFundingAfterGpCountersigns}
            onChange={(v) => onChange({ autoFundingAfterGpCountersigns: v })}
            error={errors.autoFundingAfterGpCountersigns}
            yesIsCommon
          />
        </div>
      </div>
    </section>
  )
}
