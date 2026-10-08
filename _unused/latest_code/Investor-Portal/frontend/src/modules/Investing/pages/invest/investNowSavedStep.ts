import type { MyLpDealInvestNowCommitmentPayload } from "@/modules/Syndication/Deals/api/lpInvestNowCommitmentApi"
import type { InvestorQuestionnaireConfig } from "@/modules/Syndication/Deals/tabs/esign_templates/investorQuestionnaire.types"
import { buildInvestNowFlowSteps } from "./investNowFlowSteps"
import type { VisibleQuestionnaireSection } from "./investNowEsignContext"

function hasW9NameAddress(
  w9: MyLpDealInvestNowCommitmentPayload["w9Form"],
): boolean {
  if (!w9) return false
  const name = String(w9.name ?? "").trim()
  const line = String(w9.address_line ?? w9.addressLine ?? "").trim()
  const street = String(w9.street1 ?? "").trim()
  const city = String(w9.city ?? "").trim()
  const state = String(w9.state ?? "").trim()
  const zip = String(w9.zip ?? "").trim()
  return Boolean(name && (line || (street && city && state && zip)))
}

/**
 * Furthest wizard step index from server-saved progress (opens resume on this step).
 */
export function investNowStepIndexFromSavedProgress(params: {
  saved: MyLpDealInvestNowCommitmentPayload
  showQuestionnaire: boolean
  visibleSections: VisibleQuestionnaireSection[]
  questionnaireConfig: InvestorQuestionnaireConfig | null
  esignWasSent?: boolean
}): number {
  const flowSteps = buildInvestNowFlowSteps({
    showQuestionnaire: params.showQuestionnaire,
    visibleSections: params.visibleSections,
  })
  if (flowSteps.length === 0) return 0

  const amount = Number(String(params.saved.committedAmount ?? "").replace(/[$,\s]/g, ""))
  const hasAmount = Number.isFinite(amount) && amount > 0
  const hasFunding = Boolean(params.saved.fundingMethod?.trim())
  const answers = params.saved.questionnaireAnswers ?? {}
  const sectionIds = new Set(params.visibleSections.map((s) => s.id))
  const hasQuestionnaire =
    params.showQuestionnaire &&
    Object.keys(answers).some((id) => {
      if (!String(answers[id] ?? "").trim()) return false
      const sectionId = id.includes(".") ? id.split(".")[0] : ""
      return !sectionId || sectionIds.has(sectionId) || sectionIds.size === 0
    })

  let targetKind: "esignatures" | "w9" | "questionnaire" | "investment" | "investor" =
    "investor"

  if (params.esignWasSent) {
    targetKind = "esignatures"
  } else if (hasW9NameAddress(params.saved.w9Form)) {
    targetKind = "w9"
  } else if (hasQuestionnaire) {
    let lastQIdx = -1
    for (const section of params.visibleSections) {
      const hasSectionAnswer = Object.entries(answers).some(([id, val]) => {
        if (!String(val ?? "").trim()) return false
        return id === section.id || id.startsWith(`${section.id}.`)
      })
      if (!hasSectionAnswer) continue
      const idx = flowSteps.findIndex(
        (s) => s.kind === "questionnaire" && s.sectionId === section.id,
      )
      if (idx > lastQIdx) lastQIdx = idx
    }
    if (lastQIdx >= 0) return lastQIdx
    targetKind = "questionnaire"
  } else if (hasAmount && hasFunding) {
    targetKind = "investment"
    const investmentIdx = flowSteps.findIndex((s) => s.kind === "investment")
    if (investmentIdx >= 0) {
      const next = investmentIdx + 1
      if (next < flowSteps.length) return next
    }
  } else if (params.saved.userInvestorProfileId?.trim()) {
    return 0
  }

  if (targetKind === "esignatures") {
    const idx = flowSteps.findIndex((s) => s.kind === "esignatures")
    return idx >= 0 ? idx : flowSteps.length - 1
  }
  if (targetKind === "w9") {
    const idx = flowSteps.findIndex((s) => s.kind === "w9")
    return idx >= 0 ? idx : 0
  }
  if (targetKind === "questionnaire") {
    const firstQ = flowSteps.findIndex((s) => s.kind === "questionnaire")
    return firstQ >= 0 ? firstQ : 0
  }
  if (targetKind === "investment") {
    const idx = flowSteps.findIndex((s) => s.kind === "investment")
    return idx >= 0 ? idx : 0
  }
  return 0
}
