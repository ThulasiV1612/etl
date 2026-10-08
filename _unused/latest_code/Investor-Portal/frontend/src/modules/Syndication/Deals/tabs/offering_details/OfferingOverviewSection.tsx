import { HelpCircle, Info, Loader2, RotateCcw, Save } from "lucide-react"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "../../../../../common/components/Toast"
import { focusFirstFormErrorAfterUpdate } from "../../../../../common/utils/scrollToFirstFormError"
import {
  DEAL_ESIGN_TEMPLATES_CHANGED_EVENT,
  fetchDealById,
  fetchDealEsignTemplates,
  fetchDealInvestorClasses,
  patchDealOfferingOverview,
  updateDealInvestorClass,
  type DealDetailApi,
} from "../../api/dealsApi"
import { OpenInvestmentDraftStageInfoModal } from "../../components/OpenInvestmentDraftStageInfoModal"
import { OpenInvestmentEsignRequiredModal } from "../../components/OpenInvestmentEsignRequiredModal"
import {
  computeDealAssetRowsFromClientStorage,
  DEAL_ASSETS_STORAGE_CHANGED_EVENT,
} from "../../types/deal-asset.types"
import { syncDealAssetsFromServer } from "../../utils/dealAssetsServerSync"
import { DEAL_FORM_TYPE_OPTIONS } from "../../types/deals.types"
import { SEC_TYPE_OPTIONS } from "../../constants/sec-type-options"
import {
  computeInvestorClassPricePerUnitFromForm,
  isLpInvestorClass,
} from "../../utils/investorClassOverviewFields"
import type { DealInvestorClass } from "../../types/deal-investor-class.types"
import {
  blurFormatMoneyInput,
  blurFormatNumberOfUnitsInput,
  formatCurrencyUsdTypeInput,
  formatNumberOfUnitsTypingInput,
} from "../../utils/offeringMoneyFormat"
import {
  isDealStageDraft,
  isInvestmentFlowOpeningTransition,
  normalizeDealStageCanonical,
  normalizeDealStatus,
  offeringStatusRequiresInvestorClass,
  validateOfferingStatusChange,
} from "../../constants/deal-lifecycle"
import {
  DEFAULT_OFFERING_VISIBILITY,
  isOfferingStatusFieldEditable,
  mapLegacyOfferingVisibility,
  offeringStatusFromApi,
  offeringStatusOptionsForOverview,
  OFFERING_VISIBILITY_OPTIONS,
  type OfferingVisibilityValue,
} from "../../utils/offeringOverviewForm"
import { investorClassRowToFormValues } from "./OfferingInformationSection"
import { OfferingOverviewAssetsMultiSelect } from "./OfferingOverviewAssetsMultiSelect"
import { OfferingOverviewLocationMap } from "./OfferingOverviewLocationMap"
import {
  DealOfferingStatusReadonly,
  DealOfferingStatusSelect,
} from "./DealOfferingStatusSelect"
import {
  computeMergedOverviewAssetSelection,
  consumeOverviewAssetsMergePending,
  OFFERING_OVERVIEW_ASSETS_MERGE_EVENT,
  offeringOverviewAssetsMergeStorageKey,
  persistOverviewExcludedFromSave,
} from "../../utils/offeringOverviewAssetSync"
import {
  OFFERING_PREVIEW_VISIBILITY_CHANGED_EVENT,
  readOfferingPreviewInvestorVisibility,
} from "../../utils/offeringPreviewInvestorVisibility"
import {
  canActivateOpenInvestment,
  isOpenInvestmentWhileDealStageDraft,
} from "../../utils/canActivateOpenInvestment"
import { resolveDealEsignTemplatesConfigured } from "../../utils/dealEsignTemplatesConfigured"
import { DEAL_DETAIL_TAB_QUERY_PARAM } from "../../utils/offeringDetailsSectionNav"

type OfferingOverviewSectionProps = {
  detail: DealDetailApi
  onSaved?: (deal: DealDetailApi) => void
}

type OverviewDraft = {
  offeringStatus: string
  offeringVisibility: OfferingVisibilityValue
  dealName: string
  dealType: string
  selectedAssetIds: string[]
  selectedClassId: string
  classOfferingSize: string
  classMinimumInvestment: string
  classNumberOfUnits: string
  classPricePerUnit: string
  classInvestmentType: string
}

const OVERVIEW_INVESTMENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "equity", label: "Equity" },
  { value: "debt", label: "Debt" },
  { value: "convertible", label: "Convertible" },
  { value: "hybrid", label: "Hybrid" },
  { value: "other", label: "Other" },
]

function investmentTypeFromClassRow(
  row: DealInvestorClass | undefined,
): string {
  if (!row?.advancedOptionsJson?.trim()) return "equity"
  try {
    const o = JSON.parse(row.advancedOptionsJson) as { investmentType?: string }
    const raw = typeof o.investmentType === "string" ? o.investmentType.trim() : ""
    return raw || "equity"
  } catch {
    return "equity"
  }
}

function closeDateForDateInput(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim()
  if (!t) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return ""
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function normalizeVisibility(v: string | undefined): OfferingVisibilityValue {
  const mapped = mapLegacyOfferingVisibility(String(v ?? ""))
  const ok = OFFERING_VISIBILITY_OPTIONS.some((o) => o.value === mapped)
  return ok ? (mapped as OfferingVisibilityValue) : DEFAULT_OFFERING_VISIBILITY
}

function stateFromDetail(d: DealDetailApi): OverviewDraft {
  return {
    offeringStatus: offeringStatusFromApi(d.offeringStatus),
    offeringVisibility: normalizeVisibility(d.offeringVisibility),
    dealName: d.dealName?.trim() || "",
    dealType: (d.dealType ?? "").trim(),
    selectedAssetIds: [...(d.offeringOverviewAssetIds ?? [])],
    selectedClassId: d.offeringOverviewClassId?.trim() || "",
    classOfferingSize: "",
    classMinimumInvestment: "",
    classNumberOfUnits: "",
    classPricePerUnit: "",
    classInvestmentType: "equity",
  }
}

/** Apply server overview fields while keeping a valid investor-class selection when possible. */
function mergeOverviewDraftWithClasses(
  base: OverviewDraft,
  prev: OverviewDraft,
  classes: DealInvestorClass[],
): OverviewDraft {
  if (classes.length === 0) {
    return {
      ...base,
      selectedClassId: "",
      classOfferingSize: "",
      classMinimumInvestment: "",
      classNumberOfUnits: "",
      classPricePerUnit: "",
      classInvestmentType: "equity",
    }
  }
  const pick =
    prev.selectedClassId && classes.some((c) => c.id === prev.selectedClassId)
      ? prev.selectedClassId
      : base.selectedClassId && classes.some((c) => c.id === base.selectedClassId)
        ? base.selectedClassId
        : classes[0]!.id
  const row = classes.find((c) => c.id === pick)
  if (!row) {
    return {
      ...base,
      selectedClassId: pick,
      classOfferingSize: "",
      classMinimumInvestment: "",
      classNumberOfUnits: "",
      classPricePerUnit: "",
      classInvestmentType: "equity",
    }
  }
  return {
    ...base,
    selectedClassId: pick,
    classOfferingSize: blurFormatMoneyInput(row.offeringSize ?? ""),
    classMinimumInvestment: blurFormatMoneyInput(
      row.minimumInvestment ?? "",
    ),
    classNumberOfUnits: blurFormatNumberOfUnitsInput(row.numberOfUnits ?? ""),
    classPricePerUnit: isLpInvestorClass(row)
      ? computeInvestorClassPricePerUnitFromForm({
          offeringSize: blurFormatMoneyInput(row.offeringSize ?? ""),
          raiseAmountDistributions: blurFormatMoneyInput(
            row.raiseAmountDistributions ?? "",
          ),
          numberOfUnits: blurFormatNumberOfUnitsInput(row.numberOfUnits ?? ""),
        })
      : blurFormatMoneyInput(row.pricePerUnit ?? ""),
    classInvestmentType: investmentTypeFromClassRow(row),
  }
}

function sortedIdsKey(ids: string[]): string {
  return [...ids].sort().join("\0")
}

function isMoneyFieldEmpty(raw: string): boolean {
  return String(raw ?? "")
    .replace(/[$,\s]/g, "")
    .trim() === ""
}

function overviewDraftPricePerUnit(draft: OverviewDraft): string {
  return computeInvestorClassPricePerUnitFromForm({
    offeringSize: draft.classOfferingSize,
    raiseAmountDistributions: "",
    numberOfUnits: draft.classNumberOfUnits,
  })
}

function withOverviewAutoPricePerUnit(
  patch: Partial<OverviewDraft>,
  current: OverviewDraft,
  isLpClass: boolean,
): OverviewDraft {
  const merged = { ...current, ...patch }
  if (!isLpClass) return merged
  return {
    ...merged,
    classPricePerUnit: overviewDraftPricePerUnit(merged),
  }
}

function draftEqual(a: OverviewDraft, b: OverviewDraft): boolean {
  return (
    a.offeringStatus === b.offeringStatus &&
    a.offeringVisibility === b.offeringVisibility &&
    a.dealName === b.dealName &&
    a.dealType === b.dealType &&
    sortedIdsKey(a.selectedAssetIds) === sortedIdsKey(b.selectedAssetIds) &&
    a.selectedClassId === b.selectedClassId &&
    a.classOfferingSize === b.classOfferingSize &&
    a.classMinimumInvestment === b.classMinimumInvestment &&
    a.classNumberOfUnits === b.classNumberOfUnits &&
    a.classPricePerUnit === b.classPricePerUnit &&
    a.classInvestmentType === b.classInvestmentType
  )
}

export function OfferingOverviewSection({
  detail,
  onSaved,
}: OfferingOverviewSectionProps) {
  const navigate = useNavigate()
  const visibilityHintId = useId()
  const statusHintId = useId()

  const [classes, setClasses] = useState<DealInvestorClass[]>([])
  const [draft, setDraft] = useState<OverviewDraft>(() =>
    stateFromDetail(detail),
  )
  const [savedSnapshot, setSavedSnapshot] = useState<OverviewDraft>(() =>
    stateFromDetail(detail),
  )
  const [saving, setSaving] = useState(false)
  const [dealNameError, setDealNameError] = useState<string | undefined>()
  const [classOfferingSizeError, setClassOfferingSizeError] = useState<
    string | undefined
  >()
  const [esignTemplatesConfigured, setEsignTemplatesConfigured] = useState<
    boolean | null
  >(null)
  const [esignRequiredModalOpen, setEsignRequiredModalOpen] = useState(false)
  const [draftStageInfoModalOpen, setDraftStageInfoModalOpen] = useState(false)
  const [pendingOpenInvestmentStatus, setPendingOpenInvestmentStatus] =
    useState<string | null>(null)
  const [assetsSyncTick, setAssetsSyncTick] = useState(0)
  const overviewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    void syncDealAssetsFromServer(detail.id).then(() => {
      if (!cancelled) setAssetsSyncTick((t) => t + 1)
    })
    return () => {
      cancelled = true
    }
  }, [detail.id])

  const refreshEsignTemplatesConfigured = useCallback(async () => {
    const result = await fetchDealEsignTemplates(detail.id)
    if (!result.ok) {
      setEsignTemplatesConfigured(false)
      return false
    }
    const configured = resolveDealEsignTemplatesConfigured(
      result.filesByCategory,
      result.templatesFullyConfigured,
    )
    setEsignTemplatesConfigured(configured)
    return configured
  }, [detail.id])

  useEffect(() => {
    void refreshEsignTemplatesConfigured()
  }, [refreshEsignTemplatesConfigured])

  useEffect(() => {
    function onEsignTemplatesChanged(e: Event) {
      const ev = e as CustomEvent<{ dealId?: string }>
      if (ev.detail?.dealId && ev.detail.dealId !== detail.id) return
      void refreshEsignTemplatesConfigured()
    }
    window.addEventListener(DEAL_ESIGN_TEMPLATES_CHANGED_EVENT, onEsignTemplatesChanged)
    return () =>
      window.removeEventListener(
        DEAL_ESIGN_TEMPLATES_CHANGED_EVENT,
        onEsignTemplatesChanged,
      )
  }, [detail.id, refreshEsignTemplatesConfigured])

  const goToEsignTemplatesTab = useCallback(() => {
    setEsignRequiredModalOpen(false)
    const params = new URLSearchParams()
    params.set(DEAL_DETAIL_TAB_QUERY_PARAM, "esign_templates")
    navigate({
      pathname: `/deals/${encodeURIComponent(detail.id)}`,
      search: params.toString(),
    })
  }, [detail.id, navigate])

  const cancelDraftStageOpenInvestment = useCallback(() => {
    setPendingOpenInvestmentStatus(null)
    setDraftStageInfoModalOpen(false)
  }, [])

  const confirmDraftStageOpenInvestment = useCallback(() => {
    const next = pendingOpenInvestmentStatus
    setPendingOpenInvestmentStatus(null)
    setDraftStageInfoModalOpen(false)
    if (!next) return
    setDraft((d) => ({ ...d, offeringStatus: next }))
  }, [pendingOpenInvestmentStatus])

  const tryApplyOfferingStatus = useCallback(
    async (next: string): Promise<boolean> => {
      if (
        classes.length === 0 &&
        next !== draft.offeringStatus &&
        offeringStatusRequiresInvestorClass(next)
      ) {
        toast.error("Create a class to change the deal status")
        return false
      }
      let configured = esignTemplatesConfigured
      if (configured === null) {
        configured = await refreshEsignTemplatesConfigured()
      }
      const check = canActivateOpenInvestment(
        {
          offeringStatus: draft.offeringStatus,
          esignTemplatesConfigured: configured ?? false,
        },
        next,
      )
      if (!check.ok) {
        setEsignRequiredModalOpen(true)
        return false
      }
      if (
        isOpenInvestmentWhileDealStageDraft(
          detail.dealStage,
          draft.offeringStatus,
          next,
        )
      ) {
        setPendingOpenInvestmentStatus(next)
        setDraftStageInfoModalOpen(true)
        return false
      }
      setDraft((d) => ({ ...d, offeringStatus: next }))
      return true
    },
    [
      classes.length,
      detail.dealStage,
      draft.offeringStatus,
      esignTemplatesConfigured,
      refreshEsignTemplatesConfigured,
    ],
  )

  const selectedClassRow = useMemo(
    () => classes.find((c) => c.id === draft.selectedClassId),
    [classes, draft.selectedClassId],
  )

  const reloadClasses = useCallback(async () => {
    const list = await fetchDealInvestorClasses(detail.id)
    setClasses(list)
  }, [detail.id])

  useEffect(() => {
    setClasses([])
    void reloadClasses()
  }, [reloadClasses])

  useEffect(() => {
    const base = stateFromDetail(detail)
    setDraft((d) => mergeOverviewDraftWithClasses(base, d, classes))
    setSavedSnapshot((s) => mergeOverviewDraftWithClasses(base, s, classes))
  }, [
    detail.id,
    detail.dealStage,
    detail.offeringStatus,
    detail.offeringVisibility,
    detail.dealName,
    detail.dealType,
    detail.secType,
    detail.closeDate,
    detail.offeringOverviewClassId,
    sortedIdsKey(detail.offeringOverviewAssetIds ?? []),
    classes,
  ])

  const isDirty = useMemo(
    () => !draftEqual(draft, savedSnapshot),
    [draft, savedSnapshot],
  )

  const assetRows = useMemo(
    () =>
      computeDealAssetRowsFromClientStorage(detail).filter(
        (r) => !r.archived,
      ),
    [detail, assetsSyncTick],
  )

  const assetRowIdsKey = useMemo(
    () => sortedIdsKey(assetRows.map((r) => r.id)),
    [assetRows],
  )

  const applyOverviewAssetMerge = useCallback(
    (options: { mergeAllActive?: boolean; mergeNewOnly?: boolean }) => {
      setDraft((d) => {
        const merged = computeMergedOverviewAssetSelection({
          dealId: detail.id,
          detail,
          selectedIds: d.selectedAssetIds,
          savedSelectedIds: savedSnapshot.selectedAssetIds,
          options,
        })
        if (!merged) return d
        return { ...d, selectedAssetIds: merged }
      })
    },
    [detail, savedSnapshot.selectedAssetIds],
  )

  useEffect(() => {
    function onMergeEvent(e: Event) {
      const dealId = (e as CustomEvent<{ dealId?: string }>).detail?.dealId
      if (dealId !== detail.id) return
      if (!readOfferingPreviewInvestorVisibility(detail.id).assets) return
      applyOverviewAssetMerge({ mergeAllActive: true })
    }

    function onVisibilityEvent(e: Event) {
      const dealId = (e as CustomEvent<{ dealId?: string }>).detail?.dealId
      if (dealId !== detail.id) return
      if (consumeOverviewAssetsMergePending(detail.id)) {
        applyOverviewAssetMerge({ mergeAllActive: true })
      }
    }

    function onAssetsStorageChanged(e: Event) {
      const dealId = (e as CustomEvent<{ dealId?: string }>).detail?.dealId
      if (dealId !== detail.id) return
      if (!readOfferingPreviewInvestorVisibility(detail.id).assets) return
      applyOverviewAssetMerge({ mergeNewOnly: true })
    }

    function onStorage(e: StorageEvent) {
      if (e.key !== offeringOverviewAssetsMergeStorageKey(detail.id)) return
      if (!readOfferingPreviewInvestorVisibility(detail.id).assets) return
      applyOverviewAssetMerge({ mergeNewOnly: true })
    }

    window.addEventListener(OFFERING_OVERVIEW_ASSETS_MERGE_EVENT, onMergeEvent)
    window.addEventListener(
      OFFERING_PREVIEW_VISIBILITY_CHANGED_EVENT,
      onVisibilityEvent,
    )
    window.addEventListener(
      DEAL_ASSETS_STORAGE_CHANGED_EVENT,
      onAssetsStorageChanged,
    )
    window.addEventListener("storage", onStorage)

    if (consumeOverviewAssetsMergePending(detail.id)) {
      applyOverviewAssetMerge({ mergeAllActive: true })
    } else if (readOfferingPreviewInvestorVisibility(detail.id).assets) {
      applyOverviewAssetMerge({ mergeNewOnly: true })
    }

    return () => {
      window.removeEventListener(
        OFFERING_OVERVIEW_ASSETS_MERGE_EVENT,
        onMergeEvent,
      )
      window.removeEventListener(
        OFFERING_PREVIEW_VISIBILITY_CHANGED_EVENT,
        onVisibilityEvent,
      )
      window.removeEventListener(
        DEAL_ASSETS_STORAGE_CHANGED_EVENT,
        onAssetsStorageChanged,
      )
      window.removeEventListener("storage", onStorage)
    }
  }, [applyOverviewAssetMerge, detail.id])

  useEffect(() => {
    if (!readOfferingPreviewInvestorVisibility(detail.id).assets) return
    applyOverviewAssetMerge({ mergeNewOnly: true })
  }, [assetRowIdsKey, applyOverviewAssetMerge, detail.id])

  const handleReset = useCallback(() => {
    setDraft({ ...savedSnapshot })
  }, [savedSnapshot])

  const focusOverviewField = useCallback((preferSelector: string) => {
    focusFirstFormErrorAfterUpdate({
      container: overviewRef.current,
      preferSelector,
    })
  }, [])

  const handleSave = useCallback(async () => {
    if (saving) return
    const name = draft.dealName.trim()
    if (!name) {
      const message = "Offering name is required."
      setDealNameError(message)
      toast.error(message)
      focusOverviewField(`#deal-ov-oname-${detail.id}`)
      return
    }
    if (assetRows.length > 0 && draft.selectedAssetIds.length === 0) {
      toast.error("Select at least one asset.")
      focusOverviewField(`#deal-ov-assets-${detail.id}`)
      return
    }
    if (classes.length > 0) {
      if (!draft.selectedClassId) {
        toast.error("Select an investor class.")
        focusOverviewField(`#deal-ov-class-${detail.id}`)
        return
      }
      if (isMoneyFieldEmpty(draft.classOfferingSize)) {
        const message = "Offering size is required."
        setClassOfferingSizeError(message)
        toast.error(message)
        focusOverviewField(`#deal-ov-osize-${detail.id}`)
        return
      }
    }

    const overviewBitsEqual =
      draft.offeringStatus === savedSnapshot.offeringStatus &&
      draft.offeringVisibility === savedSnapshot.offeringVisibility &&
      draft.dealName === savedSnapshot.dealName &&
      draft.dealType === savedSnapshot.dealType &&
      sortedIdsKey(draft.selectedAssetIds) ===
        sortedIdsKey(savedSnapshot.selectedAssetIds)

    const classBitsEqual =
      draft.selectedClassId === savedSnapshot.selectedClassId &&
      draft.classOfferingSize === savedSnapshot.classOfferingSize &&
      draft.classMinimumInvestment === savedSnapshot.classMinimumInvestment &&
      draft.classNumberOfUnits === savedSnapshot.classNumberOfUnits &&
      draft.classPricePerUnit === savedSnapshot.classPricePerUnit &&
      draft.classInvestmentType === savedSnapshot.classInvestmentType

    if (overviewBitsEqual && classBitsEqual) return

    if (!classBitsEqual && classes.length === 0) {
      toast.error("Add an investor class under Classes to save these fields.")
      return
    }

    if (!classBitsEqual && !draft.selectedClassId) {
      toast.error("Select an investor class.")
      return
    }

    setSaving(true)
    try {
      let dealOut: DealDetailApi | null = null

      if (!overviewBitsEqual) {
        if (draft.offeringStatus !== savedSnapshot.offeringStatus) {
          if (
            classes.length === 0 &&
            offeringStatusRequiresInvestorClass(draft.offeringStatus)
          ) {
            toast.error("Create a class to change the deal status")
            return
          }
          const statusCheck = validateOfferingStatusChange({
            dealStage: detail.dealStage,
            previousOfferingStatus: detail.offeringStatus,
            nextOfferingStatus: draft.offeringStatus,
          })
          if (!statusCheck.ok) {
            toast.error(statusCheck.message)
            return
          }
          let configuredForOpenInvestment = esignTemplatesConfigured
          if (configuredForOpenInvestment === null) {
            configuredForOpenInvestment = await refreshEsignTemplatesConfigured()
          }
          const openInvestmentCheck = canActivateOpenInvestment(
            {
              offeringStatus: detail.offeringStatus,
              esignTemplatesConfigured: configuredForOpenInvestment ?? false,
            },
            draft.offeringStatus,
          )
          if (!openInvestmentCheck.ok) {
            setEsignRequiredModalOpen(true)
            return
          }
        }
        const res = await patchDealOfferingOverview(detail.id, {
          offeringStatus: draft.offeringStatus,
          offeringVisibility: draft.offeringVisibility,
          dealName: name,
          dealType: draft.dealType.trim(),
          offeringOverviewAssetIds: draft.selectedAssetIds,
          offeringOverviewClassId: draft.selectedClassId || null,
        })
        if (!res.ok) {
          const nameErr = res.fieldErrors?.deal_name
          const statusErr = res.fieldErrors?.offering_status
          if (nameErr) setDealNameError(nameErr)
          toast.error(statusErr ?? nameErr ?? res.message)
          return
        }
        dealOut = res.deal
      }

      if (!classBitsEqual) {
        const row = classes.find((c) => c.id === draft.selectedClassId)
        if (!row) {
          toast.error("Selected class was not found.")
          return
        }
        const form = investorClassRowToFormValues(row)
        form.offeringSize = draft.classOfferingSize
        form.minimumInvestment = draft.classMinimumInvestment
        form.numberOfUnits = draft.classNumberOfUnits
        form.pricePerUnit = isLpInvestorClass(row)
          ? overviewDraftPricePerUnit(draft)
          : draft.classPricePerUnit
        form.advanced.investmentType = draft.classInvestmentType.trim() || "equity"
        try {
          await updateDealInvestorClass(
            detail.id,
            draft.selectedClassId,
            form,
          )
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "Could not save class fields.",
          )
          return
        }
        if (overviewBitsEqual) {
          const classIdRes = await patchDealOfferingOverview(detail.id, {
            offeringStatus: draft.offeringStatus,
            offeringVisibility: draft.offeringVisibility,
            dealName: draft.dealName.trim(),
            dealType: draft.dealType.trim(),
            offeringOverviewAssetIds: draft.selectedAssetIds,
            offeringOverviewClassId: draft.selectedClassId || null,
          })
          if (!classIdRes.ok) {
            toast.error(classIdRes.message)
            return
          }
          dealOut = classIdRes.deal
        } else {
          try {
            dealOut = await fetchDealById(detail.id)
          } catch (e) {
            toast.error(
              e instanceof Error
                ? e.message
                : "Saved class fields but could not reload the deal.",
            )
            return
          }
        }
      }

      if (!dealOut) {
        try {
          dealOut = await fetchDealById(detail.id)
        } catch (e) {
          toast.error(
            e instanceof Error
              ? e.message
              : "Could not reload the deal after save.",
          )
          return
        }
      }

      if (
        !overviewBitsEqual &&
        isInvestmentFlowOpeningTransition(
          savedSnapshot.offeringStatus,
          draft.offeringStatus,
        )
      ) {
        toast.success(
          "Investment is now fully open",
          "Existing investors will be notified to complete their investment.",
          8000,
        )
      } else if (
        !overviewBitsEqual &&
        isDealStageDraft(detail.dealStage) &&
        normalizeDealStageCanonical(dealOut.dealStage) === "capital_raising" &&
        normalizeDealStatus(draft.offeringStatus) === "open_investment"
      ) {
        toast.success(
          "Deal is now live",
          "Stage moved to Capital Raising. Investors can access Open to Investment.",
          8000,
        )
      }

      onSaved?.(dealOut)
      const list = await fetchDealInvestorClasses(detail.id)
      setClasses(list)
      const base = stateFromDetail(dealOut)
      const merged = mergeOverviewDraftWithClasses(base, draft, list)
      setDraft(merged)
      setSavedSnapshot({ ...merged })
      persistOverviewExcludedFromSave({
        dealId: detail.id,
        detail: dealOut,
        savedSelectedIds: merged.selectedAssetIds,
      })
      if (
        !(
          !overviewBitsEqual &&
          isDealStageDraft(detail.dealStage) &&
          normalizeDealStageCanonical(dealOut.dealStage) === "capital_raising" &&
          normalizeDealStatus(draft.offeringStatus) === "open_investment"
        )
      ) {
        toast.success("Offering overview saved.")
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not save offering overview.",
      )
    } finally {
      setSaving(false)
    }
  }, [
    assetRows,
    classes,
    detail.dealStage,
    detail.id,
    detail.offeringStatus,
    draft,
    esignTemplatesConfigured,
    focusOverviewField,
    onSaved,
    refreshEsignTemplatesConfigured,
    savedSnapshot,
    saving,
  ])

  const statusOptions = useMemo(
    () =>
      offeringStatusOptionsForOverview(detail.dealStage, draft.offeringStatus),
    [detail.dealStage, draft.offeringStatus],
  )

  const statusFieldEditable = isOfferingStatusFieldEditable(detail.dealStage)

  const statusFieldLockedHint = useMemo(() => {
    if (statusFieldEditable) {
      const stage = String(detail.dealStage ?? "").trim().toLowerCase()
      if (stage === "draft") {
        return "Set status to Open to Investment and click Save — the deal will move to Capital Raising automatically when eSign and classes are ready."
      }
      return undefined
    }
    const stage = String(detail.dealStage ?? "").trim().toLowerCase()
    if (stage === "asset_managing" || stage === "managing_asset") {
      return "Deal status is locked while the deal is Managing Asset (Closed only)."
    }
    if (stage === "liquidated") {
      return "Deal status is locked while the deal is Liquidated (Past only)."
    }
    return "Deal status can only be changed while the deal is in Draft or Capital Raising."
  }, [detail.dealStage, statusFieldEditable])

  const visibilityOptionHint = useMemo(() => {
    const opt = OFFERING_VISIBILITY_OPTIONS.find(
      (o) => o.value === draft.offeringVisibility,
    )
    return opt && "optionHint" in opt
      ? (opt as { optionHint?: string }).optionHint
      : undefined
  }, [draft.offeringVisibility])

  const id = detail.id
  const statusControlDescribedBy = statusFieldLockedHint
    ? statusHintId
    : undefined
  const classFieldsDisabled = classes.length === 0

  const closeDateInputValue = useMemo(
    () => closeDateForDateInput(detail.closeDate),
    [detail.closeDate],
  )

  const isSelectedLpClass = isLpInvestorClass(selectedClassRow)

  const showNumberOfUnitsRow = isSelectedLpClass

  const showPricePerUnitRow = isSelectedLpClass

  return (
    <div className="deal_offering_overview" ref={overviewRef}>
      <OfferingOverviewLocationMap detail={detail} />

      <div className="deal_kh">
        <div className="deal_kh_table" role="table" aria-label="Offering overview">
          <div className="deal_kh_thead" role="rowgroup">
            <div
              className="deal_kh_tr deal_kh_tr_head deal_kh_tr_head_ov"
              role="row"
            >
              <div className="deal_kh_th" role="columnheader">
                Field
              </div>
              <div className="deal_kh_th" role="columnheader">
                Value
              </div>
            </div>
          </div>
          <div className="deal_kh_tbody" role="rowgroup">
            <div
              className="deal_kh_tr deal_kh_tr_body deal_kh_tr_body_ov"
              role="row"
            >
              <div className="deal_kh_td" role="cell">
                <span className="deal_kh_metric_label deal_offering_ov_label_line">
                  Deal Status
                  <span className="deal_offering_ov_req" aria-hidden>
                    *
                  </span>
                </span>
              </div>
              <div className="deal_kh_td deal_kh_td_stack" role="cell">
                {statusFieldEditable ? (
                  <DealOfferingStatusSelect
                    id={`deal-ov-status-${id}`}
                    value={draft.offeringStatus}
                    options={statusOptions}
                    ariaDescribedBy={statusControlDescribedBy}
                    onChange={(next) => {
                      void tryApplyOfferingStatus(next)
                    }}
                  />
                ) : (
                  <div
                    id={`deal-ov-status-${id}`}
                    aria-describedby={statusControlDescribedBy}
                  >
                    <DealOfferingStatusReadonly value={detail.offeringStatus} />
                  </div>
                )}
                {statusFieldLockedHint ? (
                  <div
                    id={statusHintId}
                    className="deal_offering_visibility_hint"
                    role="note"
                  >
                    <Info
                      size={15}
                      strokeWidth={2}
                      className="deal_offering_visibility_hint_icon"
                      aria-hidden
                    />
                    <span>{statusFieldLockedHint}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div
              className="deal_kh_tr deal_kh_tr_body deal_kh_tr_body_ov"
              role="row"
            >
              <div className="deal_kh_td" role="cell">
                <span className="deal_kh_metric_label deal_offering_ov_label_line">
                  Visibility
                  <span className="deal_offering_ov_req" aria-hidden>
                    *
                  </span>
                </span>
              </div>
              <div className="deal_kh_td deal_kh_td_stack" role="cell">
                <select
                  id={`deal-ov-vis-${id}`}
                  className="deal_kh_select"
                  value={draft.offeringVisibility}
                  aria-required
                  aria-describedby={
                    visibilityOptionHint ? visibilityHintId : undefined
                  }
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      offeringVisibility: normalizeVisibility(e.target.value),
                    }))
                  }
                >
                  {OFFERING_VISIBILITY_OPTIONS.map((o) => (
                    <option
                      key={o.value}
                      value={o.value}
                      title={
                        "optionHint" in o
                          ? (o as { optionHint?: string }).optionHint
                          : undefined
                      }
                    >
                      {o.label}
                    </option>
                  ))}
                </select>
                {visibilityOptionHint ? (
                  <div
                    id={visibilityHintId}
                    className="deal_offering_visibility_hint"
                    role="note"
                  >
                    <Info
                      size={15}
                      strokeWidth={2}
                      className="deal_offering_visibility_hint_icon"
                      aria-hidden
                    />
                    <span>{visibilityOptionHint}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div
              className="deal_kh_tr deal_kh_tr_body deal_kh_tr_body_ov"
              role="row"
            >
              <div className="deal_kh_td" role="cell">
                <span className="deal_kh_metric_label deal_offering_ov_label_line">
                  <span>Offering name</span>
                  <span className="deal_offering_ov_req" aria-hidden>
                    *
                  </span>
                  <span
                    className="deal_offering_ov_help"
                    title="Title investors see for this offering."
                  >
                    <HelpCircle size={14} strokeWidth={2} aria-hidden />
                  </span>
                </span>
              </div>
              <div className="deal_kh_td" role="cell">
                <input
                  id={`deal-ov-oname-${id}`}
                  type="text"
                  className="deal_kh_input"
                  value={draft.dealName}
                  required
                  aria-required
                  onChange={(e) => {
                    setDealNameError(undefined)
                    setDraft((d) => ({ ...d, dealName: e.target.value }))
                  }}
                  autoComplete="off"
                  aria-label="Offering name"
                  aria-invalid={dealNameError ? true : undefined}
                  aria-describedby={
                    dealNameError ? `deal-ov-oname-err-${id}` : undefined
                  }
                />
                {dealNameError ? (
                  <p
                    id={`deal-ov-oname-err-${id}`}
                    className="deals_create_field_error"
                    role="alert"
                  >
                    {dealNameError}
                  </p>
                ) : null}
              </div>
            </div>

            <div
              className="deal_kh_tr deal_kh_tr_body deal_kh_tr_body_ov"
              role="row"
            >
              <div className="deal_kh_td" role="cell">
                <span className="deal_kh_metric_label deal_offering_ov_label_line">
                  <span>Deal type</span>
                  <span
                    className="deal_offering_ov_help"
                    title="Syndication structure (from create-deal wizard)."
                  >
                    <HelpCircle size={14} strokeWidth={2} aria-hidden />
                  </span>
                </span>
              </div>
              <div className="deal_kh_td" role="cell">
                <select
                  id={`deal-ov-dtype-${id}`}
                  className="deal_kh_select"
                  value={draft.dealType}
                  aria-label="Deal type"
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, dealType: e.target.value }))
                  }
                >
                  <option value="">Select deal type</option>
                  {DEAL_FORM_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              className="deal_kh_tr deal_kh_tr_body deal_kh_tr_body_ov"
              role="row"
            >
              <div className="deal_kh_td" role="cell">
                <span className="deal_kh_metric_label deal_offering_ov_label_line">
                  <span>SEC type</span>
                  <span
                    className="deal_offering_ov_help"
                    title="From the main deal profile. Edit on the deal form if needed."
                  >
                    <HelpCircle size={14} strokeWidth={2} aria-hidden />
                  </span>
                </span>
              </div>
              <div className="deal_kh_td" role="cell">
                <select
                  id={`deal-ov-sec-${id}`}
                  className="deal_kh_select"
                  value={detail.secType?.trim() ?? ""}
                  disabled
                  aria-disabled
                  aria-label="SEC type"
                  title="Edit on the main deal profile."
                >
                  {SEC_TYPE_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              className="deal_kh_tr deal_kh_tr_body deal_kh_tr_body_ov"
              role="row"
            >
              <div className="deal_kh_td" role="cell">
                <span className="deal_kh_metric_label deal_offering_ov_label_line">
                  <span>Close date</span>
                  <span
                    className="deal_offering_ov_help"
                    title="Target close date from the main deal profile."
                  >
                    <HelpCircle size={14} strokeWidth={2} aria-hidden />
                  </span>
                </span>
              </div>
              <div className="deal_kh_td" role="cell">
                <input
                  id={`deal-ov-close-${id}`}
                  type="date"
                  className="deal_kh_input"
                  value={closeDateInputValue}
                  disabled
                  aria-disabled
                  aria-label="Close date"
                  title="Edit on the main deal profile."
                />
              </div>
            </div>

            <div
              className="deal_kh_tr deal_kh_tr_body deal_kh_tr_body_ov"
              role="row"
            >
              <div className="deal_kh_td" role="cell">
                <span className="deal_kh_metric_label deal_offering_ov_label_line">
                  <span>Investment type</span>
                  <span
                    className="deal_offering_ov_help"
                    title="Applies to the selected investor class; saved with overview."
                  >
                    <HelpCircle size={14} strokeWidth={2} aria-hidden />
                  </span>
                </span>
              </div>
              <div className="deal_kh_td" role="cell">
                <select
                  id={`deal-ov-invtype-${id}`}
                  className="deal_kh_select"
                  value={draft.classInvestmentType}
                  disabled={classFieldsDisabled}
                  aria-disabled={classFieldsDisabled}
                  aria-label="Investment type"
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      classInvestmentType: e.target.value,
                    }))
                  }
                >
                  {OVERVIEW_INVESTMENT_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              className="deal_kh_tr deal_kh_tr_body deal_kh_tr_body_ov"
              role="row"
            >
              <div className="deal_kh_td" role="cell">
                <span className="deal_kh_metric_label deal_offering_ov_label_line">
                  <span>Assets</span>
                  {assetRows.length > 0 ? (
                    <span className="deal_offering_ov_req" aria-hidden>
                      *
                    </span>
                  ) : null}
                  <span
                    className="deal_offering_ov_help"
                    title="When Assets is set to “Make it visible to Investors”, assets from the Assets section are added here (any count). Remove any you do not want on the offering, then Save."
                  >
                    <HelpCircle size={14} strokeWidth={2} aria-hidden />
                  </span>
                </span>
              </div>
              <div className="deal_kh_td deal_kh_td_stack" role="cell">
                {assetRows.length === 0 ? (
                  <span className="deal_offering_overview_muted">
                    No assets yet. Add assets in the Assets section first.
                  </span>
                ) : (
                  <OfferingOverviewAssetsMultiSelect
                    controlId={`deal-ov-assets-${id}`}
                    assetRows={assetRows}
                    selectedIds={draft.selectedAssetIds}
                    onSelectedIdsChange={(ids) =>
                      setDraft((d) => ({ ...d, selectedAssetIds: ids }))
                    }
                  />
                )}
              </div>
            </div>

            <div
              className="deal_kh_tr deal_kh_tr_body deal_kh_tr_body_ov"
              role="row"
            >
              <div className="deal_kh_td" role="cell">
                <span className="deal_kh_metric_label deal_offering_ov_label_line">
                  <span>Investor class</span>
                  {classes.length > 0 ? (
                    <span className="deal_offering_ov_req" aria-hidden>
                      *
                    </span>
                  ) : null}
                  <span
                    className="deal_offering_ov_help"
                    title="Economics below apply to this class; manage full class terms under Classes."
                  >
                    <HelpCircle size={14} strokeWidth={2} aria-hidden />
                  </span>
                </span>
              </div>
              <div className="deal_kh_td" role="cell">
                <select
                  id={`deal-ov-class-${id}`}
                  className="deal_kh_select"
                  disabled={classFieldsDisabled}
                  aria-required={!classFieldsDisabled}
                  value={draft.selectedClassId}
                  onChange={(e) => {
                    const cid = e.target.value
                    const row = classes.find((c) => c.id === cid)
                    setDraft((d) =>
                      row
                        ? {
                            ...d,
                            selectedClassId: cid,
                            classOfferingSize: blurFormatMoneyInput(
                              row.offeringSize ?? "",
                            ),
                            classMinimumInvestment: blurFormatMoneyInput(
                              row.minimumInvestment ?? "",
                            ),
                            classNumberOfUnits: blurFormatNumberOfUnitsInput(
                              row.numberOfUnits ?? "",
                            ),
                            classPricePerUnit: isLpInvestorClass(row)
                              ? computeInvestorClassPricePerUnitFromForm({
                                  offeringSize: blurFormatMoneyInput(
                                    row.offeringSize ?? "",
                                  ),
                                  raiseAmountDistributions: blurFormatMoneyInput(
                                    row.raiseAmountDistributions ?? "",
                                  ),
                                  numberOfUnits: blurFormatNumberOfUnitsInput(
                                    row.numberOfUnits ?? "",
                                  ),
                                })
                              : blurFormatMoneyInput(row.pricePerUnit ?? ""),
                            classInvestmentType:
                              investmentTypeFromClassRow(row),
                          }
                        : { ...d, selectedClassId: cid },
                    )
                  }}
                >
                  {classes.length === 0 ? (
                    <option value="">No classes yet</option>
                  ) : null}
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name.trim() || c.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              className="deal_kh_tr deal_kh_tr_body deal_kh_tr_body_ov"
              role="row"
            >
              <div className="deal_kh_td" role="cell">
                <span className="deal_kh_metric_label deal_offering_ov_label_line">
                  Minimum investment
                </span>
              </div>
              <div className="deal_kh_td" role="cell">
                <input
                  id={`deal-ov-min-${id}`}
                  type="text"
                  className="deal_kh_input"
                  inputMode="decimal"
                  disabled={classFieldsDisabled}
                  aria-disabled={classFieldsDisabled}
                  value={draft.classMinimumInvestment}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      classMinimumInvestment: formatCurrencyUsdTypeInput(
                        e.target.value,
                      ),
                    }))
                  }
                  onBlur={(e) =>
                    setDraft((d) => ({
                      ...d,
                      classMinimumInvestment: blurFormatMoneyInput(
                        e.target.value,
                      ),
                    }))
                  }
                  autoComplete="off"
                  aria-label="Minimum investment"
                />
              </div>
            </div>

            <div
              className="deal_kh_tr deal_kh_tr_body deal_kh_tr_body_ov"
              role="row"
            >
              <div className="deal_kh_td" role="cell">
                <span className="deal_kh_metric_label deal_offering_ov_label_line">
                  Offering size
                  {!classFieldsDisabled ? (
                    <span className="deal_offering_ov_req" aria-hidden>
                      *
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="deal_kh_td" role="cell">
                <input
                  id={`deal-ov-osize-${id}`}
                  type="text"
                  className="deal_kh_input"
                  inputMode="decimal"
                  disabled={classFieldsDisabled}
                  required={!classFieldsDisabled}
                  aria-required={!classFieldsDisabled}
                  value={draft.classOfferingSize}
                  aria-invalid={classOfferingSizeError ? true : undefined}
                  aria-describedby={
                    classOfferingSizeError
                      ? `deal-ov-osize-err-${id}`
                      : undefined
                  }
                  onChange={(e) => {
                    setClassOfferingSizeError(undefined)
                    setDraft((d) =>
                      withOverviewAutoPricePerUnit(
                        {
                          classOfferingSize: formatCurrencyUsdTypeInput(
                            e.target.value,
                          ),
                        },
                        d,
                        isSelectedLpClass,
                      ),
                    )
                  }}
                  onBlur={(e) =>
                    setDraft((d) =>
                      withOverviewAutoPricePerUnit(
                        {
                          classOfferingSize: blurFormatMoneyInput(e.target.value),
                        },
                        d,
                        isSelectedLpClass,
                      ),
                    )
                  }
                  autoComplete="off"
                  aria-label="Offering size"
                />
                {classOfferingSizeError ? (
                  <p
                    id={`deal-ov-osize-err-${id}`}
                    className="deals_create_field_error"
                    role="alert"
                  >
                    {classOfferingSizeError}
                  </p>
                ) : null}
              </div>
            </div>

            {showNumberOfUnitsRow ? (
              <div
                className="deal_kh_tr deal_kh_tr_body deal_kh_tr_body_ov"
                role="row"
              >
                <div className="deal_kh_td" role="cell">
                  <span className="deal_kh_metric_label deal_offering_ov_label_line">
                    Number of units
                  </span>
                </div>
                <div className="deal_kh_td" role="cell">
                  <input
                    id={`deal-ov-nunits-${id}`}
                    type="text"
                    className="deal_kh_input"
                    inputMode="numeric"
                    disabled={classFieldsDisabled}
                    aria-disabled={classFieldsDisabled}
                    value={draft.classNumberOfUnits}
                    onChange={(e) =>
                      setDraft((d) =>
                        withOverviewAutoPricePerUnit(
                          {
                            classNumberOfUnits: formatNumberOfUnitsTypingInput(
                              e.target.value,
                            ),
                          },
                          d,
                          isSelectedLpClass,
                        ),
                      )
                    }
                    onBlur={(e) =>
                      setDraft((d) =>
                        withOverviewAutoPricePerUnit(
                          {
                            classNumberOfUnits: blurFormatNumberOfUnitsInput(
                              e.target.value,
                            ),
                          },
                          d,
                          isSelectedLpClass,
                        ),
                      )
                    }
                    autoComplete="off"
                    aria-label="Number of units"
                  />
                </div>
              </div>
            ) : null}

            {showPricePerUnitRow ? (
              <div
                className="deal_kh_tr deal_kh_tr_body deal_kh_tr_body_ov"
                role="row"
              >
                <div className="deal_kh_td" role="cell">
                  <span className="deal_kh_metric_label deal_offering_ov_label_line">
                    Price per unit
                  </span>
                </div>
                <div className="deal_kh_td" role="cell">
                  <input
                    id={`deal-ov-ppu-${id}`}
                    type="text"
                    className="deal_kh_input"
                    inputMode="decimal"
                    disabled={classFieldsDisabled}
                    aria-disabled={classFieldsDisabled}
                    value={draft.classPricePerUnit}
                    readOnly
                    aria-readonly
                    tabIndex={-1}
                    autoComplete="off"
                    aria-label="Price per unit (calculated from offering size and number of units)"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="deal_kh_footer um_modal_actions add_contact_modal_actions">
          <button
            type="button"
            className="um_btn_secondary"
            disabled={!isDirty || saving}
            onClick={handleReset}
          >
            <RotateCcw size={17} strokeWidth={2} aria-hidden />
            Reset
          </button>
          <div className="add_contact_modal_actions_trailing">
            <button
              type="button"
              className="um_btn_primary"
              disabled={!isDirty || saving}
              onClick={() => void handleSave()}
            >
              {saving ? (
                <>
                  <Loader2
                    size={18}
                    strokeWidth={2}
                    className="deal_offering_btn_spin"
                    aria-hidden
                  />
                  Saving…
                </>
              ) : (
                <>
                  <Save size={18} strokeWidth={2} aria-hidden />
                  Save
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <OpenInvestmentEsignRequiredModal
        open={esignRequiredModalOpen}
        onCancel={() => setEsignRequiredModalOpen(false)}
        onGoToEsignTemplates={goToEsignTemplatesTab}
      />
      <OpenInvestmentDraftStageInfoModal
        open={draftStageInfoModalOpen}
        onCancel={cancelDraftStageOpenInvestment}
        onConfirm={confirmDraftStageOpenInvestment}
      />
    </div>
  )
}
