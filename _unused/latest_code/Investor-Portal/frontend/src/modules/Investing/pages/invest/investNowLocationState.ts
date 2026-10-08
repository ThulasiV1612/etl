import type { InvestNowStepperPhase } from "./investNowFlowSteps"
import { INVEST_NOW_STEPPER_PHASES } from "./investNowFlowSteps"

/** Navigation state for `/deals/:dealId/invest`. */
export type InvestNowEntryMode = "fresh" | "resume"

const STEPPER_PHASE_IDS = new Set(
  INVEST_NOW_STEPPER_PHASES.map((p) => p.id),
)

export type InvestNowLocationState = {
  returnTo?: string
  mode?: InvestNowEntryMode
  /** Book profile to restore (resume) or pre-select (optional fresh). */
  userInvestorProfileId?: string
  profileId?: string
  investmentId?: string
  /** Open the wizard on this stepper phase (dashboard progress chips). */
  phaseId?: InvestNowStepperPhase["id"]
  /** Encrypted sponsor ref from the offering preview link (`?ref=`). */
  referringSponsorRef?: string
  /** Resolved sponsor name from the public preview API (optional). */
  referringSponsorDisplayName?: string
}

export function readInvestNowLocationState(
  state: unknown,
): InvestNowLocationState {
  if (!state || typeof state !== "object") return {}
  const s = state as InvestNowLocationState
  const phaseRaw = s.phaseId
  const phaseId =
    typeof phaseRaw === "string" &&
    STEPPER_PHASE_IDS.has(phaseRaw as InvestNowStepperPhase["id"])
      ? (phaseRaw as InvestNowStepperPhase["id"])
      : undefined
  return {
    returnTo: s.returnTo?.trim(),
    mode: s.mode === "resume" ? "resume" : s.mode === "fresh" ? "fresh" : undefined,
    userInvestorProfileId: s.userInvestorProfileId?.trim(),
    profileId: s.profileId?.trim(),
    investmentId: s.investmentId?.trim(),
    phaseId,
    referringSponsorRef: s.referringSponsorRef?.trim(),
    referringSponsorDisplayName: s.referringSponsorDisplayName?.trim(),
  }
}
