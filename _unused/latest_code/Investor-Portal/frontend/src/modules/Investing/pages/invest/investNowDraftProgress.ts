import type { DealInvestorRow } from "@/modules/Syndication/Deals/types/deal-investors.types"
import {
  investorEsignWasSent,
  investorInvestmentProfileIsComplete,
  investorRowCommittedNumeric,
} from "@/modules/Syndication/Deals/utils/investorEsignStatus"
import {
  INVEST_NOW_STEPPER_PHASES,
  type InvestNowStepperPhase,
} from "./investNowFlowSteps"

export type InvestNowDraftProgress = {
  percent: number
  phaseLabel: string
  phaseId: InvestNowStepperPhase["id"]
}

function phaseLabelFor(id: InvestNowStepperPhase["id"]): string {
  return INVEST_NOW_STEPPER_PHASES.find((p) => p.id === id)?.label ?? "Investor"
}

/** Short CTA label for the step the investor still needs to complete. */
export function investNowDraftPhaseActionLabel(
  phaseId: InvestNowStepperPhase["id"],
): string {
  switch (phaseId) {
    case "investor":
      return "Select investor"
    case "investment":
      return "Add investment"
    case "questionnaire":
      return "Complete questionnaire"
    case "w9":
      return "Submit W-9"
    case "esignatures":
      return "Sign documents"
    default:
      return phaseLabelFor(phaseId)
  }
}

/** Sub-progress within the Sign phase from e-sign workflow timestamps. */
function esignSignSubProgress(row: DealInvestorRow): number {
  const esign = row.esignStatus
  if (!esign) return 0.2
  if (esign.completedAt) return 1
  if (esign.signedAt) return 0.85
  if (esign.viewedAt) return 0.55
  return 0.25
}

export function completedInvestNowProgress(): InvestNowDraftProgress {
  return {
    percent: 100,
    phaseLabel: phaseLabelFor("esignatures"),
    phaseId: "esignatures",
  }
}

/**
 * Estimate Invest Now completion from a draft investor row (no commitment GET).
 * Aligns with the five Invest Now stepper phases on the wizard.
 * ETL fallback: funds fully received + `doc_signed_date` is 100% complete.
 */
export function investNowDraftProgressFromInvestorRow(
  row: DealInvestorRow,
): InvestNowDraftProgress {
  if (investorInvestmentProfileIsComplete(row)) {
    return completedInvestNowProgress()
  }

  const phaseCount = INVEST_NOW_STEPPER_PHASES.length
  let completedPhases = 0
  let phaseId: InvestNowStepperPhase["id"] = "investor"

  if (String(row.userInvestorProfileId ?? "").trim()) {
    completedPhases = 1
    phaseId = "investment"
  }

  if (investorRowCommittedNumeric(row) > 0) {
    completedPhases = 2
    phaseId = "questionnaire"
  }

  if (investorEsignWasSent(row)) {
    completedPhases = 4
    phaseId = "esignatures"
    const raw = ((completedPhases + esignSignSubProgress(row)) / phaseCount) * 100
    return {
      percent: clampPercent(raw),
      phaseLabel: phaseLabelFor(phaseId),
      phaseId,
    }
  }

  return {
    percent: clampPercent((completedPhases / phaseCount) * 100),
    phaseLabel: phaseLabelFor(phaseId),
    phaseId,
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}
