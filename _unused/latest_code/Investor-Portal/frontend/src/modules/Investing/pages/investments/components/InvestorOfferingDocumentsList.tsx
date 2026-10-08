import { DocumentsTableScroll } from "@/modules/Syndication/Deals/tabs/documents/DocumentsTableScroll"
import { ChevronDown, Download, Eye } from "lucide-react"
import { useContext, useState } from "react"
import type {
  InvestmentDetailDocumentRow,
  InvestmentDetailDocumentSectionGroup,
} from "../utils/investmentDetailDocuments"
import { isInvestorOfferingDocumentSectionExcluded } from "@/modules/Syndication/Deals/utils/offeringPreviewDocSections"
import { NotificationsContext } from "@/modules/notifications/context/NotificationsProvider"
import {
  isNewlySharedOfferingDoc,
  markOfferingDocSeen,
  sharedOfferingDocumentNotificationId,
} from "@/modules/notifications/utils/sharedOfferingDocumentNotification"

function safeDownloadFilename(name: string): string {
  const base = name.trim() || "document"
  return base.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 200)
}

function InvestorDocumentRow({
  dealId,
  doc,
}: {
  dealId: string
  doc: InvestmentDetailDocumentRow
}) {
  const notifications = useContext(NotificationsContext)
  const url = doc.url?.trim() || ""
  const displayName = doc.name.trim() || "Document"
  const noteId = sharedOfferingDocumentNotificationId(dealId, doc.id)
  const [isNew, setIsNew] = useState(() =>
    isNewlySharedOfferingDoc(dealId, doc.id),
  )

  function markOpened() {
    markOfferingDocSeen(dealId, doc.id)
    notifications?.markRead(noteId)
    setIsNew(false)
  }

  return (
    <tr className="deal_docs_ui_tr">
      <td className="deal_docs_ui_td deal_docs_ui_td_doc">
        <div className="deal_docs_ui_doc_cell">
          <div className="deal_docs_ui_doc_name_wrap">
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="deal_docs_ui_doc_name_link"
                title={displayName}
                aria-label={`View ${displayName}`}
                onClick={markOpened}
              >
                <span className="deal_docs_ui_doc_name_text">{displayName}</span>
                {isNew ? (
                  <span className="investment_detail_offering_doc_new">New</span>
                ) : null}
              </a>
            ) : (
              <span className="deal_docs_ui_doc_name_text" title={displayName}>
                {displayName}
                {isNew ? (
                  <span className="investment_detail_offering_doc_new">New</span>
                ) : null}
              </span>
            )}
          </div>
          {url ? (
            <div className="deal_docs_ui_doc_quick">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="deal_docs_ui_doc_icon_btn deal_docs_ui_doc_icon_link"
                title="View"
                aria-label={`View ${displayName}`}
                onClick={markOpened}
              >
                <Eye size={16} strokeWidth={2} aria-hidden />
              </a>
              <a
                href={url}
                download={safeDownloadFilename(displayName)}
                rel="noopener noreferrer"
                className="deal_docs_ui_doc_icon_btn deal_docs_ui_doc_icon_link"
                title="Download"
                aria-label={`Download ${displayName}`}
                onClick={markOpened}
              >
                <Download size={16} strokeWidth={2} aria-hidden />
              </a>
            </div>
          ) : (
            <span className="investment_detail_offering_doc_unavailable">
              Unavailable
            </span>
          )}
        </div>
      </td>
      <td className="deal_docs_ui_td deal_docs_ui_td_date">{doc.dateAdded}</td>
    </tr>
  )
}

type InvestorOfferingDocumentsListProps = {
  dealId: string
  sections: InvestmentDetailDocumentSectionGroup[]
}

export function InvestorOfferingDocumentsList({
  dealId,
  sections,
}: InvestorOfferingDocumentsListProps) {
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({})

  const displaySections = sections.filter(
    (section) =>
      section.documents.length > 0 &&
      !isInvestorOfferingDocumentSectionExcluded(
        section.sectionId,
        section.sectionLabel,
      ),
  )
  if (displaySections.length === 0) return null

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !(prev[sectionId] ?? true),
    }))
  }

  return (
    <div className="deal_docs_ui_root">
      {displaySections.map((section) => {
        const isOpen = expandedSections[section.sectionId] ?? true
        const visibleCount = section.documents.length
        const panelId = `inv-offering-${section.sectionId}-panel`

        return (
          <div key={section.sectionId} className="deal_docs_ui_bundle">
            <div
              className="deal_docs_ui_banner"
              role="region"
              aria-label={section.sectionLabel}
            >
              <div className="deal_docs_ui_banner_left">
                <button
                  type="button"
                  className="deal_docs_ui_banner_chevron_btn"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggleSection(section.sectionId)}
                  aria-label={isOpen ? "Collapse section" : "Expand section"}
                >
                  <ChevronDown
                    size={14}
                    strokeWidth={2.75}
                    aria-hidden
                    className={`deal_docs_ui_banner_chevron${isOpen ? " deal_docs_ui_banner_chevron_open" : ""}`}
                  />
                </button>
                <div className="deal_docs_ui_banner_heading">
                  <span className="deal_docs_ui_banner_title">
                    {section.sectionLabel}
                  </span>
                </div>
              </div>
              <div className="deal_docs_ui_banner_right">
                <span className="deal_docs_ui_banner_count" aria-live="polite">
                  {visibleCount} document{visibleCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            <div id={panelId} className="deal_docs_ui_panel" hidden={!isOpen}>
              <DocumentsTableScroll active={isOpen}>
                <table className="deal_docs_ui_table investment_detail_offering_docs_table">
                  <thead>
                    <tr>
                      <th
                        className="deal_docs_ui_th deal_docs_ui_th_doc"
                        scope="col"
                      >
                        Document
                      </th>
                      <th
                        className="deal_docs_ui_th deal_docs_ui_th_date"
                        scope="col"
                      >
                        Date added
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCount === 0 ? (
                      <tr className="deal_docs_ui_tr">
                        <td
                          className="deal_docs_ui_td investment_detail_offering_docs_empty"
                          colSpan={2}
                        >
                          No documents in this section are visible to you.
                        </td>
                      </tr>
                    ) : (
                      section.documents.map((doc) => (
                        <InvestorDocumentRow
                          key={`${section.sectionId}-${doc.id}`}
                          dealId={dealId}
                          doc={doc}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </DocumentsTableScroll>
            </div>
          </div>
        )
      })}
    </div>
  )
}
