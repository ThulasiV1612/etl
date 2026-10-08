import {
  investNowStepperPhaseIndex,
  investNowStepperPhases,
  type InvestNowStepperPhase,
} from "./investNowFlowSteps"

export interface InvestNowFlowStepperProps {
  activePhaseId: InvestNowStepperPhase["id"]
  /** When false, the Questionnaire step is omitted from the progress bar. */
  includeQuestionnaire?: boolean
}

export function InvestNowFlowStepper({
  activePhaseId,
  includeQuestionnaire = true,
}: InvestNowFlowStepperProps) {
  const phases = investNowStepperPhases({ includeQuestionnaire })
  const activeIndex = investNowStepperPhaseIndex(activePhaseId, phases)

  return (
    <div
      className="add_contact_stepper deals_add_deal_asset_stepper deals_create_stepper invest_now_flow_stepper"
      role="group"
      aria-label="Invest now progress"
    >
      {phases.map((phase, index) => {
        const isActive = phase.id === activePhaseId
        const isDone = index < activeIndex
        const nodeClass = isActive
          ? "add_contact_step_node add_contact_step_node_active"
          : isDone
            ? "add_contact_step_node add_contact_step_node_done"
            : "add_contact_step_node"

        return (
          <div key={phase.id} className="invest_now_flow_stepper_phase">
            {index > 0 ? (
              <span
                className={
                  index <= activeIndex
                    ? "add_contact_step_line add_contact_step_line_active"
                    : "add_contact_step_line"
                }
                aria-hidden
              />
            ) : null}
            <div className={nodeClass}>
              <span
                className="add_contact_step_dot"
                aria-current={isActive ? "step" : undefined}
              >
                {index + 1}
              </span>
              <span className="add_contact_step_label">{phase.label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
