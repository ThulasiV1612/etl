import { ArrowLeft, Building2, CircleDollarSign, Percent } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
  Link,
} from "react-router-dom"
import { TabsScrollStrip } from "../../../../common/components/tabs-scroll-strip/TabsScrollStrip"
import { toast } from "../../../../common/components/Toast/toastStore"
import { setAppDocumentTitle } from "../../../../common/utils/appDocumentTitle"
import {
  buildDealDetailReturnSearch,
  OFFERING_DETAILS_CLASSES_RETURN,
  type DealDetailReturnState,
} from "../utils/offeringDetailsSectionNav"
import {
  fetchDistributionSetup,
  completeDistributionSetup,
  newPaymentRowId,
  saveDistributionSetup,
} from "./api/distributionSetupApi"
import { fetchDealById, fetchDealInvestors } from "../api/dealsApi"
import {
  allocateInvestorsByPreferredDue,
  classTotalsFromInvestorLines,
  sanitizePriorDistributions,
} from "../tabs/distributions/utils/investorPreferredAllocation"
import { getPeriodWindow, periodLabel } from "./utils/distributionPeriod"
import { DistributionSetupSkeleton } from "./components/DistributionSetupSkeleton"
import { DistributionFeePanel } from "./components/DistributionFeePanel"
import { DistributionSimPanel } from "./components/DistributionSimPanel"
import { UnsavedChangesModal } from "./components/UnsavedChangesModal"
import { WaterfallBuilder } from "./components/WaterfallBuilder"
import type {
  DistributionFeeConfig,
  DistributionPaymentRow,
  DistributionSetupBundle,
  DistributionWaterfalls,
  DistributionWfKind,
  DistributionWfSource,
  PriorDistributionRecord,
} from "./types/distribution-setup.types"
import { KIND_META } from "./types/distribution-setup.types"
import {
  blurFormatMoneyInput,
  parseMoneyDigits,
} from "../utils/offeringMoneyFormat"
import { allocateCentsByWeight, roundMoney } from "./engine/helpers/rounding"
import {
  defaultPayToForKind,
  investedCapitalFromClasses,
  periodFromFactor,
  runDistributionSim,
  type InvestmentAccrualLine,
  type PreferredDayCountMode,
} from "./utils/distributionSim"
import {
  allocateFeeCashByClass,
  emptyDistributionFeeConfig,
  mergeFeeTypeOptions,
  syncFeeClassSplits,
  validateDistributionFee,
} from "./utils/distributionFee"
import { findDuplicateDistributionName } from "./utils/distributionNameUniqueness"
import {
  buildCashFlows,
  type HurdleCashFlow,
} from "./utils/hurdleCalculations"
import { resolveDealInvestmentDateIso } from "./utils/resolveDealInvestmentDate"
import {
  allocateInvestorDistributionLines,
  fillClassPaymentsFromStoredPercents,
  investorCapitalForDistribution,
  resolveInvestorClass,
} from "../tabs/distributions/utils/investorDistributionAllocation"
import type { DealInvestorRow } from "../types/deal-investors.types"
import "../../usermanagement/user_management.css"
import "../deals-list.css"
import "./distribution-setup.css"

function priorRecordsToCashFlows(
  records: PriorDistributionRecord[],
): Array<{ amount: number; date: Date }> {
  const out: Array<{ amount: number; date: Date }> = []
  for (const row of records) {
    const amount = parseMoneyDigits(row.amount)
    if (!Number.isFinite(amount) || amount === 0) continue
    const date = new Date(row.date)
    if (Number.isNaN(date.getTime())) continue
    out.push({ amount, date })
  }
  return out
}

interface SetupPersistSnapshot {
  waterfallsJson: string
  setupName: string
  dayCountMode: PreferredDayCountMode
  investmentDate: string
  distributionFeeJson: string
}

function buildPersistSnapshot(params: {
  waterfalls: DistributionWaterfalls
  setupName: string
  dayCountMode: PreferredDayCountMode
  investmentDate: string
  distributionFee: DistributionFeeConfig
}): SetupPersistSnapshot {
  return {
    waterfallsJson: JSON.stringify(params.waterfalls),
    setupName: params.setupName.trim(),
    dayCountMode: params.dayCountMode,
    investmentDate: params.investmentDate || "",
    distributionFeeJson: JSON.stringify(params.distributionFee),
  }
}

type DsMainTab = DistributionWfSource | "fee"

export function DistributionSetupPage() {
  const { dealId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const returnState = location.state as DealDetailReturnState | null
  const editDistributionIdParam = (
    searchParams.get("editDistributionId") ||
    searchParams.get("edit_distribution_id") ||
    ""
  ).trim()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [bundle, setBundle] = useState<DistributionSetupBundle | null>(null)
  const [mainTab, setMainTab] = useState<DsMainTab>("fee")
  const activeWf: DistributionWfSource =
    mainTab === "fee" ? "operating" : mainTab
  const [addKind, setAddKind] = useState<DistributionWfKind>("LP_PREF")
  const [simCash, setSimCash] = useState(() => blurFormatMoneyInput("25000"))
  const [simPeriod, setSimPeriod] = useState("0.25")
  const [stageMet, setStageMet] = useState<Record<number, boolean>>({})
  const [dueOverrides, setDueOverrides] = useState<Record<string, number>>({})
  const [investmentDate, setInvestmentDate] = useState("")
  const [investmentDateSource, setInvestmentDateSource] = useState<
    "close" | "funded" | "none"
  >("none")
  const [setupName, setSetupName] = useState("")
  const [distributionRunName, setDistributionRunName] = useState("")
  const [editingDistributionId, setEditingDistributionId] = useState("")
  const [distributionDate, setDistributionDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [periodStart, setPeriodStart] = useState(() => {
    const asOf = new Date().toISOString().slice(0, 10)
    return getPeriodWindow(asOf, "quarterly").start
  })
  const [periodEnd, setPeriodEnd] = useState(() => {
    const asOf = new Date().toISOString().slice(0, 10)
    return getPeriodWindow(asOf, "quarterly").end
  })
  const [otherAdjustment, setOtherAdjustment] = useState(() =>
    blurFormatMoneyInput("0"),
  )
  const [dayCountMode, setDayCountMode] =
    useState<PreferredDayCountMode>("period_window")
  const [distributionFee, setDistributionFee] = useState<DistributionFeeConfig>(
    () => emptyDistributionFeeConfig(),
  )
  const [investmentLines, setInvestmentLines] = useState<
    InvestmentAccrualLine[]
  >([])
  const [dealInvestors, setDealInvestors] = useState<DealInvestorRow[]>([])
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState<SetupPersistSnapshot | null>(
    null,
  )

  function captureSavedSnapshot(params: {
    waterfalls: DistributionWaterfalls
    setupName: string
    dayCountMode: PreferredDayCountMode
    investmentDate: string
    distributionFee: DistributionFeeConfig
  }) {
    setSavedSnapshot(buildPersistSnapshot(params))
  }

  const isDirty = useMemo(() => {
    if (!bundle || !savedSnapshot) return false
    const current = buildPersistSnapshot({
      waterfalls: bundle.waterfalls,
      setupName,
      dayCountMode,
      investmentDate,
      distributionFee,
    })
    return (
      current.waterfallsJson !== savedSnapshot.waterfallsJson ||
      current.setupName !== savedSnapshot.setupName ||
      current.dayCountMode !== savedSnapshot.dayCountMode ||
      current.investmentDate !== savedSnapshot.investmentDate ||
      current.distributionFeeJson !== savedSnapshot.distributionFeeJson
    )
  }, [
    bundle,
    setupName,
    dayCountMode,
    investmentDate,
    distributionFee,
    savedSnapshot,
  ])

  function buildInvestmentLines(
    investors: DealInvestorRow[],
    classes: DistributionSetupBundle["classes"],
  ): InvestmentAccrualLine[] {
    const out: InvestmentAccrualLine[] = []
    for (const inv of investors) {
      const cls = resolveInvestorClass(inv.investorClass ?? "", classes)
      if (!cls) continue
      const capital = investorCapitalForDistribution(inv)
      if (!(capital > 0)) continue
      const funded = String(inv.fundedDate ?? "")
        .trim()
        .slice(0, 10)
      const accrualStartIso = /^\d{4}-\d{2}-\d{2}$/.test(funded)
        ? funded
        : ""
      out.push({
        classId: cls.id,
        capital,
        accrualStartIso,
      })
    }
    return out
  }

  function applyPriorRunToForm(prior: PriorDistributionRecord) {
    const sourceRaw = (prior.source ?? "").trim().toLowerCase()
    const sourceTab =
      sourceRaw === "fee" || sourceRaw === "distribution_fee"
        ? "fee"
        : sourceRaw === "capital" || sourceRaw === "capital_event"
          ? "capital"
          : "operating"
    setMainTab(sourceTab)
    setEditingDistributionId(prior.id)
    if (prior.name?.trim()) setDistributionRunName(prior.name.trim())
    else setDistributionRunName("")
    const priorAmt = parseMoneyDigits(prior.amount)
    if (Number.isFinite(priorAmt) && priorAmt > 0)
      setSimCash(blurFormatMoneyInput(String(priorAmt)))
    const asOf =
      (prior.paymentDate && /^\d{4}-\d{2}-\d{2}$/.test(prior.paymentDate)
        ? prior.paymentDate
        : "") ||
      (prior.periodEnd && /^\d{4}-\d{2}-\d{2}$/.test(prior.periodEnd)
        ? prior.periodEnd
        : "") ||
      prior.date
    setDistributionDate(asOf)
    let nextPeriodFactor = "0.25"
    if (
      prior.period === "monthly" ||
      prior.period === "quarterly" ||
      prior.period === "annual"
    ) {
      nextPeriodFactor =
        prior.period === "monthly"
          ? "0.083333"
          : prior.period === "annual"
            ? "1"
            : "0.25"
      setSimPeriod(nextPeriodFactor)
    } else {
      setSimPeriod("0.25")
    }
    if (
      prior.periodStart &&
      /^\d{4}-\d{2}-\d{2}$/.test(prior.periodStart) &&
      prior.periodEnd &&
      /^\d{4}-\d{2}-\d{2}$/.test(prior.periodEnd)
    ) {
      setPeriodStart(prior.periodStart)
      setPeriodEnd(prior.periodEnd)
    } else {
      const win = getPeriodWindow(
        asOf,
        periodFromFactor(Number(nextPeriodFactor) || 0.25),
      )
      setPeriodStart(win.start)
      setPeriodEnd(win.end)
    }
  }

  const dealDetailPath =
    dealId != null && dealId !== ""
      ? `/deals/${encodeURIComponent(dealId)}`
      : "/deals"

  const classSetupHref = dealId
    ? `/deals/${encodeURIComponent(dealId)}/class-setup`
    : "/deals"

  const detailsReturnHref =
    dealId && editingDistributionId
      ? `/deals/${encodeURIComponent(dealId)}/distributions/${encodeURIComponent(editingDistributionId)}`
      : ""

  const goBack = useCallback(() => {
    if (detailsReturnHref) {
      navigate(detailsReturnHref)
      return
    }
    const qs = buildDealDetailReturnSearch({
      tab:
        returnState?.returnTab ??
        OFFERING_DETAILS_CLASSES_RETURN.returnTab ??
        "offering_details",
      offeringSection:
        returnState?.returnSection ??
        OFFERING_DETAILS_CLASSES_RETURN.returnSection,
    })
    navigate(`${dealDetailPath}${qs}`)
  }, [
    dealDetailPath,
    detailsReturnHref,
    navigate,
    returnState?.returnSection,
    returnState?.returnTab,
  ])

  const load = useCallback(async () => {
    if (!dealId) return
    setLoading(true)
    try {
      const [next, deal, invPayload] = await Promise.all([
        fetchDistributionSetup(dealId),
        fetchDealById(dealId).catch(() => null),
        fetchDealInvestors(dealId, { lpInvestorsOnly: false }).catch(
          () => null,
        ),
      ])
      setBundle({
        ...next,
        priorDistributions: sanitizePriorDistributions(
          next.priorDistributions ?? [],
        ),
      })
      const nextSetupName = next.setupName ?? ""
      const nextDayCountMode = next.dayCountMode ?? "period_window"
      let nextInvestmentDate = ""
      setSetupName(nextSetupName)
      setDistributionRunName("")
      setEditingDistributionId("")
      setDueOverrides({})
      setStageMet({})
      setDayCountMode(nextDayCountMode)
      if (
        next.defaultAccrualStartIso &&
        /^\d{4}-\d{2}-\d{2}$/.test(next.defaultAccrualStartIso)
      ) {
        nextInvestmentDate = next.defaultAccrualStartIso
        setInvestmentDate(next.defaultAccrualStartIso)
        setInvestmentDateSource("funded")
      }
      setSimPeriod("0.25")
      setOtherAdjustment(blurFormatMoneyInput("0"))

      const nextFee = syncFeeClassSplits({
        classes: next.classes,
        splits:
          next.distributionFee?.classSplits ??
          emptyDistributionFeeConfig(next.classes).classSplits,
      })
      const defaults = emptyDistributionFeeConfig(next.classes)
      const priorFeeTypes = (next.priorDistributions ?? [])
        .filter((p) => {
          const s = (p.source ?? "").trim().toLowerCase()
          return s === "fee" || s === "distribution_fee"
        })
        .flatMap((p) => [p.distributionType, p.name])
        .filter((t): t is string => Boolean(t?.trim()))
      const loadedFee: DistributionFeeConfig = {
        ...defaults,
        ...(next.distributionFee ?? {}),
        classSplits: nextFee,
        cashAvailable: blurFormatMoneyInput(
          next.distributionFee?.cashAvailable ?? "0",
        ),
        type:
          next.distributionFee?.type?.trim() ||
          next.distributionFee?.name?.trim() ||
          defaults.type,
        typeOptions: mergeFeeTypeOptions({
          options: next.distributionFee?.typeOptions,
          extra: [
            ...(next.distributionFee?.type
              ? [next.distributionFee.type]
              : []),
            ...(next.distributionFee?.name
              ? [next.distributionFee.name]
              : []),
            ...priorFeeTypes,
          ],
        }),
        periodStart:
          next.distributionFee?.periodStart &&
          /^\d{4}-\d{2}-\d{2}$/.test(next.distributionFee.periodStart)
            ? next.distributionFee.periodStart
            : defaults.periodStart,
        periodEnd:
          next.distributionFee?.periodEnd &&
          /^\d{4}-\d{2}-\d{2}$/.test(next.distributionFee.periodEnd)
            ? next.distributionFee.periodEnd
            : defaults.periodEnd,
      }
      setDistributionFee(loadedFee)

      const sanitizedPriors = sanitizePriorDistributions(
        next.priorDistributions ?? [],
      )
      const editTarget = editDistributionIdParam
        ? sanitizedPriors.find(
            (p) => String(p.id).trim() === editDistributionIdParam,
          )
        : null

      if (editTarget) {
        applyPriorRunToForm(editTarget)
      } else if (sanitizedPriors.length > 0) {
        // Prefill cash + date from the latest prior run (deal data), not hardcoded.
        const latest = [...sanitizedPriors].sort((a, b) =>
          (b.paymentDate || b.date).localeCompare(a.paymentDate || a.date),
        )[0]!
        applyPriorRunToForm(latest)
        // Opening setup without an explicit edit id is a new-run draft,
        // prefilled from latest — do not keep replace mode.
        setEditingDistributionId("")
      } else {
        const today = new Date().toISOString().slice(0, 10)
        setDistributionDate(today)
        const win = getPeriodWindow(today, "quarterly")
        setPeriodStart(win.start)
        setPeriodEnd(win.end)
      }

      if (editDistributionIdParam && !editTarget) {
        toast.error(
          "Distribution not found",
          "That distribution could not be loaded for edit.",
        )
        setSearchParams(
          (prev) => {
            const nextParams = new URLSearchParams(prev)
            nextParams.delete("editDistributionId")
            nextParams.delete("edit_distribution_id")
            return nextParams
          },
          { replace: true },
        )
      }

      const investors = invPayload?.investors ?? []
      setDealInvestors(investors)
      setInvestmentLines(buildInvestmentLines(investors, next.classes))

      const closeDate = deal?.closeDate ?? null
      const fromClose = resolveDealInvestmentDateIso({ closeDate })
      if (fromClose) {
        nextInvestmentDate = fromClose
        setInvestmentDate(fromClose)
        setInvestmentDateSource("close")
      } else {
        const fromFunded = resolveDealInvestmentDateIso({
          investors,
        })
        if (fromFunded) {
          nextInvestmentDate = fromFunded
          setInvestmentDate(fromFunded)
          setInvestmentDateSource("funded")
        } else if (!nextInvestmentDate) {
          setInvestmentDate("")
          setInvestmentDateSource("none")
        }
      }

      captureSavedSnapshot({
        waterfalls: next.waterfalls,
        setupName: nextSetupName,
        dayCountMode: nextDayCountMode,
        investmentDate: nextInvestmentDate,
        distributionFee: loadedFee,
      })
    } catch (err) {
      toast.error(
        "Could not load distribution setup",
        err instanceof Error ? err.message : "Try again later.",
      )
    } finally {
      setLoading(false)
    }
  }, [dealId, editDistributionIdParam, setSearchParams])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setAppDocumentTitle(
      editingDistributionId ? "Edit Distribution" : "Distribution Setup",
    )
  }, [editingDistributionId])

  const isEditingRun = Boolean(editingDistributionId)
  const editingRunLabel =
    distributionRunName.trim() ||
    (isEditingRun ? "this distribution" : "")

  const rows = bundle?.waterfalls[activeWf] ?? []

  function patchRows(nextRows: DistributionPaymentRow[]) {
    if (!bundle) return
    setBundle({
      ...bundle,
      waterfalls: {
        ...bundle.waterfalls,
        [activeWf]: nextRows,
      },
    })
  }

  function handleAddRow() {
    if (!bundle) return
    const row: DistributionPaymentRow = {
      id: newPaymentRowId(),
      kind: addKind,
      name: KIND_META[addKind].defaultName,
      payTo: defaultPayToForKind(addKind, bundle.classes),
      amountMode: "calc",
      inputAmount: blurFormatMoneyInput("0") || "$0",
      catchupPct: "20",
    }
    patchRows([...rows, row])
  }

  function applyPeriodWindowFrom(asOfIso: string, periodFactorStr: string) {
    const asOf =
      asOfIso && /^\d{4}-\d{2}-\d{2}$/.test(asOfIso)
        ? asOfIso
        : new Date().toISOString().slice(0, 10)
    const win = getPeriodWindow(
      asOf,
      periodFromFactor(Number(periodFactorStr) || 0.25),
    )
    setPeriodStart(win.start)
    setPeriodEnd(win.end)
  }

  function handleDistributionDateChange(v: string) {
    setDistributionDate(v)
    applyPeriodWindowFrom(v, simPeriod)
  }

  function handlePeriodChange(v: string) {
    setSimPeriod(v)
    applyPeriodWindowFrom(distributionDate, v)
  }

  async function handleSave(): Promise<boolean> {
    if (!dealId || !bundle || saving) return false
    const feeCheck = validateDistributionFee({ fee: distributionFee })
    if (!feeCheck.ok) {
      toast.error("Acquisition fee", feeCheck.message)
      setMainTab("fee")
      return false
    }
    if (distributionFee.name.trim()) {
      const dup = findDuplicateDistributionName({
        candidate: distributionFee.name,
        priorDistributions: bundle.priorDistributions,
        distributionFee,
        ignoreFeeName: true,
        extraNames: distributionRunName.trim()
          ? [
              {
                name: distributionRunName,
                source: activeWf === "capital" ? "capital" : "operating",
              },
            ]
          : undefined,
      })
      if (dup) {
        toast.error("Duplicate name", dup)
        setMainTab("fee")
        return false
      }
    }
    setSaving(true)
    try {
      const saved = await saveDistributionSetup(
        dealId,
        bundle.waterfalls,
        setupName.trim(),
        {
          dayCountMode,
          defaultAccrualStartIso: investmentDate || undefined,
          distributionFee,
        },
      )
      setBundle(saved)
      const nextSetupName = saved.setupName ?? setupName.trim()
      const nextDayCount = saved.dayCountMode ?? dayCountMode
      const nextInvestDate =
        saved.defaultAccrualStartIso &&
        /^\d{4}-\d{2}-\d{2}$/.test(saved.defaultAccrualStartIso)
          ? saved.defaultAccrualStartIso
          : investmentDate
      setSetupName(nextSetupName)
      if (saved.dayCountMode) setDayCountMode(saved.dayCountMode)
      if (saved.defaultAccrualStartIso)
        setInvestmentDate(saved.defaultAccrualStartIso)
      const savedFee = syncFeeClassSplits({
        classes: saved.classes,
        splits:
          saved.distributionFee?.classSplits ?? distributionFee.classSplits,
      })
      const nextFee: DistributionFeeConfig = {
        ...emptyDistributionFeeConfig(saved.classes),
        ...(saved.distributionFee ?? distributionFee),
        classSplits: savedFee,
        cashAvailable: blurFormatMoneyInput(
          saved.distributionFee?.cashAvailable ??
            distributionFee.cashAvailable,
        ),
        type:
          saved.distributionFee?.type?.trim() ||
          distributionFee.type.trim() ||
          saved.distributionFee?.name?.trim() ||
          "",
        typeOptions: mergeFeeTypeOptions({
          options:
            saved.distributionFee?.typeOptions ?? distributionFee.typeOptions,
          extra: [
            saved.distributionFee?.type ?? "",
            distributionFee.type,
            saved.distributionFee?.name ?? "",
          ],
        }),
      }
      setDistributionFee(nextFee)
      captureSavedSnapshot({
        waterfalls: saved.waterfalls,
        setupName: nextSetupName,
        dayCountMode: nextDayCount,
        investmentDate: nextInvestDate,
        distributionFee: nextFee,
      })
      toast.success("Distribution setup saved")
      return true
    } catch (err) {
      toast.error(
        "Save failed",
        err instanceof Error ? err.message : "Try again.",
      )
      return false
    } finally {
      setSaving(false)
    }
  }

  function goToClassSetup() {
    setLeaveConfirmOpen(false)
    navigate(classSetupHref, { state: returnState })
  }

  function handleClassSetupClick() {
    if (!isDirty) {
      goToClassSetup()
      return
    }
    setLeaveConfirmOpen(true)
  }

  async function handleLeaveSave() {
    const ok = await handleSave()
    if (ok) goToClassSetup()
  }

  const sim = useMemo(() => {
    if (!bundle) {
      return {
        flowRows: [],
        perClass: {},
        leftover: 0,
        totalPaid: 0,
        hurdleEvaluations: [],
        stageMet: {},
        period: "quarterly" as const,
        periodWindowLabel: "",
        priorCashInPeriod: 0,
        preferredDayCount: 0,
        dayCountMode: "period_window" as const,
        preferredHurdleUnpaid: false,
      }
    }
    const invested = investedCapitalFromClasses(bundle.classes)
    const cashAmount = (() => {
      const n = parseMoneyDigits(simCash)
      return Number.isFinite(n) ? n : 0
    })()
    const asOf =
      distributionDate && /^\d{4}-\d{2}-\d{2}$/.test(distributionDate)
        ? distributionDate
        : new Date().toISOString().slice(0, 10)

    // Exclude the run being edited (and same-cash re-previews) so preferred
    // dues are not wiped by treating this cash as already paid.
    const priorsForSim = (bundle.priorDistributions ?? []).filter((p) => {
      if (
        editingDistributionId &&
        String(p.id).trim() === editingDistributionId
      )
        return false
      const amt = parseMoneyDigits(p.amount)
      if (!(Number.isFinite(amt) && amt > 0)) return false
      if (cashAmount > 0 && Math.abs(amt - cashAmount) < 0.02) return false
      return true
    })

    const prior = priorRecordsToCashFlows(priorsForSim)
    const invDate = (() => {
      if (!investmentDate || !/^\d{4}-\d{2}-\d{2}$/.test(investmentDate)) {
        return new Date(`${asOf}T00:00:00`)
      }
      const d = new Date(`${investmentDate}T00:00:00`)
      return Number.isNaN(d.getTime()) ? new Date(`${asOf}T00:00:00`) : d
    })()
    const cashFlows: HurdleCashFlow[] =
      invested > 0
        ? buildCashFlows({
            investmentAmount: invested,
            investmentDate: invDate,
            distributions: [
              ...prior,
              {
                amount: cashAmount,
                date: new Date(`${asOf}T00:00:00`),
              },
            ],
          })
        : []
    const cumulativeDistributions =
      prior.reduce((s, d) => s + d.amount, 0) + cashAmount

    return runDistributionSim({
      cash: cashAmount,
      periodFactor: Number(simPeriod) || 0.25,
      rows,
      classes: bundle.classes,
      promote: bundle.promote,
      stageMetOverrides: stageMet,
      dueOverrides,
      cashFlows,
      cumulativeDistributions,
      asOfDate: asOf,
      priorDistributions: priorsForSim,
      investmentDate,
      investments: investmentLines.map((l) => ({
        ...l,
        accrualStartIso:
          l.accrualStartIso ||
          (investmentDate && /^\d{4}-\d{2}-\d{2}/.test(investmentDate)
            ? investmentDate
            : ""),
      })),
      dayCountMode,
      periodStartIso: periodStart,
      periodEndIso: periodEnd,
    })
  }, [
    bundle,
    simCash,
    simPeriod,
    rows,
    stageMet,
    dueOverrides,
    investmentDate,
    investmentLines,
    dayCountMode,
    distributionDate,
    periodStart,
    periodEnd,
    editingDistributionId,
  ])

  /** Who receives what = Σ investor payments by class (waterfall + Other). */
  const classDisplayTotals = useMemo((): Record<string, number> => {
    if (!bundle) return {}
    const cashAmount = (() => {
      const n = parseMoneyDigits(simCash)
      return Number.isFinite(n) ? Math.max(0, n) : 0
    })()
    const otherRaw = parseMoneyDigits(otherAdjustment)
    const other = Number.isFinite(otherRaw) ? otherRaw : 0
    const asOf =
      distributionDate && /^\d{4}-\d{2}-\d{2}$/.test(distributionDate)
        ? distributionDate
        : new Date().toISOString().slice(0, 10)
    const window =
      periodStart &&
      /^\d{4}-\d{2}-\d{2}$/.test(periodStart) &&
      periodEnd &&
      /^\d{4}-\d{2}-\d{2}$/.test(periodEnd) &&
      periodEnd >= periodStart
        ? { start: periodStart, end: periodEnd }
        : getPeriodWindow(asOf, periodFromFactor(Number(simPeriod) || 0.25))

    if (dealInvestors.length > 0 && bundle.classes.length > 0) {
      const lines = allocateInvestorsByPreferredDue({
        distributionAmount: cashAmount,
        periodStartIso: window.start,
        periodEndIso: window.end,
        dayCountMode,
        defaultAccrualStartIso: investmentDate || undefined,
        investors: dealInvestors,
        classes: bundle.classes,
        perClassPaid: sim.perClass,
        otherAdjustment: other,
      })
      const extra = fillClassPaymentsFromStoredPercents({
        investors: dealInvestors,
        classes: bundle.classes,
        perClass: sim.perClass,
        alreadyCoveredClassIds: lines.map((l) => l.classId),
      })
      const merged = [...lines, ...extra]
      if (merged.length > 0) return classTotalsFromInvestorLines(merged)
    }

    // Fallback: waterfall class nets + Other by actuallyFunded weight.
    if (!(Math.abs(other) >= 0.005)) return { ...sim.perClass }
    const ids = bundle.classes.map((c) => c.id)
    const weights = bundle.classes.map((c) => {
      const funded = parseMoneyDigits(c.actuallyFunded)
      return Number.isFinite(funded) && funded > 0 ? funded : 0
    })
    const otherCents = allocateCentsByWeight({
      totalCents: Math.round(Math.abs(other) * 100),
      weights,
    })
    const sign = other >= 0 ? 1 : -1
    const out: Record<string, number> = { ...sim.perClass }
    ids.forEach((id, i) => {
      out[id] = roundMoney(
        Math.max(0, (out[id] ?? 0) + (sign * (otherCents[i] ?? 0)) / 100),
      )
    })
    return out
  }, [
    bundle,
    simCash,
    otherAdjustment,
    distributionDate,
    simPeriod,
    periodStart,
    periodEnd,
    dayCountMode,
    investmentDate,
    dealInvestors,
    sim.perClass,
  ])

  async function handleComplete() {
    if (!dealId || !bundle || completing) return
    const amount = parseMoneyDigits(simCash)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(
        "Cannot complete",
        "Enter cash available greater than $0 first.",
      )
      return
    }
    setCompleting(true)
    try {
      const asOf =
        distributionDate && /^\d{4}-\d{2}-\d{2}$/.test(distributionDate)
          ? distributionDate
          : new Date().toISOString().slice(0, 10)
      const period = periodFromFactor(Number(simPeriod) || 0.25)
      const windowForRun =
        periodStart &&
        /^\d{4}-\d{2}-\d{2}$/.test(periodStart) &&
        periodEnd &&
        /^\d{4}-\d{2}-\d{2}$/.test(periodEnd) &&
        periodEnd >= periodStart
          ? {
              start: periodStart,
              end: periodEnd,
              label: `${periodLabel(period)} · ${periodStart} → ${periodEnd}`,
              period,
            }
          : getPeriodWindow(asOf, period)
      const otherRaw = parseMoneyDigits(otherAdjustment)
      const other = Number.isFinite(otherRaw) ? otherRaw : 0
      const runName =
        distributionRunName.trim() ||
        (activeWf === "capital"
          ? `Capital event · ${asOf}`
          : `${windowForRun.label} Distribution`)
      const dup = findDuplicateDistributionName({
        candidate: runName,
        priorDistributions: bundle.priorDistributions,
        distributionFee,
        excludePriorId: editingDistributionId || undefined,
        // Same name may be reused across Distributions runs.
        ignorePriorNames: true,
      })
      if (dup) {
        toast.error("Duplicate name", dup)
        return
      }
      let investorPayments:
        | Array<{
            investorId: string
            contactId?: string
            userEmail?: string
            investorName: string
            classId: string
            className: string
            capital: number
            percentOfClass: number
            percentOfDeal?: number
            payment: number
          }>
        | undefined
      try {
        const invPayload = await fetchDealInvestors(dealId, {
          lpInvestorsOnly: false,
        })
        const roster = invPayload.investors ?? []
        const prefLines = allocateInvestorsByPreferredDue({
          distributionAmount: amount,
          periodStartIso: windowForRun.start,
          periodEndIso: windowForRun.end,
          dayCountMode,
          defaultAccrualStartIso: investmentDate || undefined,
          investors: roster,
          classes: bundle.classes,
          perClassPaid: sim.perClass,
          otherAdjustment: other,
        })
        const extra = fillClassPaymentsFromStoredPercents({
          investors: roster,
          classes: bundle.classes,
          perClass: sim.perClass,
          alreadyCoveredClassIds: prefLines.map((l) => l.classId),
        })
        const merged = [...prefLines, ...extra]
        if (merged.length > 0) {
          investorPayments = merged.map((l) => ({
            investorId: l.investorId,
            ...(l.contactId ? { contactId: l.contactId } : {}),
            ...(l.userEmail ? { userEmail: l.userEmail } : {}),
            investorName: l.investorName,
            classId: l.classId,
            className: l.className,
            capital: l.capital,
            percentOfClass: l.percentOfClass,
            percentOfDeal: l.percentOfDeal,
            payment: l.payment,
          }))
        }
      } catch {
        // Backend capital-weighted fallback still runs without client lines.
      }
      // Final recorded amount = waterfall cash + Other (Woodland 44,790.59 + 0.10).
      const finalAmount = Math.round((amount + other) * 100) / 100
      const saved = await completeDistributionSetup(dealId, bundle.waterfalls, {
        source: activeWf,
        amount: finalAmount,
        date: asOf,
        period,
        name: runName,
        setupName: setupName.trim(),
        periodStart: windowForRun.start,
        periodEnd: windowForRun.end,
        paymentDate: asOf,
        distributionType: "preferred_return",
        deductsFrom: "accrued_pref",
        visible: true,
        ...(editingDistributionId
          ? { replaceDistributionId: editingDistributionId }
          : {}),
        ...(investorPayments ? { investorPayments } : {}),
      })
      setBundle({
        ...saved,
        priorDistributions: sanitizePriorDistributions(
          saved.priorDistributions ?? [],
        ),
      })
      setSetupName(saved.setupName ?? setupName.trim())
      if (editingDistributionId) {
        toast.success(
          "Distribution updated",
          "Investor payments and run details were saved for this distribution.",
        )
        navigate(
          `/deals/${encodeURIComponent(dealId)}/distributions/${encodeURIComponent(editingDistributionId)}`,
        )
        return
      }
      toast.success(
        "Distribution completed",
        "It now appears under Prior distributions and on the Distributions tab.",
      )
    } catch (err) {
      toast.error(
        "Complete failed",
        err instanceof Error ? err.message : "Try again.",
      )
    } finally {
      setCompleting(false)
    }
  }

  async function handleCompleteFee() {
    if (!dealId || !bundle || completing) return
    const feeCheck = validateDistributionFee({
      fee: distributionFee,
      requireComplete: true,
      classes: bundle.classes,
      investors: dealInvestors,
    })
    if (!feeCheck.ok) {
      toast.error("Acquisition fee", feeCheck.message)
      return
    }
    const amount = parseMoneyDigits(distributionFee.cashAvailable)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(
        "Cannot complete",
        "Enter cash available greater than $0 first.",
      )
      return
    }
    const feeName = distributionFee.name.trim()
    const feeType = distributionFee.type.trim()
    const dup = findDuplicateDistributionName({
      candidate: feeName,
      priorDistributions: bundle.priorDistributions,
      distributionFee,
      ignoreFeeName: true,
    })
    if (dup) {
      toast.error("Duplicate name", dup)
      return
    }

    setCompleting(true)
    try {
      const period = periodFromFactor(
        Number(distributionFee.periodFactor) || 0.25,
      )
      const startIso =
        distributionFee.periodStart &&
        /^\d{4}-\d{2}-\d{2}$/.test(distributionFee.periodStart)
          ? distributionFee.periodStart
          : ""
      const endIso =
        distributionFee.periodEnd &&
        /^\d{4}-\d{2}-\d{2}$/.test(distributionFee.periodEnd)
          ? distributionFee.periodEnd
          : ""
      if (!startIso || !endIso || endIso < startIso) {
        toast.error(
          "Cannot complete",
          "Enter a valid period start date and period end date.",
        )
        setCompleting(false)
        return
      }
      const asOf = endIso
      const nextTypeOptions = mergeFeeTypeOptions({
        options: distributionFee.typeOptions,
        extra: [feeType],
      })
      const feeToPersist: DistributionFeeConfig = {
        ...distributionFee,
        type: feeType,
        typeOptions: nextTypeOptions,
      }
      setDistributionFee(feeToPersist)
      await saveDistributionSetup(dealId, bundle.waterfalls, setupName.trim(), {
        dayCountMode,
        defaultAccrualStartIso: investmentDate || undefined,
        distributionFee: feeToPersist,
      })
      const classPaid = allocateFeeCashByClass({
        cashAvailable: distributionFee.cashAvailable,
        splits: distributionFee.classSplits,
      })

      let investorPayments:
        | Array<{
            investorId: string
            contactId?: string
            userEmail?: string
            investorName: string
            classId: string
            className: string
            capital: number
            percentOfClass: number
            percentOfDeal?: number
            payment: number
          }>
        | undefined
      try {
        const invPayload = await fetchDealInvestors(dealId, {
          lpInvestorsOnly: false,
        })
        const investors = invPayload.investors ?? []
        for (const cls of bundle.classes) {
          const classCash = classPaid[cls.id] ?? 0
          if (classCash <= 0.005) continue
          const inClass = investors.filter((inv) => {
            const resolved = resolveInvestorClass(
              inv.investorClass ?? "",
              bundle.classes,
            )
            return resolved?.id === cls.id
          })
          if (inClass.length === 0) {
            toast.error(
              "Cannot complete",
              `${cls.name || "A class"} has a percentage allocated but no class investors. Distributions are class-scoped, so that class is not paid and this distribution is not paid to other classes either.`,
            )
            return
          }
        }
        const lines = allocateInvestorDistributionLines({
          investors,
          classes: bundle.classes,
          perClass: classPaid,
        })
        if (lines.length > 0) {
          investorPayments = lines.map((l) => ({
            investorId: l.investorId,
            ...(l.contactId ? { contactId: l.contactId } : {}),
            ...(l.userEmail ? { userEmail: l.userEmail } : {}),
            investorName: l.investorName,
            classId: l.classId,
            className: l.className,
            capital: l.capital,
            percentOfClass: l.percentOfClass,
            percentOfDeal: l.percentOfDeal,
            payment: l.payment,
          }))
        }
      } catch {
        // Backend fallback still runs without client lines.
      }

      const saved = await completeDistributionSetup(dealId, bundle.waterfalls, {
        source: "fee",
        amount: roundMoney(amount),
        date: asOf,
        period,
        name: feeName,
        setupName: setupName.trim(),
        periodStart: startIso,
        periodEnd: endIso,
        paymentDate: asOf,
        distributionType: feeType,
        deductsFrom: "fee",
        visible: true,
        ...(investorPayments ? { investorPayments } : {}),
      })
      setBundle({
        ...saved,
        priorDistributions: sanitizePriorDistributions(
          saved.priorDistributions ?? [],
        ),
      })
      if (saved.distributionFee) {
        setDistributionFee({
          ...emptyDistributionFeeConfig(saved.classes),
          ...saved.distributionFee,
          classSplits: syncFeeClassSplits({
            classes: saved.classes,
            splits: saved.distributionFee.classSplits ?? [],
          }),
          cashAvailable: blurFormatMoneyInput(
            saved.distributionFee.cashAvailable ?? distributionFee.cashAvailable,
          ),
          type: saved.distributionFee.type?.trim() || feeType,
          typeOptions: mergeFeeTypeOptions({
            options: saved.distributionFee.typeOptions ?? nextTypeOptions,
            extra: [feeType],
          }),
        })
      } else {
        setDistributionFee(feeToPersist)
      }
      toast.success(
        "Acquisition fee completed",
        "It appears on the Distributions tab with Source “GP Payment” and Type set to the selected type.",
      )
    } catch (err) {
      toast.error(
        "Complete failed",
        err instanceof Error ? err.message : "Try again.",
      )
    } finally {
      setCompleting(false)
    }
  }

  if (!dealId) {
    return (
      <div className="deals_list_page deals_detail_page deals_dist_setup_page">
        <p className="deals_list_not_found">Missing deal.</p>
        <Link to="/deals" className="deals_list_inline_back">
          Back to deals
        </Link>
      </div>
    )
  }

  return (
    <div className="deals_list_page deals_detail_page deals_dist_setup_page">
      <header className="deals_list_head ds_page_header">
        <div className="deals_list_title_row">
          <button
            type="button"
            className="deals_list_back_circle"
            onClick={goBack}
            aria-label={
              isEditingRun ? "Back to distribution details" : "Back to deal"
            }
          >
            <ArrowLeft size={20} strokeWidth={2} aria-hidden />
          </button>
          <div className="ds_page_header_text">
            <h1 className="deals_list_title">
              {isEditingRun ? "Edit Distribution" : "Distribution Setup"}
            </h1>
            <p className="ds_page_subtitle">
              {bundle?.dealName ? `${bundle.dealName} · ` : ""}
              {isEditingRun
                ? `Editing ${editingRunLabel} — name, cash, period, and waterfall preview`
                : `${setupName.trim() ? `${setupName.trim()} · ` : ""}Step 2 of 2 — payment order and residual splits (after Class Setup)`}
            </p>
          </div>
        </div>
        <div className="ds_page_header_actions">
          <button
            type="button"
            className="um_toolbar_export_btn"
            onClick={handleClassSetupClick}
          >
            Class Setup
          </button>
          <button
            type="button"
            className="um_btn_primary"
            disabled={loading || !bundle || saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      {loading || !bundle ? (
        <DistributionSetupSkeleton />
      ) : (
        <div className="ds_page_body">
          <div className="um_members_tabs_outer deals_tabs_outer um_segmented_tabs_outer ds_wf_tabs_outer">
            <TabsScrollStrip scrollClassName="deals_tabs_scroll um_segmented_tabs_scroll">
              <div
                className="um_members_tabs_row deals_tabs_row um_segmented_tabs_row"
                role="tablist"
                aria-label="Distribution setup sections"
              >
                <button
                  type="button"
                  id="ds-wf-tab-fee"
                  role="tab"
                  aria-selected={mainTab === "fee"}
                  aria-controls="ds-fee-panel"
                  className={`um_members_tab deals_tabs_tab um_segmented_tab${
                    mainTab === "fee" ? " um_members_tab_active" : ""
                  }`}
                  onClick={() => setMainTab("fee")}
                >
                  <Percent
                    className="deals_tabs_icon um_segmented_tab_icon"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span className="deals_tabs_label um_segmented_tab_label">
                    Acquisition Fee
                  </span>
                </button>
                <button
                  type="button"
                  id="ds-wf-tab-operating"
                  role="tab"
                  aria-selected={mainTab === "operating"}
                  aria-controls="ds-wf-panel"
                  className={`um_members_tab deals_tabs_tab um_segmented_tab${
                    mainTab === "operating" ? " um_members_tab_active" : ""
                  }`}
                  onClick={() => {
                    setMainTab("operating")
                    setDueOverrides({})
                    setStageMet({})
                  }}
                >
                  <CircleDollarSign
                    className="deals_tabs_icon um_segmented_tab_icon"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span className="deals_tabs_label um_segmented_tab_label">
                    Operating
                  </span>
                </button>
                <button
                  type="button"
                  id="ds-wf-tab-capital"
                  role="tab"
                  aria-selected={mainTab === "capital"}
                  aria-controls="ds-wf-panel"
                  className={`um_members_tab deals_tabs_tab um_segmented_tab${
                    mainTab === "capital" ? " um_members_tab_active" : ""
                  }`}
                  onClick={() => {
                    setMainTab("capital")
                    setDueOverrides({})
                    setStageMet({})
                  }}
                >
                  <Building2
                    className="deals_tabs_icon um_segmented_tab_icon"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span className="deals_tabs_label um_segmented_tab_label">
                    Capital event
                  </span>
                </button>
              </div>
            </TabsScrollStrip>
          </div>

          {mainTab === "fee" ? (
            <div
              id="ds-fee-panel"
              role="tabpanel"
              aria-labelledby="ds-wf-tab-fee"
              className="ds_workbench"
            >
              <DistributionFeePanel
                fee={distributionFee}
                classes={bundle.classes}
                investors={dealInvestors}
                completing={completing}
                onComplete={() => void handleCompleteFee()}
                onChange={(next) =>
                  setDistributionFee({
                    ...next,
                    classSplits: syncFeeClassSplits({
                      classes: bundle.classes,
                      splits: next.classSplits,
                    }),
                  })
                }
              />
            </div>
          ) : (
          <div id="ds-wf-panel" role="tabpanel" className="ds_workbench">
            <DistributionSimPanel
              section="test"
              cash={simCash}
              periodFactor={simPeriod}
              onCashChange={setSimCash}
              onPeriodChange={handlePeriodChange}
              sim={sim}
              classes={bundle.classes}
              stageMet={sim.stageMet}
              onToggleStageMet={(stage, met) =>
                setStageMet((prev) => ({ ...prev, [stage]: met }))
              }
              onDueOverride={(rowId, value) => {
                const n = parseMoneyDigits(value)
                setDueOverrides((prev) => ({
                  ...prev,
                  [rowId]: Number.isFinite(n) ? n : 0,
                }))
              }}
              rowIds={rows.map((r) => r.id)}
              investmentDate={investmentDate}
              onInvestmentDateChange={(v) => {
                setInvestmentDate(v)
                setInvestmentDateSource("none")
              }}
              investmentDateSource={investmentDateSource}
              distributionDate={distributionDate}
              onDistributionDateChange={handleDistributionDateChange}
              periodStart={periodStart}
              periodEnd={periodEnd}
              onPeriodStartChange={setPeriodStart}
              onPeriodEndChange={setPeriodEnd}
              priorDistributions={bundle.priorDistributions}
              investedCapital={investedCapitalFromClasses(bundle.classes)}
              setupName={setupName}
              onSetupNameChange={setSetupName}
              distributionRunName={distributionRunName}
              onDistributionRunNameChange={setDistributionRunName}
              dayCountMode={dayCountMode}
              onDayCountModeChange={setDayCountMode}
              otherAdjustment={otherAdjustment}
              onOtherAdjustmentChange={setOtherAdjustment}
              classDisplayTotals={classDisplayTotals}
              completing={completing}
              completeLabel={
                isEditingRun ? "Update distribution" : "Complete distribution"
              }
              onComplete={() => void handleComplete()}
            />

            <div className="ds_layout">
              <WaterfallBuilder
                rows={rows}
                classes={bundle.classes}
                promote={bundle.promote}
                addKind={addKind}
                activeWf={activeWf}
                onAddKindChange={setAddKind}
                onAddRow={handleAddRow}
                onChangeRow={(id, next) =>
                  patchRows(rows.map((r) => (r.id === id ? next : r)))
                }
                onMoveRow={(id, dir) => {
                  const i = rows.findIndex((r) => r.id === id)
                  if (i < 0) return
                  const j = i + dir
                  if (j < 0 || j >= rows.length) return
                  const next = [...rows]
                  const tmp = next[i]!
                  next[i] = next[j]!
                  next[j] = tmp
                  patchRows(next)
                }}
                onDeleteRow={(id) =>
                  patchRows(rows.filter((r) => r.id !== id))
                }
              />

              <DistributionSimPanel
                section="results"
                cash={simCash}
                periodFactor={simPeriod}
                onCashChange={setSimCash}
                onPeriodChange={handlePeriodChange}
                sim={sim}
                classes={bundle.classes}
                stageMet={sim.stageMet}
                onToggleStageMet={(stage, met) =>
                  setStageMet((prev) => ({ ...prev, [stage]: met }))
                }
                onDueOverride={(rowId, value) => {
                  const n = parseMoneyDigits(value)
                  setDueOverrides((prev) => ({
                    ...prev,
                    [rowId]: Number.isFinite(n) ? n : 0,
                  }))
                }}
                rowIds={rows.map((r) => r.id)}
                investmentDate={investmentDate}
                onInvestmentDateChange={(v) => {
                  setInvestmentDate(v)
                  setInvestmentDateSource("none")
                }}
                investmentDateSource={investmentDateSource}
                distributionDate={distributionDate}
                onDistributionDateChange={handleDistributionDateChange}
                periodStart={periodStart}
                periodEnd={periodEnd}
                onPeriodStartChange={setPeriodStart}
                onPeriodEndChange={setPeriodEnd}
                priorDistributions={bundle.priorDistributions}
                investedCapital={investedCapitalFromClasses(bundle.classes)}
                setupName={setupName}
                onSetupNameChange={setSetupName}
                distributionRunName={distributionRunName}
                onDistributionRunNameChange={setDistributionRunName}
                dayCountMode={dayCountMode}
                onDayCountModeChange={setDayCountMode}
                otherAdjustment={otherAdjustment}
                onOtherAdjustmentChange={setOtherAdjustment}
                classDisplayTotals={classDisplayTotals}
              />
            </div>
          </div>
          )}
        </div>
      )}

      <UnsavedChangesModal
        open={leaveConfirmOpen}
        busy={saving}
        message="You have unsaved changes on Distribution Setup. Save them before going to Class Setup, or discard them."
        onCancel={() => {
          if (saving) return
          setLeaveConfirmOpen(false)
        }}
        onDiscard={goToClassSetup}
        onSave={() => void handleLeaveSave()}
      />
    </div>
  )
}
