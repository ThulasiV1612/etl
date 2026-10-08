import {
  isValidUsPhoneTenDigits,
  nationalTenDigitsFromRawInput,
} from "@/common/phone/usPhoneNumber"
import { einFieldError, nineDigitsFromEinInput } from "@/common/tax/usEin"
import {
  isInvestorQuestionnaireQuestionVisible,
  questionsForSection,
  resolveQuestionForDisplay,
  type InvestorQuestionnaireConfig,
  type InvestorQuestionnaireQuestion,
} from "@/modules/Syndication/Deals/tabs/esign_templates/investorQuestionnaire.types"
import type { VisibleQuestionnaireSection } from "./investNowEsignContext"

export type InvestNowQuestionnaireAnswers = Record<string, string>

export type InvestNowQuestionnaireFieldValidation = {
  message: string
  questionId: string
}

function fieldValidation(
  question: InvestorQuestionnaireQuestion,
  message: string,
): InvestNowQuestionnaireFieldValidation {
  return { message, questionId: question.id }
}

function validatePhoneAnswer(
  raw: string | undefined,
  required: boolean,
): string | null {
  const digits = nationalTenDigitsFromRawInput(raw ?? "")
  if (!digits.length) {
    return required ? "required" : null
  }
  if (digits.length < 10) return "incomplete"
  if (!isValidUsPhoneTenDigits(digits)) return "invalid"
  return null
}

function isEinQuestion(question: InvestorQuestionnaireQuestion): boolean {
  return (
    question.fieldType === "ein" ||
    question.id === "ira_entity_custodian_ein" ||
    question.id === "ira_entity_partner_ein"
  )
}

function validateEinAnswer(
  raw: string | undefined,
  required: boolean,
): string | null {
  const err = einFieldError(raw ?? "", { required })
  if (!err) return null
  if (!nineDigitsFromEinInput(raw ?? "").length && required) return "required"
  if (err.includes("9 digits")) return "incomplete"
  return "invalid"
}

function isAnswered(
  question: InvestorQuestionnaireQuestion,
  answers: InvestNowQuestionnaireAnswers,
): boolean {
  const raw = answers[question.id]
  if (question.fieldType === "checkboxes") {
    try {
      const parsed = JSON.parse(raw ?? "[]") as unknown
      return Array.isArray(parsed) && parsed.length > 0
    } catch {
      return false
    }
  }
  if (question.fieldType === "boolean") {
    return raw === "yes" || raw === "no"
  }
  if (question.fieldType === "paragraph") {
    return String(raw ?? "").trim().length > 0
  }
  if (question.fieldType === "phone") {
    return validatePhoneAnswer(raw, question.required) === null
  }
  if (isEinQuestion(question)) {
    return validateEinAnswer(raw, question.required) === null
  }
  return String(raw ?? "").trim().length > 0
}

export function validateInvestNowQuestionnaireSection({
  config,
  sectionId,
  answers,
}: {
  config: InvestorQuestionnaireConfig | null | undefined
  sectionId: string
  answers: InvestNowQuestionnaireAnswers
}): InvestNowQuestionnaireFieldValidation | string | null {
  if (!config) return "Questionnaire is not loaded yet"

  const questions = questionsForSection(config.questions, sectionId).map(
    resolveQuestionForDisplay,
  )
  for (const question of questions) {
    if (!isInvestorQuestionnaireQuestionVisible(question, answers)) continue
    if (question.fieldType === "phone") {
      const phoneErr = validatePhoneAnswer(answers[question.id], question.required)
      if (phoneErr === "required") {
        return fieldValidation(
          question,
          `Complete required field: ${question.label}`,
        )
      }
      if (phoneErr === "incomplete") {
        return fieldValidation(
          question,
          `${question.label}: enter a complete 10-digit U.S. phone number`,
        )
      }
      if (phoneErr === "invalid") {
        return fieldValidation(
          question,
          `${question.label}: enter a valid U.S. phone number`,
        )
      }
      continue
    }
    if (isEinQuestion(question)) {
      const einErr = validateEinAnswer(answers[question.id], question.required)
      if (einErr === "required") {
        return fieldValidation(
          question,
          `Complete required field: ${question.label}`,
        )
      }
      if (einErr === "incomplete") {
        return fieldValidation(
          question,
          `${question.label}: enter a complete EIN (XX-XXXXXXX)`,
        )
      }
      if (einErr === "invalid") {
        return fieldValidation(
          question,
          `${question.label}: enter a valid U.S. EIN (XX-XXXXXXX)`,
        )
      }
      continue
    }
    if (!question.required) continue
    if (!isAnswered(question, answers)) {
      return fieldValidation(
        question,
        `Complete required field: ${question.label}`,
      )
    }
  }

  return null
}

export function questionnaireValidationMessage(
  result: InvestNowQuestionnaireFieldValidation | string | null,
): string | null {
  if (!result) return null
  return typeof result === "string" ? result : result.message
}

export function questionnaireValidationQuestionId(
  result: InvestNowQuestionnaireFieldValidation | string | null,
): string | null {
  if (!result || typeof result === "string") return null
  return result.questionId
}

export function validateInvestNowQuestionnaireAnswers({
  config,
  visibleSections,
  answers,
}: {
  config: InvestorQuestionnaireConfig | null | undefined
  visibleSections: VisibleQuestionnaireSection[]
  answers: InvestNowQuestionnaireAnswers
}): InvestNowQuestionnaireFieldValidation | string | null {
  if (!config || visibleSections.length === 0) return null

  for (const section of visibleSections) {
    const err = validateInvestNowQuestionnaireSection({
      config,
      sectionId: section.id,
      answers,
    })
    if (err) return err
  }

  return null
}
