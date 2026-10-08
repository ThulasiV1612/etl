export type EsignSignflowWorkflowType = "parallel" | "sequential"
export type EsignSignflowSigningOrder = "investor_first" | "sponsor_first"

export const DEFAULT_ESIGN_SIGNFLOW_WORKFLOW_TYPE: EsignSignflowWorkflowType =
  "sequential"
export const DEFAULT_ESIGN_SIGNFLOW_SIGNING_ORDER: EsignSignflowSigningOrder =
  "investor_first"

export function resolveEsignSignflowWorkflowType(file: {
  signflowWorkflowType?: string | null
}): EsignSignflowWorkflowType {
  const v = String(file.signflowWorkflowType ?? "")
    .trim()
    .toLowerCase()
  if (v === "parallel" || v === "sequential") return v
  return DEFAULT_ESIGN_SIGNFLOW_WORKFLOW_TYPE
}

export function resolveEsignSignflowSigningOrder(file: {
  signflowSigningOrder?: string | null
}): EsignSignflowSigningOrder {
  const v = String(file.signflowSigningOrder ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
  if (v === "investor_first" || v === "investor") return "investor_first"
  if (v === "sponsor_first" || v === "sponsor") return "sponsor_first"
  return DEFAULT_ESIGN_SIGNFLOW_SIGNING_ORDER
}

export function signingWorkflowSummary(file: {
  signflowWorkflowType?: string | null
  signflowSigningOrder?: string | null
}): string {
  const workflowType = resolveEsignSignflowWorkflowType(file)
  if (workflowType === "parallel") {
    return "Parallel — any investor may sign; sponsor countersigns after each investor"
  }
  const order = resolveEsignSignflowSigningOrder(file)
  return order === "sponsor_first"
    ? "Sequential — sponsor signs first, then all investors (any order)"
    : "Sequential — investors sign first (any order), then sponsor"
}
