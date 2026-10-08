import type { ReactNode } from 'react'

interface FlowStep {
  title: string
}

interface UploadFlowStepsProps {
  steps: ReadonlyArray<FlowStep>
  compact?: boolean
}

export function UploadFlowSteps({ steps, compact = false }: UploadFlowStepsProps) {
  return (
    <ol className={compact ? 'entity-action-flow' : 'upload-flow-steps'} aria-label="Upload steps">
      {steps.map((step, index) => (
        <li key={`${index}-${step.title}`}>
          <span className={compact ? 'entity-action-flow-num' : 'page-info-step-num'} aria-hidden="true">
            {index + 1}
          </span>
          <span className={compact ? 'entity-action-flow-title' : 'upload-flow-step-title'}>
            {compact ? step.title : `Step ${index + 1} — ${step.title}`}
          </span>
          {index < steps.length - 1 ? (
            <span className={compact ? 'entity-action-flow-arrow' : 'upload-flow-step-arrow'} aria-hidden="true">
              →
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

interface StepHeadingProps {
  step: number
  children: ReactNode
}

export function StepHeading({ step, children }: StepHeadingProps) {
  return (
    <h2 className="upload-step-heading">
      <span className="page-info-step-num" aria-hidden="true">
        {step}
      </span>
      <span>
        Step {step} — {children}
      </span>
    </h2>
  )
}
