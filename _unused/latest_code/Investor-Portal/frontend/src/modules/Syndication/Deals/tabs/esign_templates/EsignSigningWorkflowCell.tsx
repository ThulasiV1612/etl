import type { DealEsignTemplateFileRecord } from "@/modules/Syndication/Deals/api/dealsApi"
import {
  resolveEsignSignflowSigningOrder,
  resolveEsignSignflowWorkflowType,
  signingWorkflowSummary,
} from "../../utils/esignSigningWorkflow"
import { EsignSequentialFlowPreview } from "./EsignSigningWorkflowPicker"

function templateUsesSignflow(
  file: DealEsignTemplateFileRecord,
  dealProvider: "signflow" | "dropbox" | null,
): boolean {
  const provider = String(file.esignProvider ?? dealProvider ?? "signflow")
    .trim()
    .toLowerCase()
  return provider !== "dropbox"
}

type Props = {
  file: DealEsignTemplateFileRecord | null
  esignProvider: "signflow" | "dropbox" | null
}

/** Compact signing-order display for the eSign templates table. */
export function EsignSigningWorkflowCell({ file, esignProvider }: Props) {
  if (!file || !templateUsesSignflow(file, esignProvider)) {
    return <span className="deal_esign_doc_muted">—</span>
  }

  const workflowType = resolveEsignSignflowWorkflowType(file)
  const summary = signingWorkflowSummary(file)

  if (workflowType === "parallel") {
    return (
      <div className="deal_esign_profiles_workflow_cell">
        <span className="deal_esign_profiles_workflow_mode">Parallel</span>
        <span className="deal_esign_profiles_workflow_desc" title={summary}>
          Investor first, any order
        </span>
      </div>
    )
  }

  const signingOrder = resolveEsignSignflowSigningOrder(file)
  const orderLabel =
    signingOrder === "sponsor_first" ? "Sponsor first" : "Investor first"

  return (
    <div className="deal_esign_profiles_workflow_cell" title={summary}>
      <EsignSequentialFlowPreview signingOrder={signingOrder} compact />
      <span className="deal_esign_profiles_workflow_desc">{orderLabel}</span>
    </div>
  )
}
