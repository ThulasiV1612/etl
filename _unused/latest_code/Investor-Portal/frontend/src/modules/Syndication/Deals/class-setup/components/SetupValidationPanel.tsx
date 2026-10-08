import { CheckCircle2, AlertCircle } from "lucide-react"
import type { ClassSetupValidation } from "../types/class-setup.types"

interface SetupValidationPanelProps {
  validation: ClassSetupValidation
}

/** Compact validation status — warnings do not block Save. */
export function SetupValidationPanel({ validation }: SetupValidationPanelProps) {
  const failing = validation.checks.filter((c) => !c.ok)
  const allOk = failing.length === 0

  if (allOk) {
    return (
      <div className="cs_status_banner is-ok" role="status">
        <CheckCircle2 size={16} aria-hidden />
        <span>Setup looks good — ready to save when you are done editing.</span>
      </div>
    )
  }

  return (
    <div className="cs_status_banner is-warn" role="status">
      <AlertCircle size={16} aria-hidden />
      <div className="cs_status_banner_body">
        <strong>
          {failing.length} check{failing.length === 1 ? "" : "s"} need attention
          {validation.canSave ? " — you can still save" : ""}
        </strong>
        <ul className="cs_status_list">
          {failing.map((check) => (
            <li key={check.id}>{check.message}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
