import { ChevronDown, Eye } from "lucide-react"
import { useId, useState } from "react"
import { useNavigate } from "react-router-dom"
import { assetImagePathToUrl } from "../../../../common/utils/apiBaseUrl"
import type { DealDetailApi } from "../api/dealsApi"
import "../deal-offering-details.css"
import { AssetsSection } from "./AssetsSection"
import { DocumentsSection } from "./DocumentsSection"
import { KeyHighlightsSection } from "./KeyHighlightsSection"
import { OfferingInformationSection } from "./OfferingInformationSection"

interface DealOfferingDetailsTabProps {
  detail: DealDetailApi
}

type SectionId =
  | "classes"
  | "gallery"
  | "summary"
  | "documents"
  | "assets"
  | "key_highlights"
  | "funding_instructions"

const SECTION_ORDER: { id: SectionId; label: string }[] = [
  { id: "classes", label: "Classes" },
  { id: "gallery", label: "Gallery" },
  { id: "summary", label: "Summary" },
  { id: "documents", label: "Documents" },
  { id: "assets", label: "Assets" },
  { id: "key_highlights", label: "Key Highlights" },
  { id: "funding_instructions", label: "Funding Instructions" },
]

function boolLabel(value: boolean): string {
  return value ? "Yes" : "No"
}

function GalleryBody({ detail }: { detail: DealDetailApi }) {
  const url = assetImagePathToUrl(detail.assetImagePath)
  if (!url)
    return (
      <p className="deal_offering_muted">
        No gallery images uploaded for this offering yet.
      </p>
    )
  return (
    <div className="deal_offering_gallery">
      <img src={url} alt="" className="deal_offering_gallery_img" />
    </div>
  )
}

function SummaryBody({ detail }: { detail: DealDetailApi }) {
  const lr = detail.listRow
  const bits = [
    lr.raiseTarget && `Raise target: ${lr.raiseTarget}`,
    lr.totalAccepted && `Total accepted: ${lr.totalAccepted}`,
    lr.investors && `Investors: ${lr.investors}`,
    detail.dealType && `Type: ${detail.dealType}`,
  ].filter(Boolean) as string[]
  return (
    <div className="deal_offering_summary">
      {bits.length > 0 ? (
        <ul className="deal_offering_bullets">
          {bits.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : (
        <p className="deal_offering_muted">No summary text available yet.</p>
      )}
    </div>
  )
}

function FundingBody({ detail }: { detail: DealDetailApi }) {
  return (
    <>
      <dl className="deal_offering_dl">
        <div className="deal_offering_dl_row">
          <dt>Auto-send funding instructions</dt>
          <dd>{boolLabel(detail.autoSendFundingInstructions)}</dd>
        </div>
        <div className="deal_offering_dl_row">
          <dt>Funds required before GP sign</dt>
          <dd>{boolLabel(detail.fundsRequiredBeforeGpSign)}</dd>
        </div>
      </dl>
      <p className="deal_offering_funding_note">
        Wire instructions and subscription steps can be shown here when the
        workflow is fully configured.
      </p>
    </>
  )
}

function initialSectionsOpen(): Record<SectionId, boolean> {
  const o = {} as Record<SectionId, boolean>
  SECTION_ORDER.forEach(({ id }, i) => {
    o[id] = i === 0
  })
  return o
}

export function DealOfferingDetailsTab({ detail }: DealOfferingDetailsTabProps) {
  const navigate = useNavigate()
  const baseId = useId()
  const [openSections, setOpenSections] = useState(initialSectionsOpen)

  function sectionBody(id: SectionId) {
    switch (id) {
      case "classes":
        return <OfferingInformationSection dealId={detail.id} />
      case "gallery":
        return <GalleryBody detail={detail} />
      case "summary":
        return <SummaryBody detail={detail} />
      case "documents":
        return <DocumentsSection />
      case "assets":
        return <AssetsSection key={detail.id} detail={detail} />
      case "key_highlights":
        return <KeyHighlightsSection />
      case "funding_instructions":
        return <FundingBody detail={detail} />
      default:
        return null
    }
  }

  return (
    <div className="deal_offering_root">
      <div className="deal_offering_top">
        <div className="deal_offering_top_row">
          <div className="deal_offering_intro_block">
            <p className="deal_offering_intro">
              Configure sections below, then open the investor-facing preview to
              see how this offering reads end-to-end.
            </p>
          </div>
          <button
            type="button"
            className="deal_offering_preview_btn"
            onClick={() =>
              navigate(
                `/deals/${encodeURIComponent(detail.id)}/offering-portfolio`,
              )
            }
          >
            <Eye size={18} strokeWidth={2} aria-hidden />
            <span>Preview offering</span>
          </button>
        </div>
        {/* <dl
          className="deal_offering_metrics"
          aria-label="Key offering figures"
        >
          <div className="deal_offering_metric">
            <dt>Offering size</dt>
            <dd>{offeringSizeDisplay}</dd>
          </div>
          <div className="deal_offering_metric">
            <dt>Raise target</dt>
            <dd>{raiseTargetDisplay}</dd>
          </div>
          <div className="deal_offering_metric">
            <dt>Investors</dt>
            <dd title="Total number of investors">
              {investorsDisplay}
            </dd>
          </div>
          <div className="deal_offering_metric">
            <dt>Total accepted</dt>
            <dd>{totalAcceptedDisplay}</dd>
          </div>
        </dl> */}
      </div>
      <div className="deal_offering_stack" role="list">
        {SECTION_ORDER.map(({ id, label }) => {
          const expanded = Boolean(openSections[id])
          const panelId = `${baseId}-${id}`
          return (
            <div
              key={id}
              className={`deal_offering_section${expanded ? " deal_offering_section_expanded" : ""}`}
              role="listitem"
            >
              <button
                type="button"
                id={`${panelId}-trigger`}
                className="deal_offering_trigger"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() =>
                  setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))
                }
              >
                <span className="deal_offering_trigger_label">{label}</span>
                <ChevronDown
                  size={20}
                  strokeWidth={2}
                  aria-hidden
                  className={`deal_offering_chevron${expanded ? " deal_offering_chevron_open" : ""}`}
                />
              </button>
              <div
                id={panelId}
                role="region"
                aria-labelledby={`${panelId}-trigger`}
                hidden={!expanded}
                className="deal_offering_panel"
              >
                {expanded ? sectionBody(id) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
