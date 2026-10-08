import type { LucideIcon } from "lucide-react"
import {
  ArrowLeft,
  BarChart3,
  File,
  FileSignature,
  FileText,
  Pencil,
  Users,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom"
import {
  dealDetailApiToRecord,
  dealStageLabel,
  type DealRecord,
} from "../dealsDashboardUtils"
import { usePortalMode } from "@/modules/Investing/context/PortalModeContext"
import { getSessionUserEmail } from "../../../common/auth/sessionUserEmail"
import { getSessionUserId } from "../../../common/auth/sessionUserId"
import { isCompanyAdmin, isPlatformAdmin } from "../../../common/auth/roleUtils"
import { setAppDocumentTitle } from "../../../common/utils/appDocumentTitle"
import {
  buildDealOfferingPreviewShareUrl,
  deleteDealMemberRoster,
  fetchDealById,
  fetchDealInvestorClasses,
  fetchDealInvestors,
  fetchDealMembers,
  isDealDetailFormIncomplete,
  DEAL_ESIGN_TEMPLATES_CHANGED_EVENT,
  fetchDealEsignTemplates,
  postDealInvestorSendEsign,
  postDealMemberInvitationEmail,
  type DealDetailApi,
} from "./api/dealsApi"
import { DealAnnouncementBanner } from "./components/DealAnnouncementBanner"
import { DealsPageCenteredLoader } from "./components/DealsPageCenteredLoader"
import { DealSaasPaywallModal } from "./components/DealSaasPaywallModal"
import {
  dealInvestNowPath,
  EMPTY_INVESTORS_PAYLOAD,
} from "./dealOfferingPreviewShared"
import { LpDealDetailsPage } from "@/modules/Investing/pages/deals/deal-details"
import { refreshInvestmentDealDocumentsPreview } from "@/modules/Investing/pages/investments/utils/refreshInvestmentDealDocumentsPreview"
import { applyOfferingInvestorPreviewJsonFromServer } from "./utils/offeringPreviewServerState"
import { clearOfferingPreviewRuntime } from "./utils/offeringPreviewRuntimeStore"
import { invitationMailSentOptimisticKeys, omitInvitationMailKeys } from "./utils/dealInvitationMailStatus"
import { dealStageChipCompactClassName } from "./utils/dealStageChip"
import { ADD_MEMBER_DRAFT_ROW_ID } from "./tabs/deal_members/add-investment/addMemberDraftInvestorRow"
import {
  clearAddMemberDraft,
  loadAddMemberDraft,
} from "./tabs/deal_members/add-investment/addMemberFormDraftStorage"
import {
  DealInvestorsTab,
  type DealInvestorsTabHandle,
} from "./tabs/investors/DealInvestorsTab"
import { DealMembersTab } from "./tabs/deal_members"
import {
  dealInvestmentModalEntryFromRosterKind,
  dealRosterKindFromRole,
  type DealInvestmentModalEntry,
} from "./constants/investor-profile"
import { DealEsignTemplatesTab } from "./components/DealEsignTemplatesTab"
import { DealDocumentsTab } from "./tabs/documents/DealDocumentsTab"
import { DealOfferingDetailsTab } from "./tabs/offering_details/DealOfferingDetailsTab"
import { InvestorCommunicationTab } from "./tabs/investor_communication"
import { DistributionsTab } from "./tabs/distributions"
import type {
  DealInvestorRow,
  DealInvestorsPayload,
} from "./types/deal-investors.types"
import type { DealInvestorClass } from "./types/deal-investor-class.types"
import {
  parseViewerDealMemberRoleFromApi,
  resolveViewerDealInvestorRoleRaw,
  resolveViewerDealMemberRole,
  viewerCanSendDealEsignTemplates,
  viewerCanUploadDealEsignTemplates,
  viewerCanApproveDealFund,
  viewerCanEditDeal,
  visibleDealDetailTabIds,
  isUsableInvestorEmail,
  type ViewerDealMemberRole,
} from "./utils/dealDetailTabVisibility"
import { toast } from "../../../common/components/Toast"
import { getSessionOrganizationCompanyId } from "../../../common/auth/sessionOrganization"
import { syncExtraCompanyUserCheckout } from "../company/companyBillingApi"
import {
  isDealStageDraft,
  isDealStageOfferingShareBlocked,
} from "./constants/deal-lifecycle/deal-stage"
import { dealHasOfferingShareLink } from "./utils/offeringOverviewForm"
import { TabsScrollStrip } from "../../../common/components/tabs-scroll-strip/TabsScrollStrip"
import { notifyDealsListRefetch } from "./createDealFormDraftStorage"
import {
  isDealSaasPaymentRequiredError,
  type DealSaasPaywallDeal,
} from "./utils/dealSaasAccess"
import {
  DEAL_DETAIL_TAB_QUERY_PARAM,
  isOfferingDetailsSectionId,
  OFFERING_SECTION_QUERY_PARAM,
} from "./utils/offeringDetailsSectionNav"
import "../usermanagement/user_management.css"
import "./deal-offering-portfolio.css"
import "./deals-list.css"

/**
 * Role column value(s) for invitation email when sent from the **Deal members** tab.
 */
function dealRowRoleLabelForInvitationEmail(
  row: DealInvestorRow,
): string {
  const fromLabels = row.memberRoleLabels
    ?.map((s) => String(s).trim())
    .filter((s) => s && s !== "—")
  if (fromLabels && fromLabels.length) return fromLabels.join(", ")
  const r = String(row.investorRole ?? "").trim()
  return r && r !== "—" ? r : ""
}

/** Deal detail: `/deals/:dealId`. Tab **Deal Members** (`deal_members`) renders `DealMembersTab` (root `deal_members_tab` in `tabs/deal_members/tab/deal-members.css`). */
interface DealDetailTabDef {
  id: string
  label: string
  icon: LucideIcon
}

const DEAL_DETAIL_TABS: DealDetailTabDef[] = [
  { id: "offering_details", label: "Offering Details", icon: FileText },
  { id: "documents", label: "Documents", icon: File },
  { id: "esign_templates", label: "eSign Templates", icon: FileSignature },
  { id: "investors", label: "Investors", icon: Users },
  { id: "investor_communication", label: "Investor Communication ", icon: BarChart3 },
  { id: "distributions", label: "Distributions", icon: BarChart3 },
  { id: "deal_members", label: "General Partners", icon: Users },
]

export function DealDetailPage() {
  const { mode, switchToInvesting } = usePortalMode()
  const { dealId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<string>(() => {
    const fromUrl = searchParams.get(DEAL_DETAIL_TAB_QUERY_PARAM)?.trim()
    return fromUrl || "offering_details"
  })
  const [addInvestmentOpen, setAddInvestmentOpen] = useState(false)
  /** True while shared Add/Edit investment modal is open (add or edit) — hides session draft row in Deal Members table. */
  const [sharedInvestmentModalOpen, setSharedInvestmentModalOpen] =
    useState(false)
  /** Which flow opened the shared modal — drives “Add Member” vs “Add Investor” title. */
  const [investmentModalEntry, setInvestmentModalEntry] =
    useState<DealInvestmentModalEntry>("member")
  /** Add-member modal: restore session draft (draft row) vs empty form (“Add Member” button). */
  const [restoreAddMemberSessionDraft, setRestoreAddMemberSessionDraft] =
    useState(true)
  const [dealMembersRefreshKey, setDealMembersRefreshKey] = useState(0)
  /** After send-invitation succeeds, until API list reflects `send_invitation_mail: yes`. */
  const [invitationMailSentByRowId, setInvitationMailSentByRowId] = useState<
    Record<string, true>
  >({})
  const [invitationMailSendingByRowId, setInvitationMailSendingByRowId] =
    useState<Record<string, true>>({})
  const dealInvestorsTabRef = useRef<DealInvestorsTabHandle>(null)
  const [deal, setDeal] = useState<DealRecord | null | undefined>(undefined)
  const [dealDetailApi, setDealDetailApi] = useState<DealDetailApi | null>(null)
  const [saasPaywallDeal, setSaasPaywallDeal] =
    useState<DealSaasPaywallDeal | null>(null)
  const [upgradePromptDeal, setUpgradePromptDeal] =
    useState<DealSaasPaywallDeal | null>(null)

  const handleDealPersisted = useCallback((d: DealDetailApi) => {
    setDealDetailApi(d)
    setDeal(dealDetailApiToRecord(d))
    notifyDealsListRefetch()
  }, [])
  const [investingOfferingClasses, setInvestingOfferingClasses] = useState<
    DealInvestorClass[]
  >([])
  const [investingOfferingInvestors, setInvestingOfferingInvestors] =
    useState<DealInvestorsPayload>(EMPTY_INVESTORS_PAYLOAD)
  const [investingOfferingLoading, setInvestingOfferingLoading] = useState(
    () => mode === "investing",
  )
  const [memberRosterForTabs, setMemberRosterForTabs] = useState<
    DealInvestorRow[]
  >([])
  const [viewerDealMemberRoleFromApi, setViewerDealMemberRoleFromApi] =
    useState<ViewerDealMemberRole | null>(null)

  const openInvestNow = useCallback(() => {
    const id = dealId?.trim()
    if (!id) return
    navigate(dealInvestNowPath(id), { state: { mode: "fresh" } })
  }, [dealId, navigate])

  useEffect(() => {
    setInvitationMailSentByRowId({})
  }, [dealId])

  useEffect(() => {
    setViewerDealMemberRoleFromApi(null)
    if (!dealId?.trim()) return
    let cancelled = false
    void fetchDealMembers(dealId).then((result) => {
      if (cancelled) return
      setMemberRosterForTabs(result.members)
      setViewerDealMemberRoleFromApi(
        parseViewerDealMemberRoleFromApi(result.viewerDealMemberRole),
      )
    })
    return () => {
      cancelled = true
    }
  }, [dealId, dealMembersRefreshKey])

  const sessionEmail = getSessionUserEmail()
  const sessionUserId = getSessionUserId()

  const viewerDealMemberRole = useMemo(() => {
    if (viewerDealMemberRoleFromApi != null) return viewerDealMemberRoleFromApi
    return resolveViewerDealMemberRole(
      memberRosterForTabs,
      sessionEmail,
      sessionUserId,
    )
  }, [
    viewerDealMemberRoleFromApi,
    memberRosterForTabs,
    sessionEmail,
    sessionUserId,
  ])

  const isWorkspaceAdmin = isCompanyAdmin() || isPlatformAdmin()

  const viewerDealTabIds = useMemo(
    () =>
      visibleDealDetailTabIds(viewerDealMemberRole, {
        isWorkspaceAdmin,
      }),
    [viewerDealMemberRole, isWorkspaceAdmin],
  )

  const canUploadEsignTemplates = useMemo(
    () => viewerCanUploadDealEsignTemplates(viewerDealMemberRole),
    [viewerDealMemberRole],
  )

  const canSendEsignTemplates = useMemo(
    () => viewerCanSendDealEsignTemplates(viewerDealMemberRole),
    [viewerDealMemberRole],
  )

  const canApproveFund = useMemo(
    () =>
      viewerCanApproveDealFund(viewerDealMemberRole, { isWorkspaceAdmin }),
    [viewerDealMemberRole, isWorkspaceAdmin],
  )

  const canEditDeal = useMemo(() => {
    if (dealDetailApi?.viewerCanEditDeal === false) return false
    return viewerCanEditDeal(viewerDealMemberRole)
  }, [dealDetailApi?.viewerCanEditDeal, viewerDealMemberRole])

  const [dealHasEsignDocuments, setDealHasEsignDocuments] = useState(false)

  const refreshDealEsignDocumentAvailability = useCallback(async () => {
    if (!dealId?.trim()) {
      setDealHasEsignDocuments(false)
      return
    }
    const result = await fetchDealEsignTemplates(dealId.trim())
    if (result.ok) setDealHasEsignDocuments(result.hasDocuments)
  }, [dealId])

  useEffect(() => {
    void refreshDealEsignDocumentAvailability()
  }, [refreshDealEsignDocumentAvailability])

  useEffect(() => {
    if (!dealId?.trim()) return
    const onTemplatesChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ dealId?: string }>).detail
      if (detail?.dealId && detail.dealId !== dealId.trim()) return
      void refreshDealEsignDocumentAvailability()
    }
    window.addEventListener(
      DEAL_ESIGN_TEMPLATES_CHANGED_EVENT,
      onTemplatesChanged,
    )
    return () =>
      window.removeEventListener(
        DEAL_ESIGN_TEMPLATES_CHANGED_EVENT,
        onTemplatesChanged,
      )
  }, [dealId, refreshDealEsignDocumentAvailability])

  const viewerDealInvestorRoleRaw = useMemo(
    () =>
      resolveViewerDealInvestorRoleRaw(
        memberRosterForTabs,
        sessionEmail,
        sessionUserId,
      ),
    [memberRosterForTabs, sessionEmail],
  )

  const dealsListBackPath = useMemo(() => {
    if (mode !== "investing") return "/deals"
    const returnTo = (
      location.state as { returnTo?: string } | null
    )?.returnTo?.trim()
    if (returnTo === "/investing/dashboard") return "/dashboard"
    return returnTo || "/investing/investments"
  }, [mode, location.state])

  const dealDetailTabsVisible = useMemo(
    () => DEAL_DETAIL_TABS.filter((t) => viewerDealTabIds.has(t.id)),
    [viewerDealTabIds],
  )

  useEffect(() => {
    if (dealDetailTabsVisible.length === 0) return
    if (!dealDetailTabsVisible.some((t) => t.id === activeTab))
      setActiveTab(dealDetailTabsVisible[0].id)
  }, [dealDetailTabsVisible, activeTab])

  useEffect(() => {
    const tabFromUrl = searchParams.get(DEAL_DETAIL_TAB_QUERY_PARAM)?.trim()
    if (!tabFromUrl || !dealDetailTabsVisible.some((t) => t.id === tabFromUrl))
      return
    setActiveTab((prev) => (prev === tabFromUrl ? prev : tabFromUrl))
  }, [searchParams, dealDetailTabsVisible])

  useEffect(() => {
    const extraUser = searchParams.get("extraCompanyUser")?.trim()
    const sessionId = searchParams.get("session_id")?.trim() ?? ""
    if (extraUser !== "success" || !sessionId) return
    const companyId = getSessionOrganizationCompanyId()?.trim() ?? ""
    if (!companyId) return
    let cancelled = false
    void syncExtraCompanyUserCheckout(companyId, sessionId).then((result) => {
      if (cancelled) return
      if (result.ok) {
        toast.success(
          "Extra company user paid",
          "You can save the additional team member now.",
        )
      }
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete("extraCompanyUser")
          next.delete("session_id")
          return next
        },
        { replace: true },
      )
    })
    return () => {
      cancelled = true
    }
  }, [searchParams, setSearchParams])

  const selectDealTab = useCallback(
    (tabId: string) => {
      setActiveTab(tabId)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set(DEAL_DETAIL_TAB_QUERY_PARAM, tabId)
          if (tabId !== "offering_details") next.delete(OFFERING_SECTION_QUERY_PARAM)
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  useEffect(() => {
    const section = searchParams.get(OFFERING_SECTION_QUERY_PARAM)
    if (!isOfferingDetailsSectionId(section)) return
    if (activeTab === "offering_details") return
    setActiveTab("offering_details")
  }, [searchParams, activeTab])

  useEffect(() => {
    const id = dealId?.trim() ?? ""
    if (!id) {
      setDeal(undefined)
      return
    }
    let cancelled = false
    setDeal(undefined)
    setDealDetailApi(null)
    setSaasPaywallDeal(null)
    setUpgradePromptDeal(null)
    void (async () => {
      try {
        const d = await fetchDealById(id)
        if (!cancelled) {
          if (mode === "investing") {
            await refreshInvestmentDealDocumentsPreview(d.id)
          } else {
            applyOfferingInvestorPreviewJsonFromServer(
              d.id,
              d.offeringInvestorPreviewJson,
            )
          }
          setDealDetailApi(d)
          setDeal(dealDetailApiToRecord(d))
          if (
            mode !== "investing" &&
            d.viewerIsLeadSponsor === true &&
            d.needsPlanUpgrade === true
          ) {
            const key = `sx-deal-upgrade-prompt:${d.id}`
            try {
              if (sessionStorage.getItem(key) !== "1") {
                setUpgradePromptDeal({
                  id: d.id,
                  dealName: d.dealName ?? "",
                  needsPlanUpgrade: true,
                  suggestedPlanId: d.suggestedPlanId ?? null,
                  billingPlanId: d.billingPlanId ?? d.listRow?.billingPlanId ?? null,
                  viewerIsLeadSponsor: true,
                })
              }
            } catch {
              setUpgradePromptDeal({
                id: d.id,
                dealName: d.dealName ?? "",
                needsPlanUpgrade: true,
                suggestedPlanId: d.suggestedPlanId ?? null,
                billingPlanId: d.billingPlanId ?? null,
                viewerIsLeadSponsor: true,
              })
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          if (mode !== "investing" && isDealSaasPaymentRequiredError(err)) {
            setSaasPaywallDeal({
              ...err.payload,
              id: err.payload.id || id,
            })
          }
          setDeal(null)
          setDealDetailApi(null)
        }
      }
    })()
    return () => {
      cancelled = true
      clearOfferingPreviewRuntime(id)
    }
  }, [dealId, mode])

  useEffect(() => {
    if (mode !== "investing" || !dealId?.trim()) {
      setInvestingOfferingLoading(false)
      return
    }
    let cancelled = false
    setInvestingOfferingLoading(true)
    setInvestingOfferingClasses([])
    setInvestingOfferingInvestors(EMPTY_INVESTORS_PAYLOAD)
    void (async () => {
      try {
        const id = dealId.trim()
        const [icResult, invResult] = await Promise.allSettled([
          fetchDealInvestorClasses(id),
          fetchDealInvestors(id),
        ])
        if (cancelled) return
        setInvestingOfferingClasses(
          icResult.status === "fulfilled" ? icResult.value : [],
        )
        setInvestingOfferingInvestors(
          invResult.status === "fulfilled"
            ? invResult.value
            : EMPTY_INVESTORS_PAYLOAD,
        )
      } finally {
        if (!cancelled) setInvestingOfferingLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mode, dealId])

  useEffect(() => {
    if (!dealId?.trim() || deal === undefined || deal === null) return
    const st = location.state as { investNow?: boolean } | null
    if (!st?.investNow) return
    switchToInvesting()
    navigate(dealInvestNowPath(dealId.trim()), { replace: true, state: null })
  }, [dealId, deal, location.state, navigate, switchToInvesting])

  useEffect(() => {
    if (!dealId) return
    if (deal === undefined) {
      setAppDocumentTitle("Deal")
      return
    }
    if (deal === null) {
      setAppDocumentTitle("Deal not found")
      return
    }
    const title =
      dealDetailApi?.dealName?.trim() || deal.title.trim() || "Deal"
    setAppDocumentTitle(title)
  }, [dealId, deal, dealDetailApi?.dealName])

  useEffect(() => {
    const el = document.getElementById(`deal-tab-${activeTab}`)
    if (!el) return
    el.scrollIntoView({
      behavior: "smooth",
      inline: "nearest",
      block: "nearest",
    })
  }, [activeTab])

  const displayName =
    dealDetailApi?.dealName?.trim() ||
    (deal !== undefined && deal !== null ? deal.title : "")
  const displayStage =
    deal !== undefined && deal !== null && dealDetailApi?.dealStage
      ? dealStageLabel(dealDetailApi.dealStage)
      : ""

  const dealFormIncomplete =
    dealDetailApi != null && isDealDetailFormIncomplete(dealDetailApi)

  const announcementTitle =
    dealDetailApi?.dealAnnouncementTitle?.trim() ?? ""
  const announcementMessage =
    dealDetailApi?.dealAnnouncementMessage?.trim() ?? ""
  const isDealDraftStage = isDealStageDraft(dealDetailApi?.dealStage)
  const isDealOfferingShareBlocked = isDealStageOfferingShareBlocked(
    dealDetailApi?.dealStage,
  )
  /** Stage chip already says Draft — avoid a second draft marker beside the title. */
  const showIncompleteDraftBadge = dealFormIncomplete && !isDealDraftStage

  const offeringLinkAvailable = useMemo(
    () => dealHasOfferingShareLink(dealDetailApi) && !isDealOfferingShareBlocked,
    [dealDetailApi, isDealOfferingShareBlocked],
  )

  const handleEditDeal = useCallback(() => {
    if (!dealId?.trim()) return
    const id = encodeURIComponent(dealId.trim())
    navigate(`/deals/create?edit=${id}&from=detail`)
  }, [dealId, navigate])

  const handleCopyMemberOfferingLink = useCallback(
    async (row: DealInvestorRow) => {
      if (
        !dealId?.trim() ||
        !dealDetailApi ||
        !dealHasOfferingShareLink(dealDetailApi) ||
        isDealOfferingShareBlocked
      )
        return
      try {
        const url = await buildDealOfferingPreviewShareUrl(dealId.trim(), {
          previewToken: dealDetailApi.offeringPreviewToken,
          sponsorContactId: row.contactId?.trim(),
        })
        await navigator.clipboard.writeText(url)
        toast.success(
          "Link copied",
          "The offering preview link was copied to your clipboard.",
        )
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Could not copy the offering link."
        toast.error("Could not copy link", msg)
      }
    },
    [dealId, dealDetailApi, isDealOfferingShareBlocked],
  )

  /** **Investors** tab: send eSign documents to this row’s email. */
  const handleSendInvestorEsign = useCallback(
    async (row: DealInvestorRow, fileIds: string[]) => {
      const email = row.userEmail?.trim()
      if (!isUsableInvestorEmail(email)) {
        toast.error("No email address", "This row has no email to send to.")
        return
      }
      if (!fileIds.length) {
        toast.error("No documents selected", "Choose at least one document to send.")
        return
      }
      if (!dealId) return
      const name = row.displayName?.trim()
      const result = await postDealInvestorSendEsign(dealId, {
        to_email: email!,
        member_display_name: name && name !== "—" ? name : undefined,
        roster_id: row.id?.trim(),
        file_ids: fileIds,
      })
      if (result.ok) {
        toast.success(
          "E-sign sent",
          "The eSign request was sent to this investor.",
        )
        setDealMembersRefreshKey((k) => k + 1)
        void dealInvestorsTabRef.current?.refetchInvestors()
      } else {
        toast.error("Could not send E-sign", result.message)
      }
    },
    [dealId],
  )

  /** **Investors** tab: email framed as an investor invite. */
  const handleSendInvestorInvitationMail = useCallback(
    async (row: DealInvestorRow) => {
      const email = row.userEmail?.trim()
      if (!isUsableInvestorEmail(email)) {
        toast.error("No email address", "This row has no email to send to.")
        return
      }
      if (!dealId) return
      const name = row.displayName?.trim()
      const result = await postDealMemberInvitationEmail(dealId, {
        to_email: email!,
        member_display_name: name && name !== "—" ? name : undefined,
        invitation_source: "investor",
        contact_member_id: row.contactId?.trim() || undefined,
      })
      if (result.ok) {
        setInvitationMailSentByRowId((prev) => ({
          ...prev,
          ...invitationMailSentOptimisticKeys(row),
        }))
        toast.success(
          "Invitation sent",
          "The investor invitation email was sent using your server email settings.",
        )
        setDealMembersRefreshKey((k) => k + 1)
        void dealInvestorsTabRef.current?.refetchInvestors()
      } else {
        toast.error("Could not send email", result.message)
      }
    },
    [dealId],
  )

  /** **Deal members** tab: email includes the row Role in subject/body. */
  const handleSendMemberInvitationMail = useCallback(
    async (row: DealInvestorRow) => {
      const email = row.userEmail?.trim()
      if (!isUsableInvestorEmail(email)) {
        toast.error("No email address", "This row has no email to send to.")
        return
      }
      if (!dealId) return
      const sendingKeys = invitationMailSentOptimisticKeys(row)
      setInvitationMailSendingByRowId((prev) => ({ ...prev, ...sendingKeys }))
      const name = row.displayName?.trim()
      try {
        const result = await postDealMemberInvitationEmail(dealId, {
          to_email: email!,
          member_display_name: name && name !== "—" ? name : undefined,
          invitation_source: "deal_member",
          deal_member_role: dealRowRoleLabelForInvitationEmail(row),
          contact_member_id: row.contactId?.trim() || undefined,
        })
        if (result.ok) {
          setInvitationMailSentByRowId((prev) => ({
            ...prev,
            ...sendingKeys,
          }))
          toast.success(
            "Invitation sent",
            "The deal invitation email was sent (with this row’s role) using your server email settings.",
          )
          setDealMembersRefreshKey((k) => k + 1)
          void dealInvestorsTabRef.current?.refetchInvestors()
        } else {
          toast.error("Could not send email", result.message)
        }
      } finally {
        setInvitationMailSendingByRowId((prev) =>
          omitInvitationMailKeys(prev, sendingKeys),
        )
      }
    },
    [dealId],
  )

  const handleDeleteMember = useCallback(
    async (row: DealInvestorRow) => {
      if (row.id === ADD_MEMBER_DRAFT_ROW_ID && dealId) {
        const draft = loadAddMemberDraft(dealId)
        const autosavedRosterId = draft?.backendInvestmentId?.trim()
        if (autosavedRosterId) {
          const del = await deleteDealMemberRoster(dealId, autosavedRosterId)
          if (!del.ok) {
            toast.error("Could not remove member", del.message)
            return
          }
        }
        clearAddMemberDraft(dealId)
        toast.success(
          "Draft removed",
          autosavedRosterId
            ? "The add-member draft and its autosaved roster entry were removed."
            : "The unsaved add-member draft was discarded.",
        )
        setDealMembersRefreshKey((k) => k + 1)
        void dealInvestorsTabRef.current?.refetchInvestors()
        return
      }
      if (!dealId?.trim()) return
      const result = await deleteDealMemberRoster(dealId, row.id)
      if (result.ok) {
        toast.success(
          "Member removed",
          "This member was removed from the deal.",
        )
        setDealMembersRefreshKey((k) => k + 1)
        void dealInvestorsTabRef.current?.refetchInvestors()
      } else {
        toast.error("Could not remove member", result.message)
      }
    },
    [dealId],
  )

  if (!dealId)
    return (
      <div className="deals_list_page deals_detail_page">
        <p className="deals_list_not_found">Missing deal.</p>
      </div>
    )

  if (deal === undefined)
    return <DealsPageCenteredLoader label="Loading deal…" />

  if (!deal)
    return (
      <div className="deals_list_page deals_detail_page">
        {saasPaywallDeal ? (
          <>
            <p className="deals_list_not_found">
              {saasPaywallDeal.dealName.trim()
                ? `Pay monthly SaaS (MRR) for “${saasPaywallDeal.dealName.trim()}” to continue.`
                : "Pay monthly SaaS (MRR) for this deal to continue."}{" "}
              <Link to={dealsListBackPath} className="deals_list_inline_back">
                <ArrowLeft size={18} strokeWidth={2} aria-hidden />
                Back to deals
              </Link>
            </p>
            <DealSaasPaywallModal
              deal={saasPaywallDeal}
              onClose={() => navigate(dealsListBackPath)}
            />
          </>
        ) : (
          <p className="deals_list_not_found">
            Deal not found.{" "}
            <Link to={dealsListBackPath} className="deals_list_inline_back">
              <ArrowLeft size={18} strokeWidth={2} aria-hidden />
              Back to deals
            </Link>
          </p>
        )}
      </div>
    )

  if (mode === "investing" && investingOfferingLoading)
    return <DealsPageCenteredLoader label="Loading deal…" />

  const showSyndicatingDealChrome = mode !== "investing"

  return (
    <div className="deals_list_page deals_detail_page">
      {showSyndicatingDealChrome ? (
      <div className="deals_detail_sticky_chrome">
      <header className="deals_list_head">
        <DealAnnouncementBanner
          title={announcementTitle}
          message={announcementMessage}
          variant="page"
        />
        <div className="deals_list_title_row">
          <Link
            className="deals_list_back_circle"
            to={dealsListBackPath}
            aria-label="Back to deals"
          >
            <ArrowLeft size={20} strokeWidth={2} aria-hidden />
          </Link>
          <div className="deals_detail_title_stack">
            <div className="deals_list_name_with_draft deals_detail_title_name_block">
              <h1 className="deals_list_title">{displayName}</h1>
              {showIncompleteDraftBadge ? (
                <span
                  className="deals_list_draft_badge"
                  title="Deal details are incomplete or not finalized"
                >
                  Draft
                </span>
              ) : null}
            </div>
            {displayStage ? (
              <span
                className={dealStageChipCompactClassName(dealDetailApi?.dealStage)}
              >
                {displayStage}
              </span>
            ) : null}
          </div>
          {canEditDeal ? (
          <button
            type="button"
            className="um_btn_secondary deals_detail_edit_deal_btn"
            onClick={handleEditDeal}
          >
            <Pencil size={16} strokeWidth={2} aria-hidden />
            {dealFormIncomplete ? "Continue editing" : "Edit deal"}
          </button>
          ) : null}
        </div>
      </header>

      <div className="um_members_tabs_outer deals_tabs_outer um_segmented_tabs_outer">
        <TabsScrollStrip scrollClassName="deals_tabs_scroll um_segmented_tabs_scroll">
          <div
            className="um_members_tabs_row deals_tabs_row um_segmented_tabs_row"
            role="tablist"
            aria-label="Deal sections"
          >
            {dealDetailTabsVisible.map((tab) => {
              const isActive = activeTab === tab.id
              const TabIcon = tab.icon
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls="deal-detail-tabpanel"
                  id={`deal-tab-${tab.id}`}
                  className={`um_members_tab deals_tabs_tab um_segmented_tab${
                    isActive ? " um_members_tab_active" : ""
                  }`}
                  onClick={() => {
                    selectDealTab(tab.id)
                    if (tab.id === "investors") {
                      setDealMembersRefreshKey((k) => k + 1)
                    }
                  }}
                >
                  <TabIcon
                    className="deals_tabs_icon um_segmented_tab_icon"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span className="deals_tabs_label um_segmented_tab_label">
                    {tab.label}
                  </span>
                </button>
              )
            })}
          </div>
        </TabsScrollStrip>
      </div>
      </div>
      ) : null}

      {mode === "investing" && dealDetailApi ? (
        <>
          <LpDealDetailsPage
            deal={dealDetailApi}
            classes={investingOfferingClasses}
            investorsPayload={investingOfferingInvestors}
            onInvestNow={openInvestNow}
            backTo={dealsListBackPath}
            viewerRoleLabel={viewerDealInvestorRoleRaw}
          />
        </>
      ) : null}

      {showSyndicatingDealChrome ? (
        <>
      <div
        className={
          activeTab === "deal_members"
            ? "um_members_tab_content deal_members_tab"
            : "um_members_tab_content"
        }
      >
        <div
          id="deal-detail-tabpanel"
          className="deal_detail_tab_panel"
          role="tabpanel"
          aria-labelledby={`deal-tab-${activeTab}`}
        >
        {activeTab === "investors" || activeTab === "deal_members" ? (
          <>
            {activeTab === "deal_members" ? (
              <DealMembersTab
                dealId={dealId}
                dealName={displayName}
                offeringLinkAvailable={offeringLinkAvailable}
                offeringLinkBlockedBecauseDraft={isDealOfferingShareBlocked}
                addInvestmentOpen={addInvestmentOpen}
                sharedInvestmentModalOpen={sharedInvestmentModalOpen}
                investorsRefreshKey={dealMembersRefreshKey}
                invitationMailStatusByRowId={invitationMailSentByRowId}
                invitationMailSendingByRowId={invitationMailSendingByRowId}
                onAddMember={(kind) => {
                  setInvestmentModalEntry(
                    dealInvestmentModalEntryFromRosterKind(kind),
                  )
                  setRestoreAddMemberSessionDraft(false)
                  setAddInvestmentOpen(true)
                }}
                onEditMember={(row: DealInvestorRow) => {
                  setInvestmentModalEntry(
                    dealInvestmentModalEntryFromRosterKind(
                      dealRosterKindFromRole(row.investorRole),
                    ),
                  )
                  if (row.id === ADD_MEMBER_DRAFT_ROW_ID) {
                    setRestoreAddMemberSessionDraft(true)
                    setAddInvestmentOpen(true)
                    return
                  }
                  dealInvestorsTabRef.current?.openEditInvestor(row)
                }}
                onCopyMemberOfferingLink={handleCopyMemberOfferingLink}
                onSendMemberInvitationMail={handleSendMemberInvitationMail}
                onDeleteMember={handleDeleteMember}
                onViewMember={(row) => {
                  dealInvestorsTabRef.current?.openViewInvestor(row)
                }}
              />
            ) : null}
            <DealInvestorsTab
              ref={dealInvestorsTabRef}
              dealId={dealId}
              dealName={displayName}
              dealDetail={dealDetailApi}
              investorsListRefreshKey={dealMembersRefreshKey}
              addInvestmentOpen={addInvestmentOpen}
              onSharedInvestmentModalOpenChange={setSharedInvestmentModalOpen}
              modalOnly={activeTab === "deal_members"}
              onAddInvestmentClose={() => setAddInvestmentOpen(false)}
              onOpenFullInvestmentModal={() => {
                setInvestmentModalEntry("investor")
                setRestoreAddMemberSessionDraft(true)
                setAddInvestmentOpen(true)
              }}
              addInvestmentEntry={
                activeTab === "investors"
                  ? "investor"
                  : investmentModalEntry
              }
              restoreAddMemberSessionDraft={restoreAddMemberSessionDraft}
              onInvestorsChanged={() =>
                setDealMembersRefreshKey((k) => k + 1)
              }
              onSendInvitationMail={handleSendInvestorInvitationMail}
              onSendEsignConfirm={
                canSendEsignTemplates ? handleSendInvestorEsign : undefined
              }
              sendEsignDisabled={
                canSendEsignTemplates && !dealHasEsignDocuments
              }
              sendEsignDisabledTitle="Upload at least one document on the eSign Templates tab before sending."
              canApproveFund={canApproveFund}
              onCopyOfferingLink={handleCopyMemberOfferingLink}
              onDeleteMember={handleDeleteMember}
              offeringLinkAvailable={offeringLinkAvailable}
              offeringLinkBlockedBecauseDraft={isDealOfferingShareBlocked}
              invitationMailStatusByRowId={invitationMailSentByRowId}
              viewerDealMemberRole={viewerDealMemberRole}
              dealMembersRoster={memberRosterForTabs}
            />
          </>
        ) : activeTab === "offering_details" && dealDetailApi ? (
          <DealOfferingDetailsTab
            detail={dealDetailApi}
            onDealUpdated={handleDealPersisted}
            viewerDealMemberRole={viewerDealMemberRole}
          />
        ) : activeTab === "documents" && dealDetailApi ? (
          <DealDocumentsTab
            dealId={dealDetailApi.id}
            dealName={displayName}
            offeringInvestorPreviewJson={dealDetailApi.offeringInvestorPreviewJson}
            investorsListRefreshKey={dealMembersRefreshKey}
            viewerDealMemberRole={viewerDealMemberRole}
            onOfferingPreviewSynced={handleDealPersisted}
          />
        ) : activeTab === "esign_templates" ? (
          <DealEsignTemplatesTab
            dealId={dealId}
            offeringInvestorPreviewJson={dealDetailApi?.offeringInvestorPreviewJson}
            dealStage={dealDetailApi?.dealStage}
            offeringStatus={dealDetailApi?.offeringStatus}
            canUploadDocuments={canUploadEsignTemplates}
          />
        ) : activeTab === "investor_communication" && dealId?.trim() ? (
          <InvestorCommunicationTab dealId={dealId.trim()} />
        ) : activeTab === "distributions" && dealId?.trim() ? (
          <DistributionsTab
            dealId={dealId.trim()}
            dealName={
              dealDetailApi?.dealName?.trim() ||
              deal?.title?.trim() ||
              undefined
            }
          />
        ) : (
          <div className="deal_detail_wip_wrap" role="status">
            <p className="deal_detail_wip_title">Working in progress</p>
            <p className="deal_detail_wip_hint">
              There is no content here yet. Check back soon or complete the
              related details in your workflow.
            </p>
          </div>
        )}
        </div>
      </div>
        </>
      ) : null}
      <DealSaasPaywallModal
        deal={upgradePromptDeal}
        onClose={() => {
          const id = upgradePromptDeal?.id?.trim()
          if (id) {
            try {
              sessionStorage.setItem(`sx-deal-upgrade-prompt:${id}`, "1")
            } catch {
              /* ignore */
            }
          }
          setUpgradePromptDeal(null)
        }}
      />
    </div>
  )
}
