import { Search } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { InvestorOfferingDocumentsList } from "@/modules/Investing/pages/investments/components/InvestorOfferingDocumentsList"
import { buildInvestmentDocumentAudience } from "@/modules/Investing/pages/investments/utils/buildInvestmentDocumentAudience"
import type { InvestmentDocumentAudienceContext } from "@/modules/Investing/pages/investments/utils/investmentDocumentAudience"
import {
  dealHasOfferingDocumentSections,
  EMPTY_INVESTMENT_DOCUMENT_AUDIENCE,
  filterInvestorOfferingDocumentSectionGroups,
  listInvestmentDetailDocumentSectionGroups,
} from "@/modules/Investing/pages/investments/utils/investmentDetailDocuments"
import { refreshInvestmentDealDocumentsPreview } from "@/modules/Investing/pages/investments/utils/refreshInvestmentDealDocumentsPreview"
import { bindInvestmentOfferingDocumentsAutoRefresh } from "@/modules/Investing/pages/investments/utils/bindInvestmentOfferingDocumentsAutoRefresh"
import { OFFERING_PREVIEW_SECTIONS_CHANGED_EVENT } from "@/modules/Syndication/Deals/utils/offeringPreviewDocSections"
import "@/modules/Syndication/usermanagement/user_management.css"
import "@/modules/Syndication/Deals/deals-list.css"
import "../lp-deal-details.css"

type LpDealOfferingDocumentsPanelProps = {
  dealId: string
  /** Inside offering preview wireframe — matches portfolio Documents block. */
  embedded?: boolean
}

/** Sectioned offering documents for the investing deal workspace (deal scope). */
export function LpDealOfferingDocumentsPanel({
  dealId,
  embedded = false,
}: LpDealOfferingDocumentsPanelProps) {
  const [query, setQuery] = useState("")
  const [loadPending, setLoadPending] = useState(true)
  const [audience, setAudience] =
    useState<InvestmentDocumentAudienceContext>(EMPTY_INVESTMENT_DOCUMENT_AUDIENCE)
  const [sectionsRevision, setSectionsRevision] = useState(0)
  const [previewSyncFailed, setPreviewSyncFailed] = useState(false)
  const [dealHasDocumentSections, setDealHasDocumentSections] = useState(false)
  const fetchGenRef = useRef(0)

  useEffect(() => {
    const id = dealId.trim()
    if (!id) {
      setAudience(EMPTY_INVESTMENT_DOCUMENT_AUDIENCE)
      setPreviewSyncFailed(false)
      setLoadPending(false)
      return
    }

    const gen = ++fetchGenRef.current
    setLoadPending(true)
    setPreviewSyncFailed(false)

    void (async () => {
      const preview = await refreshInvestmentDealDocumentsPreview(id)
      if (fetchGenRef.current !== gen) return
      setDealHasDocumentSections(preview.hasSections)
      setPreviewSyncFailed(!preview.syncedFromServer)

      let aud = EMPTY_INVESTMENT_DOCUMENT_AUDIENCE
      try {
        aud = await buildInvestmentDocumentAudience(id)
      } catch {
        aud = EMPTY_INVESTMENT_DOCUMENT_AUDIENCE
      }
      if (fetchGenRef.current !== gen) return
      setAudience(aud)
      setSectionsRevision((n) => n + 1)
      setLoadPending(false)
    })()
  }, [dealId])

  useEffect(() => {
    const id = dealId.trim()
    if (!id) return
    return bindInvestmentOfferingDocumentsAutoRefresh(id, () => {
      setDealHasDocumentSections(dealHasOfferingDocumentSections(id))
      setSectionsRevision((n) => n + 1)
    })
  }, [dealId])

  useEffect(() => {
    const id = dealId.trim()
    if (!id) return
    const bumpSections = () => setSectionsRevision((n) => n + 1)
    const onCustom = (e: Event) => {
      const d = (e as CustomEvent<{ dealId?: string }>).detail
      if (d?.dealId === id) bumpSections()
    }
    window.addEventListener(OFFERING_PREVIEW_SECTIONS_CHANGED_EVENT, onCustom)
    return () => {
      window.removeEventListener(
        OFFERING_PREVIEW_SECTIONS_CHANGED_EVENT,
        onCustom,
      )
    }
  }, [dealId])

  const offeringDocumentSections = useMemo(() => {
    return listInvestmentDetailDocumentSectionGroups(dealId, audience)
  }, [dealId, audience, sectionsRevision])

  const offeringDocuments = useMemo(
    () => offeringDocumentSections.flatMap((section) => section.documents),
    [offeringDocumentSections],
  )

  const filteredOfferingSections = useMemo(
    () => filterInvestorOfferingDocumentSectionGroups(offeringDocumentSections, query),
    [offeringDocumentSections, query],
  )

  const hasSectionsOnDeal =
    dealHasDocumentSections ||
    dealHasOfferingDocumentSections(dealId) ||
    offeringDocuments.length > 0
  const hasVisibleDocs = offeringDocuments.length > 0
  const hasSearchMatches = filteredOfferingSections.length > 0
  const showOfferingList =
    (hasSectionsOnDeal || hasVisibleDocs) &&
    !(query.trim() && !hasSearchMatches)

  const sectionClassName = [
    "lpdd_offering_docs",
    "lpdd_offering_docs_panel",
    embedded
      ? "deal_offer_pf_wireframe_block deal_offer_pf_documents_section deal_offer_pf_panel deal_offer_pf_bento_full lpdd_offering_docs--embedded"
      : "",
  ]
    .join(" ")
    .trim()

  const headingClassName = embedded
    ? "deal_offer_pf_section_heading"
    : "lpdd_section_heading"

  const headingId = embedded ? "deal-pf-documents" : "lpdd-offering-documents-heading"
  const headingLabel = embedded ? "Documents" : "Offering documents"

  if (loadPending) {
    return (
      <section
        className={sectionClassName}
        aria-labelledby={headingId}
      >
        <h2 id={headingId} className={headingClassName}>
          {headingLabel}
        </h2>
        <p className="lpdd_offering_docs_status" role="status">
          Loading documents…
        </p>
      </section>
    )
  }

  return (
    <section
      className={sectionClassName}
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className={headingClassName}>
        {headingLabel}
      </h2>

      <div className="deal_docs investment_detail_offering_docs">
        <div className="um_panel um_members_tab_panel deals_list_table_panel deals_list_card_surface deal_inv_table_panel deal_assets_datatable_panel investment_detail_offering_docs_panel">
          <div
            className="um_toolbar deal_docs_toolbar investment_detail_offering_docs_toolbar"
            role="toolbar"
            aria-label="Search offering documents"
          >
            <div className="um_search_wrap">
              <Search className="um_search_icon" size={16} strokeWidth={2} aria-hidden />
              <input
                type="search"
                className="um_search_input"
                placeholder="Search documents…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search offering documents"
                autoComplete="off"
              />
            </div>
          </div>

          {previewSyncFailed && hasSectionsOnDeal ? (
            <p className="investment_detail_offering_docs_notice" role="status">
              Showing cached documents; a fresh sync from the server was not
              available.
            </p>
          ) : null}

          {!hasSectionsOnDeal ? (
            <p className="lpdd_offering_docs_status" role="status">
              No offering documents are on this deal yet.
            </p>
          ) : null}

          {previewSyncFailed && !hasSectionsOnDeal ? (
            <p className="lpdd_offering_docs_status lpdd_offering_docs_status--alert" role="alert">
              Could not load the latest document list from the server. Try
              refreshing the page.
            </p>
          ) : null}

          {query.trim() && !hasSearchMatches ? (
            <p className="lpdd_offering_docs_status" role="status">
              No offering documents match your search.
            </p>
          ) : null}

          {!hasVisibleDocs && showOfferingList && !query.trim() ? (
            <p className="investment_detail_offering_docs_notice" role="status">
              No offering documents match your visibility or Shared With settings
              on this deal yet.
            </p>
          ) : null}

          {showOfferingList ? (
            <InvestorOfferingDocumentsList
              dealId={dealId}
              sections={filteredOfferingSections}
            />
          ) : null}
        </div>
      </div>
    </section>
  )
}
