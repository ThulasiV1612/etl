import { UsPhoneInput } from "@/common/components/UsPhoneInput"
import {
  YesNoCardRadioGroup,
  isYesNoOptionPair,
  storedOptionFromYesNoValue,
  yesNoValueFromStoredOption,
} from "@/common/components/YesNoCardRadioGroup/YesNoCardRadioGroup"
import { questionnaireFieldSelector } from "@/common/utils/formValidationFocus"
import "@/common/components/us-phone-input.css"
import {
  nationalDigitsFromStoredPhone,
} from "@/common/phone/usPhoneNumber"
import { formatEinInput } from "@/common/tax/usEin"
import { SsnItinMaskedInput } from "@/common/components/SsnItinMaskedInput"
import {
  pruneHiddenInvestorQuestionnaireAnswers,
  resolveQuestionForDisplay,
  type InvestorQuestionnaireQuestion,
} from "@/modules/Syndication/Deals/tabs/esign_templates/investorQuestionnaire.types"
import { InvestNowFormField, InvestNowFieldError } from "./InvestNowFormField"
import type { InvestNowQuestionnaireAnswers } from "./investNowQuestionnaireValidation"

export interface InvestNowQuestionnaireFieldProps {
  question: InvestorQuestionnaireQuestion
  answers: InvestNowQuestionnaireAnswers
  disabled?: boolean
  invalid?: boolean
  error?: string
  onChange: (answers: InvestNowQuestionnaireAnswers) => void
}

function questionFieldId(questionId: string): string {
  return questionnaireFieldSelector(questionId).replace(/^#/, "")
}

function readCheckboxValues(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === "string")
  } catch {
    return []
  }
}

export function InvestNowQuestionnaireField({
  question: rawQuestion,
  answers,
  disabled = false,
  invalid = false,
  error,
  onChange,
}: InvestNowQuestionnaireFieldProps) {
  const question = resolveQuestionForDisplay(rawQuestion)
  const fieldId = questionFieldId(question.id)
  const value = answers[question.id] ?? ""
  const ariaInvalid = invalid || undefined

  function patch(nextValue: string) {
    onChange(
      pruneHiddenInvestorQuestionnaireAnswers({
        ...answers,
        [question.id]: nextValue,
      }),
    )
  }

  function toggleCheckbox(option: string, checked: boolean) {
    const current = readCheckboxValues(value)
    const next = checked
      ? [...current, option]
      : current.filter((v) => v !== option)
    patch(JSON.stringify(next))
  }

  if (question.fieldType === "paragraph" || question.fieldType === "textarea") {
    return (
      <InvestNowFormField
        id={fieldId}
        label={question.label}
        required={question.required}
        hint={question.subtext}
        error={error}
      >
        <textarea
          id={fieldId}
          className="deals_create_textarea"
          rows={question.fieldType === "paragraph" ? 4 : 3}
          value={value}
          disabled={disabled}
          aria-invalid={ariaInvalid}
          onChange={(e) => patch(e.target.value)}
        />
      </InvestNowFormField>
    )
  }

  if (question.fieldType === "boolean") {
    const yesNoValue =
      value === "yes" || value === "no" ? (value as "yes" | "no") : ""
    return (
      <InvestNowFormField
        label={question.label}
        required={question.required}
        error={error}
      >
        <YesNoCardRadioGroup
          name={fieldId}
          value={yesNoValue}
          onChange={(v) => patch(v)}
          disabled={disabled}
          ariaLabel={question.label}
        />
      </InvestNowFormField>
    )
  }

  if (question.fieldType === "radio") {
    const options = question.options ?? []
    if (isYesNoOptionPair(options)) {
      const yesNoValue = yesNoValueFromStoredOption(value, options)
      return (
        <InvestNowFormField
          label={question.label}
          required={question.required}
          error={error}
        >
          <YesNoCardRadioGroup
            name={fieldId}
            value={yesNoValue}
            onChange={(v) => patch(storedOptionFromYesNoValue(v, options))}
            disabled={disabled}
            ariaLabel={question.label}
          />
        </InvestNowFormField>
      )
    }
    return (
      <fieldset
        id={fieldId}
        className={`invest_now_questionnaire_fieldset${invalid ? " invest_now_questionnaire_fieldset_invalid" : ""}`}
        aria-invalid={ariaInvalid}
      >
        <legend className="deals_create_label_text">
          {question.label}
          {question.required ? (
            <span className="deals_create_req" aria-hidden>
              {" "}
              *
            </span>
          ) : null}
        </legend>
        <div className="invest_now_questionnaire_options">
          {options.map((option) => (
            <label key={option} className="invest_now_questionnaire_option">
              <input
                type="radio"
                name={fieldId}
                value={option}
                checked={value === option}
                disabled={disabled}
                aria-invalid={ariaInvalid}
                onChange={() => patch(option)}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
        <InvestNowFieldError message={error} />
      </fieldset>
    )
  }

  if (question.fieldType === "checkboxes") {
    const options = question.options ?? []
    const selected = readCheckboxValues(value)
    return (
      <fieldset
        id={fieldId}
        className={`invest_now_questionnaire_fieldset${invalid ? " invest_now_questionnaire_fieldset_invalid" : ""}`}
        aria-invalid={ariaInvalid}
      >
        <legend className="deals_create_label_text">
          {question.label}
          {question.required ? (
            <span className="deals_create_req" aria-hidden>
              {" "}
              *
            </span>
          ) : null}
        </legend>
        <div className="invest_now_questionnaire_options">
          {options.map((option) => (
            <label key={option} className="invest_now_questionnaire_option">
              <input
                type="checkbox"
                checked={selected.includes(option)}
                disabled={disabled}
                aria-invalid={ariaInvalid}
                onChange={(e) => toggleCheckbox(option, e.target.checked)}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
        <InvestNowFieldError message={error} />
      </fieldset>
    )
  }

  if (question.fieldType === "phone") {
    const nationalDigits = nationalDigitsFromStoredPhone(value)
    return (
      <InvestNowFormField
        id={fieldId}
        label={question.label}
        required={question.required}
        hint={question.subtext}
        error={error}
      >
        <UsPhoneInput
          id={fieldId}
          nationalDigits={nationalDigits}
          onNationalDigitsChange={patch}
          disabled={disabled}
          className="deals_create_input"
          autoComplete="tel"
          validationMode="tenDigits"
          aria-invalid={ariaInvalid}
          invalidClassName="um_field_input_invalid"
        />
      </InvestNowFormField>
    )
  }

  const inputType = question.fieldType === "date" ? "date" : "text"
  const isEinField =
    question.fieldType === "ein" ||
    question.id === "ira_entity_custodian_ein" ||
    question.id === "ira_entity_partner_ein"
  const isSsnField = question.fieldType === "ssn"

  if (isSsnField) {
    return (
      <InvestNowFormField
        id={fieldId}
        label={question.label}
        required={question.required}
        hint={question.subtext}
        error={error}
      >
        <SsnItinMaskedInput
          id={fieldId}
          className="deals_create_input"
          value={value}
          disabled={disabled}
          showToggle
          allowReveal
          revealLabel="Show SSN"
          hideLabel="Hide SSN"
          aria-invalid={ariaInvalid}
          onValueChange={(next) => patch(next)}
        />
      </InvestNowFormField>
    )
  }

  return (
    <InvestNowFormField
      id={fieldId}
      label={question.label}
      required={question.required}
      hint={question.subtext}
      error={error}
    >
      <input
        id={fieldId}
        type={inputType}
        className="deals_create_input"
        value={value}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        autoComplete="off"
        inputMode={isEinField ? "numeric" : undefined}
        placeholder={isEinField ? "XX-XXXXXXX" : undefined}
        onChange={(e) => {
          let next = e.target.value
          if (isEinField) next = formatEinInput(next)
          patch(next)
        }}
      />
    </InvestNowFormField>
  )
}
