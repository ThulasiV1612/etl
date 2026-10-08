import type { VisibleQuestionnaireSection } from "./investNowEsignContext"

export type InvestNowFlowStep =
  | { kind: "investor" }
  | { kind: "investment" }
  | { kind: "questionnaire"; sectionId: string; sectionLabel: string }
  | { kind: "w9" }
  | { kind: "esignatures" }

export function buildInvestNowFlowSteps({
  showQuestionnaire,
  visibleSections,
}: {
  showQuestionnaire: boolean
  visibleSections: VisibleQuestionnaireSection[]
}): InvestNowFlowStep[] {
  const steps: InvestNowFlowStep[] = [
    { kind: "investor" },
    { kind: "investment" },
  ]

  if (showQuestionnaire) {
    for (const section of visibleSections) {
      steps.push({
        kind: "questionnaire",
        sectionId: section.id,
        sectionLabel: section.label,
      })
    }
  }

  steps.push({ kind: "w9" }, { kind: "esignatures" })
  return steps
}

export function investNowFlowStepKey(step: InvestNowFlowStep): string {
  if (step.kind === "questionnaire") return `questionnaire:${step.sectionId}`
  return step.kind
}

export function investNowFlowStepTitle(step: InvestNowFlowStep): string {
  if (step.kind === "investor") return "Investor"
  if (step.kind === "investment") return "Investment"
  if (step.kind === "questionnaire") return step.sectionLabel
  if (step.kind === "w9") return "W-9 form"
  return "E-signatures"
}

export function investNowFlowStepSubtitle(step: InvestNowFlowStep): string {
  if (step.kind === "investor") {
    return "Select the investor profile and investment class you want to invest in, as well as the primary sponsor you are investing with."
  }
  if (step.kind === "investment") {
    return "Input the amount you would like to invest and the method you will use."
  }
  if (step.kind === "questionnaire") {
    return `Complete the ${step.sectionLabel} section of the investor suitability questionnaire. Fields marked with an asterisk are required.`
  }
  if (step.kind === "w9") {
    return "Complete the W-9 form below. This is a requirement from the IRS to collect taxpayer information."
  }
  return "Review and sign the subscription documents for this deal."
}

export type InvestNowStepperPhase = {
  id: "investor" | "investment" | "questionnaire" | "w9" | "esignatures"
  label: string
}

export const INVEST_NOW_STEPPER_PHASES: InvestNowStepperPhase[] = [
  { id: "investor", label: "Investor" },
  { id: "investment", label: "Investment" },
  { id: "questionnaire", label: "Questionnaire" },
  { id: "w9", label: "W-9" },
  { id: "esignatures", label: "Sign" },
]

export function investNowStepperPhases(options?: {
  includeQuestionnaire?: boolean
}): InvestNowStepperPhase[] {
  if (options?.includeQuestionnaire !== false) {
    return INVEST_NOW_STEPPER_PHASES
  }
  return INVEST_NOW_STEPPER_PHASES.filter((p) => p.id !== "questionnaire")
}

export function investNowActiveStepperPhaseId(
  step: InvestNowFlowStep | undefined,
): InvestNowStepperPhase["id"] {
  if (!step) return "investor"
  if (step.kind === "questionnaire") return "questionnaire"
  return step.kind
}

export function investNowStepperPhaseIndex(
  phaseId: InvestNowStepperPhase["id"],
  phases: InvestNowStepperPhase[] = INVEST_NOW_STEPPER_PHASES,
): number {
  return phases.findIndex((p) => p.id === phaseId)
}

/** First wizard step index for a stepper phase (respects questionnaire sections in flow). */
export function investNowStepIndexForPhaseId(
  phaseId: InvestNowStepperPhase["id"],
  flowSteps: InvestNowFlowStep[],
): number {
  if (flowSteps.length === 0) return 0
  if (phaseId === "investor") return 0
  if (phaseId === "investment") {
    const idx = flowSteps.findIndex((s) => s.kind === "investment")
    return idx >= 0 ? idx : 0
  }
  if (phaseId === "questionnaire") {
    const idx = flowSteps.findIndex((s) => s.kind === "questionnaire")
    if (idx >= 0) return idx
    const w9 = flowSteps.findIndex((s) => s.kind === "w9")
    return w9 >= 0 ? w9 : 0
  }
  if (phaseId === "w9") {
    const idx = flowSteps.findIndex((s) => s.kind === "w9")
    return idx >= 0 ? idx : 0
  }
  const idx = flowSteps.findIndex((s) => s.kind === "esignatures")
  return idx >= 0 ? idx : flowSteps.length - 1
}
