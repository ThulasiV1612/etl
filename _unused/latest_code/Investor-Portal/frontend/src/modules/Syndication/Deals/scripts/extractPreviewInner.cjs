const fs = require("fs")
const path = require("path")
const src = path.join(__dirname, "..", "DealOfferingPortfolioPage.tsx")
const out = path.join(__dirname, "..", "DealOfferingPreviewInner.tsx")
const lines = fs.readFileSync(src, "utf8").split(/\r?\n/)
const start = 746
const end = 1337
const chunk = lines.slice(start, end + 1).join("\n")
const header = `import DOMPurify from "dompurify"
import {
  ChevronLeft,
  ChevronRight,
  Compass,
  FileText,
  Map,
  MapPin,
  Megaphone,
  TrendingUp,
  X,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { Link } from "react-router-dom"
import type { DealDetailApi } from "./api/dealsApi"
import type { DealInvestorsPayload } from "./types/deal-investors.types"
import type { DealInvestorClass } from "./types/deal-investor-class.types"
import { readOfferingPreviewDocuments } from "./utils/offeringPreviewDocuments"
import { readOfferingPreviewInvestorVisibility } from "./utils/offeringPreviewInvestorVisibility"
import { buildOfferingPreviewAssetBlocks } from "./utils/offeringPreviewAssets"
import { orderedGalleryUrlsForOffering } from "./utils/offeringGalleryUrls"
import { dealStageChipCompactClassName } from "./utils/dealStageChip"
import { dealStageLabel } from "../dealsDashboardUtils"
import {
  buildSummaryBits,
  keyHighlightRowsFromJson,
  previewTargetDisplay,
} from "./dealOfferingPreviewShared"
import "./tabs/deal_members/add-investment/add_deal_modal.css"
import "./deal-offering-portfolio.css"
import "./deals-list.css"

function PanelHeader({
  titleId,
  children,
}: {
  titleId: string
  children: ReactNode
}) {
  return (
    <div className="deal_offer_pf_panel_head">
      <h2 id={titleId} className="deal_offer_pf_panel_title_text">
        {children}
      </h2>
    </div>
  )
}

export type DealOfferingPreviewInnerProps = {
  detail: DealDetailApi
  classes: DealInvestorClass[]
  investorsPayload: DealInvestorsPayload
  applyInvestorLinkVisibility: boolean
  isPublicOfferingRoute: boolean
}

export function DealOfferingPreviewInner({
  detail,
  classes,
  investorsPayload,
  applyInvestorLinkVisibility,
  isPublicOfferingRoute,
}: DealOfferingPreviewInnerProps) {
`
const footer = "\n}\n"
fs.writeFileSync(out, header + chunk + footer)
console.log("Wrote", out)
