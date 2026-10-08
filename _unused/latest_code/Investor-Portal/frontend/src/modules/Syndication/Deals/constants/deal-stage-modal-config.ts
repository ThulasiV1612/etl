import type { DealStage } from "./deal-lifecycle/deal-stage"
import { normalizeDealStageCanonical } from "./deal-lifecycle/deal-stage"
import type { DealStageOption } from "../types/deals.types"

export interface DealStageModalContent {
  /** Destination stage label shown in the modal badge. */
  stageLabel: string
  title: string
  description: string
  confirmText: string
}

export type DealStageModalPayload = DealStageModalContent & {
  stage: DealStage
}

export const DEAL_STAGE_MODAL_CONFIG: Record<DealStage, DealStageModalContent> =
  {
    draft: {
      stageLabel: "Draft",
      title: "Move deal to Draft?",
      description:
        "This deal will be hidden from investors and all offering access will be disabled until the deal is moved back into an active stage.",
      confirmText: "Move to Draft",
    },
    capital_raising: {
      stageLabel: "Capital Raising",
      title: "Open deal for fundraising?",
      description:
        "This deal will enter the fundraising phase. Investor access and investment availability will depend on the selected offering status.",
      confirmText: "Start Fundraising",
    },
    asset_managing: {
      stageLabel: "Asset Managing",
      title: "Move deal to Asset Managing?",
      description:
        "This deal will no longer accept new investments. Active offerings will be closed for new investor participation while existing investor records remain accessible.",
      confirmText: "Close Fundraising",
    },
    liquidated: {
      stageLabel: "Liquidated",
      title: "Mark deal as Liquidated?",
      description:
        "This deal will be marked as completed and archived from active investment workflows.",
      confirmText: "Complete Deal",
    },
  }

export function getDealStageModalContent(
  targetStage: DealStage,
): DealStageModalPayload {
  return {
    stage: targetStage,
    ...DEAL_STAGE_MODAL_CONFIG[targetStage],
  }
}

/** Wizard form value → canonical stage key. */
export function formDealStageToCanonical(
  raw: string | null | undefined,
): DealStage | null {
  return normalizeDealStageCanonical(raw)
}

/** Canonical stage key → wizard `dealStage` field value. */
export function canonicalDealStageToFormValue(
  stage: DealStage,
): DealStageOption {
  switch (stage) {
    case "draft":
      return "Draft"
    case "capital_raising":
      return "capital_raising"
    case "asset_managing":
      return "managing_asset"
    case "liquidated":
      return "liquidated"
  }
}

export function dealStagesAreDifferent(
  previous: string | null | undefined,
  next: string | null | undefined,
): boolean {
  const a = formDealStageToCanonical(previous)
  const b = formDealStageToCanonical(next)
  if (!a || !b) return false
  return a !== b
}
