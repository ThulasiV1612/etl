import {
  type DealDetailApi,
  dealDetailFieldForCreateWizard,
  isDealDetailFormIncomplete,
} from "./api/dealsApi"
import {
  DEAL_STAGE_CHOICES,
  DEFAULT_ASSET_COUNTRY,
  type AssetStepDraft,
  type DealStepDraft,
} from "./types/deals.types"

/** Maps GET /deals/:id response into the same draft shape as the create-deal wizard. */
export function mapDealDetailApiToCreateDrafts(detail: DealDetailApi): {
  deal: DealStepDraft
  asset: AssetStepDraft
} {
  const incomplete = isDealDetailFormIncomplete(detail)
  const stageRawSource = String(detail.dealStage ?? "").trim()
  const stageRaw =
    stageRawSource === "raising_capital"
      ? "capital_raising"
      : stageRawSource === "asset_managing"
        ? "managing_asset"
        : stageRawSource.toLowerCase() === "draft"
          ? "Draft"
          : stageRawSource
  const stageOk = DEAL_STAGE_CHOICES.some((c) => c.value === stageRaw)
  const dealStage = stageOk
    ? (stageRaw as Exclude<DealStepDraft["dealStage"], "">)
    : ""

  let closeDate = ""
  if (detail.closeDate != null && String(detail.closeDate).trim() !== "") {
    const s = String(detail.closeDate)
    closeDate = s.length >= 10 ? s.slice(0, 10) : s
  }

  return {
    deal: {
      dealName: dealDetailFieldForCreateWizard(
        "dealName",
        detail.dealName,
        incomplete,
      ),
      dealType: detail.dealType ?? "",
      dealStage,
      secType: dealDetailFieldForCreateWizard(
        "secType",
        detail.secType,
        incomplete,
      ),
      closeDate,
      owningEntityName: dealDetailFieldForCreateWizard(
        "owningEntityName",
        detail.owningEntityName,
        incomplete,
      ),
      fundsBeforeGpCountersigns: detail.fundsRequiredBeforeGpSign
        ? "yes"
        : "no",
      autoFundingAfterGpCountersigns: detail.autoSendFundingInstructions
        ? "yes"
        : "no",
    },
    asset: {
      propertyName: dealDetailFieldForCreateWizard(
        "propertyName",
        detail.propertyName,
        incomplete,
      ),
      country: detail.country?.trim() || DEFAULT_ASSET_COUNTRY,
      streetAddress1: dealDetailFieldForCreateWizard(
        "streetAddress1",
        detail.addressLine1,
        incomplete,
      ),
      streetAddress2: dealDetailFieldForCreateWizard(
        "streetAddress2",
        detail.addressLine2,
        incomplete,
      ),
      city: dealDetailFieldForCreateWizard("city", detail.city, incomplete),
      state: dealDetailFieldForCreateWizard("state", detail.state, incomplete),
      zipCode: dealDetailFieldForCreateWizard("zipCode", detail.zipCode, incomplete),
    },
  }
}
