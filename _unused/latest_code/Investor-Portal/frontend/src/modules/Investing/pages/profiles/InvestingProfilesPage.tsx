import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { FilePenLine, IdCard, Landmark, MapPin, Plus, Users } from "lucide-react"
import {
  AvatarInitialsRing,
  EntityAvatarNameCell,
} from "@/common/components/entity-avatar/EntityAvatarNameCell"
import { ActiveArchivedTabs } from "@/common/components/active-archived-tabs/ActiveArchivedTabs"
import { TabsScrollStrip } from "@/common/components/tabs-scroll-strip/TabsScrollStrip"
import { toast } from "@/common/components/Toast"
import {
  DataTable,
  type DataTableColumn,
} from "@/common/components/data-table/DataTable"
import {
  AddBeneficiaryModal,
  type BeneficiaryDraft,
} from "./AddBeneficiaryModal"
import { ExportAddressesModal } from "./ExportAddressesModal"
import { ExportBeneficiariesModal } from "./ExportBeneficiariesModal"
import { ExportInvestorProfilesModal } from "./ExportInvestorProfilesModal"
import { AddAddressModal } from "./AddAddressModal"
import { formatSavedAddressLabel, type AddressFormDraft, type SavedAddress } from "./address.types"
import { COUNTRY_OPTIONS, US_STATE_OPTIONS } from "./usStates"
import {
  formatUsPhoneStoredForUi,
  nationalDigitsFromStoredPhone,
} from "@/common/phone/usPhoneNumber"
import { DEALS_LIST_REFETCH_EVENT } from "@/modules/Syndication/Deals/createDealFormDraftStorage"
import {
  ADD_PROFILE_DRAFT_UPDATED_EVENT,
  PROFILE_BOOK_REFETCH_EVENT,
  clearAddProfileDraft,
  loadAddProfileDraft,
} from "./addProfileFormDraftStorage"
import {
  ADD_PROFILE_DRAFT_ROW_ID,
  buildAddProfileDraftListRow,
  isInvestorProfileListRowIncomplete,
} from "./addProfileDraftListRow"
import { getMergedInvestmentListRows } from "../investments/investmentsRuntimeData"
import type { InvestmentListRow } from "../investments/investments.types"
import {
  fetchMyProfileBook,
  deleteInvestorProfile,
  patchBeneficiaryArchived,
  patchInvestorProfileArchived,
  patchSavedAddressArchived,
  postBeneficiary,
  postSavedAddress,
  putBeneficiary,
  putSavedAddress,
} from "./investingProfileBookApi"
import {
  exportBeneficiaryRow,
  exportInvestorProfileRow,
  exportSavedAddressRow,
} from "./investingProfileBookExport"
import { InvestingEntityViewModal } from "./InvestingEntityViewModal"
import {
  buildInvestorProfileViewDescription,
  buildInvestorProfileViewSections,
} from "./investorProfileViewDetails"
import type { InvestorProfileListRow } from "./investor-profiles.types"
import { bookProfileTypeDisplayLabel } from "@/modules/Syndication/Deals/utils/resolveInvestNowDealContext"
import {
  fetchInvestmentCountsByUserInvestorProfileId,
  mergeInvestorProfileRowsWithLinkedCounts,
} from "./profileInvestmentCounts"
import {
  buildBankAccountTableRows,
  InvestingBankAccountsTab,
} from "./InvestingBankAccountsTab"
import { ProfileBankSelect } from "./ProfileBankSelect"
import { InvestingProfilesRowActions } from "./InvestingProfilesRowActions"
import { InvestingProfilesTableToolbar } from "./InvestingProfilesTableToolbar"
import {
  attachStripeConnectBankToProfile,
  fetchInvestorSharedConnectBanks,
  fetchStripeConnectRecipientStatus,
  startStripeConnectRecipientOnboarding,
  type InvestorSharedConnectBank,
  type StripeConnectRecipientStatus,
} from "@/modules/Investing/api/stripeInvestorPaymentsApi"
import "@/modules/Syndication/usermanagement/user_management.css"
import "@/modules/Syndication/Deals/deals-list.css"
import "@/modules/Syndication/Deals/deal-investors-tab.css"
import "@/modules/Syndication/contacts/contacts.css"
import "./investing-profiles.css"

type ProfilesTab = "my-profiles" | "bank-accounts" | "beneficiaries" | "addresses"
type ListStatusTab = "active" | "archived"

type BeneficiaryListRow = BeneficiaryDraft & { id: string; archived?: boolean }

type ViewModalState =
  | { kind: "profile"; row: InvestorProfileListRow }
  | { kind: "beneficiary"; row: BeneficiaryListRow }
  | { kind: "address"; row: SavedAddress }
  | null

function formatProfileListDate(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return "—"
  return new Date(t).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

/** Column widths for fixed-layout profile tables (keep name column readable). */
const PROFILES_TABLE_COL_WIDTH = {
  profileName: "16rem",
  profileType: "17rem",
  addedBy: "9rem",
  investments: "6.5rem",
  bankAccount: "12rem",
  dateCreated: "8.5rem",
  beneficiaryName: "12rem",
  relationship: "8rem",
  email: "11rem",
  phone: "8rem",
  address: "14rem",
  addressName: "11rem",
  actions: "5rem",
} as const

function formatProfileBankCell(
  status: StripeConnectRecipientStatus | undefined,
): string {
  if (!status) return "—"
  const bank = status.bankAccount
  if (bank?.bankName || bank?.last4) {
    const parts = [
      bank.bankName?.trim() || null,
      bank.last4 ? `···· ${bank.last4}` : null,
    ].filter(Boolean)
    return parts.join(" ")
  }
  if (status.payoutsEnabled) return "Ready"
  if (status.accountId) return "Setup pending"
  return "Not added"
}

function ProfileListNameCell({
  row,
  resumeHref,
  onView,
}: {
  row: InvestorProfileListRow
  resumeHref?: string
  onView: () => void
}) {
  const isIncomplete = isInvestorProfileListRowIncomplete(row)
  const nameLink = resumeHref ? (
    <Link className="deals_table_name_link investing_profiles_name_text" to={resumeHref}>
      {row.profileName?.trim() || "—"}
    </Link>
  ) : (
    <button
      type="button"
      className="deals_table_name_link investing_profiles_name_text um_user_meta_username"
      onClick={onView}
    >
      {row.profileName?.trim() || "—"}
    </button>
  )

  return (
    <div className="um_user_cell investing_profiles_name_cell">
      <AvatarInitialsRing name={row.profileName?.trim() || "?"} />
      <div className="um_user_meta investing_profiles_name_meta">
        <div
          className={[
            "investing_profiles_name_primary",
            isIncomplete ? "deals_list_name_with_draft" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {nameLink}
          {isIncomplete ? (
            <span
              className="deals_list_draft_icon deals_list_draft_icon--draft"
              title="Incomplete draft"
            >
              <FilePenLine size={14} strokeWidth={2} aria-hidden />
              <span className="deals_list_sr_only">Draft</span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/**
 * LP investing shell: `/investing/profiles` — profiles, beneficiaries, and saved addresses.
 */
export default function InvestingProfilesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const hideAddProfileDraftRow = location.pathname === "/investing/profiles/add"
  const [activeTab, setActiveTab] = useState<ProfilesTab>("my-profiles")
  const [bankSetupBusy, setBankSetupBusy] = useState(false)
  const [banksLoading, setBanksLoading] = useState(false)
  const [assignBusyId, setAssignBusyId] = useState<string | null>(null)
  const stripeReturnKeyRef = useRef<string | null>(null)
  const [addBenOpen, setAddBenOpen] = useState(false)
  const [addAddressOpen, setAddAddressOpen] = useState(false)
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([])
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryListRow[]>([])
  const [profiles, setProfiles] = useState<InvestorProfileListRow[]>([])
  const [mergedInvRows, setMergedInvRows] = useState<InvestmentListRow[]>([])
  /** One deal commitment per `userInvestorProfileId` from the deals API; not from collapsed list rows. */
  const [investmentCountByProfileId, setInvestmentCountByProfileId] = useState<
    ReadonlyMap<string, number> | null
  >(null)
  const [query, setQuery] = useState("")
  const [beneQuery, setBeneQuery] = useState("")
  const [addrQuery, setAddrQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [benePage, setBenePage] = useState(1)
  const [benePageSize, setBenePageSize] = useState(10)
  const [addrPage, setAddrPage] = useState(1)
  const [addrPageSize, setAddrPageSize] = useState(10)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportBeneModalOpen, setExportBeneModalOpen] = useState(false)
  const [exportAddrModalOpen, setExportAddrModalOpen] = useState(false)
  const [profilesStatusTab, setProfilesStatusTab] = useState<ListStatusTab>("active")
  const [beneStatusTab, setBeneStatusTab] = useState<ListStatusTab>("active")
  const [addrStatusTab, setAddrStatusTab] = useState<ListStatusTab>("active")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [bookLoading, setBookLoading] = useState(true)
  const [viewModal, setViewModal] = useState<ViewModalState>(null)
  const [editBeneficiary, setEditBeneficiary] = useState<BeneficiaryListRow | null>(null)
  const [editingAddress, setEditingAddress] = useState<SavedAddress | null>(null)
  const [addProfileDraftTick, setAddProfileDraftTick] = useState(0)
  const [connectByProfileId, setConnectByProfileId] = useState<
    Record<string, StripeConnectRecipientStatus>
  >({})
  const [sharedBanks, setSharedBanks] = useState<InvestorSharedConnectBank[]>(
    [],
  )

  const loadSharedBanks = useCallback(async () => {
    setBanksLoading(true)
    try {
      const banks = await fetchInvestorSharedConnectBanks()
      setSharedBanks(banks)
      return banks
    } catch (err) {
      console.error("loadSharedBanks:", err)
      setSharedBanks([])
      toast.error(
        "Could not load bank accounts",
        err instanceof Error ? err.message : "Please refresh and try again.",
      )
      return [] as InvestorSharedConnectBank[]
    } finally {
      setBanksLoading(false)
    }
  }, [])

  const loadConnectStatuses = useCallback(async (rows: InvestorProfileListRow[]) => {
    const ids = rows
      .filter(
        (r) =>
          r.id !== ADD_PROFILE_DRAFT_ROW_ID &&
          !isInvestorProfileListRowIncomplete(r) &&
          !r.archived,
      )
      .map((r) => r.id)
    if (ids.length === 0) {
      setConnectByProfileId({})
      await loadSharedBanks()
      return
    }
    const entries = await Promise.all(
      ids.map(async (id) => {
        try {
          const status = await fetchStripeConnectRecipientStatus(id)
          return [id, status] as const
        } catch {
          return null
        }
      }),
    )
    const next: Record<string, StripeConnectRecipientStatus> = {}
    for (const entry of entries) {
      if (entry) next[entry[0]] = entry[1]
    }
    setConnectByProfileId(next)
    await loadSharedBanks()
  }, [loadSharedBanks])

  const reloadProfileBook = useCallback(async () => {
    try {
      const book = await fetchMyProfileBook()
      setProfiles(book.profiles)
      setBeneficiaries(book.beneficiaries)
      setSavedAddresses(book.addresses)
      await loadConnectStatuses(book.profiles)
    } catch {
      // keep prior rows
    }
  }, [loadConnectStatuses])

  const resolveBankHostProfileId = useCallback(
    (opts?: { preferWithoutBank?: boolean; accountId?: string }) => {
      const active = profiles.filter(
        (r) =>
          r.id !== ADD_PROFILE_DRAFT_ROW_ID &&
          !isInvestorProfileListRowIncomplete(r) &&
          !r.archived,
      )
      if (active.length === 0) return null
      if (opts?.accountId) {
        const linked = active.find((r) =>
          sharedBanks.some(
            (b) =>
              b.accountId === opts.accountId && b.profileIds.includes(r.id),
          ),
        )
        if (linked) return linked.id
        const fromBank = sharedBanks.find((b) => b.accountId === opts.accountId)
        if (fromBank?.profileIds[0]) return fromBank.profileIds[0]
      }
      if (opts?.preferWithoutBank) {
        const without = active.find((r) => !connectByProfileId[r.id]?.accountId)
        if (without) return without.id
      }
      return active[0].id
    },
    [profiles, sharedBanks, connectByProfileId],
  )

  const startPayoutOnboarding = useCallback(
    async (profileId: string, opts?: { forceNew?: boolean }) => {
      setBankSetupBusy(true)
      try {
        const link = await startStripeConnectRecipientOnboarding(profileId, opts)
        window.location.assign(link.url)
      } catch (err) {
        setBankSetupBusy(false)
        toast.error(
          "Could not start bank setup",
          err instanceof Error ? err.message : "Please try again.",
        )
      }
    },
    [],
  )

  const startBankSetupFromTab = useCallback(
    async (opts?: { forceNew?: boolean; accountId?: string }) => {
      const profileId = resolveBankHostProfileId({
        preferWithoutBank: !opts?.forceNew && !opts?.accountId,
        accountId: opts?.accountId,
      })
      if (!profileId) {
        toast.error(
          "Add a profile first",
          "Create an investor profile before adding a bank account.",
        )
        return
      }
      await startPayoutOnboarding(profileId, { forceNew: opts?.forceNew })
    },
    [resolveBankHostProfileId, startPayoutOnboarding],
  )

  const assignBankToProfile = useCallback(
    async (profileId: string, value: string) => {
      const next = value.trim()
      if (!next) return
      const current = connectByProfileId[profileId]?.accountId?.trim() || ""
      if (current === next) return
      setAssignBusyId(profileId)
      try {
        const status = await attachStripeConnectBankToProfile(profileId, next)
        setConnectByProfileId((prev) => ({ ...prev, [profileId]: status }))
        await loadSharedBanks()
        toast.success(
          "Bank selected",
          "This profile will use the selected bank for ACH distributions.",
        )
      } catch (err) {
        toast.error(
          "Could not select bank",
          err instanceof Error ? err.message : "Please try again.",
        )
      } finally {
        setAssignBusyId(null)
      }
    },
    [connectByProfileId, loadSharedBanks],
  )

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const connectReturn = params.get("stripe_connect")
    const profileId = params.get("profile_id")?.trim() ?? ""
    if (!connectReturn || !profileId) return
    const returnKey = `${connectReturn}:${profileId}:${location.search}`
    if (stripeReturnKeyRef.current === returnKey) return
    stripeReturnKeyRef.current = returnKey
    setActiveTab("bank-accounts")
    void (async () => {
      if (connectReturn === "refresh") {
        try {
          const link = await startStripeConnectRecipientOnboarding(profileId)
          window.location.assign(link.url)
          return
        } catch (err) {
          toast.error(
            "Bank setup needs attention",
            err instanceof Error ? err.message : "Please restart bank setup.",
          )
        }
      } else {
        try {
          const status = await fetchStripeConnectRecipientStatus(profileId)
          setConnectByProfileId((prev) => ({ ...prev, [profileId]: status }))
          const bankLabel = formatProfileBankCell(status)
          if (status.payoutsEnabled) {
            const sharedCount = status.sharedToProfileCount ?? 0
            toast.success(
              "Bank account ready",
              [
                bankLabel !== "—" &&
                bankLabel !== "Ready" &&
                bankLabel !== "Not added" &&
                bankLabel !== "Bank account on file"
                  ? bankLabel
                  : null,
                "ACH distributions can use this bank.",
                sharedCount > 0
                  ? `Also linked to ${sharedCount} other profile${sharedCount === 1 ? "" : "s"} without a bank.`
                  : "Choose this bank on any profile that should receive ACH.",
              ]
                .filter(Boolean)
                .join(" "),
            )
          } else {
            toast.warning(
              "Bank setup pending",
              bankLabel !== "—" && bankLabel !== "Not added"
                ? `${bankLabel}. Finish any remaining Stripe steps if prompted.`
                : "Finish adding your bank details before ACH distributions can be received.",
            )
          }
        } catch (err) {
          toast.error(
            "Could not verify bank setup",
            err instanceof Error ? err.message : "Please try again.",
          )
        }
      }
      await reloadProfileBook()
      void navigate("/investing/profiles", { replace: true })
    })()
  }, [location.search, navigate, reloadProfileBook])

  useEffect(() => {
    if (activeTab !== "bank-accounts") return
    void loadSharedBanks()
  }, [activeTab, loadSharedBanks])

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    setBookLoading(true)
    void (async () => {
      try {
        const [book, inv, byProfile] = await Promise.all([
          fetchMyProfileBook(),
          getMergedInvestmentListRows().catch((): InvestmentListRow[] => []),
          fetchInvestmentCountsByUserInvestorProfileId().catch(
            (): ReadonlyMap<string, number> => new Map(),
          ),
        ])
        if (cancelled) return
        setProfiles(book.profiles)
        setMergedInvRows(inv)
        setInvestmentCountByProfileId(byProfile)
        setBeneficiaries(book.beneficiaries)
        setSavedAddresses(book.addresses)
        void loadConnectStatuses(book.profiles)
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error
              ? e.message
              : "Could not load your profile data. Check that you are signed in.",
          )
        }
      } finally {
        if (!cancelled) setBookLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadConnectStatuses])

  useEffect(() => {
    function onDealsListRefetch() {
      void (async () => {
        try {
          const [inv, byProfile] = await Promise.all([
            getMergedInvestmentListRows(),
            fetchInvestmentCountsByUserInvestorProfileId(),
          ])
          setMergedInvRows(inv)
          setInvestmentCountByProfileId(byProfile)
        } catch {
          // keep prior merged rows; profile book API may still have counts
        }
      })()
    }
    window.addEventListener(DEALS_LIST_REFETCH_EVENT, onDealsListRefetch)
    return () => {
      window.removeEventListener(DEALS_LIST_REFETCH_EVENT, onDealsListRefetch)
    }
  }, [])

  useEffect(() => {
    function onProfileDraftUpdated() {
      setAddProfileDraftTick((t) => t + 1)
    }
    function onProfileBookRefetch() {
      reloadProfileBook()
    }
    window.addEventListener(ADD_PROFILE_DRAFT_UPDATED_EVENT, onProfileDraftUpdated)
    window.addEventListener(PROFILE_BOOK_REFETCH_EVENT, onProfileBookRefetch)
    return () => {
      window.removeEventListener(
        ADD_PROFILE_DRAFT_UPDATED_EVENT,
        onProfileDraftUpdated,
      )
      window.removeEventListener(PROFILE_BOOK_REFETCH_EVENT, onProfileBookRefetch)
    }
  }, [reloadProfileBook])

  const profilesDisplay = useMemo(
    () =>
      mergeInvestorProfileRowsWithLinkedCounts(
        profiles,
        mergedInvRows,
        investmentCountByProfileId,
      ),
    [profiles, mergedInvRows, investmentCountByProfileId],
  )

  const addBeneficiary = useCallback(
    (b: BeneficiaryDraft) => {
      const id = editBeneficiary?.id
      void (async () => {
        try {
          if (id) {
            const row = await putBeneficiary(id, b)
            setBeneficiaries((prev) => prev.map((x) => (x.id === row.id ? row : x)))
            toast.success("Beneficiary updated", "Your changes were saved.")
          } else {
            const row = await postBeneficiary(b)
            setBeneficiaries((prev) => [row, ...prev])
            toast.success("Beneficiary added", "Your beneficiary was saved.")
          }
        } catch (e) {
          toast.error(
            "Could not save beneficiary",
            e instanceof Error ? e.message : "Please try again.",
          )
        }
      })()
    },
    [editBeneficiary],
  )

  const addressInitialDraft = useMemo((): AddressFormDraft | null => {
    if (!editingAddress) return null
    return {
      fullNameOrCompany: editingAddress.fullNameOrCompany,
      country: editingAddress.country,
      street1: editingAddress.street1,
      street2: editingAddress.street2,
      city: editingAddress.city,
      state: editingAddress.state,
      zip: editingAddress.zip,
      checkMemo: editingAddress.checkMemo,
      distributionNote: editingAddress.distributionNote,
    }
  }, [editingAddress])

  const addAddress = useCallback(
    (a: AddressFormDraft) => {
      const addrId = editingAddress?.id
      void (async () => {
        try {
          if (addrId) {
            const row = await putSavedAddress(addrId, a)
            setSavedAddresses((prev) => prev.map((x) => (x.id === row.id ? row : x)))
            toast.success("Address updated", "Your changes were saved.")
          } else {
            const row = await postSavedAddress(a)
            setSavedAddresses((prev) => [row, ...prev])
            toast.success("Address added", "Your address was saved.")
          }
        } catch (e) {
          toast.error(
            "Could not save address",
            e instanceof Error ? e.message : "Please try again.",
          )
        }
      })()
    },
    [editingAddress],
  )

  const setProfileArchived = useCallback(async (id: string, archived: boolean) => {
    try {
      const row = await patchInvestorProfileArchived(id, archived)
      setProfiles((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...row, archived } : p)),
      )
      setProfilesStatusTab(archived ? "archived" : "active")
    } catch (e) {
      toast.error(
        "Could not update profile",
        e instanceof Error ? e.message : "Please try again.",
      )
      throw e
    }
  }, [])

  const deleteProfile = useCallback(async (row: InvestorProfileListRow) => {
    if (row.id === ADD_PROFILE_DRAFT_ROW_ID) {
      clearAddProfileDraft()
      return
    }
    try {
      await deleteInvestorProfile(row.id)
      setProfiles((prev) => prev.filter((p) => p.id !== row.id))
      setViewModal((cur) =>
        cur?.kind === "profile" && cur.row.id === row.id ? null : cur,
      )
    } catch (e) {
      toast.error(
        "Could not delete profile",
        e instanceof Error ? e.message : "Please try again.",
      )
      throw e
    }
  }, [])

  const setBeneficiaryArchived = useCallback(async (id: string, archived: boolean) => {
    try {
      const row = await patchBeneficiaryArchived(id, archived)
      setBeneficiaries((prev) => prev.map((b) => (b.id === id ? row : b)))
      setBeneStatusTab(archived ? "archived" : "active")
    } catch (e) {
      toast.error(
        "Could not update beneficiary",
        e instanceof Error ? e.message : "Please try again.",
      )
      throw e
    }
  }, [])

  const setAddressArchived = useCallback(async (id: string, archived: boolean) => {
    try {
      const row = await patchSavedAddressArchived(id, archived)
      setSavedAddresses((prev) => prev.map((a) => (a.id === id ? row : a)))
      setAddrStatusTab(archived ? "archived" : "active")
    } catch (e) {
      toast.error(
        "Could not update address",
        e instanceof Error ? e.message : "Please try again.",
      )
      throw e
    }
  }, [])

  const benInitialDraft = useMemo((): BeneficiaryDraft | null => {
    if (!editBeneficiary) return null
    return {
      fullName: editBeneficiary.fullName,
      relationship: editBeneficiary.relationship,
      taxId: editBeneficiary.taxId,
      phone: editBeneficiary.phone,
      email: editBeneficiary.email,
      addressQuery: editBeneficiary.addressQuery,
    }
  }, [editBeneficiary])

  const profileActiveCount = useMemo(
    () => profiles.filter((p) => !p.archived).length,
    [profiles],
  )
  const profileArchivedCount = useMemo(
    () => profiles.filter((p) => p.archived).length,
    [profiles],
  )
  const beneActiveCount = useMemo(
    () => beneficiaries.filter((b) => !b.archived).length,
    [beneficiaries],
  )
  const beneArchivedCount = useMemo(
    () => beneficiaries.filter((b) => b.archived).length,
    [beneficiaries],
  )
  const addrActiveCount = useMemo(
    () => savedAddresses.filter((a) => !a.archived).length,
    [savedAddresses],
  )
  const addrArchivedCount = useMemo(
    () => savedAddresses.filter((a) => a.archived).length,
    [savedAddresses],
  )

  const profilesByStatus = useMemo(() => {
    return profilesStatusTab === "archived"
      ? profilesDisplay.filter((p) => p.archived)
      : profilesDisplay.filter((p) => !p.archived)
  }, [profilesDisplay, profilesStatusTab])

  const filteredProfiles = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [...profilesByStatus]
    return profilesByStatus.filter((r) => {
      const dateLabel = formatProfileListDate(r.dateCreated).toLowerCase()
      return (
        (r.profileName ?? "").toLowerCase().includes(q) ||
        bookProfileTypeDisplayLabel(r).toLowerCase().includes(q) ||
        (r.profileType ?? "").toLowerCase().includes(q) ||
        (r.addedBy ?? "").toLowerCase().includes(q) ||
        String(r.investmentsCount).includes(q) ||
        dateLabel.includes(q)
      )
    })
  }, [query, profilesByStatus])

  const sessionAddProfileDraftRow = useMemo((): InvestorProfileListRow | null => {
    void addProfileDraftTick
    return buildAddProfileDraftListRow(profilesDisplay)
  }, [addProfileDraftTick, profilesDisplay])

  const displayProfiles = useMemo(() => {
    const base = filteredProfiles
    if (
      activeTab !== "my-profiles" ||
      profilesStatusTab !== "active" ||
      hideAddProfileDraftRow ||
      !sessionAddProfileDraftRow
    ) {
      return base
    }
    const q = query.trim().toLowerCase()
    if (
      q &&
      !(sessionAddProfileDraftRow.profileName ?? "").toLowerCase().includes(q)
    ) {
      return base
    }
    const sessionBackendId = loadAddProfileDraft()?.backendProfileId?.trim()
    const withoutApiDuplicate =
      sessionBackendId != null && sessionBackendId !== ""
        ? base.filter((r) => r.id !== sessionBackendId)
        : base
    return [sessionAddProfileDraftRow, ...withoutApiDuplicate]
  }, [
    filteredProfiles,
    activeTab,
    profilesStatusTab,
    hideAddProfileDraftRow,
    sessionAddProfileDraftRow,
    query,
  ])

  useEffect(() => {
    setPage(1)
  }, [query, profiles.length, profilesStatusTab])

  useEffect(() => {
    const totalPages = Math.max(
      1,
      Math.ceil(displayProfiles.length / pageSize),
    )
    if (page > totalPages) setPage(totalPages)
  }, [displayProfiles.length, pageSize, page])

  const profilesPagination = useMemo(
    () => ({
      page,
      pageSize,
      totalItems: displayProfiles.length,
      onPageChange: setPage,
      onPageSizeChange: (n: number) => {
        setPageSize(n)
        setPage(1)
      },
      ariaLabel: "Profiles table pagination",
    }),
    [page, pageSize, displayProfiles.length],
  )

  const beneficiariesByStatus = useMemo(() => {
    return beneStatusTab === "archived"
      ? beneficiaries.filter((b) => b.archived)
      : beneficiaries.filter((b) => !b.archived)
  }, [beneficiaries, beneStatusTab])

  const filteredBeneficiaries = useMemo(() => {
    const q = beneQuery.trim().toLowerCase()
    if (!q) return beneficiariesByStatus
    return beneficiariesByStatus.filter((b) => {
      return (
        (b.fullName ?? "").toLowerCase().includes(q) ||
        (b.relationship ?? "").toLowerCase().includes(q) ||
        (b.email ?? "").toLowerCase().includes(q) ||
        (b.phone ?? "").toLowerCase().includes(q) ||
        formatUsPhoneStoredForUi(b.phone).toLowerCase().includes(q) ||
        (() => {
          const dq = q.replace(/\D/g, "")
          if (!dq) return false
          return nationalDigitsFromStoredPhone(String(b.phone ?? "")).includes(dq)
        })() ||
        (b.addressQuery ?? "").toLowerCase().includes(q) ||
        (b.taxId ?? "").toLowerCase().includes(q)
      )
    })
  }, [beneQuery, beneficiariesByStatus])

  const addressesByStatus = useMemo(() => {
    return addrStatusTab === "archived"
      ? savedAddresses.filter((a) => a.archived)
      : savedAddresses.filter((a) => !a.archived)
  }, [addrStatusTab, savedAddresses])

  const filteredAddresses = useMemo(() => {
    const q = addrQuery.trim().toLowerCase()
    if (!q) return addressesByStatus
    return addressesByStatus.filter((a) => {
      const stateLabel =
        US_STATE_OPTIONS.find((s) => s.value === a.state)?.label ?? a.state
      const countryLabel =
        COUNTRY_OPTIONS.find((c) => c.value === a.country)?.label ?? a.country
      const line = [
        a.fullNameOrCompany,
        a.street1,
        a.street2,
        a.city,
        stateLabel,
        a.zip,
        countryLabel,
        a.checkMemo,
        a.distributionNote,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return line.includes(q)
    })
  }, [addrQuery, savedAddresses])

  useEffect(() => {
    setBenePage(1)
  }, [beneQuery, beneficiaries.length, beneStatusTab])

  useEffect(() => {
    setAddrPage(1)
  }, [addrQuery, savedAddresses.length, addrStatusTab])

  useEffect(() => {
    const t = Math.max(1, Math.ceil(filteredBeneficiaries.length / benePageSize))
    if (benePage > t) setBenePage(t)
  }, [filteredBeneficiaries.length, benePageSize, benePage])

  useEffect(() => {
    const t = Math.max(1, Math.ceil(filteredAddresses.length / addrPageSize))
    if (addrPage > t) setAddrPage(t)
  }, [filteredAddresses.length, addrPageSize, addrPage])

  const benePagination = useMemo(
    () => ({
      page: benePage,
      pageSize: benePageSize,
      totalItems: filteredBeneficiaries.length,
      onPageChange: setBenePage,
      onPageSizeChange: (n: number) => {
        setBenePageSize(n)
        setBenePage(1)
      },
      ariaLabel: "Beneficiaries table pagination",
    }),
    [benePage, benePageSize, filteredBeneficiaries.length],
  )

  const addressPagination = useMemo(
    () => ({
      page: addrPage,
      pageSize: addrPageSize,
      totalItems: filteredAddresses.length,
      onPageChange: setAddrPage,
      onPageSizeChange: (n: number) => {
        setAddrPageSize(n)
        setAddrPage(1)
      },
      ariaLabel: "Addresses table pagination",
    }),
    [addrPage, addrPageSize, filteredAddresses.length],
  )

  const profileViewSections = useMemo(() => {
    if (!viewModal || viewModal.kind !== "profile") return null
    const sections = buildInvestorProfileViewSections({
      row: viewModal.row,
      savedAddresses,
      savedBeneficiaries: beneficiaries,
    })
    const connect = connectByProfileId[viewModal.row.id]
    const bank = connect?.bankAccount
    const achRows = [
      {
        label: "Status",
        value: connect
          ? connect.payoutsEnabled
            ? "Ready for ACH"
            : connect.accountId
              ? "Setup pending"
              : "Not added"
          : "—",
      },
      {
        label: "Bank",
        value: bank?.bankName?.trim() || "—",
      },
      {
        label: "Account",
        value: bank?.last4 ? `···· ${bank.last4}` : "—",
      },
      {
        label: "Routing",
        value: bank?.routingNumber?.trim() || "—",
      },
      {
        label: "Name on account",
        value: bank?.accountHolderName?.trim() || "—",
      },
    ]
    return [
      ...sections,
      {
        heading: "ACH bank account",
        rows: achRows,
      },
    ]
  }, [viewModal, savedAddresses, beneficiaries, connectByProfileId])

  const viewModalConfig = useMemo(() => {
    if (!viewModal) return null
    if (viewModal.kind === "profile") {
      const name = viewModal.row.profileName?.trim()
      return {
        title: name || "Profile details",
        description: buildInvestorProfileViewDescription(viewModal.row),
        sections: profileViewSections ?? [],
        profileId: viewModal.row.id,
      }
    }
    if (viewModal.kind === "beneficiary") {
      const r = viewModal.row
      return {
        title: "Beneficiary details" as const,
        rows: [
          { label: "Name", value: r.fullName },
          { label: "Relationship", value: r.relationship },
          { label: "Email", value: r.email },
          { label: "Phone", value: formatUsPhoneStoredForUi(r.phone) },
          { label: "Address", value: r.addressQuery },
          { label: "Tax ID", value: r.taxId },
          { label: "Status", value: r.archived ? "Archived" : "Active" },
        ],
      }
    }
    const a = viewModal.row
    const countryLabel =
      COUNTRY_OPTIONS.find((c) => c.value === a.country)?.label ?? a.country
    const stateLabel =
      US_STATE_OPTIONS.find((s) => s.value === a.state)?.label ?? a.state
    return {
      title: "Address details" as const,
      rows: [
        { label: "Name / company", value: a.fullNameOrCompany },
        { label: "Country", value: countryLabel },
        { label: "Street line 1", value: a.street1 },
        { label: "Street line 2", value: a.street2 },
        { label: "City", value: a.city },
        { label: "State / region", value: stateLabel },
        { label: "Zip", value: a.zip },
        { label: "Check memo", value: a.checkMemo },
        { label: "Distribution note", value: a.distributionNote },
        { label: "Status", value: a.archived ? "Archived" : "Active" },
      ],
    }
  }, [viewModal, profileViewSections])

  const openProfileView = useCallback((row: InvestorProfileListRow) => {
    setViewModal({ kind: "profile", row })
  }, [])

  const profileResumeHref = useCallback((row: InvestorProfileListRow): string | undefined => {
    if (row.id === ADD_PROFILE_DRAFT_ROW_ID) return "/investing/profiles/add?resume=1"
    if (row.isDraft) {
      return `/investing/profiles/add?resume=1&profileId=${encodeURIComponent(row.id)}`
    }
    return undefined
  }, [])

  const profileColumns: DataTableColumn<InvestorProfileListRow>[] = useMemo(
    () => [
      {
        id: "profileName",
        header: "Profile name",
        colWidth: PROFILES_TABLE_COL_WIDTH.profileName,
        thClassName: "investing_profiles_col_name",
        sortValue: (r) => (r.profileName ?? "").toLowerCase(),
        tdClassName: "um_td_user investing_profiles_td_name",
        cell: (r) => (
          <ProfileListNameCell
            row={r}
            resumeHref={profileResumeHref(r)}
            onView={() => openProfileView(r)}
          />
        ),
      },
      {
        id: "profileType",
        header: "Profile type",
        colWidth: PROFILES_TABLE_COL_WIDTH.profileType,
        thClassName: "investing_profiles_col_profile_type",
        tdClassName: "investing_profiles_td_profile_type",
        sortValue: (r) => bookProfileTypeDisplayLabel(r).toLowerCase(),
        cell: (r) => bookProfileTypeDisplayLabel(r),
      },
      {
        id: "addedBy",
        header: "Added by",
        colWidth: PROFILES_TABLE_COL_WIDTH.addedBy,
        sortValue: (r) => (r.addedBy ?? "").toLowerCase(),
        cell: (r) => r.addedBy?.trim() || "—",
      },
      {
        id: "investments",
        header: "Investments",
        align: "right",
        colWidth: PROFILES_TABLE_COL_WIDTH.investments,
        thClassName: "deals_th_align_right",
        tdClassName: "um_td_numeric investing_profiles_td_count",
        sortValue: (r) => r.investmentsCount,
        cell: (r) => String(r.investmentsCount ?? 0),
      },
      {
        id: "bankAccount",
        header: "Bank account",
        colWidth: "14rem",
        thClassName: "investing_profiles_col_bank",
        tdClassName: "investing_profiles_td_bank",
        sortValue: (r) =>
          formatProfileBankCell(connectByProfileId[r.id]).toLowerCase(),
        cell: (r) => {
          if (
            isInvestorProfileListRowIncomplete(r) ||
            r.id === ADD_PROFILE_DRAFT_ROW_ID ||
            r.archived
          ) {
            return "—"
          }
          const selected =
            connectByProfileId[r.id]?.accountId?.trim() || ""
          const readyBanks = sharedBanks.filter((b) => b.accountId)
          const busy =
            bankSetupBusy || assignBusyId === r.id || banksLoading
          return (
            <ProfileBankSelect
              id={`profile-bank-${r.id}`}
              ariaLabel={`Bank account for ${r.profileName || "profile"}`}
              value={selected}
              banks={readyBanks}
              disabled={busy}
              onChange={(accountId) => {
                void assignBankToProfile(r.id, accountId)
              }}
              onAddBank={() => {
                void startPayoutOnboarding(r.id, {
                  forceNew: readyBanks.length > 0,
                })
              }}
            />
          )
        },
      },
      {
        id: "dateCreated",
        header: "Date created",
        colWidth: PROFILES_TABLE_COL_WIDTH.dateCreated,
        sortValue: (r) => Date.parse(r.dateCreated) || 0,
        cell: (r) =>
          isInvestorProfileListRowIncomplete(r)
            ? "Draft"
            : formatProfileListDate(r.dateCreated),
      },
      {
        id: "actions",
        header: "Actions",
        align: "right",
        colWidth: PROFILES_TABLE_COL_WIDTH.actions,
        thClassName: "um_th_actions",
        tdClassName: "um_td_actions",
        cell: (row) => (
          <InvestingProfilesRowActions
            displayName={row.profileName}
            kind="profile"
            archived={Boolean(row.archived)}
            incompleteDraft={isInvestorProfileListRowIncomplete(row)}
            onSetArchived={
              row.id === ADD_PROFILE_DRAFT_ROW_ID
                ? undefined
                : (v) => setProfileArchived(row.id, v)
            }
            onDelete={() => deleteProfile(row)}
            onView={() => {
              const resumeTo = profileResumeHref(row)
              if (resumeTo) {
                void navigate(resumeTo)
                return
              }
              openProfileView(row)
            }}
            onEdit={() => {
              const resumeTo = profileResumeHref(row)
              if (resumeTo) {
                void navigate(resumeTo)
                return
              }
              void navigate(
                `/investing/profiles/${encodeURIComponent(row.id)}/edit`,
              )
            }}
            onExport={() => exportInvestorProfileRow(row)}
          />
        ),
      },
    ],
    [
      setProfileArchived,
      deleteProfile,
      navigate,
      openProfileView,
      profileResumeHref,
      connectByProfileId,
      sharedBanks,
      bankSetupBusy,
      banksLoading,
      assignBusyId,
      assignBankToProfile,
      startPayoutOnboarding,
    ],
  )

  const profileNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of profiles) {
      map.set(row.id, row.profileName?.trim() || "Profile")
    }
    return map
  }, [profiles])

  const bankAccountRows = useMemo(
    () => buildBankAccountTableRows(sharedBanks, profileNameById),
    [sharedBanks, profileNameById],
  )

  const beneficiaryColumns: DataTableColumn<BeneficiaryListRow>[] = useMemo(
    () => [
      {
        id: "fullName",
        header: "Name",
        colWidth: PROFILES_TABLE_COL_WIDTH.beneficiaryName,
        thClassName: "investing_profiles_col_name",
        sortValue: (r) => (r.fullName ?? "").toLowerCase(),
        tdClassName: "um_td_user investing_profiles_td_name",
        cell: (r) => (
          <EntityAvatarNameCell
            displayName={r.fullName ?? ""}
            linkClassName="deals_table_name_link investing_profiles_name_text um_user_meta_username"
            cellClassName="investing_profiles_name_cell"
          />
        ),
      },
      {
        id: "relationship",
        header: "Relationship",
        colWidth: PROFILES_TABLE_COL_WIDTH.relationship,
        sortValue: (r) => (r.relationship ?? "").toLowerCase(),
        cell: (r) => r.relationship?.trim() || "—",
      },
      {
        id: "email",
        header: "Email",
        colWidth: PROFILES_TABLE_COL_WIDTH.email,
        sortValue: (r) => (r.email ?? "").toLowerCase(),
        cell: (r) => r.email?.trim() || "—",
      },
      {
        id: "phone",
        header: "Phone",
        colWidth: PROFILES_TABLE_COL_WIDTH.phone,
        sortValue: (r) => nationalDigitsFromStoredPhone(String(r.phone ?? "")),
        cell: (r) => formatUsPhoneStoredForUi(r.phone),
      },
      {
        id: "address",
        header: "Address",
        colWidth: PROFILES_TABLE_COL_WIDTH.address,
        sortValue: (r) => (r.addressQuery ?? "").toLowerCase(),
        cell: (r) => r.addressQuery?.trim() || "—",
      },
      {
        id: "actions",
        header: "Actions",
        align: "right",
        colWidth: PROFILES_TABLE_COL_WIDTH.actions,
        thClassName: "um_th_actions",
        tdClassName: "um_td_actions",
        cell: (row) => (
          <InvestingProfilesRowActions
            displayName={row.fullName}
            kind="beneficiary"
            archived={Boolean(row.archived)}
            onSetArchived={(v) => setBeneficiaryArchived(row.id, v)}
            onView={() => setViewModal({ kind: "beneficiary", row })}
            onEdit={() => {
              setEditBeneficiary(row)
              setAddBenOpen(true)
            }}
            onExport={() => exportBeneficiaryRow(row)}
          />
        ),
      },
    ],
    [setBeneficiaryArchived],
  )

  const addressColumns: DataTableColumn<SavedAddress>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Name / company",
        colWidth: PROFILES_TABLE_COL_WIDTH.addressName,
        thClassName: "investing_profiles_col_name",
        sortValue: (r) => (r.fullNameOrCompany ?? "").toLowerCase(),
        tdClassName: "um_td_user investing_profiles_td_name",
        cell: (r) => (
          <EntityAvatarNameCell
            displayName={r.fullNameOrCompany ?? ""}
            linkClassName="deals_table_name_link investing_profiles_name_text um_user_meta_username"
            cellClassName="investing_profiles_name_cell"
          />
        ),
      },
      {
        id: "address",
        header: "Address",
        sortValue: (r) => formatSavedAddressLabel(r).toLowerCase(),
        cell: (r) => {
          const countryLabel =
            COUNTRY_OPTIONS.find((c) => c.value === r.country)?.label ?? r.country
          const stateLabel =
            US_STATE_OPTIONS.find((s) => s.value === r.state)?.label ?? r.state
          return (
            <span className="investing_profiles_addr_multiline">
              {[
                [r.street1, r.street2].filter(Boolean).join(", "),
                [r.city, stateLabel, r.zip].filter(Boolean).join(", "),
                countryLabel,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )
        },
      },
      {
        id: "checkMemo",
        header: "Check memo",
        sortValue: (r) => (r.checkMemo ?? "").toLowerCase(),
        cell: (r) => r.checkMemo?.trim() || "—",
      },
      {
        id: "distributionNote",
        header: "Distribution note",
        sortValue: (r) => (r.distributionNote ?? "").toLowerCase(),
        cell: (r) => r.distributionNote?.trim() || "—",
      },
      {
        id: "actions",
        header: "Actions",
        align: "right",
        thClassName: "um_th_actions",
        tdClassName: "um_td_actions",
        cell: (row) => (
          <InvestingProfilesRowActions
            displayName={row.fullNameOrCompany}
            kind="address"
            archived={Boolean(row.archived)}
            onSetArchived={(v) => setAddressArchived(row.id, v)}
            onView={() => setViewModal({ kind: "address", row })}
            onEdit={() => {
              setEditingAddress(row)
              setAddAddressOpen(true)
            }}
            onExport={() => exportSavedAddressRow(row)}
          />
        ),
      },
    ],
    [setAddressArchived],
  )

  return (
    <section className="um_page contacts_page investing_profiles_page">
      <div className="um_members_header_block">
        <div className="um_header_row">
          <h2 className="um_title um_title_with_icon">
            <IdCard
              className="um_title_icon"
              size={26}
              strokeWidth={1.75}
              aria-hidden
            />
            Profiles
          </h2>
        </div>
      </div>

      {loadError ? (
        <div
          className="um_panel"
          style={{ marginBottom: "1rem", color: "var(--um-danger, #b42318)" }}
          role="alert"
        >
          {loadError}
        </div>
      ) : null}

      <div className="um_members_tabs_outer deals_tabs_outer contacts_main_tabs_outer um_segmented_tabs_outer">
        <TabsScrollStrip scrollClassName="deals_tabs_scroll um_segmented_tabs_scroll">
          <div
            className="um_members_tabs_row deals_tabs_row um_segmented_tabs_row"
            role="tablist"
            aria-label="Profiles sections"
          >
            <button
              type="button"
              id="profiles-tab-my-profiles"
              role="tab"
              aria-selected={activeTab === "my-profiles"}
              aria-controls="profiles-panel-my-profiles"
              className={`um_members_tab deals_tabs_tab um_segmented_tab${activeTab === "my-profiles" ? " um_members_tab_active" : ""}`}
              onClick={() => setActiveTab("my-profiles")}
            >
              <IdCard
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                My Profiles
              </span>
            </button>
            <button
              type="button"
              id="profiles-tab-bank-accounts"
              role="tab"
              aria-selected={activeTab === "bank-accounts"}
              aria-controls="profiles-panel-bank-accounts"
              className={`um_members_tab deals_tabs_tab um_segmented_tab${activeTab === "bank-accounts" ? " um_members_tab_active" : ""}`}
              onClick={() => {
                setActiveTab("bank-accounts")
                void loadSharedBanks()
              }}
            >
              <Landmark
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Bank accounts
              </span>
            </button>
            <button
              type="button"
              id="profiles-tab-beneficiaries"
              role="tab"
              aria-selected={activeTab === "beneficiaries"}
              aria-controls="profiles-panel-beneficiaries"
              className={`um_members_tab deals_tabs_tab um_segmented_tab${activeTab === "beneficiaries" ? " um_members_tab_active" : ""}`}
              onClick={() => setActiveTab("beneficiaries")}
            >
              <Users
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Beneficiaries
              </span>
            </button>
            <button
              type="button"
              id="profiles-tab-addresses"
              role="tab"
              aria-selected={activeTab === "addresses"}
              aria-controls="profiles-panel-addresses"
              className={`um_members_tab deals_tabs_tab um_segmented_tab${activeTab === "addresses" ? " um_members_tab_active" : ""}`}
              onClick={() => setActiveTab("addresses")}
            >
              <MapPin
                className="deals_tabs_icon um_segmented_tab_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              <span className="deals_tabs_label um_segmented_tab_label">
                Address
              </span>
            </button>
          </div>
        </TabsScrollStrip>
      </div>

      {activeTab === "my-profiles" && (
        <>
          <div className="um_members_header_block contacts_inner_header">
              <div className="contacts_toolbar_filters_row">
                <ActiveArchivedTabs
                  value={profilesStatusTab}
                  onChange={setProfilesStatusTab}
                  activeCount={profileActiveCount}
                  archivedCount={profileArchivedCount}
                  idPrefix="investing-profiles-filter"
                  ariaLabel="Filter profiles by status"
                  activeIcon={IdCard}
                  activePanelId="profiles-panel-my-profiles"
                />
                <button
                  type="button"
                  className="um_btn_primary contacts_toolbar_add_btn"
                  onClick={() => void navigate("/investing/profiles/add")}
                >
                  <Plus size={18} strokeWidth={2} aria-hidden />
                  Add profile
                </button>
              </div>
            </div>

          <div id="profiles-panel-my-profiles" role="tabpanel" aria-labelledby="profiles-tab-my-profiles" className="contacts_main_tab_panel_wrap">
            <div className="um_members_tab_content contacts_main_tab_content_flush">
              <div className="um_panel um_members_tab_panel deals_list_table_panel deals_list_card_surface deal_inv_table_panel investing_profiles_table_panel">
                <InvestingProfilesTableToolbar
                  onExport={() => setExportModalOpen(true)}
                  exportDisabled={bookLoading}
                  searchValue={query}
                  onSearchChange={setQuery}
                  searchPlaceholder="Search profiles…"
                  searchAriaLabel={profilesStatusTab === "archived" ? "Search archived profiles" : "Search active profiles"}
                  searchDisabled={bookLoading}
                />
                <DataTable<InvestorProfileListRow>
              visualVariant="members"
              membersTableClassName="um_table_members deal_inv_table"
              stickyFirstColumn={false}
              columns={profileColumns}
              rows={displayProfiles}
              isLoading={bookLoading}
              getRowKey={(r, i) => r.id || `profile-row-${i}`}
              emptyLabel={
                query.trim()
                  ? "No profiles match your search."
                  : profilesStatusTab === "archived"
                    ? "No archived profiles. Use Archive in the row menu on the Active tab to move a profile here."
                    : "You have not added a profile yet. Use Add profile to get started."
              }
              initialSort={{ columnId: "dateCreated", direction: "desc" }}
              pagination={
                displayProfiles.length > 0 ? profilesPagination : undefined
              }
            />
              </div>
            </div>
          </div>
          </>
        )}

      {activeTab === "bank-accounts" ? (
        <InvestingBankAccountsTab
          rows={bankAccountRows}
          loading={bookLoading || banksLoading}
          setupBusy={bankSetupBusy}
          onAddBank={() =>
            void startBankSetupFromTab({
              forceNew: sharedBanks.length > 0,
            })
          }
          onUpdateBank={(row) =>
            void startBankSetupFromTab({ accountId: row.accountId })
          }
        />
      ) : null}

        {activeTab === "beneficiaries" && (
          <>
            <div className="um_members_header_block contacts_inner_header">
              <div className="contacts_toolbar_filters_row">
                <ActiveArchivedTabs
                  value={beneStatusTab}
                  onChange={setBeneStatusTab}
                  activeCount={beneActiveCount}
                  archivedCount={beneArchivedCount}
                  idPrefix="investing-bene-filter"
                  ariaLabel="Filter beneficiaries by status"
                  activeIcon={Users}
                  activePanelId="profiles-panel-beneficiaries"
                />
                <button
                  type="button"
                  className="um_btn_primary contacts_toolbar_add_btn"
                  onClick={() => {
                    setEditBeneficiary(null)
                    setAddBenOpen(true)
                  }}
                >
                  <Plus size={18} strokeWidth={2} aria-hidden />
                  Add beneficiary
                </button>
              </div>
            </div>

          <div id="profiles-panel-beneficiaries" role="tabpanel" aria-labelledby="profiles-tab-beneficiaries" className="contacts_main_tab_panel_wrap">
            <div className="um_members_tab_content contacts_main_tab_content_flush">
              <div className="um_panel um_members_tab_panel deals_list_table_panel deals_list_card_surface deal_inv_table_panel investing_profiles_table_panel">
                <InvestingProfilesTableToolbar
                  onExport={() => setExportBeneModalOpen(true)}
                  exportDisabled={bookLoading}
                  searchValue={beneQuery}
                  onSearchChange={setBeneQuery}
                  searchPlaceholder="Search beneficiaries…"
                  searchAriaLabel={beneStatusTab === "archived" ? "Search archived beneficiaries" : "Search active beneficiaries"}
                  searchDisabled={bookLoading}
                />
                <DataTable<BeneficiaryListRow>
              visualVariant="members"
              membersTableClassName="um_table_members deal_inv_table"
              stickyFirstColumn={false}
              columns={beneficiaryColumns}
              rows={filteredBeneficiaries}
              isLoading={bookLoading}
              getRowKey={(r) => r.id}
              emptyLabel={
                beneQuery.trim()
                  ? "No beneficiaries match your search."
                  : beneStatusTab === "archived"
                    ? "No archived beneficiaries. Use Archive in the row menu on the Active tab to move a row here."
                    : "You have not added a beneficiary yet. Use Add beneficiary to get started."
              }
              initialSort={{ columnId: "fullName", direction: "asc" }}
              pagination={
                filteredBeneficiaries.length > 0 ? benePagination : undefined
              }
            />
              </div>
            </div>
          </div>
          </>
        )}

        {activeTab === "addresses" && (
          <>
            <div className="um_members_header_block contacts_inner_header">
              <div className="contacts_toolbar_filters_row">
                <ActiveArchivedTabs
                  value={addrStatusTab}
                  onChange={setAddrStatusTab}
                  activeCount={addrActiveCount}
                  archivedCount={addrArchivedCount}
                  idPrefix="investing-addr-filter"
                  ariaLabel="Filter addresses by status"
                  activeIcon={MapPin}
                  activePanelId="profiles-panel-addresses"
                />
                <button
                  type="button"
                  className="um_btn_primary contacts_toolbar_add_btn"
                  onClick={() => {
                    setEditingAddress(null)
                    setAddAddressOpen(true)
                  }}
                >
                  <Plus size={18} strokeWidth={2} aria-hidden />
                  Add address
                </button>
              </div>
            </div>

          <div id="profiles-panel-addresses" role="tabpanel" aria-labelledby="profiles-tab-addresses" className="contacts_main_tab_panel_wrap">
            <div className="um_members_tab_content contacts_main_tab_content_flush">
              <div className="um_panel um_members_tab_panel deals_list_table_panel deals_list_card_surface deal_inv_table_panel investing_profiles_table_panel">
                <InvestingProfilesTableToolbar
                  onExport={() => setExportAddrModalOpen(true)}
                  exportDisabled={bookLoading}
                  searchValue={addrQuery}
                  onSearchChange={setAddrQuery}
                  searchPlaceholder="Search addresses…"
                  searchAriaLabel={addrStatusTab === "archived" ? "Search archived addresses" : "Search active addresses"}
                  searchDisabled={bookLoading}
                />
                <DataTable<SavedAddress>
              visualVariant="members"
              membersTableClassName="um_table_members deal_inv_table"
              stickyFirstColumn={false}
              columns={addressColumns}
              rows={filteredAddresses}
              isLoading={bookLoading}
              getRowKey={(r) => r.id}
              emptyLabel={
                addrQuery.trim()
                  ? "No saved addresses match your search."
                  : addrStatusTab === "archived"
                    ? "No archived addresses. Use Archive in the row menu on the Active tab to move a row here."
                    : "You have not added an address yet. Use Add address to get started."
              }
              initialSort={{ columnId: "name", direction: "asc" }}
              pagination={
                filteredAddresses.length > 0 ? addressPagination : undefined
              }
            />
              </div>
            </div>
          </div>
          </>
        )}

      {viewModalConfig ? (
        <InvestingEntityViewModal
          open
          onClose={() => setViewModal(null)}
          title={viewModalConfig.title}
          description={
            "description" in viewModalConfig
              ? viewModalConfig.description
              : undefined
          }
          rows={"rows" in viewModalConfig ? viewModalConfig.rows : undefined}
          sections={
            "sections" in viewModalConfig ? viewModalConfig.sections : undefined
          }
          onEdit={
            "profileId" in viewModalConfig && viewModalConfig.profileId
              ? () => {
                  setViewModal(null)
                  void navigate(
                    `/investing/profiles/${encodeURIComponent(viewModalConfig.profileId!)}/edit`,
                  )
                }
              : undefined
          }
          editLabel="Edit profile"
        />
      ) : null}
      <ExportInvestorProfilesModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        profiles={profilesByStatus}
      />
      <ExportBeneficiariesModal
        open={exportBeneModalOpen}
        onClose={() => setExportBeneModalOpen(false)}
        beneficiaries={beneficiariesByStatus}
      />
      <ExportAddressesModal
        open={exportAddrModalOpen}
        onClose={() => setExportAddrModalOpen(false)}
        addresses={addressesByStatus}
      />
      <AddBeneficiaryModal
        open={addBenOpen}
        onClose={() => {
          setAddBenOpen(false)
          setEditBeneficiary(null)
        }}
        onSave={addBeneficiary}
        initial={benInitialDraft}
        variant={editBeneficiary ? "edit" : "add"}
        savedAddresses={savedAddresses}
        existingBeneficiaries={beneficiaries}
        excludeBeneficiaryId={editBeneficiary?.id}
        onAddressAdded={(row) => setSavedAddresses((prev) => [row, ...prev])}
      />
      <AddAddressModal
        open={addAddressOpen}
        onClose={() => {
          setAddAddressOpen(false)
          setEditingAddress(null)
        }}
        onSave={addAddress}
        initialDraft={addressInitialDraft}
        isEdit={Boolean(editingAddress)}
        existingAddresses={savedAddresses}
        excludeAddressId={editingAddress?.id}
      />
    </section>
  )
}
