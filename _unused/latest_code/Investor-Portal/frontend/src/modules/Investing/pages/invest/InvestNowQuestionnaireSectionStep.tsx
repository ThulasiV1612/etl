import {
  isInvestorQuestionnaireQuestionVisible,
  questionsForSection,
  resolveQuestionForDisplay,
  type InvestorQuestionnaireConfig,
} from "@/modules/Syndication/Deals/tabs/esign_templates/investorQuestionnaire.types"
import { InvestNowQuestionnaireField } from "./InvestNowQuestionnaireField"
import type { InvestNowQuestionnaireAnswers } from "./investNowQuestionnaireValidation"
import type { InvestNowFlowStep } from "./investNowFlowSteps"
import { investNowFlowStepSubtitle, investNowFlowStepTitle } from "./investNowFlowSteps"
import { InvestNowStepLayout } from "./InvestNowStepLayout"

export interface InvestNowQuestionnaireSectionStepProps {
  step: Extract<InvestNowFlowStep, { kind: "questionnaire" }>
  config: InvestorQuestionnaireConfig
  answers: InvestNowQuestionnaireAnswers
  showIntro: boolean
  disabled?: boolean
  error?: string
  fieldErrors?: Record<string, string>
  onAnswersChange: (answers: InvestNowQuestionnaireAnswers) => void
}

export function InvestNowQuestionnaireSectionStep({
  step,
  config,
  answers,
  showIntro,
  disabled = false,
  error,
  fieldErrors = {},
  onAnswersChange,
}: InvestNowQuestionnaireSectionStepProps) {
  const titleId = `invest-now-q-${step.sectionId}`
  const questions = questionsForSection(config.questions, step.sectionId)
    .map(resolveQuestionForDisplay)
    .filter((question) => isInvestorQuestionnaireQuestionVisible(question, answers))

  return (
    <InvestNowStepLayout
      titleId={titleId}
      title={investNowFlowStepTitle(step)}
      hint={
        showIntro
          ? "Please complete the investor suitability questionnaire below. This is a requirement from the SEC to collect basic information. Fields marked with an asterisk are required."
          : investNowFlowStepSubtitle(step)
      }
      error={error}
    >
      {questions.map((question) => (
        <InvestNowQuestionnaireField
          key={question.id}
          question={question}
          answers={answers}
          disabled={disabled}
          invalid={Boolean(fieldErrors[question.id])}
          error={fieldErrors[question.id]}
          onChange={onAnswersChange}
        />
      ))}
    </InvestNowStepLayout>
  )
}
