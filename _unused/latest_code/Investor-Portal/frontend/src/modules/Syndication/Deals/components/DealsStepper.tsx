import { Check } from "lucide-react"
import "./deals-stepper.css"

export interface DealsStepperStep {
  id: string
  label: string
}

interface DealsStepperProps {
  steps: DealsStepperStep[]
  activeIndex: number
}

export function DealsStepper({ steps, activeIndex }: DealsStepperProps) {
  return (
    <ol className="deals_stepper" aria-label="Deal creation progress">
      {steps.map((step, index) => {
        const done = index < activeIndex
        const current = index === activeIndex
        return (
          <li
            key={step.id}
            className={`deals_stepper_step${done ? " deals_stepper_step_done" : ""}${current ? " deals_stepper_step_current" : ""}`}
            aria-current={current ? "step" : undefined}
          >
            <span className="deals_stepper_badge" aria-hidden>
              {done ? <Check size={14} strokeWidth={2.5} /> : index + 1}
            </span>
            <span className="deals_stepper_label">{step.label}</span>
          </li>
        )
      })}
    </ol>
  )
}
