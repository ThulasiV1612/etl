import {
  isInvestorQuestionnaireQuestionVisible,
  questionsForSection,
  resolveQuestionForDisplay,
  type InvestorQuestionnaireConfig,
} from "@/modules/Syndication/Deals/tabs/esign_templates/investorQuestionnaire.types"
import type { VisibleQuestionnaireSection } from "./investNowEsignContext"
import { InvestNowQuestionnaireField } from "./InvestNowQuestionnaireField"
import type { InvestNowQuestionnaireAnswers } from "./investNowQuestionnaireValidation"

export interface InvestNowQuestionnaireSectionsProps {
  config: InvestorQuestionnaireConfig
  visibleSections: VisibleQuestionnaireSection[]
  answers: InvestNowQuestionnaireAnswers
  subsectionStartIndex: number
  disabled?: boolean
  onAnswersChange: (answers: InvestNowQuestionnaireAnswers) => void
}

export function InvestNowQuestionnaireSections({
  config,
  visibleSections,
  answers,
  subsectionStartIndex,
  disabled = false,
  onAnswersChange,
}: InvestNowQuestionnaireSectionsProps) {
  if (visibleSections.length === 0) return null

  return (
    <>
      {visibleSections.map((section, index) => {
        const questions = questionsForSection(config.questions, section.id)
          .map(resolveQuestionForDisplay)
          .filter((question) =>
            isInvestorQuestionnaireQuestionVisible(question, answers),
          )
        const subsectionNumber = subsectionStartIndex + index

        return (
          <div
            key={section.id}
            className="invest_now_subsection invest_now_questionnaire_section"
          >
            <h3 className="invest_now_subsection_title">
              3.{subsectionNumber} {section.label}
            </h3>
            {index === 0 ? (
              <p className="invest_now_step_desc">
                Please complete the investor suitability questionnaire below. This
                is a requirement from the SEC to collect basic information. Fields
                marked with an asterisk are required.
              </p>
            ) : null}
            <div className="invest_now_fields">
              {questions.map((question) => (
                <InvestNowQuestionnaireField
                  key={question.id}
                  question={question}
                  answers={answers}
                  disabled={disabled}
                  onChange={onAnswersChange}
                />
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}
