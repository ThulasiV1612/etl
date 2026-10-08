import type { InvestorQuestionnaireConfig } from "@/modules/Syndication/Deals/tabs/esign_templates/investorQuestionnaire.types"
import type { VisibleQuestionnaireSection } from "./investNowEsignContext"
import { InvestNowQuestionnaireSections } from "./InvestNowQuestionnaireSections"
import { InvestNowW9Form } from "./InvestNowW9Form"
import type { InvestNowQuestionnaireAnswers } from "./investNowQuestionnaireValidation"
import type { InvestNowW9FormValues } from "./investNowW9.types"

export interface InvestNowDocumentsStepProps {
  showQuestionnaire: boolean
  questionnaireConfig: InvestorQuestionnaireConfig | null
  visibleSections: VisibleQuestionnaireSection[]
  questionnaireAnswers: InvestNowQuestionnaireAnswers
  w9Values: InvestNowW9FormValues
  onQuestionnaireAnswersChange: (answers: InvestNowQuestionnaireAnswers) => void
  onW9Change: (v: InvestNowW9FormValues) => void
  disabled: boolean
  error?: string
}

export function InvestNowDocumentsStep({
  showQuestionnaire,
  questionnaireConfig,
  visibleSections,
  questionnaireAnswers,
  w9Values,
  onQuestionnaireAnswersChange,
  onW9Change,
  disabled,
  error,
}: InvestNowDocumentsStepProps) {
  const questionnaireSectionCount =
    showQuestionnaire && questionnaireConfig ? visibleSections.length : 0
  const w9SubsectionNumber = questionnaireSectionCount + 1

  return (
    <section
      className="invest_now_step invest_now_documents_step"
      aria-labelledby="invest-now-step-documents-title"
    >
      <h2 id="invest-now-step-documents-title" className="invest_now_step_title">
        3. Documents
      </h2>

      {error ? (
        <p className="invest_now_step_error" role="alert">
          {error}
        </p>
      ) : null}

      {showQuestionnaire ? (
        <>
          {visibleSections.length === 0 ? (
            <p className="invest_now_step_desc invest_now_step_desc_warn">
              No questionnaire sections are enabled for your investor profile on
              this deal. Contact your sponsor if you believe this is an error.
            </p>
          ) : questionnaireConfig ? (
            <InvestNowQuestionnaireSections
              config={questionnaireConfig}
              visibleSections={visibleSections}
              answers={questionnaireAnswers}
              subsectionStartIndex={1}
              disabled={disabled}
              onAnswersChange={onQuestionnaireAnswersChange}
            />
          ) : null}
        </>
      ) : null}

      <div className="invest_now_subsection">
        <h3 className="invest_now_subsection_title">
          3.{w9SubsectionNumber} W-9 form
        </h3>
        <p className="invest_now_step_desc">
          Please complete the W-9 form below. This is a requirement from the IRS
          to collect taxpayer information. Note that questions marked with an
          asterisk are required fields.
        </p>

        <InvestNowW9Form
          values={w9Values}
          onChange={onW9Change}
          disabled={disabled}
        />
      </div>
    </section>
  )
}
