import { Download, Eye, FileSignature, FileText, Search } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { InvestmentEsignSignModal } from "./InvestmentEsignSignModal"
import { InvestorOfferingDocumentsList } from "./components/InvestorOfferingDocumentsList"
import {
  fetchDealMyEsignDocuments,
  type DealMyEsignScopeQuery,
} from "@/modules/Syndication/Deals/api/dealsApi"
import "@/modules/Syndication/Deals/deal-offering-details.css"
import { OFFERING_PREVIEW_SECTIONS_CHANGED_EVENT } from "@/modules/Syndication/Deals/utils/offeringPreviewDocSections"
import type { DealInvestorRow } from "@/modules/Syndication/Deals/types/deal-investors.types"
import { parseMoneyDigits } from "@/modules/Syndication/Deals/utils/offeringMoneyFormat"
import {
  esignCategoryLabel,
  resolveInvestorEsignCategoryId,
} from "@/modules/Syndication/Deals/utils/esignTemplateCategories"
import {
  fetchUserInvestorProfileNameMap,
  profileNameForInvestmentBreakdown,
} from "./investedAsDisplay"
import { resolveEsignDocumentUrlForViewer } from "@/modules/Syndication/Deals/utils/investorEsignStatus"
import "@/modules/Syndication/usermanagement/user_management.css"
import "@/modules/Syndication/Deals/deals-list.css"
import "@/modules/Syndication/Deals/deal-investors-tab.css"
import { buildInvestmentDocumentAudience } from "./utils/buildInvestmentDocumentAudience"
import type { InvestmentDocumentAudienceContext } from "./utils/investmentDocumentAudience"
import {
  dealHasOfferingDocumentSections,
  EMPTY_INVESTMENT_DOCUMENT_AUDIENCE,
  filterInvestorOfferingDocumentSectionGroups,
  listInvestmentDetailDocumentSectionGroups,
  type InvestmentDetailDocumentRow,
  type InvestmentDetailDocumentSectionGroup,
} from "./utils/investmentDetailDocuments"
import { refreshInvestmentDealDocumentsPreview } from "./utils/refreshInvestmentDealDocumentsPreview"
import { bindInvestmentOfferingDocumentsAutoRefresh } from "./utils/bindInvestmentOfferingDocumentsAutoRefresh"
import "@/modules/Syndication/Deals/deal-esign-ui.css"
import "../deals/deal-details/lp-deal-details.css"
import "./investment-detail.css"

type InvestmentDetailDocumentsTabProps = {
  dealId: string
}

type DocumentsSubTab = "offering" | "esignatures"

function safeDownloadFilename(name: string): string {
  const base = name.trim() || "document"
  return base.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 200)
}

function investmentEsignStatusLabel(
  status: "pending" | "signed",
  esignCompleted?: boolean,
): string {
  if (esignCompleted) return "Completed"
  if (status === "signed") return "Signed"
  return "Awaiting signature"
}

function investmentEsignStatusClassName(status: "pending" | "signed"): string {
  return status === "signed"
    ? "lpd_doc_esign_status lpd_doc_esign_status--signed"
    : "lpd_doc_esign_status lpd_doc_esign_status--pending"
}

type EsignProfileCardData = {
  cardKey: string
  categoryId: string
  label: string
  /** Saved My Profiles name for this commitment (when known). */
  profileName?: string
  /** Pins sign session / sync to this commitment row. */
  esignScope: DealMyEsignScopeQuery
  /** All sends for this profile are fully complete in eSign. */
  esignCompleted?: boolean
  /** Documents for this profile only (not merged across names). */
  documents: InvestmentDetailDocumentRow[]
}

type EsignCommitmentSlot = {
  cardKey: string
  categoryId: string
  label: string
  profileName: string
  userInvestorProfileId: string
  commitmentProfileId: string
  investmentRowId: string
  investorKind?: DealInvestorRow["investorKind"]
}

function isPositiveCommitment(committed: string | undefined): boolean {
  const n = parseMoneyDigits(String(committed ?? "").trim())
  return Number.isFinite(n) && n > 0
}

function buildEsignCommitmentSlots(
  viewerRows: DealInvestorRow[],
  nameByUserProfileId: ReadonlyMap<string, string>,
): EsignCommitmentSlot[] {
  const slots: EsignCommitmentSlot[] = []
  const seen = new Set<string>()
  for (const row of viewerRows) {
    if (!isPositiveCommitment(row.committed)) continue
    const categoryId = resolveInvestorEsignCategoryId(row)
    if (!categoryId) continue
    const uip = String(row.userInvestorProfileId ?? "").trim()
    const cardKey = `${categoryId}|${uip || row.id}`
    if (seen.has(cardKey)) continue
    seen.add(cardKey)
    const name = profileNameForInvestmentBreakdown(row, nameByUserProfileId)
    slots.push({
      cardKey,
      categoryId,
      label: esignCategoryLabel(categoryId),
      profileName: name !== "—" ? name : "",
      userInvestorProfileId: uip,
      commitmentProfileId: String(row.profileId ?? "").trim(),
      investmentRowId: row.id,
      investorKind: row.investorKind,
    })
  }
  return slots
}

function esignProfileCardStatus(
  card: EsignProfileCardData,
): "pending" | "signed" | null {
  if (card.esignCompleted) return "signed"
  return cardAggregateEsignStatus(card.documents)
}

function mapMyEsignApiDocuments(
  docs: Awaited<ReturnType<typeof fetchDealMyEsignDocuments>>["documents"],
  cardKey: string,
  esignCompleted?: boolean,
): InvestmentDetailDocumentRow[] {
  return docs.map((d) => {
    const categoryId = d.categoryId?.trim() || ""
    const signed = d.status === "signed"
    return {
      id: `esign-${cardKey}-${d.fileId}`,
      name: d.name,
      url: resolveEsignDocumentUrlForViewer(d.url),
      dateAdded: "—",
      sectionLabel: categoryId ? esignCategoryLabel(categoryId) : "E-signatures",
      visibilityLabel: investmentEsignStatusLabel(
        signed ? "signed" : "pending",
        esignCompleted,
      ),
      esignStatus: signed ? "signed" : "pending",
      source: "esign",
      canSign: !signed && Boolean(d.signatureRequestId?.trim()),
      signatureRequestId: d.signatureRequestId?.trim() || undefined,
      categoryId: categoryId || undefined,
    }
  })
}

function esignScopeForSlot(slot: EsignCommitmentSlot): DealMyEsignScopeQuery {
  return {
    ...(slot.investorKind !== "lp_roster"
      ? { investmentId: slot.investmentRowId }
      : {}),
    userInvestorProfileId: slot.userInvestorProfileId || undefined,
    profileId: slot.commitmentProfileId || undefined,
  }
}

function cardAggregateEsignStatus(
  documents: InvestmentDetailDocumentRow[],
): "pending" | "signed" | null {
  if (documents.length === 0) return null
  if (documents.every((d) => d.esignStatus === "signed")) return "signed"
  if (documents.some((d) => d.esignStatus === "pending")) return "pending"
  return null
}

/** One card per saved profile commitment that has e-sign on this deal. */
async function fetchEsignProfileCardsForDeal(
  dealId: string,
  viewerRows: DealInvestorRow[],
  nameByUserProfileId: ReadonlyMap<string, string>,
): Promise<{
  cards: EsignProfileCardData[]
  pending: boolean
  loadError: string | null
  investorPortalDocumentsGateOpen: boolean
  awaitingSponsorCounterSign: boolean
  awaitingSequentialSignTurn: boolean
}> {
  const slots = buildEsignCommitmentSlots(viewerRows, nameByUserProfileId)

  const results: Array<{
    slot: EsignCommitmentSlot
    esign: Awaited<ReturnType<typeof fetchDealMyEsignDocuments>>
    esignScope: DealMyEsignScopeQuery
  }> = []
  for (const slot of slots) {
    const esignScope = esignScopeForSlot(slot)
    const esign = await fetchDealMyEsignDocuments(dealId, esignScope)
    results.push({ slot, esign, esignScope })
  }

  let pending = false
  let loadError: string | null = null
  let investorPortalDocumentsGateOpen = true
  let awaitingSponsorCounterSign = false
  let awaitingSequentialSignTurn = false
  const cards: EsignProfileCardData[] = []

  for (const { slot, esign, esignScope } of results) {
    if (esign.loadError && !loadError) loadError = esign.loadError
    if (esign.esignPending) pending = true
    if (esign.investorPortalDocumentsGateOpen === false) {
      investorPortalDocumentsGateOpen = false
    }
    if (esign.awaitingSponsorCounterSign) awaitingSponsorCounterSign = true
    if (esign.awaitingSequentialSignTurn) awaitingSequentialSignTurn = true
    if (esign.documents.length === 0) continue
    cards.push({
      cardKey: slot.cardKey,
      categoryId: slot.categoryId,
      label: slot.label,
      ...(slot.profileName ? { profileName: slot.profileName } : {}),
      esignScope,
      esignCompleted: esign.esignCompleted,
      documents: mapMyEsignApiDocuments(
        esign.documents,
        slot.cardKey,
        esign.esignCompleted,
      ),
    })
  }

  if (cards.length === 0 && slots.length === 0) {
    const esign = await fetchDealMyEsignDocuments(dealId)
    if (esign.loadError) loadError = esign.loadError
    if (esign.esignPending) pending = true
    if (esign.investorPortalDocumentsGateOpen === false) {
      investorPortalDocumentsGateOpen = false
    }
    if (esign.awaitingSponsorCounterSign) awaitingSponsorCounterSign = true
    if (esign.awaitingSequentialSignTurn) awaitingSequentialSignTurn = true
    if (esign.documents.length > 0) {
      cards.push({
        cardKey: "unscoped",
        categoryId: "",
        label: "E-signatures",
        esignScope: {},
        documents: mapMyEsignApiDocuments(esign.documents, "unscoped"),
      })
    }
  }

  return {
    cards,
    pending,
    loadError,
    investorPortalDocumentsGateOpen,
    awaitingSponsorCounterSign,
    awaitingSequentialSignTurn,
  }
}

function esignProfileCardTitle(card: EsignProfileCardData): string {
  const name = card.profileName?.trim()
  if (name) return `${name} — ${card.label}`
  return card.label
}

function esignProfileCardMatchesQuery(
  card: EsignProfileCardData,
  query: string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const blob = [
    card.profileName,
    card.label,
    ...card.documents.flatMap((d) => [
      d.name,
      d.sectionLabel,
      d.visibilityLabel,
    ]),
  ]
    .join(" ")
    .toLowerCase()
  return blob.includes(q)
}

export function InvestmentDetailDocumentsTab({
  dealId,
}: InvestmentDetailDocumentsTabProps) {
  const [query, setQuery] = useState("")
  const [activeSubTab, setActiveSubTab] = useState<DocumentsSubTab>("offering")
  const [loadPending, setLoadPending] = useState(true)
  const [audience, setAudience] =
    useState<InvestmentDocumentAudienceContext>(EMPTY_INVESTMENT_DOCUMENT_AUDIENCE)
  const [sectionsRevision, setSectionsRevision] = useState(0)
  const [previewSyncFailed, setPreviewSyncFailed] = useState(false)
  const [dealHasDocumentSections, setDealHasDocumentSections] = useState(false)
  const [esignProfileCards, setEsignProfileCards] = useState<
    EsignProfileCardData[]
  >([])
  const [esignPending, setEsignPending] = useState(false)
  const [esignLoadError, setEsignLoadError] = useState<string | null>(null)
  const [investorPortalDocumentsGateOpen, setInvestorPortalDocumentsGateOpen] =
    useState(true)
  const [awaitingSponsorCounterSign, setAwaitingSponsorCounterSign] =
    useState(false)
  const [awaitingSequentialSignTurn, setAwaitingSequentialSignTurn] =
    useState(false)
  const [profileNameByBookId, setProfileNameByBookId] = useState<
    ReadonlyMap<string, string>
  >(() => new Map())
  const [signModalOpen, setSignModalOpen] = useState(false)
  const [signModalSignatureRequestId, setSignModalSignatureRequestId] = useState<
    string | null
  >(null)
  const [signModalEsignScope, setSignModalEsignScope] = useState<
    DealMyEsignScopeQuery | undefined
  >(undefined)
  const fetchGenRef = useRef(0)
  const autoEsignTabRef = useRef(false)

  const openSignModal = useCallback(
    (
      signatureRequestId?: string | null,
      esignScope?: DealMyEsignScopeQuery,
    ) => {
      setSignModalSignatureRequestId(signatureRequestId?.trim() || null)
      setSignModalEsignScope(esignScope)
      setSignModalOpen(true)
    },
    [],
  )

  const reloadEsignProfileCards = useCallback(
    async (
      id: string,
      viewerRows: DealInvestorRow[],
      nameMap: ReadonlyMap<string, string>,
    ) => {
      const result = await fetchEsignProfileCardsForDeal(
        id,
        viewerRows,
        nameMap,
      )
      setEsignProfileCards(result.cards)
      setEsignPending(result.pending)
      setEsignLoadError(result.loadError)
      setInvestorPortalDocumentsGateOpen(result.investorPortalDocumentsGateOpen)
      setAwaitingSponsorCounterSign(result.awaitingSponsorCounterSign)
      setAwaitingSequentialSignTurn(result.awaitingSequentialSignTurn)
      if (result.pending && !autoEsignTabRef.current) {
        autoEsignTabRef.current = true
        setActiveSubTab("esignatures")
      }
    },
    [],
  )

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

      const nameMap = await fetchUserInvestorProfileNameMap()
      if (fetchGenRef.current !== gen) return
      setProfileNameByBookId(nameMap)

      await reloadEsignProfileCards(id, aud.viewerRows, nameMap)
      if (fetchGenRef.current !== gen) return

      setSectionsRevision((n) => n + 1)
      setLoadPending(false)
    })()
  }, [dealId, reloadEsignProfileCards])

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
    const sections = listInvestmentDetailDocumentSectionGroups(dealId, audience)
    if (investorPortalDocumentsGateOpen) return sections
    return sections
      .map((section) => ({
        ...section,
        documents: section.documents.filter(
          (doc) => !doc.id.startsWith("esign-promoted-"),
        ),
      }))
      .filter((section) => section.documents.length > 0)
  }, [dealId, audience, sectionsRevision, investorPortalDocumentsGateOpen])

  const offeringDocuments = useMemo(
    () => offeringDocumentSections.flatMap((section) => section.documents),
    [offeringDocumentSections],
  )

  const filteredOfferingSections = useMemo(
    () => filterInvestorOfferingDocumentSectionGroups(offeringDocumentSections, query),
    [offeringDocumentSections, query],
  )

  const filteredEsignProfileCards = useMemo(
    () =>
      esignProfileCards.filter((card) =>
        esignProfileCardMatchesQuery(card, query),
      ),
    [esignProfileCards, query],
  )

  const firstPendingSign = useMemo(() => {
    for (const card of esignProfileCards) {
      for (const doc of card.documents) {
        const sig = doc.signatureRequestId?.trim()
        if (doc.canSign && sig) {
          return { signatureRequestId: sig, esignScope: card.esignScope }
        }
      }
    }
    return null
  }, [esignProfileCards])

  const showAudienceGate =
    previewSyncFailed &&
    !dealHasDocumentSections &&
    !dealHasOfferingDocumentSections(dealId) &&
    offeringDocuments.length === 0 &&
    esignProfileCards.length === 0 &&
    activeSubTab === "offering"

  return (
    <div
      id="inv-detail-panel-documents"
      className="investment_detail_tab_panel investment_detail_documents_panel"
      role="tabpanel"
      aria-labelledby="inv-detail-tab-documents"
    >
      <div
        className="um_panel um_members_tab_panel deals_list_card_surface investment_detail_documents_card"
        aria-labelledby="inv-sec-documents"
      >
        <h2 id="inv-sec-documents" className="um_section_title">
          Documents
        </h2>

        <div
          className="um_members_tabs_outer deals_tabs_outer um_segmented_tabs_outer investment_detail_docs_subtabs_outer"
          role="presentation"
        >
          <div
            className="um_members_tabs_row deals_tabs_row um_segmented_tabs_row investment_detail_docs_subtabs"
            role="tablist"
            aria-label="Document categories"
          >
            <button
              type="button"
              role="tab"
              id="inv-docs-tab-offering"
              aria-selected={activeSubTab === "offering"}
              aria-controls="inv-docs-panel-offering"
              className={`um_members_tab deals_tabs_tab um_segmented_tab${
                activeSubTab === "offering" ? " um_members_tab_active" : ""
              }`}
              onClick={() => setActiveSubTab("offering")}
            >
              <FileText
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Documents
                {offeringDocuments.length > 0 ? (
                  <span className="investment_detail_docs_tab_count">
                    {offeringDocuments.length}
                  </span>
                ) : null}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              id="inv-docs-tab-esignatures"
              aria-selected={activeSubTab === "esignatures"}
              aria-controls="inv-docs-panel-esignatures"
              className={`um_members_tab deals_tabs_tab um_segmented_tab${
                activeSubTab === "esignatures" ? " um_members_tab_active" : ""
              }`}
              onClick={() => setActiveSubTab("esignatures")}
            >
              <FileSignature
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                E-signatures
                {esignProfileCards.length > 0 ? (
                  <span className="investment_detail_docs_tab_count">
                    {esignProfileCards.length}
                  </span>
                ) : null}
              </span>
            </button>
          </div>
        </div>

        <div className="investment_detail_documents_body">
          {loadPending ? (
            <p className="investment_detail_documents_status" role="status">
              Loading documents…
            </p>
          ) : activeSubTab === "offering" ? (
            <OfferingDocumentsPanel
              dealId={dealId}
              showAudienceGate={showAudienceGate}
              previewSyncFailed={previewSyncFailed}
              hasSectionsOnDeal={
                dealHasDocumentSections ||
                dealHasOfferingDocumentSections(dealId) ||
                offeringDocuments.length > 0
              }
              offeringDocuments={offeringDocuments}
              filteredOfferingSections={filteredOfferingSections}
              searchQuery={query}
              onSearchQueryChange={setQuery}
            />
          ) : (
            <EsignaturesDocumentsPanel
              esignPending={esignPending}
              esignLoadError={esignLoadError}
              esignProfileCards={filteredEsignProfileCards}
              investorPortalDocumentsGateOpen={investorPortalDocumentsGateOpen}
              awaitingSponsorCounterSign={awaitingSponsorCounterSign}
              awaitingSequentialSignTurn={awaitingSequentialSignTurn}
              searchQuery={query}
              onSearchQueryChange={setQuery}
              firstPendingSign={firstPendingSign}
              onOpenSignModal={openSignModal}
            />
          )}
        </div>
      </div>

      <InvestmentEsignSignModal
        open={signModalOpen}
        dealId={dealId.trim()}
        signatureRequestId={signModalSignatureRequestId}
        esignScope={signModalEsignScope}
        onClose={() => {
          setSignModalOpen(false)
          setSignModalSignatureRequestId(null)
          setSignModalEsignScope(undefined)
        }}
        onSignedComplete={() => {
          const id = dealId.trim()
          void (async () => {
            let aud = audience
            try {
              aud = await buildInvestmentDocumentAudience(id)
              setAudience(aud)
            } catch {
              /* keep prior audience */
            }
            await reloadEsignProfileCards(id, aud.viewerRows, profileNameByBookId)
            setSectionsRevision((n) => n + 1)
          })()
        }}
      />
    </div>
  )
}

function OfferingDocumentsPanel({
  dealId,
  showAudienceGate,
  previewSyncFailed,
  hasSectionsOnDeal,
  offeringDocuments,
  filteredOfferingSections,
  searchQuery,
  onSearchQueryChange,
}: {
  dealId: string
  showAudienceGate: boolean
  previewSyncFailed: boolean
  hasSectionsOnDeal: boolean
  offeringDocuments: InvestmentDetailDocumentRow[]
  filteredOfferingSections: InvestmentDetailDocumentSectionGroup[]
  searchQuery: string
  onSearchQueryChange: (value: string) => void
}) {
  const hasVisibleDocs = offeringDocuments.length > 0
  const hasSearchMatches = filteredOfferingSections.length > 0
  const showOfferingList =
    !showAudienceGate &&
    (hasSectionsOnDeal || hasVisibleDocs) &&
    !(searchQuery.trim() && !hasSearchMatches)

  const statusMessage = showAudienceGate
    ? "Sign in as an investor with a commitment on this deal to view offering documents shared by your sponsor."
    : previewSyncFailed && !hasSectionsOnDeal
      ? "Could not load the latest document list from the server. Try refreshing the page, or open this investment again after your sponsor shares files on the deal Documents tab."
      : !hasSectionsOnDeal
        ? "No offering documents are on this deal yet."
        : searchQuery.trim() && !hasSearchMatches
          ? "No offering documents match your search."
          : null

  return (
    <div
      id="inv-docs-panel-offering"
      role="tabpanel"
      aria-labelledby="inv-docs-tab-offering"
      className="investment_detail_docs_subpanel"
    >
      <div className="deal_docs investment_detail_offering_docs">
        <div className="um_panel um_members_tab_panel deals_list_table_panel deals_list_card_surface deal_inv_table_panel deal_assets_datatable_panel investment_detail_offering_docs_panel">
          <div
            className="um_toolbar deal_docs_toolbar um_toolbar_export_then_search investment_detail_offering_docs_toolbar"
            role="toolbar"
            aria-label="Search offering documents"
          >
            <div className="um_search_wrap">
              <Search className="um_search_icon" size={16} strokeWidth={2} aria-hidden />
              <input
                type="search"
                className="um_search_input"
                placeholder="Search documents…"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
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

          {statusMessage ? (
            <p
              className={`investment_detail_documents_status${previewSyncFailed && !hasSectionsOnDeal ? " investment_detail_documents_status--alert" : ""}`}
              role={previewSyncFailed && !hasSectionsOnDeal ? "alert" : "status"}
            >
              {statusMessage}
            </p>
          ) : null}

          {!hasVisibleDocs && showOfferingList && !searchQuery.trim() ? (
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
    </div>
  )
}

function EsignProfileTypeCardsGrid({
  cards,
  onOpenSignModal,
}: {
  cards: EsignProfileCardData[]
  onOpenSignModal: (
    signatureRequestId?: string | null,
    esignScope?: DealMyEsignScopeQuery,
  ) => void
}) {
  return (
    <div
      className={`deal_esign_profile_cards_grid investment_detail_esign_profile_cards${
        cards.length === 1 ? " investment_detail_esign_profile_cards--single" : ""
      }`}
      role="list"
      aria-label="E-sign documents by investor profile"
    >
      {cards.map((card) => {
        const status = esignProfileCardStatus(card)

        return (
          <article
            key={card.cardKey}
            className="deal_esign_profile_card investment_detail_esign_profile_card"
            role="listitem"
            aria-labelledby={`inv-esign-card-${card.cardKey}`}
          >
            <header className="deal_esign_profile_card_head">
              <div className="investment_detail_esign_profile_card_head_row">
                <h3
                  id={`inv-esign-card-${card.cardKey}`}
                  className="deal_esign_profile_card_title"
                  title={esignProfileCardTitle(card)}
                >
                  {esignProfileCardTitle(card)}
                </h3>
                {status ? (
                  <span
                    className={`${investmentEsignStatusClassName(status)} investment_detail_esign_profile_card_status`}
                  >
                    {investmentEsignStatusLabel(status, card.esignCompleted)}
                  </span>
                ) : null}
              </div>
            </header>
            <div className="investment_detail_esign_profile_card_body">
              <ul
                className="investment_detail_esign_card_doc_list"
                aria-label={`Documents for ${esignProfileCardTitle(card)}`}
              >
                {card.documents.map((doc) => {
                  const url = doc.url?.trim() || ""
                  const canSign = Boolean(doc.canSign)

                  return (
                    <li
                      key={doc.id}
                      className="investment_detail_esign_card_doc_item"
                    >
                      <div className="deal_docs_ui_doc_cell investment_detail_esign_card_doc_row">
                        <div className="deal_docs_ui_doc_name_wrap investment_detail_esign_card_doc_name_wrap">
                          <span
                            className="deal_docs_ui_doc_name_text investment_detail_esign_card_doc_name"
                            title={doc.name}
                          >
                            <FileSignature
                              className="investment_detail_esign_card_doc_icon"
                              size={15}
                              strokeWidth={2}
                              aria-hidden
                            />
                            {doc.name}
                          </span>
                        </div>
                        <div
                          className="deal_docs_ui_doc_quick investment_detail_esign_card_doc_actions"
                          role="group"
                          aria-label={`${doc.name} actions`}
                        >
                          {url ? (
                            <>
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="deal_docs_ui_doc_icon_btn deal_docs_ui_doc_icon_link"
                                title="View"
                                aria-label={`View ${doc.name}`}
                              >
                                <Eye size={16} strokeWidth={2} aria-hidden />
                              </a>
                              <a
                                href={url}
                                download={safeDownloadFilename(doc.name)}
                                rel="noopener noreferrer"
                                className="deal_docs_ui_doc_icon_btn deal_docs_ui_doc_icon_link"
                                title="Download"
                                aria-label={`Download ${doc.name}`}
                              >
                                <Download
                                  size={16}
                                  strokeWidth={2}
                                  aria-hidden
                                />
                              </a>
                            </>
                          ) : null}
                          {canSign ? (
                            <button
                              type="button"
                              className="investment_detail_esign_card_doc_sign_btn"
                              aria-label={`Sign ${doc.name}`}
                              onClick={() =>
                                onOpenSignModal(
                                  doc.signatureRequestId ?? null,
                                  card.esignScope,
                                )
                              }
                            >
                              <FileSignature
                                size={15}
                                strokeWidth={2}
                                aria-hidden
                              />
                              Sign
                            </button>
                          ) : null}
                          {!url && !canSign ? (
                            <span className="investment_detail_offering_doc_unavailable">
                              Unavailable
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function EsignaturesDocumentsPanel({
  esignPending,
  esignLoadError,
  esignProfileCards,
  investorPortalDocumentsGateOpen,
  awaitingSponsorCounterSign,
  awaitingSequentialSignTurn,
  searchQuery,
  onSearchQueryChange,
  firstPendingSign,
  onOpenSignModal,
}: {
  esignPending: boolean
  esignLoadError: string | null
  esignProfileCards: EsignProfileCardData[]
  investorPortalDocumentsGateOpen: boolean
  awaitingSponsorCounterSign: boolean
  awaitingSequentialSignTurn: boolean
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  firstPendingSign: {
    signatureRequestId: string
    esignScope: DealMyEsignScopeQuery
  } | null
  onOpenSignModal: (
    signatureRequestId?: string | null,
    esignScope?: DealMyEsignScopeQuery,
  ) => void
}) {
  const hasAny = esignProfileCards.length > 0
  const hasVisibleCards = esignProfileCards.length > 0
  const awaitingTurnMessage =
    awaitingSequentialSignTurn && !hasAny
      ? "Your documents will be ready to sign soon. We will email you and show an alert when it is your turn."
      : null
  const awaitingAllInvestorsMessage =
    !investorPortalDocumentsGateOpen &&
    !hasAny &&
    !awaitingSequentialSignTurn &&
    !awaitingSponsorCounterSign
      ? "Your signed subscription documents will appear here after you complete signing."
      : null
  const awaitingSponsorMessage =
    awaitingSponsorCounterSign && !hasAny
      ? "Your fully executed documents will appear here after your sponsor completes counter-signature."
      : null

  return (
    <div
      id="inv-docs-panel-esignatures"
      role="tabpanel"
      aria-labelledby="inv-docs-tab-esignatures"
      className="investment_detail_docs_subpanel"
    >
      <div className="investment_detail_esign_docs">
        <div className="um_panel um_members_tab_panel deals_list_card_surface investment_detail_esign_docs_panel">
          {esignPending ? (
            <div
              className="investment_detail_esign_pending_banner"
              role="status"
            >
              <p className="investment_detail_esign_pending_banner_text">
                You have documents waiting for your signature.
              </p>
              <button
                type="button"
                className="um_btn_primary investment_detail_esign_pending_banner_btn"
                onClick={() =>
                  onOpenSignModal(
                    firstPendingSign?.signatureRequestId,
                    firstPendingSign?.esignScope,
                  )
                }
              >
                <FileSignature size={16} strokeWidth={2} aria-hidden />
                Sign now
              </button>
            </div>
          ) : null}

          <div
            className="um_toolbar um_toolbar_export_then_search investment_detail_esign_docs_toolbar"
            role="toolbar"
            aria-label="Search e-sign documents"
          >
            <div className="um_search_wrap">
              <Search
                className="um_search_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <input
                type="search"
                className="um_search_input"
                placeholder="Search e-sign documents…"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                aria-label="Search e-sign documents"
                autoComplete="off"
              />
            </div>
          </div>

          {esignLoadError ? (
            <p className="deal_esign_notice deal_esign_notice--error" role="alert">
              {esignLoadError}
            </p>
          ) : null}

          {!hasAny ? (
            <p className="investment_detail_documents_status">
              {awaitingTurnMessage ??
                awaitingSponsorMessage ??
                awaitingAllInvestorsMessage ??
                "No e-sign documents have been sent to you on this deal yet. When your sponsor sends templates for signature, they will appear here."}
            </p>
          ) : !hasVisibleCards ? (
            <p className="investment_detail_documents_status">
              {searchQuery.trim()
                ? "No e-sign documents match your search."
                : "No e-sign documents are available for your profile types on this deal."}
            </p>
          ) : (
            <>
              {/* {esignProfileCards.length > 1 ? (
                <p
                  className="investment_detail_documents_group_hint"
                  role="note"
                >
                  Each saved profile has its own e-sign packet. Sign and view
                  documents separately — they are not shared across profile
                  names.
                </p>
              ) : null} */}
              <EsignProfileTypeCardsGrid
                cards={esignProfileCards}
                onOpenSignModal={onOpenSignModal}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
