import type { InvestNowDraftProgress } from "./investNowDraftProgress"
import { investNowDraftPhaseActionLabel } from "./investNowDraftProgress"
import {
  INVEST_NOW_STEPPER_PHASES,
  investNowStepperPhaseIndex,
  type InvestNowStepperPhase,
} from "./investNowFlowSteps"
import "./invest-now-draft-progress.css"

export interface InvestNowDraftProgressBarProps {
  progress: InvestNowDraftProgress
  /** Compact layout for table cells. */
  compact?: boolean
  /** Inside `.invest_now_onboarding_panel` — no outer chrome. */
  embedded?: boolean
  /** Beside deal title on dashboard prestige cards. */
  cardHead?: boolean
  /** Clickable phase navigation. */
  phaseNav?: {
    onPhaseClick: (phaseId: InvestNowStepperPhase["id"]) => void
    /** Dashboard cards: one primary button for the current step only. */
    currentStepOnly?: boolean
  }
}

export function InvestNowDraftProgressBar({
  progress,
  compact = false,
  embedded = false,
  cardHead = false,
  phaseNav,
}: InvestNowDraftProgressBarProps) {
  const { percent, phaseLabel, phaseId } = progress
  const currentPhaseIdx = investNowStepperPhaseIndex(phaseId)

  const currentStepAction = phaseNav?.currentStepOnly ? (
    <div className="invest_now_draft_progress_action">
      <button
        type="button"
        className="invest_now_onboarding_panel_action invest_now_onboarding_panel_action--primary invest_now_draft_progress_action_btn"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          phaseNav.onPhaseClick(phaseId)
        }}
      >
        {investNowDraftPhaseActionLabel(phaseId)}
      </button>
    </div>
  ) : null

  const phaseChips =
    phaseNav && !phaseNav.currentStepOnly ? (
      <div
        className="invest_now_draft_progress_phases"
        role="group"
        aria-label="Onboarding steps"
      >
        {INVEST_NOW_STEPPER_PHASES.map((phase) => {
          const phaseIdx = investNowStepperPhaseIndex(phase.id)
          const isReachable = phaseIdx <= currentPhaseIdx
          const isCurrent = phase.id === phaseId
          return (
            <button
              key={phase.id}
              type="button"
              className={[
                "invest_now_draft_progress_phase_btn",
                isCurrent ? " invest_now_draft_progress_phase_btn--current" : "",
                !isReachable
                  ? " invest_now_draft_progress_phase_btn--disabled"
                  : "",
              ]
                .join("")
                .trim()}
              disabled={!isReachable}
              aria-current={isCurrent ? "step" : undefined}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (isReachable) phaseNav.onPhaseClick(phase.id)
              }}
            >
              {phase.label}
            </button>
          )
        })}
      </div>
    ) : null

  return (
    <div
      className={[
        "invest_now_draft_progress",
        compact ? " invest_now_draft_progress--compact" : "",
        embedded ? " invest_now_draft_progress--embedded" : "",
        cardHead ? " invest_now_draft_progress--card-head" : "",
        phaseNav ? " invest_now_draft_progress--phase-nav" : "",
        phaseNav?.currentStepOnly
          ? " invest_now_draft_progress--current-step-action"
          : "",
      ]
        .join("")
        .trim()}
    >
      <div className="invest_now_draft_progress_header">
        <span className="invest_now_draft_progress_label">
          {compact || cardHead ? "Onboarding" : "Onboarding progress"}
        </span>
        <span className="invest_now_draft_progress_pct">{percent}%</span>
      </div>
      <div
        className="invest_now_draft_progress_track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Onboarding progress: ${percent}% — ${phaseLabel}`}
      >
        <div
          className="invest_now_draft_progress_fill"
          style={{ width: `${percent}%` }}
        />
      </div>
      {currentStepAction}
      {phaseChips}
      {!phaseNav && !compact && !cardHead ? (
        <div className="invest_now_draft_progress_meta">
          <span className="invest_now_draft_progress_phase">{phaseLabel}</span>
        </div>
      ) : !phaseNav && cardHead ? (
        <div className="invest_now_draft_progress_meta">
          <span className="invest_now_draft_progress_phase invest_now_draft_progress_phase--card-head">
            {phaseLabel}
          </span>
        </div>
      ) : null}
    </div>
  )
}
