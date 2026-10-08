import type { InvestorQuestionnaireFieldType } from "./investorQuestionnaire.types"

export type QuestionnaireTypeOption = {
  value: InvestorQuestionnaireFieldType
  label: string
}

export const QUESTIONNAIRE_TYPE_OPTIONS: QuestionnaireTypeOption[] = [
  { value: "text", label: "Short answer" },
  { value: "textarea", label: "Long answer" },
  { value: "paragraph", label: "Paragraph" },
  { value: "phone", label: "Phone" },
  { value: "address", label: "Address" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes / No" },
  { value: "ssn", label: "Social Security Number" },
  { value: "ein", label: "EIN (XX-XXXXXXX)" },
  { value: "radio", label: "Radio buttons" },
  { value: "checkboxes", label: "Checkboxes" },
]

export function fieldTypeUsesOptions(
  fieldType: InvestorQuestionnaireFieldType,
): boolean {
  return fieldType === "radio" || fieldType === "checkboxes"
}

export function fieldTypeDisplayLabel(
  fieldType: InvestorQuestionnaireFieldType,
): string {
  return (
    QUESTIONNAIRE_TYPE_OPTIONS.find((o) => o.value === fieldType)?.label ??
    "Short answer"
  )
}
