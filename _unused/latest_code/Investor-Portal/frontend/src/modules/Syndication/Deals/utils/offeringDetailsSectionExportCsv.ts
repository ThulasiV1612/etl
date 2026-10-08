import type { DealAssetRow } from "../types/deal-asset.types"
import type { DealInvestorClass } from "../types/deal-investor-class.types"
import { escapeCsvCell, downloadDealExportCsv } from "./dealInvestorExportCsv"
import { buildTableExportFilename } from "../../../../common/utils/tableExportFilename"

export function buildDealAssetsExportCsv(rows: DealAssetRow[]): string {
  const headers = ["Name", "Address", "Asset type", "Images", "Status"]
  const lines = [headers.map(escapeCsvCell).join(",")]
  for (const row of rows) {
    lines.push(
      [
        row.name,
        row.address,
        row.assetType,
        String(row.imageCount),
        row.archived ? "Archived" : "Active",
      ]
        .map((c) => escapeCsvCell(String(c ?? "")))
        .join(","),
    )
  }
  return `\uFEFF${lines.join("\r\n")}`
}

export function buildInvestorClassesExportCsv(
  rows: DealInvestorClass[],
  dealStatusLabel: string,
  dealVisibilityLabel: string,
): string {
  const headers = [
    "Class name",
    "Subscription type",
    "Entity name",
    "Start date",
    "Offering size",
    "Distribution raise",
    "Minimum investment",
    "Deal status",
    "Visibility",
  ]
  const lines = [headers.map(escapeCsvCell).join(",")]
  for (const row of rows) {
    lines.push(
      [
        row.name,
        row.subscriptionType,
        row.entityName,
        row.startDate,
        row.offeringSize,
        row.raiseAmountDistributions,
        row.minimumInvestment,
        dealStatusLabel,
        dealVisibilityLabel,
      ]
        .map((c) => escapeCsvCell(String(c ?? "")))
        .join(","),
    )
  }
  return `\uFEFF${lines.join("\r\n")}`
}

export function downloadDealAssetsExportCsv(
  dealName: string,
  rows: DealAssetRow[],
): string {
  const filename = buildTableExportFilename({
    dealName,
    tableSlug: "assets",
  })
  downloadDealExportCsv(buildDealAssetsExportCsv(rows), filename)
  return filename
}

export function downloadInvestorClassesExportCsv(
  dealName: string,
  rows: DealInvestorClass[],
  dealStatusLabel: string,
  dealVisibilityLabel: string,
): string {
  const filename = buildTableExportFilename({
    dealName,
    tableSlug: "investor-classes",
  })
  downloadDealExportCsv(
    buildInvestorClassesExportCsv(rows, dealStatusLabel, dealVisibilityLabel),
    filename,
  )
  return filename
}
