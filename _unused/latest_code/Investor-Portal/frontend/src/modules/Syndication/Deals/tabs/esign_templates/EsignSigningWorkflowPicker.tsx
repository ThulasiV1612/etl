import {
  ArrowRight,
  Building2,
  GitBranch,
  ListOrdered,
  UserRound,
} from "lucide-react"

import {
  resolveEsignSignflowSigningOrder,
  resolveEsignSignflowWorkflowType,
  signingWorkflowSummary,
  type EsignSignflowSigningOrder,
  type EsignSignflowWorkflowType,
} from "../../utils/esignSigningWorkflow"

export type EsignSigningWorkflowValue = {
  signflowWorkflowType: EsignSignflowWorkflowType
  signflowSigningOrder: EsignSignflowSigningOrder
}

type EsignSigningWorkflowPickerProps = {
  value: EsignSigningWorkflowValue
  onChange: (next: EsignSigningWorkflowValue) => void
  disabled?: boolean
  readOnly?: boolean
  /** Compact layout for create-template modal */
  variant?: "panel" | "modal"
}

function FlowStep({
  icon: Icon,
  label,
  tone,
}: {
  icon: typeof UserRound
  label: string
  tone: "investor" | "sponsor"
}) {
  return (
    <span
      className={`deal_esign_workflow_flow_step deal_esign_workflow_flow_step--${tone}`}
    >
      <span className="deal_esign_workflow_flow_step_icon" aria-hidden>
        <Icon size={16} strokeWidth={2} />
      </span>
      <span className="deal_esign_workflow_flow_step_label">{label}</span>
    </span>
  )
}

function SequentialFlowPreview({
  signingOrder,
  compact = false,
}: {
  signingOrder: EsignSignflowSigningOrder
  compact?: boolean
}) {
  const sponsorFirst = signingOrder === "sponsor_first"
  return (
    <div
      className={`deal_esign_workflow_flow_preview${compact ? " deal_esign_workflow_flow_preview--compact" : ""}`}
      aria-hidden
    >
      {sponsorFirst ? (
        <>
          <FlowStep icon={Building2} label="Sponsor" tone="sponsor" />
          <ArrowRight className="deal_esign_workflow_flow_arrow" size={16} />
          <FlowStep icon={UserRound} label="Investor" tone="investor" />
        </>
      ) : (
        <>
          <FlowStep icon={UserRound} label="Investor" tone="investor" />
          <ArrowRight className="deal_esign_workflow_flow_arrow" size={16} />
          <FlowStep icon={Building2} label="Sponsor" tone="sponsor" />
        </>
      )}
    </div>
  )
}

export { SequentialFlowPreview as EsignSequentialFlowPreview }

export function EsignSigningWorkflowPicker({
  value,
  onChange,
  disabled = false,
  readOnly = false,
  variant = "panel",
}: EsignSigningWorkflowPickerProps) {
  const workflowType = resolveEsignSignflowWorkflowType(value)
  const signingOrder = resolveEsignSignflowSigningOrder(value)
  const inactive = disabled || readOnly

  const setWorkflowType = (next: EsignSignflowWorkflowType) => {
    if (inactive) return
    onChange({
      signflowWorkflowType: next,
      signflowSigningOrder: signingOrder,
    })
  }

  const setSigningOrder = (next: EsignSignflowSigningOrder) => {
    if (inactive) return
    onChange({
      signflowWorkflowType: workflowType,
      signflowSigningOrder: next,
    })
  }

  if (readOnly) {
    return (
      <div
        className={`deal_esign_workflow_picker deal_esign_workflow_picker--readonly deal_esign_workflow_picker--${variant}`}
      >
        <div className="deal_esign_workflow_picker_head">
          <span className="deal_esign_workflow_picker_badge" aria-hidden>
            <GitBranch size={16} strokeWidth={2} />
          </span>
          <div>
            <p className="deal_esign_workflow_picker_eyebrow">Signing order</p>
            <p className="deal_esign_workflow_picker_summary">
              {signingWorkflowSummary(value)}
            </p>
          </div>
        </div>
        {workflowType === "sequential" ? (
          <SequentialFlowPreview signingOrder={signingOrder} />
        ) : (
          <div className="deal_esign_workflow_parallel_chip" role="status">
            Investors sign in any order; sponsor countersigns after each
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={`deal_esign_workflow_picker deal_esign_workflow_picker--${variant}`}
      role="group"
      aria-label="Signing order"
    >
      <div className="deal_esign_workflow_picker_head">
        <span className="deal_esign_workflow_picker_badge" aria-hidden>
          <GitBranch size={16} strokeWidth={2} />
        </span>
        <div>
          <p className="deal_esign_workflow_picker_eyebrow">Signing order</p>
          <p className="deal_esign_workflow_picker_lead">
            Set this before investors can sign. Sponsor fields must be assigned
            to the Sponsor recipient in the template editor.
          </p>
        </div>
      </div>

      <div className="deal_esign_workflow_mode_grid">
        <button
          type="button"
          className={`deal_esign_workflow_mode_card${
            workflowType === "parallel" ? " deal_esign_workflow_mode_card--active" : ""
          }`}
          disabled={inactive}
          aria-pressed={workflowType === "parallel"}
          onClick={() => setWorkflowType("parallel")}
        >
          <span className="deal_esign_workflow_mode_icon" aria-hidden>
            <GitBranch size={18} strokeWidth={2} />
          </span>
          <span className="deal_esign_workflow_mode_copy">
            <span className="deal_esign_workflow_mode_title">Parallel</span>
            <span className="deal_esign_workflow_mode_desc">
              Any investor may sign; sponsor countersigns after each investor.
            </span>
          </span>
          <span className="deal_esign_workflow_parallel_chip deal_esign_workflow_parallel_chip--inline">
            Investor first
          </span>
        </button>

        <button
          type="button"
          className={`deal_esign_workflow_mode_card${
            workflowType === "sequential" ? " deal_esign_workflow_mode_card--active" : ""
          }`}
          disabled={inactive}
          aria-pressed={workflowType === "sequential"}
          onClick={() => setWorkflowType("sequential")}
        >
          <span className="deal_esign_workflow_mode_icon" aria-hidden>
            <ListOrdered size={18} strokeWidth={2} />
          </span>
          <span className="deal_esign_workflow_mode_copy">
            <span className="deal_esign_workflow_mode_title">Sequential</span>
            <span className="deal_esign_workflow_mode_desc">
              Enforces sponsor vs investor order; investors may sign in any order in their phase.
            </span>
          </span>
        </button>
      </div>

      {workflowType === "sequential" ? (
        <div className="deal_esign_workflow_sequence_block">
          <p className="deal_esign_workflow_sequence_label">Who signs first?</p>
          <div className="deal_esign_workflow_sequence_grid">
            <button
              type="button"
              className={`deal_esign_workflow_sequence_card${
                signingOrder === "investor_first"
                  ? " deal_esign_workflow_sequence_card--active"
                  : ""
              }`}
              disabled={inactive}
              aria-pressed={signingOrder === "investor_first"}
              onClick={() => setSigningOrder("investor_first")}
            >
              <SequentialFlowPreview signingOrder="investor_first" />
              <span className="deal_esign_workflow_sequence_title">
                Investor first
              </span>
              <span className="deal_esign_workflow_sequence_desc">
                After all investors sign, the sponsor signs.
              </span>
            </button>

            <button
              type="button"
              className={`deal_esign_workflow_sequence_card${
                signingOrder === "sponsor_first"
                  ? " deal_esign_workflow_sequence_card--active"
                  : ""
              }`}
              disabled={inactive}
              aria-pressed={signingOrder === "sponsor_first"}
              onClick={() => setSigningOrder("sponsor_first")}
            >
              <SequentialFlowPreview signingOrder="sponsor_first" />
              <span className="deal_esign_workflow_sequence_title">
                Sponsor first
              </span>
              <span className="deal_esign_workflow_sequence_desc">
                Sponsor signs first; then all investors may sign in any order.
              </span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
