import {
  Activity,
  Briefcase,
  Calendar,
  DollarSign,
  FileText,
  Home,
  Landmark,
  MapPin,
  Send,
  Shield,
  Tag,
  Users,
  Wallet,
} from "lucide-react"
import { CardCompactAmount } from "../../../../common/components/card-compact-amount/CardCompactAmount"
import { ViewReadonlyField } from "../../../../common/components/ViewReadonlyField"
import { dealStageLabel } from "../../dealsDashboardUtils"
import type { DealDetailApi } from "../api/dealsApi"
import { formatDealListDateDisplay } from "../dealsListDisplay"

function displayOrDash(v: string | null | undefined): string {
  const t = String(v ?? "").trim()
  return t.length ? t : "—"
}

function yesNo(v: boolean | undefined): string {
  if (v === true) return "Yes"
  if (v === false) return "No"
  return "—"
}

/** Same read-only fields as Deal details preview (modal / investing deal page). */
export function DealDetailsReadonlyPreviewFields({
  detail,
}: {
  detail: DealDetailApi
}) {
  const lr = detail.listRow
  if (!lr) {
    return <p className="deals_deal_view_hint">No data.</p>
  }

  return (
    <div className="um_view_grid deal_detail_readonly_preview_grid">
      <ViewReadonlyField
        Icon={Briefcase}
        label="Deal name"
        value={displayOrDash(lr.dealName ?? detail.dealName)}
      />
      <ViewReadonlyField
        Icon={Tag}
        label="Deal type"
        value={displayOrDash(detail.dealType)}
      />
      <ViewReadonlyField
        Icon={Activity}
        label="Deal stage"
        value={displayOrDash(
          dealStageLabel(detail.dealStage || lr.dealStage),
        )}
      />
      <ViewReadonlyField
        Icon={Shield}
        label="SEC type"
        value={displayOrDash(detail.secType)}
      />
      <ViewReadonlyField
        Icon={Home}
        label="Property name"
        value={displayOrDash(detail.propertyName)}
      />
      <ViewReadonlyField
        Icon={MapPin}
        label="Location"
        value={
          [detail.city, detail.country].filter((x) => x?.trim()).join(", ") ||
          displayOrDash(lr.locationDisplay)
        }
      />
      <ViewReadonlyField
        Icon={Landmark}
        label="Owning entity"
        value={displayOrDash(detail.owningEntityName)}
      />
      <ViewReadonlyField
        Icon={Calendar}
        label="Close date"
        value={formatDealListDateDisplay(
          lr.closeDateDisplay ?? detail.closeDate ?? "",
        )}
      />
      <ViewReadonlyField
        Icon={Calendar}
        label="Start date"
        value={formatDealListDateDisplay(
          lr.startDateDisplay ?? lr.createdDateDisplay,
        )}
      />
      <ViewReadonlyField
        Icon={Wallet}
        label="Raise target"
        value={<CardCompactAmount amount={lr.raiseTarget} />}
      />
      <ViewReadonlyField
        Icon={DollarSign}
        label="Committed"
        value={<CardCompactAmount amount={lr.totalAccepted} />}
      />
      <ViewReadonlyField
        Icon={Users}
        label="Investors"
        value={displayOrDash(lr.investors)}
      />
      <ViewReadonlyField
        Icon={FileText}
        label="Investor class"
        value={
          lr.investorClass && lr.investorClass !== "—"
            ? lr.investorClass
            : "—"
        }
      />
      <ViewReadonlyField
        Icon={Briefcase}
        label="Funds required before GP sign"
        value={yesNo(detail.fundsRequiredBeforeGpSign)}
      />
      <ViewReadonlyField
        Icon={Send}
        label="Auto send funding instructions"
        value={yesNo(detail.autoSendFundingInstructions)}
      />
      <ViewReadonlyField
        Icon={Calendar}
        label="Created"
        fieldClassName="deals_deal_view_field_full"
        value={
          detail.createdAt
            ? formatDealListDateDisplay(
                lr.createdDateDisplay || detail.createdAt,
              )
            : formatDealListDateDisplay(lr.createdDateDisplay)
        }
      />
    </div>
  )
}
