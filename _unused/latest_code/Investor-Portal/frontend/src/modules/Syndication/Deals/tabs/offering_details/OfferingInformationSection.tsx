import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  DollarSign,
  Download,
  Info,
  Layers,
  LineChart,
  ListFilter,
  Loader2,
  Lock,
  LockOpen,
  Pencil,
  Percent,
  Plus,
  Search,
  Save,
  Tag,
  Trash2,
  TrendingUp,
  X,
  Hash,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import { Link, useNavigate } from "react-router-dom"
import { OFFERING_DETAILS_CLASSES_RETURN } from "../../utils/offeringDetailsSectionNav"
import {
  clearInvestorClassFormFieldHighlights,
  handleInvestorClassValidationError,
  type InvestorClassFieldErrors,
} from "../../utils/investorClassFormValidationScroll"
import {
  computeInvestorClassAllocationTotals,
  computeInvestorClassAllocationTotalsForForm,
  investorClassRemainderPercentsForNewClass,
  validateInvestorClassAllocationForSave,
  type InvestorClassAllocationTotals,
} from "../../utils/investorClassAllocationTotals"
import { FormHeadingWithInfo } from "../../../../../common/components/form-heading/FormHeadingWithInfo"
import {
  DataTable,
  type DataTableColumn,
} from "../../../../../common/components/data-table/DataTable"
import {
  FormTooltip,
  type FormTooltipPanelAlign,
} from "../../../../../common/components/form-tooltip/FormTooltip"
import { CardCompactAmount } from "../../../../../common/components/card-compact-amount/CardCompactAmount"
import { ClassRowActions } from "../../components/ClassRowActions"
import { InfoIconPanel } from "./FieldInfoHeading"
import {
  createDealInvestorClass,
  deleteDealInvestorClass,
  fetchDealById,
  fetchDealInvestorClasses,
  updateDealInvestorClass,
  type DealDetailApi,
} from "../../api/dealsApi"
import {
  computeDealAssetRowsFromClientStorage,
  DEAL_ASSETS_STORAGE_CHANGED_EVENT,
  type DealAssetRow,
} from "../../types/deal-asset.types"
import { InvestorClassAssetsMultiSelect } from "./InvestorClassAssetsMultiSelect"
import type {
  DealInvestorClass,
  DealInvestorClassFormValues,
  InvestorClassAdvancedForm,
  LpHurdleItem,
} from "../../types/deal-investor-class.types"
import {
  offeringStatusLabelFromRaw,
  offeringVisibilityLabelFromRaw,
} from "../../utils/offeringOverviewForm"
import { formatDateDdMmmYyyy } from "../../../../../common/utils/formatDateDisplay"
import {
  computeInvestorClassPricePerUnitFromForm,
  isLpInvestorClass,
} from "../../utils/investorClassOverviewFields"
import {
  blurFormatMoneyInput,
  blurFormatNumberOfUnitsInput,
  blurFormatPercentTwoDecimalsInput,
  formatCurrencyUsdTypeInput,
  formatMoneyFieldDisplay,
  formatNumberOfUnitsTypingInput,
  sanitizePercentTypingInput,
} from "../../utils/offeringMoneyFormat"
import { downloadInvestorClassesExportCsv } from "../../utils/offeringDetailsSectionExportCsv"
import { ExportSelectableRowsModal } from "../../components/ExportSelectableRowsModal"
import { toast } from "../../../../../common/components/Toast"
import {
  YesNoCardRadioGroup,
  parseYesNoFieldValue,
} from "../../../../../common/components/YesNoCardRadioGroup/YesNoCardRadioGroup"
import "../../../contacts/contacts.css"
import "../../deal-investor-class.css"
import "../../deals-create.css"
import "../../deals-list.css"
import "../../../usermanagement/user_management.css"
import "../deal_members/add-investment/add_deal_modal.css"

/** Native `<select>` option row (class type, equity name, etc.). */
export type DealIcSelectOption = { value: string; label: string }

const CLASS_TYPE_OPTIONS: DealIcSelectOption[] = [
  { value: "", label: "Select class type" },
  { value: "lp", label: "LP" },
  { value: "gp", label: "GP" },
  { value: "mezzanine", label: "Mezzanine" },
]

/** LP header & add-page title until the user enters equity class name. */
export const DEAL_IC_EQUITY_DEFAULT_LABEL = "New Class"

/** Fixed choices for Equity class name (add + edit; legacy names stay selectable when editing). */
export const EQUITY_CLASS_NAME_OPTIONS: DealIcSelectOption[] = [
  {
    value: "Class A - Limited Partners",
    label: "Class A - Limited Partners",
  },
  {
    value: "Class B - General Partners",
    label: "Class B - General Partners",
  },
  { value: "Mezzanine", label: "Mezzanine" },
]

function classTypeOptionLabel(value: string): string {
  if (!value.trim()) return "—"
  const o = CLASS_TYPE_OPTIONS.find((x) => x.value === value)
  return o?.label ?? value
}

function YesNoInvestorClassField({
  name,
  labelId,
  value,
  onChange,
  disabled,
}: {
  name: string
  labelId: string
  value: string
  onChange: (v: "yes" | "no") => void
  disabled?: boolean
}) {
  return (
    <YesNoCardRadioGroup
      name={name}
      value={parseYesNoFieldValue(value)}
      onChange={onChange}
      disabled={disabled}
      ariaLabelledBy={labelId}
    />
  )
}

/** LP metrics strip: show $0 instead of em dash for empty money fields. */
function lpMetricMoneyDisplay(raw: string): string {
  if (raw == null || !String(raw).trim()) return "$0"
  return formatMoneyFieldDisplay(raw)
}

function formatPctTwoDecimals(raw: string): string {
  const n = parseFloat(String(raw ?? "").replace(/%/g, "").trim())
  if (!Number.isFinite(n)) return "0.00%"
  return `${n.toFixed(2)}%`
}

function clampPercentNumber(n: number): number {
  return Math.max(0, Math.min(100, n))
}

/** While typing: digits only, cap at 100 — % is added on blur (keeps backspace usable). */
function clampPercentTypingInput(raw: string): string {
  const sanitized = sanitizePercentTypingInput(raw)
  if (!sanitized) return ""
  const n = parseFloat(sanitized)
  if (!Number.isFinite(n)) return sanitized
  if (n > 100) return "100"
  return sanitized
}

function blurFormatPercentClampedInput(raw: string): string {
  const t = sanitizePercentTypingInput(raw)
  if (!t) return ""
  const n = parseFloat(t)
  if (!Number.isFinite(n)) return ""
  return `${clampPercentNumber(n).toFixed(2)}%`
}

function percentFieldValuesEqual(a: string, b: string): boolean {
  const ta = sanitizePercentTypingInput(a)
  const tb = sanitizePercentTypingInput(b)
  if (!ta && !tb) return true
  if (!ta || !tb) return false
  const na = parseFloat(ta)
  const nb = parseFloat(tb)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb
  return ta === tb
}

/** True when distribution share should still mirror entity (empty or unchanged from entity). */
function distributionShareMirrorsEntity(advanced: InvestorClassAdvancedForm): boolean {
  const dist = String(advanced.distributionSharePct ?? "").trim()
  if (!dist || stripPctOrNumber(dist) === "") return true
  return percentFieldValuesEqual(
    dist,
    String(advanced.entityLegalOwnershipPct ?? ""),
  )
}

function buildEntityOwnershipAdvancedPatch(
  entityRaw: string,
  mode: "typing" | "blur",
  advanced: InvestorClassAdvancedForm,
): Partial<InvestorClassAdvancedForm> {
  const entityLegalOwnershipPct =
    mode === "blur"
      ? blurFormatPercentClampedInput(entityRaw)
      : clampPercentTypingInput(entityRaw)
  const patch: Partial<InvestorClassAdvancedForm> = { entityLegalOwnershipPct }
  if (
    !advanced.distributionShareFrozen &&
    distributionShareMirrorsEntity(advanced)
  ) {
    patch.distributionSharePct = entityLegalOwnershipPct
  }
  return patch
}

function normalizeStoredPercentField(raw: string): string {
  const t = String(raw ?? "").trim()
  if (!t) return ""
  return blurFormatPercentClampedInput(t)
}

function buildDistributionShareAdvancedPatch(
  distRaw: string,
  mode: "typing" | "blur",
  _advanced: InvestorClassAdvancedForm,
): Partial<InvestorClassAdvancedForm> {
  const distributionSharePct =
    mode === "blur"
      ? blurFormatPercentClampedInput(distRaw)
      : clampPercentTypingInput(distRaw)
  return { distributionSharePct }
}

function stripPctForTitle(raw: string): string {
  return String(raw ?? "")
    .replace(/%/g, "")
    .trim()
}

function appendDefaultLpHurdleIfEmpty(
  form: DealInvestorClassFormValues,
): DealInvestorClassFormValues {
  if (!isLpInvestorClass({ subscriptionType: form.subscriptionType })) return form
  if (form.advanced.hurdles.length > 0) return form
  return {
    ...form,
    advanced: {
      ...form.advanced,
      hurdles: [newLpHurdle()],
    },
  }
}

export type InvestorClassPipelineStep = 1 | 2

export const INVESTOR_CLASS_PIPELINE_STEPS_ALL: ReadonlySet<InvestorClassPipelineStep> =
  new Set([1, 2])

function InvestorClassPipelineStepNode({
  step,
  label,
  pipelineStep,
  visitedSteps,
  onStepClick,
}: {
  step: InvestorClassPipelineStep
  label: string
  pipelineStep: InvestorClassPipelineStep
  visitedSteps: ReadonlySet<InvestorClassPipelineStep>
  onStepClick?: (step: InvestorClassPipelineStep) => void
}) {
  const isActive = pipelineStep === step
  const isDone = pipelineStep > step
  const isVisited = visitedSteps.has(step)
  const isClickable = Boolean(onStepClick) && isVisited

  const nodeClass = [
    "add_contact_step_node",
    isActive ? "add_contact_step_node_active" : "",
    isDone ? "add_contact_step_node_done" : "",
    isClickable ? "add_contact_step_node_clickable" : "",
  ]
    .filter(Boolean)
    .join(" ")

  const content = (
    <>
      <span className="add_contact_step_dot">{step}</span>
      <span className="add_contact_step_label">{label}</span>
    </>
  )

  if (isClickable) {
    return (
      <button
        type="button"
        className={`${nodeClass} add_contact_step_node_btn`}
        aria-current={isActive ? "step" : undefined}
        onClick={() => {
          if (step !== pipelineStep) onStepClick?.(step)
        }}
      >
        {content}
      </button>
    )
  }

  return (
    <div className={nodeClass} aria-current={isActive ? "step" : undefined}>
      {content}
    </div>
  )
}

/** Add / edit investor class — 2-step progress (Class Details → Advanced). */
export function InvestorClassPipelineStepper({
  pipelineStep,
  visitedSteps = INVESTOR_CLASS_PIPELINE_STEPS_ALL,
  onStepClick,
}: {
  pipelineStep: InvestorClassPipelineStep
  /** Steps the user has already opened; only these labels are clickable. */
  visitedSteps?: ReadonlySet<InvestorClassPipelineStep>
  onStepClick?: (step: InvestorClassPipelineStep) => void
}) {
  return (
    <div
      className="add_contact_stepper deals_add_deal_asset_stepper"
      role="group"
      aria-label="Progress"
    >
      <InvestorClassPipelineStepNode
        step={1}
        label="Class Details"
        pipelineStep={pipelineStep}
        visitedSteps={visitedSteps}
        onStepClick={onStepClick}
      />
      <span
        className={
          pipelineStep > 1
            ? "add_contact_step_line add_contact_step_line_active"
            : "add_contact_step_line"
        }
        aria-hidden
      />
      <InvestorClassPipelineStepNode
        step={2}
        label="Advanced"
        pipelineStep={pipelineStep}
        visitedSteps={visitedSteps}
        onStepClick={onStepClick}
      />
    </div>
  )
}

function upsidePctDigits(raw: string): string {
  return clampPercentTypingInput(String(raw ?? "").replace(/%/g, ""))
}

function upsidePctBlur(raw: string): string {
  const t = upsidePctDigits(raw)
  if (!t) return ""
  const n = parseFloat(t)
  if (!Number.isFinite(n)) return ""
  return `${clampPercentNumber(n)}%`
}

function buildUpsideLpPctPatch(
  lpRaw: string,
  mode: "typing" | "blur",
): Partial<LpHurdleItem> {
  if (mode === "blur") {
    const lp = upsidePctBlur(lpRaw)
    if (!lp) return { upsideLpPct: "", upsideGpPct: "" }
    const lpN = parseFloat(upsidePctDigits(lp))
    return {
      upsideLpPct: lp,
      upsideGpPct: upsidePctBlur(String(100 - lpN)),
    }
  }
  const lp = upsidePctDigits(lpRaw)
  if (!lp) return { upsideLpPct: "", upsideGpPct: "" }
  const lpN = parseFloat(lp)
  if (!Number.isFinite(lpN)) return { upsideLpPct: lp }
  return {
    upsideLpPct: lp,
    upsideGpPct: String(clampPercentNumber(100 - clampPercentNumber(lpN))),
  }
}

function buildUpsideGpPctPatch(
  gpRaw: string,
  mode: "typing" | "blur",
): Partial<LpHurdleItem> {
  if (mode === "blur") {
    const gp = upsidePctBlur(gpRaw)
    if (!gp) return { upsideLpPct: "", upsideGpPct: "" }
    const gpN = parseFloat(upsidePctDigits(gp))
    return {
      upsideGpPct: gp,
      upsideLpPct: upsidePctBlur(String(100 - gpN)),
    }
  }
  const gp = upsidePctDigits(gpRaw)
  if (!gp) return { upsideGpPct: "", upsideLpPct: "" }
  const gpN = parseFloat(gp)
  if (!Number.isFinite(gpN)) return { upsideGpPct: gp }
  return {
    upsideGpPct: gp,
    upsideLpPct: String(clampPercentNumber(100 - clampPercentNumber(gpN))),
  }
}

function newLpHurdle(): LpHurdleItem {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `h-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return {
    id,
    expanded: true,
    upsideLpPct: "70%",
    upsideGpPct: "30%",
    cocReturnPct: "7",
    hurdleName: "",
    preferredReturnType: "cash_on_cash",
    finalHurdle: "no",
    advancedOpen: false,
    catchUpPreferredReturns: "yes",
    honorOnlyOnCapitalEvent: "no",
    dayCountConvention: "actual_365",
    compoundingPeriod: "none",
    startDateOverride: "",
    endDate: "",
  }
}

function normalizeLpHurdle(raw: unknown, index: number): LpHurdleItem {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const id =
    typeof o.id === "string" && o.id.trim()
      ? o.id
      : `h-${index}-${Date.now()}`
  return {
    id,
    expanded: o.expanded !== false,
    upsideLpPct:
      typeof o.upsideLpPct === "string" ? o.upsideLpPct : "70%",
    upsideGpPct:
      typeof o.upsideGpPct === "string" ? o.upsideGpPct : "30%",
    cocReturnPct:
      typeof o.cocReturnPct === "string" ? o.cocReturnPct : "7",
    hurdleName: normalizeLpHurdleStoredName(
      typeof o.hurdleName === "string" ? o.hurdleName : "",
      typeof o.upsideLpPct === "string" ? o.upsideLpPct : "70%",
      typeof o.upsideGpPct === "string" ? o.upsideGpPct : "30%",
    ),
    preferredReturnType:
      typeof o.preferredReturnType === "string" && o.preferredReturnType
        ? String(o.preferredReturnType)
        : "cash_on_cash",
    finalHurdle:
      typeof o.finalHurdle === "string" && o.finalHurdle
        ? String(o.finalHurdle)
        : "no",
    advancedOpen: Boolean(o.advancedOpen),
    catchUpPreferredReturns:
      typeof o.catchUpPreferredReturns === "string" &&
      o.catchUpPreferredReturns.trim()
        ? String(o.catchUpPreferredReturns)
        : "yes",
    honorOnlyOnCapitalEvent:
      typeof o.honorOnlyOnCapitalEvent === "string" &&
      o.honorOnlyOnCapitalEvent.trim()
        ? String(o.honorOnlyOnCapitalEvent)
        : "no",
    dayCountConvention:
      typeof o.dayCountConvention === "string" && o.dayCountConvention.trim()
        ? String(o.dayCountConvention)
        : "actual_365",
    compoundingPeriod:
      typeof o.compoundingPeriod === "string" && o.compoundingPeriod.trim()
        ? String(o.compoundingPeriod)
        : "none",
    startDateOverride:
      typeof o.startDateOverride === "string" ? o.startDateOverride : "",
    endDate: typeof o.endDate === "string" ? o.endDate : "",
  }
}

const LP_HURDLE_PREF_RETURN_OPTIONS: { value: string; label: string }[] = [
  { value: "average_annual_return", label: "Average annual return" },
  { value: "cash_on_cash", label: "Cash on cash" },
  { value: "irr", label: "IRR" },
  { value: "roi", label: "ROI" },
  // { value: "preferred", label: "Preferred return" },
]

/** Mezzanine class-level preferred return (main form). */
const MEZZ_CLASS_PREF_RETURN_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Select a preferred return type" },
  ...LP_HURDLE_PREF_RETURN_OPTIONS,
]

const LP_HURDLE_DAY_COUNT_OPTIONS: { value: string; label: string }[] = [
  { value: "actual_365", label: "Actual/365" },
  { value: "actual_360", label: "Actual/360" },
  { value: "thirty_360", label: "30/360" },
  { value: "actual_actual", label: "Actual/Actual" },
]

/** Mezzanine class-level day count (average annual return row). */
const MEZZ_CLASS_DAY_COUNT_OPTIONS: { value: string; label: string }[] = [
  { value: "actual_actual", label: "Actual/Actual" },
  { value: "actual_365", label: "Actual/365 (most common)" },
  { value: "actual_360", label: "Actual/360" },
  { value: "thirty_365", label: "30/365" },
  { value: "thirty_360", label: "30/360" },
]

const MEZZ_PREF_RETURN_ACCRUES_ON_OPTIONS: { value: string; label: string }[] = [
  { value: "capital_balance", label: "Capital balance (most common)" },
  { value: "invested_amount", label: "Invested amount" },
]

function isRoiPrefType(prefType: string): boolean {
  return prefType.trim() === "roi"
}

/** Average annual return and cash on cash share the full grid + Advanced accordion. */
function isMezzanineFullPrefReturnGridType(prefType: string): boolean {
  const t = prefType.trim()
  return t === "average_annual_return" || t === "cash_on_cash"
}

/** Mezzanine types that use the structured preferred-return field grid. */
function isMezzanineStructuredPrefReturnType(prefType: string): boolean {
  const t = prefType.trim()
  return (
    t === "average_annual_return" ||
    t === "cash_on_cash" ||
    t === "irr"
  )
}

function isMezzaninePrefReturnPanelType(prefType: string): boolean {
  return isMezzanineStructuredPrefReturnType(prefType) || isRoiPrefType(prefType)
}

function parsePctInput(raw: string): string {
  return String(raw ?? "").replace(/%/g, "").trim()
}

function formatPctDisplay(raw: string): string {
  const n = parsePctInput(raw)
  if (!n) return ""
  const num = parseFloat(n)
  if (!Number.isFinite(num)) return raw.trim()
  return `${num}%`
}

const LP_HURDLE_COMPOUNDING_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "None" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semi_annual", label: "Semi-annual" },
  { value: "annual", label: "Annual" },
]

const LP_HURDLE_UPSIDE_NAME_PREFIX = "Upside split"

/** Dynamic label from LP/GP upside % (e.g. "Upside split 70/30"). */
function lpHurdleUpsideSplitAutoName(
  upsideLpPct: string,
  upsideGpPct: string,
): string {
  const lp = stripPctForTitle(upsideLpPct) || "0"
  const gp = stripPctForTitle(upsideGpPct) || "0"
  return `${LP_HURDLE_UPSIDE_NAME_PREFIX} ${lp}/${gp}`
}

function normalizeLpHurdleStoredName(
  raw: string,
  upsideLpPct: string,
  upsideGpPct: string,
): string {
  const v = raw.trim()
  if (
    !v ||
    v === "catch_up" ||
    v === "preferred" ||
    /^upside_\d+_\d+$/i.test(v)
  ) {
    return lpHurdleUpsideSplitAutoName(upsideLpPct, upsideGpPct)
  }
  return v
}

/** True when hurdle name should follow LP/GP edits (empty or matches current auto label). */
function lpHurdleNameFollowsUpsideSplit(h: LpHurdleItem): boolean {
  const trimmed = h.hurdleName.trim()
  if (!trimmed) return true
  return trimmed === lpHurdleUpsideSplitAutoName(h.upsideLpPct, h.upsideGpPct)
}

function mergeLpHurdlePatchWithAutoName(
  h: LpHurdleItem,
  patch: Partial<LpHurdleItem>,
): Partial<LpHurdleItem> {
  const nextLp = patch.upsideLpPct ?? h.upsideLpPct
  const nextGp = patch.upsideGpPct ?? h.upsideGpPct
  if (!lpHurdleNameFollowsUpsideSplit(h)) {
    return patch
  }
  return {
    ...patch,
    hurdleName: lpHurdleUpsideSplitAutoName(nextLp, nextGp),
  }
}

function lpHurdleDisplayName(h: LpHurdleItem): string {
  const trimmed = h.hurdleName.trim()
  if (trimmed) return trimmed
  return lpHurdleUpsideSplitAutoName(h.upsideLpPct, h.upsideGpPct)
}

function lpHurdleSummaryTitle(h: LpHurdleItem): string {
  return lpHurdleDisplayName(h)
}

function lpHurdleReturnClause(preferredReturnType: string): string {
  if (preferredReturnType === "irr") return "IRR return."
  if (preferredReturnType === "preferred") return "preferred return."
  if (preferredReturnType === "average_annual_return")
    return "average annual return."
  return "cash on cash return."
}

function readAdvancedString(
  o: Record<string, unknown>,
  camelKey: string,
  fallback: string,
  snakeKey?: string,
): string {
  const camel = o[camelKey]
  if (typeof camel === "string" && camel.trim()) return camel
  if (snakeKey) {
    const snake = o[snakeKey]
    if (typeof snake === "string" && snake.trim()) return snake
  }
  return fallback
}

function normalizePreferredReturnAccruesOn(value: string): string {
  const v = value.trim().toLowerCase()
  if (v === "committed_capital" || v === "unreturned_capital") {
    return "capital_balance"
  }
  return value.trim() || "capital_balance"
}

/** Hurdle sentence uses selected equity class name; neutral fallback if not chosen yet. */
function lpHurdleEquityClassFragments(equityClassName: string): {
  toClassComma: string
  gpUntilAchieves: string
} {
  const t = equityClassName.trim()
  if (!t) {
    return {
      toClassComma: "to this class,",
      gpUntilAchieves: "to General partners until this class achieves",
    }
  }
  return {
    toClassComma: `to ${t},`,
    gpUntilAchieves: `to General partners until ${t} achieves`,
  }
}

/** Live summary under the new-class subtitle on the add-class page (LP only). */
function InvestorClassFormFinBlock({
  title,
  raiseValue,
  pctCaption,
  pctValue,
}: {
  title: string
  raiseValue: string
  pctCaption: string
  pctValue: string
}) {
  return (
    <div className="deal_inv_ic_form_fin_block">
      <span className="deal_inv_ic_form_fin_block_title">{title}</span>
      <div className="deal_inv_ic_form_fin_block_values">
        <div className="deal_inv_ic_form_fin_block_col">
          <span className="deal_inv_ic_form_fin_block_label">Raise</span>
          <span className="deal_inv_ic_form_fin_block_value">{raiseValue}</span>
        </div>
        <div className="deal_inv_ic_form_fin_block_col">
          <span className="deal_inv_ic_form_fin_block_label">{pctCaption}</span>
          <span className="deal_inv_ic_form_fin_block_value deal_inv_ic_form_fin_block_value_pct">
            {pctValue}
          </span>
        </div>
      </div>
    </div>
  )
}

function InvestorClassFormMetricsStrip({
  form,
}: {
  form: DealInvestorClassFormValues
}) {
  return (
    <div
      className="deal_inv_ic_form_metrics_strip deal_inv_ic_form_metrics_strip_paired"
      role="group"
      aria-label="Class financial summary"
    >
      <InvestorClassFormFinBlock
        title="Ownership"
        raiseValue={lpMetricMoneyDisplay(form.offeringSize)}
        pctCaption="Legal ownership"
        pctValue={formatPctTwoDecimals(form.advanced.entityLegalOwnershipPct)}
      />
      <InvestorClassFormFinBlock
        title="Distribution"
        raiseValue={lpMetricMoneyDisplay(form.raiseAmountDistributions)}
        pctCaption="Dist. share"
        pctValue={formatPctTwoDecimals(form.advanced.distributionSharePct)}
      />
      <div className="deal_inv_ic_form_fin_block deal_inv_ic_form_fin_block_total">
        <span className="deal_inv_ic_form_fin_block_title">Total raised</span>
        <div className="deal_inv_ic_form_fin_block_total_body">
          <span
            className="deal_inv_ic_form_fin_block_label deal_inv_ic_form_fin_block_label_spacer"
            aria-hidden
          >
            Raise
          </span>
          <span className="deal_inv_ic_form_fin_block_value deal_inv_ic_form_fin_block_value_money">
            {lpMetricMoneyDisplay(form.offeringSize)}
          </span>
        </div>
      </div>
    </div>
  )
}

/** GP add-page summary: ownership + distribution only (one row). */
function GpClassFormMetricsStrip({
  form,
}: {
  form: DealInvestorClassFormValues
}) {
  return (
    <div
      className="deal_inv_ic_form_metrics_strip deal_inv_ic_form_metrics_strip_gp deal_inv_ic_form_metrics_strip_paired"
      role="group"
      aria-label="Class ownership summary"
    >
      <div className="deal_inv_ic_form_fin_block deal_inv_ic_form_fin_block_pct_only">
        <span className="deal_inv_ic_form_fin_block_title">Ownership</span>
        <span className="deal_inv_ic_form_fin_block_value deal_inv_ic_form_fin_block_value_pct">
          {formatPctTwoDecimals(form.advanced.entityLegalOwnershipPct)}
        </span>
      </div>
      <div className="deal_inv_ic_form_fin_block deal_inv_ic_form_fin_block_pct_only">
        <span className="deal_inv_ic_form_fin_block_title">Distribution</span>
        <span className="deal_inv_ic_form_fin_block_value deal_inv_ic_form_fin_block_value_pct">
          {formatPctTwoDecimals(form.advanced.distributionSharePct)}
        </span>
      </div>
    </div>
  )
}

/** Mezzanine add-page summary: four metrics in one row (no distribution share). */
function MezzanineClassFormMetricsStrip({
  form,
}: {
  form: DealInvestorClassFormValues
}) {
  return (
    <div
      className="deal_inv_ic_form_metrics_strip deal_inv_ic_form_metrics_strip_mezz deal_inv_ic_form_metrics_strip_paired"
      role="group"
      aria-label="Class financial summary"
    >
      <InvestorClassFormFinBlock
        title="Ownership"
        raiseValue={lpMetricMoneyDisplay(form.offeringSize)}
        pctCaption="Legal ownership"
        pctValue={formatPctTwoDecimals(form.advanced.entityLegalOwnershipPct)}
      />
      <div className="deal_inv_ic_form_fin_block deal_inv_ic_form_fin_block_raise_only">
        <span className="deal_inv_ic_form_fin_block_title">Distribution</span>
        <div className="deal_inv_ic_form_fin_block_values">
          <div className="deal_inv_ic_form_fin_block_col">
            <span className="deal_inv_ic_form_fin_block_label">Raise</span>
            <span className="deal_inv_ic_form_fin_block_value">
              {lpMetricMoneyDisplay(form.raiseAmountDistributions)}
            </span>
          </div>
        </div>
      </div>
      <div className="deal_inv_ic_form_fin_block deal_inv_ic_form_fin_block_total">
        <span className="deal_inv_ic_form_fin_block_title">Total raised</span>
        <div className="deal_inv_ic_form_fin_block_total_body">
          <span
            className="deal_inv_ic_form_fin_block_label deal_inv_ic_form_fin_block_label_spacer"
            aria-hidden
          >
            Raise
          </span>
          <span className="deal_inv_ic_form_fin_block_value deal_inv_ic_form_fin_block_value_money">
            {lpMetricMoneyDisplay(form.offeringSize)}
          </span>
        </div>
      </div>
    </div>
  )
}

function InvestorClassFieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="deals_create_field_error">{message}</p>
}

/** Mezzanine — ROI: preferred return percentage only (type selected above). */
function MezzanineRoiPreferredReturnFields({
  idPrefix,
  form,
  patchAdvanced,
  fieldCtl,
  disabled,
  onClearError,
  fieldErrors,
}: {
  idPrefix: string
  form: DealInvestorClassFormValues
  patchAdvanced: (p: Partial<InvestorClassAdvancedForm>) => void
  fieldCtl: string
  disabled?: boolean
  onClearError?: () => void
  fieldErrors?: InvestorClassFieldErrors
}) {
  const adv = form.advanced

  return (
    <div className="deal_inv_mezz_roi_block">
      <div className="deal_inv_class_field deal_inv_mezz_roi_field">
        <label
          className="deal_inv_ic_dist_label_flex"
          htmlFor={`${idPrefix}-mezz-pref-return-pct`}
        >
          <span className="deal_inv_class_field_label deal_inv_class_label_inline">
            Preferred return{" "}
            <span className="deal_inv_required" aria-hidden>
              *
            </span>
          </span>
        </label>
        <div className="deal_inv_lp_hurdle_pct_inline deal_inv_mezz_aar_pct">
          <input
            id={`${idPrefix}-mezz-pref-return-pct`}
            type="text"
            className={`${fieldCtl} deals_add_inv_field_control deals_add_inv_input`}
            inputMode="decimal"
            disabled={disabled}
            value={parsePctInput(adv.classPreferredReturnPct)}
            aria-invalid={Boolean(fieldErrors?.mezzPrefReturnPct) || undefined}
            onChange={(e) => {
              onClearError?.()
              patchAdvanced({
                classPreferredReturnPct: e.target.value.replace(/%/g, ""),
              })
            }}
            onBlur={() =>
              patchAdvanced({
                classPreferredReturnPct: formatPctDisplay(
                  adv.classPreferredReturnPct,
                ),
              })
            }
            aria-label="Preferred return percent"
          />
          <span className="deal_inv_lp_hurdle_pct_suffix">%</span>
        </div>
        <InvestorClassFieldError message={fieldErrors?.mezzPrefReturnPct} />
      </div>
    </div>
  )
}

/** Mezzanine — structured preferred return UI (IRR, Average annual return, etc.). */
function MezzaninePreferredReturnFields({
  idPrefix,
  form,
  setForm,
  patchAdvanced,
  fieldCtl,
  advSelectCtl,
  disabled,
  onClearError,
  fieldErrors,
  showAverageAnnualExtras = false,
}: {
  idPrefix: string
  form: DealInvestorClassFormValues
  setForm: (p: Partial<DealInvestorClassFormValues>) => void
  patchAdvanced: (p: Partial<InvestorClassAdvancedForm>) => void
  fieldCtl: string
  advSelectCtl: string
  disabled?: boolean
  onClearError?: () => void
  fieldErrors?: InvestorClassFieldErrors
  /** Average annual return / cash on cash: start/end override + Advanced accordion. */
  showAverageAnnualExtras?: boolean
}) {
  const adv = form.advanced

  return (
    <div
      className={`deal_inv_mezz_aar_block${showAverageAnnualExtras ? "" : " deal_inv_mezz_aar_block--irr"}`}
    >
      <div className="deal_inv_mezz_aar_grid">
        <div className="deal_inv_class_field">
          <label
            className="deal_inv_ic_dist_label_flex"
            htmlFor={`${idPrefix}-pref-date`}
          >
            <span className="deal_inv_class_field_label deal_inv_class_label_inline">
              Preferred return start date
            </span>
            <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
              <InfoIconPanel
                ariaLabel="More information: Preferred return start date"
                infoContent={
                  <p>
                    The date on which preferred return or interest begins
                    accumulating.
                  </p>
                }
              />
            </span>
          </label>
          <input
            id={`${idPrefix}-pref-date`}
            type="date"
            className={fieldCtl}
            value={form.startDate?.slice(0, 10) ?? ""}
            onChange={(e) => setForm({ startDate: e.target.value })}
            disabled={disabled}
          />
        </div>
        <div className="deal_inv_class_field">
          <label
            className="deal_inv_ic_dist_label_flex"
            htmlFor={`${idPrefix}-mezz-pref-return`}
          >
            <span className="deal_inv_class_field_label deal_inv_class_label_inline">
              Preferred return type{" "}
              <span className="deal_inv_required" aria-hidden>
                *
              </span>
            </span>
            <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
              <InfoIconPanel
                ariaLabel="More information: Preferred return type"
                infoContent={
                  <p>
                    Basis used to measure preferred return for this mezzanine
                    class (e.g. IRR vs average annual return).
                  </p>
                }
              />
            </span>
          </label>
          <select
            id={`${idPrefix}-mezz-pref-return`}
            className={advSelectCtl}
            value={adv.classPreferredReturnType}
            disabled={disabled}
            aria-invalid={Boolean(fieldErrors?.mezzPrefReturnType) || undefined}
            onChange={(e) => {
              onClearError?.()
              patchAdvanced({ classPreferredReturnType: e.target.value })
            }}
          >
            {MEZZ_CLASS_PREF_RETURN_OPTIONS.map((o) => (
              <option key={o.value || "__mezz-pref-empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <InvestorClassFieldError message={fieldErrors?.mezzPrefReturnType} />
        </div>
        <div className="deal_inv_class_field">
          <label
            className="deal_inv_ic_dist_label_flex"
            htmlFor={`${idPrefix}-mezz-pref-return-pct`}
          >
            <span className="deal_inv_class_field_label deal_inv_class_label_inline">
              Preferred return{" "}
              <span className="deal_inv_required" aria-hidden>
                *
              </span>
            </span>
          </label>
          <div className="deal_inv_lp_hurdle_pct_inline deal_inv_mezz_aar_pct">
            <input
              id={`${idPrefix}-mezz-pref-return-pct`}
              type="text"
              className={`${fieldCtl} deals_add_inv_field_control deals_add_inv_input`}
              inputMode="decimal"
              disabled={disabled}
              value={parsePctInput(adv.classPreferredReturnPct)}
              aria-invalid={Boolean(fieldErrors?.mezzPrefReturnPct) || undefined}
              onChange={(e) => {
                onClearError?.()
                patchAdvanced({
                  classPreferredReturnPct: e.target.value.replace(/%/g, ""),
                })
              }}
              onBlur={() =>
                patchAdvanced({
                  classPreferredReturnPct: formatPctDisplay(
                    adv.classPreferredReturnPct,
                  ),
                })
              }
              aria-label="Preferred return percent"
            />
            <span className="deal_inv_lp_hurdle_pct_suffix">%</span>
          </div>
          <InvestorClassFieldError message={fieldErrors?.mezzPrefReturnPct} />
        </div>
        <div className="deal_inv_class_field">
          <label
            className="deal_inv_ic_dist_label_flex"
            htmlFor={`${idPrefix}-mezz-pref-accrues`}
          >
            <span className="deal_inv_class_field_label deal_inv_class_label_inline">
              Preferred return accrues on{" "}
              <span className="deal_inv_required" aria-hidden>
                *
              </span>
            </span>
            <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
              <InfoIconPanel
                ariaLabel="More information: Preferred return accrues on"
                infoContent={
                  <p>
                    The balance or capital base used when accruing preferred
                    return for this class.
                  </p>
                }
              />
            </span>
          </label>
          <select
            id={`${idPrefix}-mezz-pref-accrues`}
            className={advSelectCtl}
            value={adv.preferredReturnAccruesOn}
            disabled={disabled}
            aria-invalid={Boolean(fieldErrors?.mezzPrefAccruesOn) || undefined}
            onChange={(e) => {
              onClearError?.()
              patchAdvanced({ preferredReturnAccruesOn: e.target.value })
            }}
          >
            {MEZZ_PREF_RETURN_ACCRUES_ON_OPTIONS.map((o) => (
              <option key={o.value || "__mezz-accrues-empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <InvestorClassFieldError message={fieldErrors?.mezzPrefAccruesOn} />
        </div>
        <div className="deal_inv_class_field">
          <label
            className="deal_inv_ic_dist_label_flex"
            htmlFor={`${idPrefix}-mezz-day-count`}
          >
            <span className="deal_inv_class_field_label deal_inv_class_label_inline">
              Day count convention{" "}
              <span className="deal_inv_required" aria-hidden>
                *
              </span>
            </span>
            <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
              <InfoIconPanel
                ariaLabel="More information: Day count convention"
                infoContent={
                  <p>
                    Method used to count days for interest or preferred return
                    accrual (e.g. actual days in a year vs 360-day year).
                  </p>
                }
              />
            </span>
          </label>
          <select
            id={`${idPrefix}-mezz-day-count`}
            className={advSelectCtl}
            value={adv.classDayCountConvention}
            disabled={disabled}
            aria-invalid={Boolean(fieldErrors?.mezzDayCount) || undefined}
            onChange={(e) => {
              onClearError?.()
              patchAdvanced({ classDayCountConvention: e.target.value })
            }}
          >
            {MEZZ_CLASS_DAY_COUNT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <InvestorClassFieldError message={fieldErrors?.mezzDayCount} />
        </div>
        {showAverageAnnualExtras ? (
          <>
            <div className="deal_inv_class_field">
              <label
                className="deal_inv_ic_dist_label_flex"
                htmlFor={`${idPrefix}-mezz-start-override`}
              >
                <span className="deal_inv_class_field_label deal_inv_class_label_inline">
                  Start date override
                </span>
                <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                  <InfoIconPanel
                    ariaLabel="More information: Start date override"
                    infoContent={
                      <p>
                        Optional date that overrides when accrual starts for
                        modeling purposes.
                      </p>
                    }
                  />
                </span>
              </label>
              <input
                id={`${idPrefix}-mezz-start-override`}
                type="date"
                className={fieldCtl}
                disabled={disabled}
                value={adv.classStartDateOverride?.slice(0, 10) ?? ""}
                onChange={(e) =>
                  patchAdvanced({ classStartDateOverride: e.target.value })
                }
                aria-label="Start date override. Enter override start date."
              />
            </div>
            <div className="deal_inv_class_field">
              <label
                className="deal_inv_ic_dist_label_flex"
                htmlFor={`${idPrefix}-mezz-end-date`}
              >
                <span className="deal_inv_class_field_label deal_inv_class_label_inline">
                  End date
                </span>
                <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                  <InfoIconPanel
                    ariaLabel="More information: End date"
                    infoContent={
                      <p>
                        Optional end date for preferred return accrual on this
                        class.
                      </p>
                    }
                  />
                </span>
              </label>
              <input
                id={`${idPrefix}-mezz-end-date`}
                type="date"
                className={fieldCtl}
                disabled={disabled}
                value={adv.classEndDate?.slice(0, 10) ?? ""}
                onChange={(e) =>
                  patchAdvanced({ classEndDate: e.target.value })
                }
                aria-label="End date. Enter an end date."
              />
            </div>
          </>
        ) : null}
      </div>
      {showAverageAnnualExtras ? (
      <details
        className="deal_inv_lp_hurdle_advanced deal_inv_mezz_aar_advanced"
        open={adv.classPrefReturnAdvancedOpen}
        onToggle={(e) =>
          patchAdvanced({
            classPrefReturnAdvancedOpen: e.currentTarget.open,
          })
        }
      >
        <summary className="deal_inv_lp_hurdle_advanced_summary">
          <ChevronRight
            size={16}
            strokeWidth={2}
            className="deal_inv_lp_hurdle_advanced_chevron"
            aria-hidden
          />
          Advanced
        </summary>
        <div className="deal_inv_lp_hurdle_advanced_grid">
          <div className="deal_inv_class_field">
            <label
              id={`${idPrefix}-mezz-adv-catchup-label`}
              className="deal_inv_class_field_label"
            >
              Catch up on preferred returns{" "}
              <span className="deal_inv_required" aria-hidden>
                *
              </span>
            </label>
            <YesNoInvestorClassField
              name={`${idPrefix}-mezz-adv-catchup`}
              labelId={`${idPrefix}-mezz-adv-catchup-label`}
              value={adv.classCatchUpPreferredReturns}
              onChange={(v) =>
                patchAdvanced({ classCatchUpPreferredReturns: v })
              }
              disabled={disabled}
            />
          </div>
          <div className="deal_inv_class_field">
            <label
              id={`${idPrefix}-mezz-adv-honor-capital-label`}
              className="deal_inv_ic_raise_own_label"
            >
              <span>
                Honor only on capital event
                <span className="contacts_required" aria-hidden>
                  {" "}
                  *
                </span>
              </span>
              <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                <InfoIconPanel
                  ariaLabel="More information: Honor only on capital event"
                  infoContent={
                    <p>
                      When enabled, this rule applies only when a defined capital
                      event occurs.
                    </p>
                  }
                />
              </span>
            </label>
            <YesNoInvestorClassField
              name={`${idPrefix}-mezz-adv-honor-capital`}
              labelId={`${idPrefix}-mezz-adv-honor-capital-label`}
              value={adv.classHonorOnlyOnCapitalEvent}
              onChange={(v) =>
                patchAdvanced({ classHonorOnlyOnCapitalEvent: v })
              }
              disabled={disabled}
            />
          </div>
          <div className="deal_inv_class_field">
            <label
              className="deal_inv_ic_raise_own_label"
              htmlFor={`${idPrefix}-mezz-adv-compounding`}
            >
              <span>Compounding period</span>
              <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                <InfoIconPanel
                  ariaLabel="More information: Compounding period"
                  infoContent={
                    <p>
                      How often accrued preferred return compounds. None means
                      simple accrual without compounding within the period.
                    </p>
                  }
                />
              </span>
            </label>
            <select
              id={`${idPrefix}-mezz-adv-compounding`}
              className={advSelectCtl}
              disabled={disabled}
              value={adv.classCompoundingPeriod}
              onChange={(e) =>
                patchAdvanced({ classCompoundingPeriod: e.target.value })
              }
            >
              {LP_HURDLE_COMPOUNDING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </details>
      ) : null}
    </div>
  )
}

const ADV_INVESTMENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "equity", label: "Equity" },
  { value: "debt", label: "Debt" },
  // { value: "convertible", label: "Convertible" },
  // { value: "hybrid", label: "Hybrid" },
  // { value: "other", label: "Other" },
]

const ADV_WAITLIST_OPTIONS: { value: string; label: string }[] = [
  { value: "off", label: "Off (Standard)" },
  { value: "on", label: "On" },
  { value: "auto", label: "Auto" },
]

/** Mezzanine class — Advanced accordion (investment type, economics, waitlist). */
function MezzanineClassAdvancedFields({
  idPrefix,
  form,
  setForm,
  patchAdvanced,
  fieldCtl,
  advSelectCtl,
  dealAssetRows,
  disabled,
  onClearError,
  fieldErrors,
}: {
  idPrefix: string
  form: DealInvestorClassFormValues
  setForm: (p: Partial<DealInvestorClassFormValues>) => void
  patchAdvanced: (p: Partial<InvestorClassAdvancedForm>) => void
  fieldCtl: string
  advSelectCtl: string
  dealAssetRows: DealAssetRow[]
  disabled?: boolean
  onClearError?: () => void
  fieldErrors?: InvestorClassFieldErrors
}) {
  const adv = form.advanced

  return (
    <div className="deal_inv_mezz_adv_grid">
      <div className="deal_inv_class_field deal_inv_mezz_adv_cell">
        <label
          className="deal_inv_ic_dist_label_flex"
          htmlFor={`${idPrefix}-adv-inv-type`}
        >
          <span className="deal_inv_class_field_label deal_inv_class_label_inline">
            Investment type{" "}
            <span className="deal_inv_required" aria-hidden>
              *
            </span>
          </span>
        </label>
        <select
          id={`${idPrefix}-adv-inv-type`}
          className={advSelectCtl}
          value={adv.investmentType}
          disabled
          aria-readonly
          aria-invalid={Boolean(fieldErrors?.advInvestmentType) || undefined}
          onChange={() => undefined}
        >
          {ADV_INVESTMENT_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <InvestorClassFieldError message={fieldErrors?.advInvestmentType} />
      </div>

      <div
        className="deal_inv_mezz_adv_cell deal_inv_mezz_adv_cell_spacer"
        aria-hidden
      />

      <div className="deal_inv_class_field deal_inv_mezz_adv_cell">
        <label
          className="deal_inv_ic_dist_label_flex"
          htmlFor={`${idPrefix}-adv-max-inv`}
        >
          <span className="deal_inv_class_field_label deal_inv_class_label_inline">
            Maximum investment
          </span>
          <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
            <InfoIconPanel
              ariaLabel="More information: Maximum investment"
              infoContent={
                <p>
                  Optional cap on how much a single investor may commit to this
                  class.
                </p>
              }
            />
          </span>
        </label>
        <input
          id={`${idPrefix}-adv-max-inv`}
          type="text"
          className={fieldCtl}
          placeholder="$0"
          inputMode="decimal"
          value={adv.maximumInvestment}
          disabled={disabled}
          onChange={(e) => {
            onClearError?.()
            patchAdvanced({
              maximumInvestment: formatCurrencyUsdTypeInput(e.target.value),
            })
          }}
          onBlur={(e) =>
            patchAdvanced({
              maximumInvestment: blurFormatMoneyInput(e.target.value),
            })
          }
        />
      </div>

      <div className="deal_inv_class_field deal_inv_mezz_adv_cell deal_inv_mezz_adv_ppu">
        <label
          className="deal_inv_ic_dist_label_flex"
          htmlFor={`${idPrefix}-adv-ppu`}
        >
          <span className="deal_inv_class_field_label deal_inv_class_label_inline">
            Price per unit
          </span>
          <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
            <InfoIconPanel
              ariaLabel="More information: Price per unit"
              infoContent={
                <p>Nominal price per unit for this mezzanine class.</p>
              }
            />
          </span>
        </label>
        <div className="deal_inv_mezz_adv_ppu_row">
          <input
            id={`${idPrefix}-adv-ppu`}
            type="text"
            className={fieldCtl}
            inputMode="decimal"
            placeholder="$0"
            value={form.pricePerUnit}
            disabled={disabled}
            onChange={(e) =>
              setForm({
                pricePerUnit: formatCurrencyUsdTypeInput(e.target.value),
              })
            }
            onBlur={(e) =>
              setForm({
                pricePerUnit: blurFormatMoneyInput(e.target.value),
              })
            }
          />
          <button
            type="button"
            className="um_btn_secondary deal_inv_ic_inline_btn deal_inv_mezz_adv_ppu_btn"
            disabled={disabled}
            title="Manage unit price over time (coming soon)"
          >
            <LineChart size={16} strokeWidth={2} aria-hidden />
            Manage unit price over time
          </button>
        </div>
      </div>

      <div className="deal_inv_class_field deal_inv_mezz_adv_cell">
        <label
          className="deal_inv_ic_dist_label_flex"
          htmlFor={`${idPrefix}-adv-irr`}
        >
          <span className="deal_inv_class_field_label deal_inv_class_label_inline">
            Target IRR
          </span>
        </label>
        <input
          id={`${idPrefix}-adv-irr`}
          type="text"
          className={fieldCtl}
          inputMode="decimal"
          placeholder="0%"
          value={adv.targetIrr}
          disabled={disabled}
          onChange={(e) =>
            patchAdvanced({
              targetIrr: sanitizePercentTypingInput(e.target.value),
            })
          }
          onBlur={(e) =>
            patchAdvanced({
              targetIrr: blurFormatPercentTwoDecimalsInput(e.target.value),
            })
          }
        />
      </div>

      <div className="deal_inv_class_field deal_inv_mezz_adv_cell deal_inv_mezz_adv_assets">
        <label
          className="deal_inv_ic_dist_label_flex"
          htmlFor={`${idPrefix}-adv-assets-ms-input`}
        >
          <span className="deal_inv_class_field_label deal_inv_class_label_inline">
            Assets
          </span>
        </label>
        <InvestorClassAssetsMultiSelect
          controlId={`${idPrefix}-adv-assets`}
          assetRows={dealAssetRows}
          selectedTags={adv.assetTags}
          disabled={disabled}
          onSelectedTagsChange={(assetTags) => {
            onClearError?.()
            patchAdvanced({ assetTags })
          }}
        />
      </div>

      <div className="deal_inv_class_field deal_inv_mezz_adv_cell">
        <label
          className="deal_inv_ic_dist_label_flex"
          htmlFor={`${idPrefix}-adv-waitlist`}
        >
          <span className="deal_inv_class_field_label deal_inv_class_label_inline">
            Waitlist status{" "}
            <span className="deal_inv_required" aria-hidden>
              *
            </span>
          </span>
          <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
            <InfoIconPanel
              ariaLabel="More information: Waitlist status"
              infoContent={
                <p>
                  Whether investors can join a waitlist for this class.
                </p>
              }
            />
          </span>
        </label>
        <select
          id={`${idPrefix}-adv-waitlist`}
          className={advSelectCtl}
          value={adv.waitlistStatus}
          disabled={disabled}
          aria-invalid={Boolean(fieldErrors?.advWaitlist) || undefined}
          onChange={(e) => {
            onClearError?.()
            patchAdvanced({ waitlistStatus: e.target.value })
          }}
        >
          {ADV_WAITLIST_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <InvestorClassFieldError message={fieldErrors?.advWaitlist} />
      </div>
    </div>
  )
}

function defaultAdvancedForm(): InvestorClassAdvancedForm {
  return {
    investmentType: "equity",
    classPreferredReturnType: "",
    classPreferredReturnPct: "0%",
    preferredReturnAccruesOn: "capital_balance",
    classDayCountConvention: "actual_365",
    classStartDateOverride: "",
    classEndDate: "",
    classPrefReturnAdvancedOpen: false,
    classCatchUpPreferredReturns: "yes",
    classHonorOnlyOnCapitalEvent: "no",
    classCompoundingPeriod: "none",
    entityLegalOwnershipPct: "",
    entityLegalOwnershipFrozen: false,
    distributionSharePct: "",
    distributionShareFrozen: false,
    maximumInvestment: "",
    targetIrr: "",
    assetTags: ["All"],
    waitlistStatus: "off",
    hurdles: [],
  }
}

function parseAdvancedJson(raw: string | undefined | null): InvestorClassAdvancedForm {
  const base = defaultAdvancedForm()
  if (!raw?.trim()) return base
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    const tags = Array.isArray(o.assetTags)
      ? o.assetTags.filter((x): x is string => typeof x === "string")
      : base.assetTags
    const hurdlesRaw = o.hurdles
    const hurdles = Array.isArray(hurdlesRaw)
      ? hurdlesRaw.map((h, i) => normalizeLpHurdle(h, i))
      : base.hurdles
    return {
      investmentType:
        typeof o.investmentType === "string" && o.investmentType.trim()
          ? o.investmentType
          : base.investmentType,
      classPreferredReturnType: readAdvancedString(
        o,
        "classPreferredReturnType",
        base.classPreferredReturnType,
        "class_preferred_return_type",
      ),
      classPreferredReturnPct: readAdvancedString(
        o,
        "classPreferredReturnPct",
        base.classPreferredReturnPct,
        "class_preferred_return_pct",
      ),
      preferredReturnAccruesOn: normalizePreferredReturnAccruesOn(
        readAdvancedString(
          o,
          "preferredReturnAccruesOn",
          base.preferredReturnAccruesOn,
          "preferred_return_accrues_on",
        ),
      ),
      classDayCountConvention: readAdvancedString(
        o,
        "classDayCountConvention",
        base.classDayCountConvention,
        "class_day_count_convention",
      ),
      classStartDateOverride: readAdvancedString(
        o,
        "classStartDateOverride",
        base.classStartDateOverride,
        "class_start_date_override",
      ),
      classEndDate: readAdvancedString(
        o,
        "classEndDate",
        base.classEndDate,
        "class_end_date",
      ),
      classPrefReturnAdvancedOpen: Boolean(o.classPrefReturnAdvancedOpen),
      classCatchUpPreferredReturns: readAdvancedString(
        o,
        "classCatchUpPreferredReturns",
        base.classCatchUpPreferredReturns,
        "class_catch_up_preferred_returns",
      ),
      classHonorOnlyOnCapitalEvent: readAdvancedString(
        o,
        "classHonorOnlyOnCapitalEvent",
        base.classHonorOnlyOnCapitalEvent,
        "class_honor_only_on_capital_event",
      ),
      classCompoundingPeriod: readAdvancedString(
        o,
        "classCompoundingPeriod",
        base.classCompoundingPeriod,
        "class_compounding_period",
      ),
      entityLegalOwnershipPct: normalizeStoredPercentField(
        typeof o.entityLegalOwnershipPct === "string"
          ? o.entityLegalOwnershipPct
          : base.entityLegalOwnershipPct,
      ),
      entityLegalOwnershipFrozen: Boolean(o.entityLegalOwnershipFrozen),
      distributionSharePct: normalizeStoredPercentField(
        typeof o.distributionSharePct === "string"
          ? o.distributionSharePct
          : base.distributionSharePct,
      ),
      distributionShareFrozen: Boolean(o.distributionShareFrozen),
      maximumInvestment:
        typeof o.maximumInvestment === "string"
          ? o.maximumInvestment
          : base.maximumInvestment,
      targetIrr:
        typeof o.targetIrr === "string" ? o.targetIrr : base.targetIrr,
      assetTags: tags.length > 0 ? tags : base.assetTags,
      waitlistStatus:
        typeof o.waitlistStatus === "string" && o.waitlistStatus.trim()
          ? o.waitlistStatus
          : base.waitlistStatus,
      hurdles,
    }
  } catch {
    return base
  }
}

function useDealAssetsForInvestorClass(dealId: string): DealAssetRow[] {
  const [detail, setDetail] = useState<DealDetailApi | null>(null)

  const reload = useCallback(async () => {
    try {
      setDetail(await fetchDealById(dealId))
    } catch {
      setDetail(null)
    }
  }, [dealId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    function onAssetsChanged(e: Event) {
      const id = (e as CustomEvent<{ dealId?: string }>).detail?.dealId
      if (id === dealId) void reload()
    }
    window.addEventListener(DEAL_ASSETS_STORAGE_CHANGED_EVENT, onAssetsChanged)
    return () =>
      window.removeEventListener(
        DEAL_ASSETS_STORAGE_CHANGED_EVENT,
        onAssetsChanged,
      )
  }, [dealId, reload])

  return useMemo(
    () =>
      detail
        ? computeDealAssetRowsFromClientStorage(detail).filter((r) => !r.archived)
        : [],
    [detail],
  )
}

function lpHurdleTypeShort(type: string): string {
  if (type === "cash_on_cash") return "CoC"
  if (type === "irr") return "IRR"
  if (type === "preferred") return "Pref"
  return "CoC"
}

function LpHurdleCard({
  hurdle: h,
  idPrefix,
  equityClassName,
  disabled,
  onUpdate,
  onRemove,
}: {
  hurdle: LpHurdleItem
  idPrefix: string
  /** Selected equity class name — drives “to …” / “until … achieves” in the sentence. */
  equityClassName: string
  disabled?: boolean
  onUpdate: (patch: Partial<LpHurdleItem>) => void
  onRemove: () => void
}) {
  const sid = `${idPrefix}-h-${h.id}`
  const summaryTitle = lpHurdleSummaryTitle(h)
  const hurdleSectionLabel = lpHurdleDisplayName(h)
  const upsideSplitSuggestion = lpHurdleUpsideSplitAutoName(
    h.upsideLpPct,
    h.upsideGpPct,
  )
  const nameListId = `${sid}-name-suggestions`
  const classPhrases = lpHurdleEquityClassFragments(equityClassName)

  function applyHurdlePatch(patch: Partial<LpHurdleItem>) {
    onUpdate(mergeLpHurdlePatchWithAutoName(h, patch))
  }

  return (
    <details
      id={`${idPrefix}-lp-hurdle-${h.id}`}
      className="deal_inv_lp_hurdle_card"
      open={h.expanded}
      onToggle={(e) => {
        onUpdate({ expanded: e.currentTarget.open })
      }}
    >
      <summary className="deal_inv_lp_hurdle_summary">
        <ChevronDown
          size={18}
          strokeWidth={2}
          className="deal_inv_lp_hurdle_summary_chevron"
          aria-hidden
        />
        <span className="deal_inv_lp_hurdle_summary_main">
          <span className="deal_inv_lp_hurdle_summary_title">{summaryTitle}</span>
          <span className="deal_inv_lp_hurdle_summary_meta">
            <span>Limit -</span>
            <span className="deal_inv_lp_hurdle_summary_sep">·</span>
            <span>Type {lpHurdleTypeShort(h.preferredReturnType)}</span>
          </span>
        </span>
        <button
          type="button"
          className="deal_inv_lp_hurdle_trash"
          aria-label="Remove hurdle"
          disabled={disabled}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onRemove()
          }}
        >
          <Trash2 size={17} strokeWidth={2} aria-hidden />
        </button>
      </summary>
      <div className="deal_inv_lp_hurdle_body">
        <div
          className="deal_inv_lp_hurdle_sentence"
          role="group"
          aria-label={hurdleSectionLabel}
        >
          <span className="deal_inv_lp_hurdle_sentence_lead">
            {hurdleSectionLabel}
            <span className="deal_inv_required">*</span>
            <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
              <InfoIconPanel
                ariaLabel={`More information: ${hurdleSectionLabel}`}
                infoContent={
                  <p>
                    LP and GP shares of upside after the return threshold in
                    this hurdle is met. The hurdle name defaults to the upside
                    split ratio; you can edit it or use a custom name per
                    hurdle.
                  </p>
                }
              />
            </span>
          </span>
          <span className="deal_inv_lp_hurdle_pct_inline">
            <input
              id={`${sid}-lp-pct`}
              type="text"
              className="deal_inv_lp_hurdle_sentence_input deals_add_inv_field_control deals_add_inv_input"
              inputMode="decimal"
              placeholder="0"
              disabled={disabled}
              value={upsidePctDigits(h.upsideLpPct)}
              onChange={(e) =>
                applyHurdlePatch(buildUpsideLpPctPatch(e.target.value, "typing"))
              }
              onBlur={(e) =>
                applyHurdlePatch(buildUpsideLpPctPatch(e.target.value, "blur"))
              }
              aria-label="LP upside percent"
            />
            <span className="deal_inv_lp_hurdle_pct_suffix">%</span>
          </span>
          <span className="deal_inv_lp_hurdle_sentence_txt">
            {classPhrases.toClassComma}
          </span>
          <span className="deal_inv_lp_hurdle_pct_inline">
            <input
              id={`${sid}-gp-pct`}
              type="text"
              className="deal_inv_lp_hurdle_sentence_input deals_add_inv_field_control deals_add_inv_input"
              inputMode="decimal"
              placeholder="0"
              disabled={disabled}
              value={upsidePctDigits(h.upsideGpPct)}
              onChange={(e) =>
                applyHurdlePatch(buildUpsideGpPctPatch(e.target.value, "typing"))
              }
              onBlur={(e) =>
                applyHurdlePatch(buildUpsideGpPctPatch(e.target.value, "blur"))
              }
              aria-label="GP upside percent"
            />
            <span className="deal_inv_lp_hurdle_pct_suffix">%</span>
          </span>
          <span className="deal_inv_lp_hurdle_sentence_txt">
            {classPhrases.gpUntilAchieves}
          </span>
          <span className="deal_inv_lp_hurdle_pct_inline">
            <input
              id={`${sid}-coc`}
              type="text"
              className="deal_inv_lp_hurdle_sentence_input deals_add_inv_field_control deals_add_inv_input"
              inputMode="decimal"
              disabled={disabled}
              value={h.cocReturnPct}
              onChange={(e) => onUpdate({ cocReturnPct: e.target.value })}
              aria-label="Return threshold percent"
            />
            <span className="deal_inv_lp_hurdle_pct_suffix">%</span>
          </span>{" "}
          <span className="deal_inv_lp_hurdle_sentence_txt">
            {lpHurdleReturnClause(h.preferredReturnType)}
          </span>
        </div>

        <div className="deal_inv_lp_hurdle_row2">
          <div className="deal_inv_class_field">
            <label
              className="deal_inv_class_field_label"
              htmlFor={`${sid}-name`}
            >
              Hurdle name
            </label>
            <datalist id={nameListId}>
              <option value={upsideSplitSuggestion} />
            </datalist>
            <input
              id={`${sid}-name`}
              type="text"
              className="deals_add_inv_field_control deals_add_inv_input"
              list={nameListId}
              disabled={disabled}
              value={h.hurdleName}
              placeholder={upsideSplitSuggestion}
              onChange={(e) => onUpdate({ hurdleName: e.target.value })}
              onBlur={(e) => {
                const trimmed = e.target.value.trim()
                if (!trimmed) {
                  onUpdate({
                    hurdleName: lpHurdleUpsideSplitAutoName(
                      h.upsideLpPct,
                      h.upsideGpPct,
                    ),
                  })
                }
              }}
              aria-label="Hurdle name"
            />
            <p className="deal_inv_field_hint deal_inv_lp_hurdle_name_hint">
              Suggested: {upsideSplitSuggestion}
            </p>
          </div>
          <div className="deal_inv_class_field">
            <label
              className="deal_inv_ic_raise_own_label"
              htmlFor={`${sid}-pref`}
            >
              <span>
                Preferred return type
                <span className="contacts_required" aria-hidden>
                  {" "}
                  *
                </span>
              </span>
              <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                <InfoIconPanel
                  ariaLabel="More information: Preferred return type"
                  infoContent={
                    <p>
                      Basis used to measure when this hurdle is satisfied (e.g.
                      cash-on-cash vs IRR).
                    </p>
                  }
                />
              </span>
            </label>
            <select
              id={`${sid}-pref`}
              className="deals_add_inv_field_control um_field_select"
              disabled={disabled}
              value={h.preferredReturnType}
              onChange={(e) =>
                onUpdate({ preferredReturnType: e.target.value })
              }
            >
              {LP_HURDLE_PREF_RETURN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="deal_inv_class_field">
            <label
              id={`${sid}-final-label`}
              className="deal_inv_class_field_label"
            >
              Final hurdle <span className="deal_inv_required">*</span>
            </label>
            <YesNoInvestorClassField
              name={`${sid}-final`}
              labelId={`${sid}-final-label`}
              value={h.finalHurdle}
              onChange={(v) => onUpdate({ finalHurdle: v })}
              disabled={disabled}
            />
          </div>
        </div>

        <details
          className="deal_inv_lp_hurdle_advanced"
          open={h.advancedOpen}
          onToggle={(e) => {
            onUpdate({ advancedOpen: e.currentTarget.open })
          }}
        >
          <summary className="deal_inv_lp_hurdle_advanced_summary">
            <ChevronRight
              size={16}
              strokeWidth={2}
              className="deal_inv_lp_hurdle_advanced_chevron"
              aria-hidden
            />
            Advanced
          </summary>
          <div className="deal_inv_lp_hurdle_advanced_grid">
            <div className="deal_inv_class_field">
              <label
                id={`${sid}-adv-catchup-label`}
                className="deal_inv_class_field_label"
              >
                Catch up on preferred returns{" "}
                <span className="deal_inv_required" aria-hidden>
                  *
                </span>
              </label>
              <YesNoInvestorClassField
                name={`${sid}-adv-catchup`}
                labelId={`${sid}-adv-catchup-label`}
                value={h.catchUpPreferredReturns}
                onChange={(v) => onUpdate({ catchUpPreferredReturns: v })}
                disabled={disabled}
              />
            </div>
            <div className="deal_inv_class_field">
              <label
                id={`${sid}-adv-honor-capital-label`}
                className="deal_inv_ic_raise_own_label"
              >
                <span>
                  Honor only on capital event
                  <span className="contacts_required" aria-hidden>
                    {" "}
                    *
                  </span>
                </span>
                <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                  <InfoIconPanel
                    ariaLabel="More information: Honor only on capital event"
                    infoContent={
                      <p>
                        When enabled, this rule applies only when a defined
                        capital event occurs (e.g. distribution or liquidity
                        event), not on ordinary accruals.
                      </p>
                    }
                  />
                </span>
              </label>
              <YesNoInvestorClassField
                name={`${sid}-adv-honor-capital`}
                labelId={`${sid}-adv-honor-capital-label`}
                value={h.honorOnlyOnCapitalEvent}
                onChange={(v) => onUpdate({ honorOnlyOnCapitalEvent: v })}
                disabled={disabled}
              />
            </div>
            <div className="deal_inv_class_field">
              <label
                className="deal_inv_ic_raise_own_label"
                htmlFor={`${sid}-adv-day-count`}
              >
                <span>
                  Day count convention
                  <span className="contacts_required" aria-hidden>
                    {" "}
                    *
                  </span>
                </span>
                <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                  <InfoIconPanel
                    ariaLabel="More information: Day count convention"
                    infoContent={
                      <p>
                        Method used to count days for interest or preferred
                        return accrual (e.g. actual days in a year vs 360-day
                        year).
                      </p>
                    }
                  />
                </span>
              </label>
              <select
                id={`${sid}-adv-day-count`}
                className="deals_add_inv_field_control um_field_select"
                disabled={disabled}
                value={h.dayCountConvention}
                onChange={(e) =>
                  onUpdate({ dayCountConvention: e.target.value })
                }
              >
                {LP_HURDLE_DAY_COUNT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="deal_inv_class_field">
              <label
                className="deal_inv_ic_raise_own_label"
                htmlFor={`${sid}-adv-compounding`}
              >
                <span>Compounding period</span>
                <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                  <InfoIconPanel
                    ariaLabel="More information: Compounding period"
                    infoContent={
                      <p>
                        How often accrued preferred return or interest
                        compounds. None means simple accrual without
                        compounding within the period.
                      </p>
                    }
                  />
                </span>
              </label>
              <select
                id={`${sid}-adv-compounding`}
                className="deals_add_inv_field_control um_field_select"
                disabled={disabled}
                value={h.compoundingPeriod}
                onChange={(e) =>
                  onUpdate({ compoundingPeriod: e.target.value })
                }
              >
                {LP_HURDLE_COMPOUNDING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="deal_inv_class_field deal_inv_lp_hurdle_adv_span2">
              <label
                className="deal_inv_ic_dist_label_flex"
                htmlFor={`${sid}-adv-start-override`}
              >
                <span className="deal_inv_class_field_label deal_inv_class_label_inline">
                  Start date override
                </span>
                <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                  <InfoIconPanel
                    ariaLabel="More information: Start date override"
                    infoContent={
                      <p>
                        Optional date that overrides when accrual or this
                        hurdle&apos;s clock starts for modeling purposes.
                      </p>
                    }
                  />
                </span>
              </label>
              <input
                id={`${sid}-adv-start-override`}
                type="date"
                className="deals_add_inv_field_control deals_add_inv_input"
                disabled={disabled}
                value={h.startDateOverride?.slice(0, 10) ?? ""}
                onChange={(e) =>
                  onUpdate({ startDateOverride: e.target.value })
                }
                aria-label="Start date override. Enter override start date."
              />
            </div>
            <div className="deal_inv_class_field deal_inv_lp_hurdle_adv_span2">
              <label
                className="deal_inv_ic_dist_label_flex"
                htmlFor={`${sid}-adv-end-date`}
              >
                <span className="deal_inv_class_field_label deal_inv_class_label_inline">
                  End date
                </span>
                <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                  <InfoIconPanel
                    ariaLabel="More information: End date"
                    infoContent={
                      <p>
                        Optional end date for this hurdle step or accrual
                        window.
                      </p>
                    }
                  />
                </span>
              </label>
              <input
                id={`${sid}-adv-end-date`}
                type="date"
                className="deals_add_inv_field_control deals_add_inv_input"
                disabled={disabled}
                value={h.endDate?.slice(0, 10) ?? ""}
                onChange={(e) => onUpdate({ endDate: e.target.value })}
                aria-label="End date. Enter an end date."
              />
            </div>
          </div>
        </details>
      </div>
    </details>
  )
}

function LpHurdlesSection({
  idPrefix,
  hurdles,
  equityClassName,
  disabled,
  onAdd,
  onExpandOrCollapseAll,
  onRemove,
  onUpdate,
  className,
}: {
  idPrefix: string
  hurdles: LpHurdleItem[]
  equityClassName: string
  disabled?: boolean
  onAdd: () => void
  onExpandOrCollapseAll: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, patch: Partial<LpHurdleItem>) => void
  className?: string
}) {
  const allExpanded =
    hurdles.length > 0 && hurdles.every((h) => h.expanded)

  return (
    <div
      className={["deal_inv_lp_hurdles_section", className].filter(Boolean).join(" ")}
    >
      <div className="deal_inv_lp_hurdles_head">
        <div className="deal_inv_lp_hurdles_title_row">
          <span className="deal_inv_lp_hurdles_title">Hurdles</span>
          <span className="deals_add_inv_label_info">
            <InfoIconPanel
              ariaLabel="More information: Hurdles"
              infoContent={
                <p>
                  Waterfall steps that define how cash flows split between LP
                  and GP after defined return thresholds.
                </p>
              }
            />
          </span>
        </div>
        <button
          type="button"
          className="deal_inv_lp_hurdles_collapse_all"
          disabled={disabled || hurdles.length === 0}
          onClick={onExpandOrCollapseAll}
        >
          {allExpanded ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <div className="deal_inv_lp_hurdle_list">
        {hurdles.map((h) => (
          <LpHurdleCard
            key={h.id}
            hurdle={h}
            idPrefix={idPrefix}
            equityClassName={equityClassName}
            disabled={disabled}
            onUpdate={(patch) => onUpdate(h.id, patch)}
            onRemove={() => onRemove(h.id)}
          />
        ))}
      </div>
      <button
        type="button"
        className="deal_inv_ic_lp_hurdle_link deal_inv_lp_hurdles_footer_add"
        disabled={disabled}
        onClick={onAdd}
      >
        <Plus
          className="deal_inv_ic_lp_hurdle_footer_add_icon"
          size={16}
          strokeWidth={2}
          aria-hidden
        />
        Add Hurdle
      </button>
    </div>
  )
}

function stripMoneyInput(raw: string): string {
  return raw.replace(/[$,\s]/g, "").trim()
}

function isRequiredMoneyMissing(raw: string): boolean {
  return stripMoneyInput(raw) === ""
}

function isRequiredNumberOfUnitsMissing(raw: string): boolean {
  return blurFormatNumberOfUnitsInput(raw) === ""
}

/** Raise quota (billing) is hidden in the UI; API still expects a value. */
function formatMoneyFieldForSave(raw: string): string {
  const t = raw.trim()
  if (!t) return ""
  return blurFormatMoneyInput(t)
}

/** Normalize ticket-size fields to USD display before save or step advance. */
function formatInvestorClassMoneyFields(
  form: DealInvestorClassFormValues,
): DealInvestorClassFormValues {
  const formatted = {
    ...form,
    offeringSize: formatMoneyFieldForSave(form.offeringSize),
    raiseAmountDistributions: formatMoneyFieldForSave(
      form.raiseAmountDistributions,
    ),
    billingRaiseQuota: formatMoneyFieldForSave(form.billingRaiseQuota),
    minimumInvestment: formatMoneyFieldForSave(form.minimumInvestment),
    numberOfUnits: blurFormatNumberOfUnitsInput(form.numberOfUnits),
    pricePerUnit: formatMoneyFieldForSave(form.pricePerUnit),
    advanced: {
      ...form.advanced,
      maximumInvestment:
        form.subscriptionType === "gp"
          ? blurFormatNumberOfUnitsInput(form.advanced.maximumInvestment)
          : formatMoneyFieldForSave(form.advanced.maximumInvestment),
    },
  }
  if (isLpInvestorClass(form)) {
    return {
      ...formatted,
      pricePerUnit: computeInvestorClassPricePerUnitFromForm(formatted),
    }
  }
  return formatted
}

function billingRaiseQuotaForSave(form: DealInvestorClassFormValues): string {
  if (!isRequiredMoneyMissing(form.billingRaiseQuota)) {
    return blurFormatMoneyInput(form.billingRaiseQuota)
  }
  if (!isRequiredMoneyMissing(form.offeringSize)) {
    return blurFormatMoneyInput(form.offeringSize)
  }
  return "$0"
}

function advancedOptionsForSave(
  form: DealInvestorClassFormValues,
): InvestorClassAdvancedForm {
  const advanced = { ...form.advanced }
  if (form.subscriptionType === "mezzanine") {
    advanced.investmentType = "debt"
    const pct = parsePctInput(advanced.classPreferredReturnPct)
    if (pct) advanced.classPreferredReturnPct = `${pct}%`
    advanced.preferredReturnAccruesOn = normalizePreferredReturnAccruesOn(
      advanced.preferredReturnAccruesOn,
    )
  }
  if (form.subscriptionType === "gp") {
    const sharesRaw = advanced.maximumInvestment.trim()
    if (sharesRaw !== "") {
      advanced.maximumInvestment = blurFormatNumberOfUnitsInput(sharesRaw)
    }
    return advanced
  }
  const maxRaw = stripMoneyInput(advanced.maximumInvestment)
  if (maxRaw !== "") {
    advanced.maximumInvestment = blurFormatMoneyInput(advanced.maximumInvestment)
  }
  return advanced
}

function investorClassFormForSave(
  form: DealInvestorClassFormValues,
): DealInvestorClassFormValues {
  const formatted = formatInvestorClassMoneyFields(form)
  const withMezzDefaults: DealInvestorClassFormValues =
    formatted.subscriptionType === "mezzanine"
      ? {
          ...formatted,
          numberOfUnits: String(formatted.numberOfUnits ?? "").trim()
            ? formatted.numberOfUnits
            : "0",
          pricePerUnit: String(formatted.pricePerUnit ?? "").trim()
            ? formatted.pricePerUnit
            : "$0",
        }
      : formatted
  return {
    ...withMezzDefaults,
    billingRaiseQuota: billingRaiseQuotaForSave(withMezzDefaults),
    advanced: advancedOptionsForSave(withMezzDefaults),
  }
}

function maximumInvestmentFromAdvancedJson(
  advancedOptionsJson: string | undefined | null,
): string {
  const raw = parseAdvancedJson(advancedOptionsJson).maximumInvestment.trim()
  if (!raw) return ""
  return blurFormatMoneyInput(raw)
}

function stripPctOrNumber(raw: string): string {
  return raw.replace(/%/g, "").replace(/[$,\s]/g, "").trim()
}

/** Case-insensitive, trimmed comparison for duplicate class names on the same deal */
function normalizeInvestorClassNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ")
}

function normalizeSubscriptionTypeKey(t: string): string {
  return t.trim().toLowerCase()
}

/** Same name may exist under different class types (LP vs GP vs mezzanine). */
function isDuplicateInvestorClassName(
  name: string,
  subscriptionType: string,
  existing: DealInvestorClass[],
  excludeClassId?: string,
): boolean {
  const key = normalizeInvestorClassNameKey(name)
  if (!key) return false
  const typeKey = normalizeSubscriptionTypeKey(subscriptionType)
  if (!typeKey) return false
  return existing.some(
    (r) =>
      r.id !== excludeClassId &&
      normalizeInvestorClassNameKey(r.name) === key &&
      normalizeSubscriptionTypeKey(r.subscriptionType) === typeKey,
  )
}

/** Step 1 of add-class page pipeline: core offering fields only (advanced on step 2). */
function validateInvestorClassStep1(
  form: DealInvestorClassFormValues,
): string | null {
  if (!form.subscriptionType.trim()) return "Class type is required."
  if (!form.name.trim()) return "Equity class name is required."
  if (form.subscriptionType === "gp") {
    if (stripPctOrNumber(form.advanced.entityLegalOwnershipPct) === "") {
      return "Entity legal ownership is required."
    }
    return null
  }
  if (isRequiredMoneyMissing(form.offeringSize)) {
    return "Raise amount (for ownership) is required."
  }
  if (isRequiredMoneyMissing(form.raiseAmountDistributions)) {
    return "Raise amount (for distributions) is required."
  }
  if (isRequiredMoneyMissing(form.minimumInvestment)) {
    return "Minimum investment is required."
  }
  if (form.subscriptionType === "mezzanine") {
    if (!form.advanced.classPreferredReturnType.trim()) {
      return "Preferred return type is required."
    }
    const extendedErr = validateMezzanineExtendedPrefReturn(form)
    if (extendedErr) return extendedErr
  }
  return null
}

function validateMezzanineStructuredPrefReturn(
  form: DealInvestorClassFormValues,
): string | null {
  if (form.subscriptionType !== "mezzanine") return null
  if (!isMezzanineStructuredPrefReturnType(form.advanced.classPreferredReturnType)) {
    return null
  }
  if (!form.advanced.classPreferredReturnType.trim()) {
    return "Preferred return type is required."
  }
  if (parsePctInput(form.advanced.classPreferredReturnPct) === "") {
    return "Preferred return is required."
  }
  if (!form.advanced.preferredReturnAccruesOn.trim()) {
    return "Preferred return accrues on is required."
  }
  if (!form.advanced.classDayCountConvention.trim()) {
    return "Day count convention is required."
  }
  return null
}

function validateMezzanineRoiPrefReturn(
  form: DealInvestorClassFormValues,
): string | null {
  if (form.subscriptionType !== "mezzanine") return null
  if (!isRoiPrefType(form.advanced.classPreferredReturnType)) return null
  if (!form.advanced.classPreferredReturnType.trim()) {
    return "Preferred return type is required."
  }
  if (parsePctInput(form.advanced.classPreferredReturnPct) === "") {
    return "Preferred return is required."
  }
  return null
}

function validateMezzanineExtendedPrefReturn(
  form: DealInvestorClassFormValues,
): string | null {
  return (
    validateMezzanineRoiPrefReturn(form) ??
    validateMezzanineStructuredPrefReturn(form)
  )
}

/** Step 2 / Advanced panel: investment type, ownership %, units, waitlist. */
function validateInvestorClassAdvancedStep(
  form: DealInvestorClassFormValues,
): string | null {
  if (!form.advanced.investmentType.trim()) {
    return "Investment type is required (Advanced)."
  }
  const showEntityDistAdvanced =
    form.subscriptionType !== "gp" && form.subscriptionType !== "mezzanine"
  if (showEntityDistAdvanced) {
    if (stripPctOrNumber(form.advanced.entityLegalOwnershipPct) === "") {
      return "Entity legal ownership is required (Advanced)."
    }
    if (stripPctOrNumber(form.advanced.distributionSharePct) === "") {
      return "Distribution share is required (Advanced)."
    }
  }
  if (
    form.subscriptionType !== "gp" &&
    form.subscriptionType !== "mezzanine" &&
    isRequiredNumberOfUnitsMissing(form.numberOfUnits)
  ) {
    return "Number of units is required."
  }
  if (
    form.subscriptionType !== "gp" &&
    !form.advanced.waitlistStatus.trim()
  ) {
    return "Waitlist status is required (Advanced)."
  }
  return null
}

function validateInvestorClassForSave(
  form: DealInvestorClassFormValues,
  {
    existingClasses,
    editingClassId,
  }: {
    existingClasses: DealInvestorClass[]
    editingClassId?: string
  },
): string | null {
  const step1Err = validateInvestorClassStep1(form)
  if (step1Err) return step1Err

  if (form.subscriptionType === "mezzanine") {
    const mezzErr = validateMezzanineExtendedPrefReturn(form)
    if (mezzErr) return mezzErr
    if (!form.advanced.classPreferredReturnType.trim()) {
      return "Preferred return type is required."
    }
  }

  const advancedErr = validateInvestorClassAdvancedStep(form)
  if (advancedErr) return advancedErr

  if (
    isDuplicateInvestorClassName(
      form.name,
      form.subscriptionType,
      existingClasses,
      editingClassId,
    )
  ) {
    return editingClassId
      ? "Another investor class of this type already uses this name for this deal. Choose a unique name or another class type."
      : "An investor class with this name already exists for this class type on this deal. Use a unique name or choose another class type."
  }

  return validateInvestorClassAllocationForSave({
    existingRows: existingClasses,
    entityLegalOwnershipPct: form.advanced.entityLegalOwnershipPct,
    distributionSharePct: form.advanced.distributionSharePct,
    subscriptionType: form.subscriptionType,
    editingClassId,
  })
}

function emptyForm(): DealInvestorClassFormValues {
  return {
    name: "",
    subscriptionType: "",
    entityName: "",
    startDate: "",
    offeringSize: "",
    raiseAmountDistributions: "",
    billingRaiseQuota: "",
    minimumInvestment: "",
    numberOfUnits: "",
    pricePerUnit: "",
    status: "closed",
    visibility: "",
    advanced: defaultAdvancedForm(),
  }
}

/** Prefill ownership / distribution % as 100 minus totals from all existing classes. */
function emptyFormForNewInvestorClass(
  existingClasses: readonly DealInvestorClass[],
): DealInvestorClassFormValues {
  const base = emptyForm()
  const { entityLegalOwnershipPct, distributionSharePct } =
    investorClassRemainderPercentsForNewClass(existingClasses)
  if (!entityLegalOwnershipPct && !distributionSharePct) return base

  return {
    ...base,
    advanced: {
      ...base.advanced,
      entityLegalOwnershipPct,
      distributionSharePct:
        distributionSharePct || entityLegalOwnershipPct,
    },
  }
}

function rowToForm(row: DealInvestorClass): DealInvestorClassFormValues {
  const form: DealInvestorClassFormValues = {
    name: row.name,
    subscriptionType: row.subscriptionType,
    entityName: row.entityName,
    startDate: row.startDate,
    offeringSize: blurFormatMoneyInput(row.offeringSize ?? ""),
    raiseAmountDistributions: blurFormatMoneyInput(
      row.raiseAmountDistributions ?? "",
    ),
    billingRaiseQuota: blurFormatMoneyInput(row.billingRaiseQuota ?? ""),
    minimumInvestment: blurFormatMoneyInput(row.minimumInvestment ?? ""),
    numberOfUnits: blurFormatNumberOfUnitsInput(row.numberOfUnits ?? ""),
    pricePerUnit: blurFormatMoneyInput(row.pricePerUnit ?? ""),
    status: row.status || "closed",
    visibility: row.visibility,
    advanced: {
      ...parseAdvancedJson(row.advancedOptionsJson),
      maximumInvestment:
        row.subscriptionType === "gp"
          ? blurFormatNumberOfUnitsInput(
              parseAdvancedJson(row.advancedOptionsJson).maximumInvestment ??
                "",
            )
          : maximumInvestmentFromAdvancedJson(row.advancedOptionsJson),
    },
  }
  if (isLpInvestorClass(row)) {
    form.pricePerUnit = computeInvestorClassPricePerUnitFromForm(form)
  }
  return form
}

function InvestorClassModalFormBody({
  idPrefix,
  form,
  setForm,
  disabled,
  onClearError,
  onAddHurdleClick,
  showNewClassTitleAboveType = false,
  dealAssetRows = [],
  /** Add-class page pipeline: step 1 = class details; step 2 = advanced (+ LP hurdles); omit = single screen (modal). */
  formStep,
  fieldErrors,
}: {
  idPrefix: string
  form: DealInvestorClassFormValues
  setForm: (p: Partial<DealInvestorClassFormValues>) => void
  disabled?: boolean
  onClearError?: () => void
  onAddHurdleClick?: () => void
  /** Add-class page: show “New Class” / equity name above Class type. */
  showNewClassTitleAboveType?: boolean
  dealAssetRows?: DealAssetRow[]
  formStep?: 1 | 2
  fieldErrors?: InvestorClassFieldErrors
}) {
  const typeLbl = `${idPrefix}-class-type-lbl`
  const equityNameLbl = `${idPrefix}-equity-name-lbl`
  const isLpLayout = isLpInvestorClass({ subscriptionType: form.subscriptionType })
  const isGpLayout = form.subscriptionType === "gp"
  const isMezzanineLayout = form.subscriptionType === "mezzanine"
  const isMezzRoiPrefReturn =
    isMezzanineLayout && isRoiPrefType(form.advanced.classPreferredReturnType)
  const isMezzStructuredPrefReturn =
    isMezzanineLayout &&
    isMezzanineStructuredPrefReturnType(form.advanced.classPreferredReturnType)
  const isMezzPrefReturnPanel =
    isMezzanineLayout &&
    isMezzaninePrefReturnPanelType(form.advanced.classPreferredReturnType)
  const isMezzFullPrefReturnGrid =
    isMezzStructuredPrefReturn &&
    isMezzanineFullPrefReturnGridType(form.advanced.classPreferredReturnType)
  const equityNameSelectOptions = useMemo(() => {
    const placeholder: DealIcSelectOption = {
      value: "",
      label: "Select equity class name",
    }
    const t = form.name.trim()
    let choices: DealIcSelectOption[]
    if (!t || EQUITY_CLASS_NAME_OPTIONS.some((o) => o.value === t)) {
      choices = EQUITY_CLASS_NAME_OPTIONS
    } else {
      choices = [{ value: t, label: t }, ...EQUITY_CLASS_NAME_OPTIONS]
    }
    return [placeholder, ...choices]
  }, [form.name])
  const fieldCtl = "deals_add_inv_field_control deals_add_inv_input"
  const advSelectCtl = "deals_add_inv_field_control um_field_select"
  const advInputCtl = "deals_add_inv_field_control deals_add_inv_input"

  function patchAdvanced(p: Partial<InvestorClassAdvancedForm>) {
    setForm({ advanced: { ...form.advanced, ...p } })
  }

  function setFormWithAutoPricePerUnit(
    patch: Partial<DealInvestorClassFormValues>,
  ) {
    const merged = { ...form, ...patch }
    if (!isLpLayout) {
      setForm(patch)
      return
    }
    setForm({
      ...patch,
      pricePerUnit: computeInvestorClassPricePerUnitFromForm(merged),
    })
  }

  function addLpHurdle() {
    onAddHurdleClick?.()
    const hurdle = newLpHurdle()
    const elId = `${idPrefix}-lp-hurdle-${hurdle.id}`
    setForm({
      advanced: {
        ...form.advanced,
        hurdles: [...form.advanced.hurdles, hurdle],
      },
    })
    window.setTimeout(() => {
      const root = document.getElementById(elId)
      root?.scrollIntoView({ behavior: "smooth", block: "start" })
      const firstInput = root?.querySelector<HTMLInputElement>(
        "input:not([disabled])",
      )
      firstInput?.focus({ preventScroll: true })
    }, 0)
  }

  function removeLpHurdle(id: string) {
    setForm({
      advanced: {
        ...form.advanced,
        hurdles: form.advanced.hurdles.filter((x) => x.id !== id),
      },
    })
  }

  function updateLpHurdle(id: string, patch: Partial<LpHurdleItem>) {
    setForm({
      advanced: {
        ...form.advanced,
        hurdles: form.advanced.hurdles.map((x) =>
          x.id === id ? { ...x, ...patch } : x,
        ),
      },
    })
  }

  function toggleExpandAllLpHurdles() {
    const allExpanded =
      form.advanced.hurdles.length > 0 &&
      form.advanced.hurdles.every((h) => h.expanded)
    setForm({
      advanced: {
        ...form.advanced,
        hurdles: form.advanced.hurdles.map((h) => ({
          ...h,
          expanded: !allExpanded,
        })),
      },
    })
  }

  const showPipelineStep1 = formStep === 1
  const showPipelineAdvancedStep = formStep === 2
  const showLpHurdlesInAdvanced =
    isLpLayout && (formStep === undefined || showPipelineAdvancedStep)
  const advancedShellClass =
    isLpLayout
      ? "deal_inv_ic_advanced deal_inv_ic_advanced_lp"
      : isGpLayout
        ? "deal_inv_ic_advanced deal_inv_ic_advanced_gp"
        : isMezzanineLayout
          ? "deal_inv_ic_advanced deal_inv_ic_advanced_mezz"
          : "deal_inv_ic_advanced"

  return (
    <>
      {showNewClassTitleAboveType && !showPipelineAdvancedStep ? (
        <>
          <div
            className="deal_inv_ic_new_class_subtitle"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {form.name.trim() || DEAL_IC_EQUITY_DEFAULT_LABEL}
          </div>
          {/* {isLpLayout ? (
            <button
              type="button"
              className="deal_inv_ic_lp_hurdle_link deal_inv_lp_hurdles_footer_add deal_inv_ic_new_class_add_hurdle_row"
              disabled={disabled}
              onClick={() => {
                onClearError?.()
                onAddHurdleClick?.()
                addLpHurdle()
              }}
            >
              <Plus
                className="deal_inv_ic_lp_hurdle_footer_add_icon"
                size={16}
                strokeWidth={2}
                aria-hidden
              />
              Add hurdle
            </button>
          ) : null} */}
          {isLpLayout ? <InvestorClassFormMetricsStrip form={form} /> : null}
          {isGpLayout ? <GpClassFormMetricsStrip form={form} /> : null}
          {isMezzanineLayout ? (
            <MezzanineClassFormMetricsStrip form={form} />
          ) : null}
        </>
      ) : null}
      {(formStep === undefined || showPipelineStep1) ? (
      <>
      <div className="deal_inv_class_field">
        <label
          className="deal_inv_ic_dist_label_flex"
          id={typeLbl}
          htmlFor={`${idPrefix}-class-type`}
        >
          <span className="deal_inv_class_field_label deal_inv_class_label_inline">
            Class type{" "}
            <span className="deal_inv_required" aria-hidden>
              *
            </span>
          </span>
          <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
            <InfoIconPanel
              ariaLabel="More information: Class type"
              infoContent={
                <p>
                  Choose whether this class is limited partners (LP), general
                  partners (GP), or mezzanine. This sets which fields and
                  calculations apply to the class.
                </p>
              }
            />
          </span>
        </label>
        <select
          id={`${idPrefix}-class-type`}
          className={advSelectCtl}
          aria-labelledby={typeLbl}
          value={form.subscriptionType}
          disabled={disabled}
          aria-invalid={Boolean(fieldErrors?.classType) || undefined}
          onChange={(e) => {
            onClearError?.()
            const subscriptionType = e.target.value
            const patch: Partial<DealInvestorClassFormValues> = {
              subscriptionType,
            }
            if (subscriptionType === "gp" || subscriptionType === "mezzanine") {
              if (isRequiredMoneyMissing(form.offeringSize)) {
                patch.offeringSize = "$0"
              }
              if (isRequiredMoneyMissing(form.raiseAmountDistributions)) {
                patch.raiseAmountDistributions = "$0"
              }
              if (isRequiredMoneyMissing(form.minimumInvestment)) {
                patch.minimumInvestment = "$0"
              }
              if (isRequiredMoneyMissing(form.billingRaiseQuota)) {
                patch.billingRaiseQuota = "$0"
              }
              if (isRequiredNumberOfUnitsMissing(form.numberOfUnits)) {
                patch.numberOfUnits = "0"
              }
            }
            if (subscriptionType === "mezzanine") {
              patch.advanced = {
                ...form.advanced,
                investmentType: "debt",
                entityLegalOwnershipPct: form.advanced.entityLegalOwnershipPct,
                distributionSharePct: form.advanced.distributionSharePct,
              }
            }
            setForm(patch)
          }}
        >
          {CLASS_TYPE_OPTIONS.map((o) => (
            <option key={o.value || "__class-type-empty"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <InvestorClassFieldError message={fieldErrors?.classType} />
      </div>
      <div className="deal_inv_class_field">
        <label
          className="deal_inv_ic_dist_label_flex"
          id={equityNameLbl}
          htmlFor={`${idPrefix}-equity-name`}
        >
          <span className="deal_inv_class_field_label deal_inv_class_label_inline">
            Equity class name{" "}
            <span className="deal_inv_required" aria-hidden>
              *
            </span>
          </span>
          <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
            <InfoIconPanel
              ariaLabel="More information: Equity class name"
              infoContent={
                <p>
                  Identifies this class for investors and reporting (e.g. limited
                  partners, general partners, or mezzanine). Choose the option that
                  matches how this class is offered.
                </p>
              }
            />
          </span>
        </label>
        {!form.name.trim() ? (
          <select
            id={`${idPrefix}-equity-name`}
            className={advSelectCtl}
            aria-labelledby={equityNameLbl}
            value={form.name}
            disabled={disabled}
            aria-invalid={Boolean(fieldErrors?.equityName) || undefined}
            onChange={(e) => {
              onClearError?.()
              setForm({ name: e.target.value })
            }}
          >
            {equityNameSelectOptions.map((o) => (
              <option
                key={o.value || "__equity-name-empty"}
                value={o.value}
              >
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <div className="deal_inv_equity_name_editable_row">
            <div className="deal_inv_equity_name_input_shell">
              <input
                id={`${idPrefix}-equity-name`}
                type="text"
                className={`${advInputCtl} deal_inv_equity_name_text_input`}
                aria-labelledby={equityNameLbl}
                autoComplete="off"
                placeholder="Equity class name"
                value={form.name}
                disabled={disabled}
                aria-invalid={Boolean(fieldErrors?.equityName) || undefined}
                onChange={(e) => {
                  onClearError?.()
                  setForm({ name: e.target.value })
                }}
              />
              <span
                className="deal_inv_equity_name_input_suffix"
                title="Editable name"
              >
                <Pencil
                  size={16}
                  strokeWidth={2}
                  aria-hidden
                  className="deal_inv_equity_name_edit_icon"
                />
                <button
                  type="button"
                  className="deal_inv_equity_name_clear_btn"
                  aria-label="Clear equity class name"
                  title="Clear"
                  disabled={disabled}
                  onClick={() => {
                    onClearError?.()
                    setForm({ name: "" })
                  }}
                >
                  <X size={14} strokeWidth={2} aria-hidden />
                </button>
              </span>
            </div>
            {/* <select
              className={`${advSelectCtl} deal_inv_equity_name_preset_pick`}
              aria-label="Replace with a preset equity class name"
              value=""
              disabled={disabled}
              onChange={(e) => {
                const v = e.target.value.trim()
                if (!v) return
                onClearError?.()
                setForm({ name: v })
              }}
            >
              <option value="">Presets…</option>
              {EQUITY_CLASS_NAME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select> */}
          </div>
        )}
        <InvestorClassFieldError message={fieldErrors?.equityName} />
      </div>
      {isGpLayout ? (
        <>
          <div className="deal_inv_class_field">
            <label
              className="deal_inv_ic_raise_own_label"
              htmlFor={`${idPrefix}-adv-entity-own`}
            >
              <Percent
                className="deal_inv_ic_raise_own_label_icon"
                size={17}
                strokeWidth={2}
                aria-hidden
              />
              <span>
                Entity legal ownership{" "}
                <span className="contacts_required" aria-hidden>
                  *
                </span>
              </span>
              <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                <InfoIconPanel
                  ariaLabel="More information: Entity legal ownership"
                  infoContent={
                    <p>
                      Percentage of the entity allocated to this class.
                    </p>
                  }
                />
              </span>
            </label>
            <div className="deal_inv_ic_pct_row">
              <input
                id={`${idPrefix}-adv-entity-own`}
                type="text"
                className={advInputCtl}
                inputMode="decimal"
                placeholder="0.00%"
                value={form.advanced.entityLegalOwnershipPct}
                disabled={disabled}
                aria-invalid={Boolean(fieldErrors?.entityLegalOwnership) || undefined}
                onChange={(e) => {
                  onClearError?.()
                  patchAdvanced(
                    buildEntityOwnershipAdvancedPatch(
                      e.target.value,
                      "typing",
                      form.advanced,
                    ),
                  )
                }}
                onBlur={(e) =>
                  patchAdvanced(
                    buildEntityOwnershipAdvancedPatch(
                      e.target.value,
                      "blur",
                      form.advanced,
                    ),
                  )
                }
              />
              <button
                type="button"
                className={[
                  "deal_inv_ic_freeze_toggle",
                  form.advanced.entityLegalOwnershipFrozen
                    ? "deal_inv_ic_freeze_toggle_active"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-pressed={form.advanced.entityLegalOwnershipFrozen}
                aria-label={
                  form.advanced.entityLegalOwnershipFrozen
                    ? "Unfreeze percentage"
                    : "Freeze percentage"
                }
                title={
                  form.advanced.entityLegalOwnershipFrozen
                    ? "Unfreeze percentage"
                    : "Freeze percentage"
                }
                disabled={disabled}
                onClick={() =>
                  patchAdvanced({
                    entityLegalOwnershipFrozen:
                      !form.advanced.entityLegalOwnershipFrozen,
                  })
                }
              >
                {form.advanced.entityLegalOwnershipFrozen ? (
                  <Lock size={14} strokeWidth={2} aria-hidden />
                ) : (
                  <LockOpen size={14} strokeWidth={2} aria-hidden />
                )}
              </button>
            </div>
            <InvestorClassFieldError message={fieldErrors?.entityLegalOwnership} />
          </div>
          <div className="deal_inv_class_field">
            <label
              className="deal_inv_ic_dist_label_flex"
              htmlFor={`${idPrefix}-pref-date`}
            >
              <span className="deal_inv_class_field_label deal_inv_class_label_inline">
                Preferred return start date
              </span>
              <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                <InfoIconPanel
                  ariaLabel="More information: Preferred return start date"
                  infoContent={
                    <p>
                      The date on which preferred return or interest begins
                      accumulating.
                    </p>
                  }
                />
              </span>
            </label>
            <input
              id={`${idPrefix}-pref-date`}
              type="date"
              className={fieldCtl}
              value={form.startDate?.slice(0, 10) ?? ""}
              onChange={(e) => setForm({ startDate: e.target.value })}
              disabled={disabled}
            />
          </div>
        </>
      ) : null}
      {!isGpLayout ? (
        <>
          <div className="deal_inv_class_field">
            <label
              className="deal_inv_ic_raise_own_label"
              htmlFor={`${idPrefix}-raise-own`}
            >
              <DollarSign
                className="deal_inv_ic_raise_own_label_icon"
                size={17}
                strokeWidth={2}
                aria-hidden
              />
              <span>
                Raise amount (for ownership)
                <span className="contacts_required" aria-hidden>
                  {" "}
                  *
                </span>
              </span>
              <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                <InfoIconPanel
                  ariaLabel="More information: Raise amount (for ownership)"
                  infoContent={
                    <p>
                      The amount being raised for this class including any funds
                      raised outside of the portal. This is used to calculate
                      ownership percentages.
                    </p>
                  }
                />
              </span>
            </label>
            <input
              id={`${idPrefix}-raise-own`}
              type="text"
              className={fieldCtl}
              placeholder="$0"
              inputMode="decimal"
              value={form.offeringSize}
              aria-invalid={Boolean(fieldErrors?.raiseOwnership) || undefined}
              onChange={(e) => {
                onClearError?.()
                const offeringSize = formatCurrencyUsdTypeInput(e.target.value)
                setFormWithAutoPricePerUnit({
                  offeringSize,
                  raiseAmountDistributions: offeringSize,
                })
              }}
              onBlur={(e) => {
                const offeringSize = blurFormatMoneyInput(e.target.value)
                setFormWithAutoPricePerUnit({
                  offeringSize,
                  raiseAmountDistributions: offeringSize,
                })
              }}
              disabled={disabled}
            />
            <InvestorClassFieldError message={fieldErrors?.raiseOwnership} />
          </div>
          <div className="deal_inv_class_field">
            <label
              className="deal_inv_ic_dist_label_flex"
              htmlFor={`${idPrefix}-raise-dist`}
            >
              <span className="deal_inv_class_field_label deal_inv_class_label_inline">
                Raise amount (for distributions)
                <span className="deal_inv_required" aria-hidden>
                  {" "}
                  *
                </span>
              </span>
              <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                <InfoIconPanel
                  ariaLabel="More information: Raise amount (for distributions)"
                  infoContent={
                    <p>
                      The total amount being raised for this class on the portal.
                      This is used to calculate distributions and billing quota.
                    </p>
                  }
                />
              </span>
            </label>
            <input
              id={`${idPrefix}-raise-dist`}
              type="text"
              className={fieldCtl}
              placeholder="$0"
              inputMode="decimal"
              value={form.raiseAmountDistributions}
              aria-invalid={Boolean(fieldErrors?.raiseDistributions) || undefined}
              onChange={(e) => {
                onClearError?.()
                setFormWithAutoPricePerUnit({
                  raiseAmountDistributions: formatCurrencyUsdTypeInput(
                    e.target.value,
                  ),
                })
              }}
              onBlur={(e) =>
                setFormWithAutoPricePerUnit({
                  raiseAmountDistributions: blurFormatMoneyInput(
                    e.target.value,
                  ),
                })
              }
              disabled={disabled}
            />
            <InvestorClassFieldError message={fieldErrors?.raiseDistributions} />
            {/* <p className="deal_inv_field_hint">
              {isMezzanineLayout ? (
                <>
                  Target amount, usually same as raise amount for ownership.
                </>
              ) : (
                <>
                  Often matches raise amount (for ownership) when both are
                  raised on the portal.
                </>
              )}
            </p> */}
          </div>
          {/* Raise quota (for billing) — hidden; billingRaiseQuotaForSave() still sends a value on save */}
          {/*
          <div className="deal_inv_class_field">
            <label
              className="deal_inv_ic_dist_label_flex"
              htmlFor={`${idPrefix}-raise-quota`}
            >
              <span className="deal_inv_class_field_label deal_inv_class_label_inline">
                Raise quota (for billing)
              </span>
              <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                <InfoIconPanel
                  ariaLabel="More information: Raise quota (for billing)"
                  infoContent={
                    <p>
                      How much equity you are currently managing on the portal
                      for this class. This is used for billing purposes and
                      should be higher than the sum of investments.
                    </p>
                  }
                />
              </span>
            </label>
            <input
              id={`${idPrefix}-raise-quota`}
              type="text"
              className={fieldCtl}
              placeholder="$0"
              inputMode="decimal"
              value={form.billingRaiseQuota}
              onChange={(e) =>
                setForm({
                  billingRaiseQuota: formatCurrencyUsdTypeInput(e.target.value),
                })
              }
              onBlur={(e) =>
                setForm({
                  billingRaiseQuota: blurFormatMoneyInput(e.target.value),
                })
              }
              disabled={disabled}
            />
          </div>
          */}
          <div className="deal_inv_class_field">
            <label
              className="deal_inv_ic_raise_own_label"
              htmlFor={`${idPrefix}-min-inv`}
            >
              <DollarSign
                className="deal_inv_ic_raise_own_label_icon"
                size={17}
                strokeWidth={2}
                aria-hidden
              />
              <span>
                Minimum investment{" "}
                <span className="deal_inv_required" aria-hidden>
                  *
                </span>
              </span>
            </label>
            <input
              id={`${idPrefix}-min-inv`}
              type="text"
              className={fieldCtl}
              placeholder={isMezzanineLayout ? "$0" : "$50,000"}
              inputMode="decimal"
              value={form.minimumInvestment}
              aria-invalid={Boolean(fieldErrors?.minimumInvestment) || undefined}
              onChange={(e) => {
                onClearError?.()
                setForm({
                  minimumInvestment: formatCurrencyUsdTypeInput(e.target.value),
                })
              }}
              onBlur={(e) =>
                setForm({
                  minimumInvestment: blurFormatMoneyInput(e.target.value),
                })
              }
              disabled={disabled}
            />
            <InvestorClassFieldError message={fieldErrors?.minimumInvestment} />
          </div>
          {!isMezzanineLayout ? (
            <div className="deal_inv_class_field">
              <label
                className="deal_inv_ic_raise_own_label"
                htmlFor={`${idPrefix}-max-inv`}
              >
                <DollarSign
                  className="deal_inv_ic_raise_own_label_icon"
                  size={17}
                  strokeWidth={2}
                  aria-hidden
                />
                <span>Maximum investment</span>
                <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                  <InfoIconPanel
                    ariaLabel="More information: Maximum investment"
                    infoContent={
                      <p>
                        Optional cap on how much a single investor may commit to
                        this class.
                      </p>
                    }
                  />
                </span>
              </label>
              <input
                id={`${idPrefix}-max-inv`}
                type="text"
                className={fieldCtl}
                placeholder="$0"
                inputMode="decimal"
                value={form.advanced.maximumInvestment}
                onChange={(e) => {
                  onClearError?.()
                  patchAdvanced({
                    maximumInvestment: formatCurrencyUsdTypeInput(
                      e.target.value,
                    ),
                  })
                }}
                onBlur={(e) =>
                  patchAdvanced({
                    maximumInvestment: blurFormatMoneyInput(e.target.value),
                  })
                }
                disabled={disabled}
              />
            </div>
          ) : null}
          {!isMezzPrefReturnPanel ? (
            <div className="deal_inv_class_field">
              <label
                className="deal_inv_ic_dist_label_flex"
                htmlFor={`${idPrefix}-pref-date`}
              >
                <span className="deal_inv_class_field_label deal_inv_class_label_inline">
                  Preferred return start date
                </span>
                <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                  <InfoIconPanel
                    ariaLabel="More information: Preferred return start date"
                    infoContent={
                      <p>
                        The date on which preferred return or interest begins
                        accumulating.
                      </p>
                    }
                  />
                </span>
              </label>
              <input
                id={`${idPrefix}-pref-date`}
                type="date"
                className={fieldCtl}
                value={form.startDate?.slice(0, 10) ?? ""}
                onChange={(e) => setForm({ startDate: e.target.value })}
                disabled={disabled}
              />
            </div>
          ) : null}
          {isMezzanineLayout &&
          (!isMezzPrefReturnPanel || isMezzRoiPrefReturn) ? (
            <div className="deal_inv_class_field">
              <label
                className="deal_inv_ic_dist_label_flex"
                htmlFor={`${idPrefix}-mezz-pref-return`}
              >
                <span className="deal_inv_class_field_label deal_inv_class_label_inline">
                  Preferred return type{" "}
                  <span className="deal_inv_required" aria-hidden>
                    *
                  </span>
                </span>
                <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                  <InfoIconPanel
                    ariaLabel="More information: Preferred return type"
                    infoContent={
                      <p>
                        Basis used to measure preferred return for this
                        mezzanine class (e.g. cash-on-cash vs IRR).
                      </p>
                    }
                  />
                </span>
              </label>
              <select
                id={`${idPrefix}-mezz-pref-return`}
                className={advSelectCtl}
                value={form.advanced.classPreferredReturnType}
                disabled={disabled}
                aria-invalid={Boolean(fieldErrors?.mezzPrefReturnType) || undefined}
                onChange={(e) => {
                  onClearError?.()
                  patchAdvanced({ classPreferredReturnType: e.target.value })
                }}
              >
                {MEZZ_CLASS_PREF_RETURN_OPTIONS.map((o) => (
                  <option
                    key={o.value || "__mezz-pref-empty"}
                    value={o.value}
                  >
                    {o.label}
                  </option>
                ))}
              </select>
              <InvestorClassFieldError message={fieldErrors?.mezzPrefReturnType} />
            </div>
          ) : null}
          {isMezzRoiPrefReturn ? (
            <MezzanineRoiPreferredReturnFields
              idPrefix={idPrefix}
              form={form}
              patchAdvanced={patchAdvanced}
              fieldCtl={fieldCtl}
              disabled={disabled}
              onClearError={onClearError}
              fieldErrors={fieldErrors}
            />
          ) : null}
          {isMezzStructuredPrefReturn ? (
            <MezzaninePreferredReturnFields
              idPrefix={idPrefix}
              form={form}
              setForm={setForm}
              patchAdvanced={patchAdvanced}
              fieldCtl={fieldCtl}
              advSelectCtl={advSelectCtl}
              disabled={disabled}
              onClearError={onClearError}
              fieldErrors={fieldErrors}
              showAverageAnnualExtras={isMezzFullPrefReturnGrid}
            />
          ) : null}
        </>
      ) : null}
      </>
      ) : null}
      {formStep === undefined || showPipelineAdvancedStep ? (
      <>
      {showPipelineAdvancedStep ? (
        <div
          className="deals_add_deal_asset_additional deals_add_deal_asset_additional_investor_class"
          aria-labelledby={`${idPrefix}-add-ic-additional-heading`}
        >
          <div className="deals_add_deal_asset_additional_head">
            <div>
              <FormHeadingWithInfo
                as="h2"
                id={`${idPrefix}-add-ic-additional-heading`}
                className="deals_add_deal_asset_additional_subtitle"
                title="Advanced"
                info={
                  <p>
                    {isMezzanineLayout
                      ? "Investment type, unit pricing, target IRR, assets, and waitlist."
                      : isGpLayout
                        ? "Investment structure, economics, and assets for this class."
                        : "Investment structure, economics, waitlist, and hurdle waterfalls when applicable."}
                  </p>
                }
              />
            </div>
          </div>
        </div>
      ) : null}
      <details
        className={
          showPipelineAdvancedStep
            ? `${advancedShellClass} deal_inv_ic_advanced_pipeline_step2`
            : advancedShellClass
        }
        {...(showPipelineAdvancedStep
          ? { open: true }
          : {
              defaultOpen:
                isLpLayout || isGpLayout || isMezzanineLayout,
            })}
      >
        <summary
          className={
            showPipelineAdvancedStep
              ? "deal_inv_ic_advanced_summary deal_inv_ic_advanced_summary_pipeline_hidden"
              : "deal_inv_ic_advanced_summary"
          }
        >
          <ChevronRight
            size={18}
            strokeWidth={2}
            className="deal_inv_ic_advanced_chevron"
            aria-hidden
          />
          Advanced
        </summary>
        <div className="deal_inv_ic_advanced_contact_shell">
          {isMezzanineLayout ? (
            <MezzanineClassAdvancedFields
              idPrefix={idPrefix}
              form={form}
              setForm={setForm}
              patchAdvanced={patchAdvanced}
              fieldCtl={fieldCtl}
              advSelectCtl={advSelectCtl}
              dealAssetRows={dealAssetRows}
              disabled={disabled}
              onClearError={onClearError}
              fieldErrors={fieldErrors}
            />
          ) : (
          <div className="deal_inv_ic_advanced_um_grid">
            <section className="deal_inv_ic_adv_group">
              <div className="deal_inv_ic_adv_group_head">
                <FormHeadingWithInfo
                  as="span"
                  className="deal_inv_ic_adv_group_title"
                  title="Structure"
                  info={
                    <p>Define class setup and investor workflow controls.</p>
                  }
                />
              </div>
              <div className="deal_inv_ic_adv_group_grid">
                <div className="um_field add_contact_field_tight deal_inv_ic_adv_field">
                  <label
                    className="um_field_label_row"
                    htmlFor={`${idPrefix}-adv-inv-type`}
                  >
                    <Briefcase
                      className="um_field_label_icon"
                      size={17}
                      aria-hidden
                    />
                    <span>
                      Investment type{" "}
                      <span className="contacts_required" aria-hidden>
                        *
                      </span>
                    </span>
                  </label>
                  <select
                    id={`${idPrefix}-adv-inv-type`}
                    className={advSelectCtl}
                    value={form.advanced.investmentType}
                    disabled={disabled}
                    aria-invalid={Boolean(fieldErrors?.advInvestmentType) || undefined}
                    onChange={(e) =>
                      patchAdvanced({ investmentType: e.target.value })
                    }
                  >
                    {ADV_INVESTMENT_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <InvestorClassFieldError message={fieldErrors?.advInvestmentType} />
                </div>
              </div>
            </section>

            {!isGpLayout ? (
              <section className="deal_inv_ic_adv_group">
                <div className="deal_inv_ic_adv_group_head">
                  <FormHeadingWithInfo
                    as="span"
                    className="deal_inv_ic_adv_group_title"
                    title="Ownership & allocation"
                    info={
                      <p>
                        Set percentages and optionally lock them with the freeze
                        toggle.
                      </p>
                    }
                  />
                </div>
                <div className="deal_inv_ic_adv_group_grid">
                  <div className="um_field add_contact_field_tight deal_inv_ic_pct_field deal_inv_ic_adv_field">
                <label
                  className="um_field_label_row"
                  htmlFor={`${idPrefix}-adv-entity-own`}
                >
                  <Percent
                    className="um_field_label_icon"
                    size={17}
                    aria-hidden
                  />
                  <span>
                    Entity legal ownership{" "}
                    <span className="contacts_required" aria-hidden>
                      *
                    </span>
                  </span>
                  <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                    <InfoIconPanel
                      ariaLabel="More information: Entity legal ownership"
                      infoContent={
                        <p>
                          Percentage of the entity allocated to this class.
                        </p>
                      }
                    />
                  </span>
                </label>
                <div className="deal_inv_ic_pct_row">
                  <input
                    id={`${idPrefix}-adv-entity-own`}
                    type="text"
                    className={advInputCtl}
                    inputMode="decimal"
                    placeholder="0.00%"
                    value={form.advanced.entityLegalOwnershipPct}
                    disabled={disabled}
                    aria-invalid={Boolean(fieldErrors?.entityLegalOwnership) || undefined}
                    onChange={(e) => {
                      onClearError?.()
                      patchAdvanced(
                        buildEntityOwnershipAdvancedPatch(
                          e.target.value,
                          "typing",
                          form.advanced,
                        ),
                      )
                    }}
                    onBlur={(e) =>
                      patchAdvanced(
                        buildEntityOwnershipAdvancedPatch(
                          e.target.value,
                          "blur",
                          form.advanced,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className={[
                      "deal_inv_ic_freeze_toggle",
                      form.advanced.entityLegalOwnershipFrozen
                        ? "deal_inv_ic_freeze_toggle_active"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-pressed={form.advanced.entityLegalOwnershipFrozen}
                    aria-label={
                      form.advanced.entityLegalOwnershipFrozen
                        ? "Unfreeze percentage"
                        : "Freeze percentage"
                    }
                    title={
                      form.advanced.entityLegalOwnershipFrozen
                        ? "Unfreeze percentage"
                        : "Freeze percentage"
                    }
                    disabled={disabled}
                    onClick={() =>
                      patchAdvanced({
                        entityLegalOwnershipFrozen:
                          !form.advanced.entityLegalOwnershipFrozen,
                      })
                    }
                  >
                    {form.advanced.entityLegalOwnershipFrozen ? (
                      <Lock size={14} strokeWidth={2} aria-hidden />
                    ) : (
                      <LockOpen size={14} strokeWidth={2} aria-hidden />
                    )}
                  </button>
                </div>
                <InvestorClassFieldError message={fieldErrors?.entityLegalOwnership} />
                  </div>

                  <div className="um_field add_contact_field_tight deal_inv_ic_pct_field deal_inv_ic_adv_field">
                <label
                  className="um_field_label_row"
                  htmlFor={`${idPrefix}-adv-dist-share`}
                >
                  <Percent
                    className="um_field_label_icon"
                    size={17}
                    aria-hidden
                  />
                  <span>
                    Distribution share{" "}
                    <span className="contacts_required" aria-hidden>
                      *
                    </span>
                  </span>
                  <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                    <InfoIconPanel
                      ariaLabel="More information: Distribution share"
                      infoContent={
                        <p>Share of distributions for this class.</p>
                      }
                    />
                  </span>
                </label>
                <div className="deal_inv_ic_pct_row">
                  <input
                    id={`${idPrefix}-adv-dist-share`}
                    type="text"
                    className={advInputCtl}
                    inputMode="decimal"
                    placeholder="0.00%"
                    value={form.advanced.distributionSharePct}
                    disabled={disabled}
                    aria-invalid={Boolean(fieldErrors?.advDistributionShare) || undefined}
                    onChange={(e) => {
                      onClearError?.()
                      patchAdvanced(
                        buildDistributionShareAdvancedPatch(
                          e.target.value,
                          "typing",
                          form.advanced,
                        ),
                      )
                    }}
                    onBlur={(e) =>
                      patchAdvanced(
                        buildDistributionShareAdvancedPatch(
                          e.target.value,
                          "blur",
                          form.advanced,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className={[
                      "deal_inv_ic_freeze_toggle",
                      form.advanced.distributionShareFrozen
                        ? "deal_inv_ic_freeze_toggle_active"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-pressed={form.advanced.distributionShareFrozen}
                    aria-label={
                      form.advanced.distributionShareFrozen
                        ? "Unfreeze percentage"
                        : "Freeze percentage"
                    }
                    title={
                      form.advanced.distributionShareFrozen
                        ? "Unfreeze percentage"
                        : "Freeze percentage"
                    }
                    disabled={disabled}
                    onClick={() =>
                      patchAdvanced({
                        distributionShareFrozen:
                          !form.advanced.distributionShareFrozen,
                      })
                    }
                  >
                    {form.advanced.distributionShareFrozen ? (
                      <Lock size={14} strokeWidth={2} aria-hidden />
                    ) : (
                      <LockOpen size={14} strokeWidth={2} aria-hidden />
                    )}
                  </button>
                </div>
                <InvestorClassFieldError message={fieldErrors?.advDistributionShare} />
                  </div>
                </div>
              </section>
            ) : null}

            <section className="deal_inv_ic_adv_group">
              <div className="deal_inv_ic_adv_group_head">
                <FormHeadingWithInfo
                  as="span"
                  className="deal_inv_ic_adv_group_title"
                  title="Economics"
                  info={
                    <p>
                      Configure ticket size, units, pricing, and performance
                      targets.
                    </p>
                  }
                />
              </div>
              <div className="deal_inv_ic_adv_group_grid">
                {/*
                  Maximum investment — Class details (step 1), next to Minimum investment.
                  LP / Mezzanine use advanced.maximumInvestment; stored in advanced_options_json.
                */}
                {isGpLayout ? (
                  <div className="um_field add_contact_field_tight deal_inv_ic_adv_field">
                    <label
                      className="um_field_label_row"
                      htmlFor={`${idPrefix}-adv-max-inv`}
                    >
                      <Tag
                        className="um_field_label_icon"
                        size={17}
                        aria-hidden
                      />
                      <span>Number of shares</span>
                    </label>
                    <input
                      id={`${idPrefix}-adv-max-inv`}
                      type="text"
                      className={advInputCtl}
                      inputMode="numeric"
                      placeholder="0"
                      autoComplete="off"
                      value={form.advanced.maximumInvestment}
                      disabled={disabled}
                      onChange={(e) =>
                        patchAdvanced({
                          maximumInvestment: formatNumberOfUnitsTypingInput(
                            e.target.value,
                          ),
                        })
                      }
                      onBlur={(e) =>
                        patchAdvanced({
                          maximumInvestment: blurFormatNumberOfUnitsInput(
                            e.target.value,
                          ),
                        })
                      }
                    />
                  </div>
                ) : null}

                {!isGpLayout ? (
                  <>
                    <div className="um_field add_contact_field_tight deal_inv_ic_adv_field">
                  <label
                    className="um_field_label_row"
                    htmlFor={`${idPrefix}-adv-nou`}
                  >
                    <Hash className="um_field_label_icon" size={17} aria-hidden />
                    <span>Number of units</span>
                    <span className="contacts_required" aria-hidden>
                      {" "}
                      *
                    </span>
                    <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                      <InfoIconPanel
                        ariaLabel="More information: Number of units"
                        infoContent={
                          <p>Total units in this class offering (e.g. shares).</p>
                        }
                      />
                    </span>
                  </label>
                  <input
                    id={`${idPrefix}-adv-nou`}
                    type="text"
                    className={advInputCtl}
                    inputMode="numeric"
                    placeholder="0"
                    autoComplete="off"
                    value={form.numberOfUnits}
                    disabled={disabled}
                    aria-invalid={Boolean(fieldErrors?.numberOfUnits) || undefined}
                    onChange={(e) =>
                      setFormWithAutoPricePerUnit({
                        numberOfUnits: formatNumberOfUnitsTypingInput(e.target.value),
                      })
                    }
                    onBlur={(e) =>
                      setFormWithAutoPricePerUnit({
                        numberOfUnits: blurFormatNumberOfUnitsInput(e.target.value),
                      })
                    }
                  />
                  <InvestorClassFieldError message={fieldErrors?.numberOfUnits} />
                    </div>

                    <div className="um_field add_contact_field_tight deal_inv_ic_adv_field">
                  <label
                    className="um_field_label_row"
                    htmlFor={`${idPrefix}-adv-ppu`}
                  >
                    <Tag className="um_field_label_icon" size={17} aria-hidden />
                    <span>Price per unit</span>
                    <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                      <InfoIconPanel
                        ariaLabel="More information: Price per unit"
                        infoContent={
                          <p>
                            Automatically calculated as raise amount ÷ number
                            of units.
                          </p>
                        }
                      />
                    </span>
                  </label>
                  <input
                    id={`${idPrefix}-adv-ppu`}
                    type="text"
                    className={advInputCtl}
                    inputMode="decimal"
                    placeholder="$1,000"
                    value={form.pricePerUnit}
                    readOnly
                    disabled={disabled}
                    aria-readonly
                    tabIndex={-1}
                  />
                  {/* Manage unit price over time — not wired yet
                  <div className="deal_inv_ic_price_action_row">
                    <button
                      type="button"
                      className="um_btn_secondary deal_inv_ic_inline_btn"
                      disabled={disabled}
                    >
                      Manage unit price over time
                    </button>
                  </div>
                  */}
                    </div>

                    <div className="um_field add_contact_field_tight deal_inv_ic_adv_field">
                  <label
                    className="um_field_label_row"
                    htmlFor={`${idPrefix}-adv-irr`}
                  >
                    <TrendingUp
                      className="um_field_label_icon"
                      size={17}
                      aria-hidden
                    />
                    <span>Target IRR</span>
                  </label>
                  <input
                    id={`${idPrefix}-adv-irr`}
                    type="text"
                    className={advInputCtl}
                    inputMode="decimal"
                    placeholder="0.00%"
                    value={form.advanced.targetIrr}
                    disabled={disabled}
                    onChange={(e) =>
                      patchAdvanced({
                        targetIrr: sanitizePercentTypingInput(e.target.value),
                      })
                    }
                    onBlur={(e) =>
                      patchAdvanced({
                        targetIrr: blurFormatPercentTwoDecimalsInput(
                          e.target.value,
                        ),
                      })
                    }
                  />
                    </div>
                  </>
                ) : null}
              </div>
            </section>

            <section className="deal_inv_ic_adv_group">
              <div className="deal_inv_ic_adv_group_head">
                <FormHeadingWithInfo
                  as="span"
                  className="deal_inv_ic_adv_group_title"
                  title="Operations"
                  info={
                    <p>
                      {isGpLayout
                        ? "Link assets to this class."
                        : "Link assets and control waitlist availability for this class."}
                    </p>
                  }
                />
              </div>
              <div className="deal_inv_ic_adv_group_grid">
                <div className="um_field add_contact_field_tight deal_inv_ic_adv_field deal_inv_ic_adv_field_assets">
              <label
                className="um_field_label_row"
                htmlFor={`${idPrefix}-adv-assets-ms-input`}
              >
                <Layers
                  className="um_field_label_icon"
                  size={17}
                  aria-hidden
                />
                <span>Assets</span>
              </label>
              <InvestorClassAssetsMultiSelect
                controlId={`${idPrefix}-adv-assets`}
                assetRows={dealAssetRows}
                selectedTags={form.advanced.assetTags}
                disabled={disabled}
                onSelectedTagsChange={(assetTags) => {
                  onClearError?.()
                  patchAdvanced({ assetTags })
                }}
              />
                </div>

                {!isGpLayout ? (
                <div className="um_field add_contact_field_tight deal_inv_ic_adv_field">
              <label
                className="um_field_label_row"
                htmlFor={`${idPrefix}-adv-waitlist`}
              >
                <ListFilter
                  className="um_field_label_icon"
                  size={17}
                  aria-hidden
                />
                <span>
                  Waitlist status{" "}
                  <span className="contacts_required" aria-hidden>
                    *
                  </span>
                </span>
                <span className="deals_add_inv_label_info deal_inv_ic_raise_own_info">
                  <InfoIconPanel
                    ariaLabel="More information: Waitlist status"
                    infoContent={
                      <p>
                        Whether investors can join a waitlist for this class.
                      </p>
                    }
                  />
                </span>
              </label>
              <select
                id={`${idPrefix}-adv-waitlist`}
                className={advSelectCtl}
                value={form.advanced.waitlistStatus}
                disabled={disabled}
                aria-invalid={Boolean(fieldErrors?.advWaitlist) || undefined}
                onChange={(e) => {
                  onClearError?.()
                  patchAdvanced({ waitlistStatus: e.target.value })
                }}
              >
                {ADV_WAITLIST_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <InvestorClassFieldError message={fieldErrors?.advWaitlist} />
                </div>
                ) : null}
              </div>
            </section>
          </div>
          )}
          {showLpHurdlesInAdvanced ? (
            <LpHurdlesSection
              idPrefix={idPrefix}
              hurdles={form.advanced.hurdles}
              equityClassName={form.name}
              disabled={disabled}
              onAdd={addLpHurdle}
              onExpandOrCollapseAll={toggleExpandAllLpHurdles}
              onRemove={removeLpHurdle}
              onUpdate={updateLpHurdle}
              className="deal_inv_ic_advanced_lp_hurdles"
            />
          ) : null}
        </div>
      </details>
      </>
      ) : null}
    </>
  )
}

function asRecordLoose(v: unknown): Record<string, unknown> {
  if (v != null && typeof v === "object" && !Array.isArray(v))
    return v as Record<string, unknown>
  return {}
}

function strLoose(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v.trim() || fallback
  if (v != null && typeof v !== "object") return String(v).trim() || fallback
  return fallback
}

/** Latest Class Setup fields stored on advanced_options_json.classSetup. */
function readClassSetupSummary(row: DealInvestorClass): {
  classGroup: string
  mapsTo: string
  actuallyFunded: string
  equityPct: string
  prefEnabled: boolean
  prefRate: string
  prefCompounding: string
  prefTotalRate: string
  prefCurrentRate: string
  prefAccrualRate: string
  mezzRate: string
  mezzPay: string
  promoteHint: string
} {
  let raw: Record<string, unknown> = {}
  try {
    raw = row.advancedOptionsJson?.trim()
      ? (JSON.parse(row.advancedOptionsJson) as Record<string, unknown>)
      : {}
  } catch {
    raw = {}
  }
  const setup = asRecordLoose(raw.classSetup ?? raw.class_setup)
  const pref = asRecordLoose(setup.preferredReturn ?? setup.preferred_return)
  const prefEq = asRecordLoose(setup.prefEquity ?? setup.pref_equity)
  const mezz = asRecordLoose(setup.mezz)
  const finalTier = asRecordLoose(setup.finalTier ?? setup.final_tier)
  const tiers = Array.isArray(setup.waterfallTiers)
    ? setup.waterfallTiers
    : Array.isArray(setup.waterfall_tiers)
      ? setup.waterfall_tiers
      : []

  const equityFromSetup = strLoose(setup.equityPct ?? setup.equity_pct).replace(
    /%/g,
    "",
  )
  const advanced = parseAdvancedJson(row.advancedOptionsJson)
  const equityFallback = strLoose(advanced.entityLegalOwnershipPct).replace(
    /%/g,
    "",
  )

  const promoteParts: string[] = []
  for (const t of tiers) {
    const rowT = asRecordLoose(t)
    const lp = strLoose(rowT.lpPct ?? rowT.lp_pct, "0")
    promoteParts.push(`${lp}%`)
  }
  if (strLoose(finalTier.lpPct ?? finalTier.lp_pct))
    promoteParts.push(`${strLoose(finalTier.lpPct ?? finalTier.lp_pct)}%`)

  return {
    classGroup: strLoose(setup.classGroup ?? setup.class_group),
    mapsTo: strLoose(setup.mapsTo ?? setup.maps_to),
    actuallyFunded:
      strLoose(row.raiseAmountDistributions) ||
      strLoose(setup.actuallyFunded ?? setup.actually_funded) ||
      "0",
    equityPct: equityFromSetup || equityFallback || "0",
    prefEnabled: Boolean(pref.enabled),
    prefRate: strLoose(pref.rate, "0"),
    prefCompounding: strLoose(pref.compounding, "simple"),
    prefTotalRate: strLoose(prefEq.totalRate ?? prefEq.total_rate, "0"),
    prefCurrentRate: strLoose(prefEq.currentRate ?? prefEq.current_rate, "0"),
    prefAccrualRate: strLoose(prefEq.accrualRate ?? prefEq.accrual_rate, "0"),
    mezzRate: strLoose(mezz.rate, strLoose(advanced.classPreferredReturnPct).replace(/%/g, "") || "0"),
    mezzPay: strLoose(mezz.pay, "Current pay"),
    promoteHint:
      promoteParts.length > 0 ? promoteParts.join(" → ") : "Set in Class Setup",
  }
}

function investorClassListSummary(row: DealInvestorClass): {
  typeLabel: string
  funded: string
  ownershipLabel: string
  ownershipValue: string
  terms: string
  created: string
  mapsTo: string
} {
  const setup = readClassSetupSummary(row)
  const sub = (row.subscriptionType || "").toLowerCase()
  const isEquity = sub === "lp" || sub === "gp"

  let terms = "—"
  if (sub === "lp") {
    terms = setup.prefEnabled
      ? `${setup.prefRate}%/yr · ${setup.prefCompounding === "compound" ? "Compound" : "Simple"}`
      : "Pref off"
  } else if (sub === "gp") {
    terms = setup.promoteHint
  } else if (sub === "preferred_equity") {
    terms = `${setup.prefTotalRate}%/yr`
  } else if (sub === "mezzanine") {
    terms = `${setup.mezzRate}%/yr · ${setup.mezzPay}`
  }

  return {
    typeLabel: classTypeOptionLabel(row.subscriptionType),
    funded: setup.actuallyFunded,
    ownershipLabel: isEquity ? "Equity" : "Position",
    ownershipValue: isEquity
      ? formatPctTwoDecimals(setup.equityPct)
      : "Fixed return",
    terms,
    created: formatDateDdMmmYyyy(row.createdAt),
    mapsTo: setup.mapsTo,
  }
}

function ClassTableColumnHeader({
  label,
  hint,
  headerAlign = "left",
  tooltipPanelAlign,
}: {
  label: string
  hint: string
  headerAlign?: "left" | "center" | "right"
  tooltipPanelAlign?: FormTooltipPanelAlign
}) {
  const headerAlignClass =
    headerAlign === "right"
      ? " deals_table_col_header_end"
      : headerAlign === "center"
        ? " deals_table_col_header_center"
        : ""
  const panelAlign: FormTooltipPanelAlign =
    tooltipPanelAlign ??
    (headerAlign === "right"
      ? "end"
      : headerAlign === "center"
        ? "center"
        : "start")
  return (
    <span className={`deals_table_col_header${headerAlignClass}`}>
      <span>{label}</span>
      <span
        className="deals_table_header_tooltip_anchor"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <FormTooltip
          label={`More information: ${label}`}
          content={<p className="deals_table_header_tooltip_p">{hint}</p>}
          placement="bottom"
          panelAlign={panelAlign}
          nativeButtonTrigger={false}
        />
      </span>
    </span>
  )
}

export const DEAL_ADD_IC_PAGE_TITLE_ID = "deal-add-ic-page-title"
export const DEAL_EDIT_IC_PAGE_TITLE_ID = "deal-edit-ic-page-title"

export function AddInvestorClassPanel({
  asPage = false,
  open = false,
  dealId,
  existingClasses,
  onClose,
  onCreated,
  pageTitleId = DEAL_ADD_IC_PAGE_TITLE_ID,
  pipelineStep = 1,
  onPipelineStepChange,
  onAddHurdleClick,
}: {
  /** Full route page: panel is always shown; `open` is ignored. */
  asPage?: boolean
  /** Inline under Offering Information; ignored when `asPage`. */
  open?: boolean
  dealId: string
  existingClasses: DealInvestorClass[]
  onClose: () => void
  onCreated: () => void
  /** `id` of the page `<h1>` when `asPage` (for `aria-labelledby`). */
  pageTitleId?: string
  /** Add-class route pipeline steps. */
  pipelineStep?: InvestorClassPipelineStep
  onPipelineStepChange?: (step: InvestorClassPipelineStep) => void
  onAddHurdleClick?: () => void
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [form, setForm] = useState(emptyForm)
  const [err, setErr] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<InvestorClassFieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const visible = asPage || open
  const idPrefix = "add-ic"

  const patch = useCallback((p: Partial<DealInvestorClassFormValues>) => {
    setForm((prev) => ({ ...prev, ...p }))
  }, [])

  const showValidationError = useCallback(
    (message: string) => {
      handleInvestorClassValidationError(message, {
        setFieldErrors,
        setFormError: setErr,
        formRef,
        idPrefix,
        pipelineStep,
        onPipelineStepChange,
        usePipeline: asPage,
      })
    },
    [asPage, idPrefix, onPipelineStepChange, pipelineStep],
  )

  const clearFormError = useCallback(() => {
    setErr(null)
    setFieldErrors({})
    clearInvestorClassFormFieldHighlights(formRef.current)
  }, [])

  const allocationDraftTotals = useMemo(() => {
    if (!visible) return null
    return computeInvestorClassAllocationTotalsForForm({
      existingRows: existingClasses,
      entityLegalOwnershipPct: form.advanced.entityLegalOwnershipPct,
      distributionSharePct: form.advanced.distributionSharePct,
      subscriptionType: form.subscriptionType,
    })
  }, [
    visible,
    existingClasses,
    form.advanced.distributionSharePct,
    form.advanced.entityLegalOwnershipPct,
    form.subscriptionType,
  ])

  const dealAssetRows = useDealAssetsForInvestorClass(dealId)

  const existingClassesRef = useRef(existingClasses)
  existingClassesRef.current = existingClasses

  useEffect(() => {
    if (!visible) return
    setForm(emptyFormForNewInvestorClass(existingClassesRef.current))
    setErr(null)
    setFieldErrors({})
  }, [visible, dealId])

  useEffect(() => {
    if (!visible || asPage) return
    const el = panelRef.current
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [visible, asPage])

  useEffect(() => {
    if (!visible) return
    function onWindowKeyDown(ev: globalThis.KeyboardEvent) {
      if (ev.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onWindowKeyDown)
    return () => window.removeEventListener("keydown", onWindowKeyDown)
  }, [visible, onClose])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (asPage && pipelineStep === 1) {
      const step1Err = validateInvestorClassStep1(form)
      if (step1Err) {
        showValidationError(step1Err)
        return
      }
      const nextForm = appendDefaultLpHurdleIfEmpty(
        formatInvestorClassMoneyFields(form),
      )
      setForm(nextForm)
      setErr(null)
      setFieldErrors({})
      onPipelineStepChange?.(2)
      return
    }
    const prepared = formatInvestorClassMoneyFields(form)
    const saveErr = validateInvestorClassForSave(prepared, { existingClasses })
    if (saveErr) {
      showValidationError(saveErr)
      return
    }
    setErr(null)
    setSubmitting(true)
    try {
      await createDealInvestorClass(dealId, investorClassFormForSave(prepared))
      onCreated()
      if (!asPage) onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!visible) return null

  return (
    <>
    <section
      ref={panelRef}
      className={[
        "deal_inv_ic_add_panel add_contact_panel deal_inv_offering_modal deal_inv_ic_form_modal_panel",
        asPage ? "deals_add_deal_asset_panel" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={asPage ? pageTitleId : titleId}
    >
      {!asPage ? (
        <header className="deal_inv_ic_add_panel_head">
          <h3 id={titleId} className="deal_inv_ic_add_panel_title">
            Add investor class
          </h3>
          <button
            type="button"
            className="um_modal_close deal_inv_ic_add_panel_close"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </header>
      ) : null}
      <form
        ref={formRef}
        className={[
          "deals_add_inv_modal_form deal_inv_ic_add_panel_form",
          asPage ? "deals_add_deal_asset_form" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onSubmit={handleSubmit}
      >
        <div
          className={[
            "deals_add_inv_modal_body deal_inv_ic_modal_form_grid deal_inv_ic_modal_form_grid_3",
            asPage ? "deals_add_deal_asset_form_scroll" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {err ? (
            <p className="um_msg_error um_modal_form_error" role="alert">
              {err}
            </p>
          ) : null}
          {allocationDraftTotals?.showNotice ? (
            <InvestorClassAllocationToolbarNotice totals={allocationDraftTotals} />
          ) : null}
          <InvestorClassModalFormBody
            idPrefix="add-ic"
            form={form}
            setForm={patch}
            disabled={submitting}
            onClearError={clearFormError}
            onAddHurdleClick={onAddHurdleClick}
            showNewClassTitleAboveType={asPage}
            dealAssetRows={dealAssetRows}
            formStep={asPage ? pipelineStep : undefined}
            fieldErrors={fieldErrors}
          />
        </div>
        <div
          className={[
            "um_modal_actions deal_inv_ic_add_panel_actions",
            asPage ? "deals_add_deal_asset_footer_actions" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <button
            type="button"
            className="um_btn_secondary"
            onClick={onClose}
            disabled={submitting}
          >
            <X size={16} strokeWidth={2} aria-hidden />
            Close
          </button>
          <div className="add_contact_modal_actions_trailing">
            {asPage && pipelineStep > 1 ? (
              <button
                type="button"
                className="um_btn_secondary"
                disabled={submitting}
                onClick={() => {
                  setErr(null)
                  setFieldErrors({})
                  onPipelineStepChange?.(1)
                }}
              >
                <ArrowLeft size={16} strokeWidth={2} aria-hidden />
                Back
              </button>
            ) : null}
            {asPage && pipelineStep === 1 ? (
              <button type="submit" className="um_btn_primary" disabled={submitting}>
                Next
                <ChevronRight size={18} strokeWidth={2} aria-hidden />
              </button>
            ) : (
              <button type="submit" className="um_btn_primary" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2
                      size={16}
                      strokeWidth={2}
                      className="deal_ic_modal_btn_spin"
                      aria-hidden
                    />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save size={16} strokeWidth={2} aria-hidden />
                    Save
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </form>
    </section>
    </>
  )
}

/** Full-page edit shell: same panel + pipeline as {@link AddInvestorClassPanel} `asPage`. */
export function EditInvestorClassPanel({
  dealId,
  row,
  existingClasses,
  onClose,
  onSaved,
  pageTitleId = DEAL_EDIT_IC_PAGE_TITLE_ID,
  pipelineStep = 1,
  onPipelineStepChange,
  onAddHurdleClick,
}: {
  dealId: string
  row: DealInvestorClass
  existingClasses: DealInvestorClass[]
  onClose: () => void
  onSaved: () => void
  pageTitleId?: string
  pipelineStep?: InvestorClassPipelineStep
  onPipelineStepChange?: (step: InvestorClassPipelineStep) => void
  onAddHurdleClick?: () => void
}) {
  const [form, setForm] = useState(() => rowToForm(row))
  const [err, setErr] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<InvestorClassFieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const idPrefix = "edit-ic"

  const patch = useCallback((p: Partial<DealInvestorClassFormValues>) => {
    setForm((prev) => ({ ...prev, ...p }))
  }, [])
  const dealAssetRows = useDealAssetsForInvestorClass(dealId)

  const showValidationError = useCallback(
    (message: string) => {
      handleInvestorClassValidationError(message, {
        setFieldErrors,
        setFormError: setErr,
        formRef,
        idPrefix,
        pipelineStep,
        onPipelineStepChange,
        usePipeline: true,
      })
    },
    [idPrefix, onPipelineStepChange, pipelineStep],
  )

  const clearFormError = useCallback(() => {
    setErr(null)
    setFieldErrors({})
    clearInvestorClassFormFieldHighlights(formRef.current)
  }, [])

  const allocationDraftTotals = useMemo(() => {
    return computeInvestorClassAllocationTotalsForForm({
      existingRows: existingClasses,
      entityLegalOwnershipPct: form.advanced.entityLegalOwnershipPct,
      distributionSharePct: form.advanced.distributionSharePct,
      subscriptionType: form.subscriptionType,
      editingClassId: row.id,
    })
  }, [
    existingClasses,
    form.advanced.distributionSharePct,
    form.advanced.entityLegalOwnershipPct,
    form.subscriptionType,
    row.id,
  ])

  useEffect(() => {
    setForm(rowToForm(row))
    setErr(null)
    setFieldErrors({})
    clearInvestorClassFormFieldHighlights(formRef.current)
  }, [row])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (pipelineStep === 1) {
      const step1Err = validateInvestorClassStep1(form)
      if (step1Err) {
        showValidationError(step1Err)
        return
      }
      const nextForm = appendDefaultLpHurdleIfEmpty(
        formatInvestorClassMoneyFields(form),
      )
      setForm(nextForm)
      setErr(null)
      setFieldErrors({})
      onPipelineStepChange?.(2)
      return
    }
    const prepared = formatInvestorClassMoneyFields(form)
    const saveErr = validateInvestorClassForSave(prepared, {
      existingClasses,
      editingClassId: row.id,
    })
    if (saveErr) {
      showValidationError(saveErr)
      return
    }
    setErr(null)
    setSubmitting(true)
    try {
      await updateDealInvestorClass(
        dealId,
        row.id,
        investorClassFormForSave(prepared),
      )
      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
    <section
      className="deal_inv_ic_add_panel add_contact_panel deal_inv_offering_modal deal_inv_ic_form_modal_panel deals_add_deal_asset_panel"
      aria-labelledby={pageTitleId}
    >
      <form
        ref={formRef}
        className="deals_add_inv_modal_form deal_inv_ic_add_panel_form deals_add_deal_asset_form"
        onSubmit={handleSubmit}
      >
        <div className="deals_add_inv_modal_body deal_inv_ic_modal_form_grid deal_inv_ic_modal_form_grid_3 deals_add_deal_asset_form_scroll">
          {err ? (
            <p className="um_msg_error um_modal_form_error" role="alert">
              {err}
            </p>
          ) : null}
          {allocationDraftTotals?.showNotice ? (
            <InvestorClassAllocationToolbarNotice totals={allocationDraftTotals} />
          ) : null}
          <InvestorClassModalFormBody
            idPrefix="edit-ic"
            form={form}
            setForm={patch}
            disabled={submitting}
            onClearError={clearFormError}
            onAddHurdleClick={onAddHurdleClick}
            showNewClassTitleAboveType
            dealAssetRows={dealAssetRows}
            formStep={pipelineStep}
            fieldErrors={fieldErrors}
          />
        </div>
        <div className="um_modal_actions deal_inv_ic_add_panel_actions deals_add_deal_asset_footer_actions">
          <button
            type="button"
            className="um_btn_secondary"
            onClick={onClose}
            disabled={submitting}
          >
            <X size={16} strokeWidth={2} aria-hidden />
            Close
          </button>
          <div className="add_contact_modal_actions_trailing">
            {pipelineStep > 1 ? (
              <button
                type="button"
                className="um_btn_secondary"
                disabled={submitting}
                onClick={() => {
                  setErr(null)
                  setFieldErrors({})
                  onPipelineStepChange?.(1)
                }}
              >
                <ArrowLeft size={16} strokeWidth={2} aria-hidden />
                Back
              </button>
            ) : null}
            {pipelineStep === 1 ? (
              <button type="submit" className="um_btn_primary" disabled={submitting}>
                Next
                <ChevronRight size={18} strokeWidth={2} aria-hidden />
              </button>
            ) : (
              <button type="submit" className="um_btn_primary" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2
                      size={16}
                      strokeWidth={2}
                      className="deal_ic_modal_btn_spin"
                      aria-hidden
                    />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save size={16} strokeWidth={2} aria-hidden />
                    Save
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </form>
    </section>
    </>
  )
}

function InvestorClassConfirmDeleteModal({
  open,
  classLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean
  classLabel: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    function onWindowKeyDown(ev: globalThis.KeyboardEvent) {
      if (ev.key === "Escape" && !busy) onCancel()
    }
    window.addEventListener("keydown", onWindowKeyDown)
    return () => window.removeEventListener("keydown", onWindowKeyDown)
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div
      className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost deal_ic_dialog_overlay"
      role="presentation"
    >
      <div
        className="um_modal um_modal_view deals_add_inv_modal_panel deal_inv_offering_modal deal_ic_dialog_shell"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="um_modal_head">
          <h3 id={titleId} className="um_modal_title">
            Delete investor class
          </h3>
          <button
            type="button"
            className="um_modal_close"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div className="deal_ic_dialog_body">
          <p className="deal_ic_dialog_message">
            Delete &quot;{classLabel}&quot;? This cannot be undone.
          </p>
        </div>
        <div className="um_modal_actions add_contact_modal_actions">
          <button
            type="button"
            className="um_btn_secondary"
            onClick={onCancel}
            disabled={busy}
          >
            <X size={16} strokeWidth={2} aria-hidden />
            Close
          </button>
          <div className="add_contact_modal_actions_trailing">
            <button
              type="button"
              className="um_btn_primary deal_ic_dialog_btn_danger"
              onClick={onConfirm}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 size={16} strokeWidth={2} aria-hidden />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 size={16} strokeWidth={2} aria-hidden />
                  Delete
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function InvestorClassMessageModal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    function onWindowKeyDown(ev: globalThis.KeyboardEvent) {
      if (ev.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onWindowKeyDown)
    return () => window.removeEventListener("keydown", onWindowKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost deal_ic_dialog_overlay deal_ic_message_overlay"
      role="presentation"
    >
      <div
        className="um_modal um_modal_view deals_add_inv_modal_panel deal_inv_offering_modal deal_ic_dialog_shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="um_modal_head">
          <h3 id={titleId} className="um_modal_title">
            {title}
          </h3>
          <button
            type="button"
            className="um_modal_close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div className="deal_ic_dialog_body">{children}</div>
        <div className="um_modal_actions">
          <button
            type="button"
            className="um_btn_primary"
            onClick={onClose}
          >
            <CircleCheck size={16} strokeWidth={2} aria-hidden />
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

function investorClassSearchBlob(
  row: DealInvestorClass,
  dealStatusLabel: string,
  dealVisibilityLabel: string,
): string {
  return [
    row.name,
    classTypeOptionLabel(row.subscriptionType),
    row.entityName,
    formatDateDdMmmYyyy(row.createdAt),
    row.offeringSize,
    row.raiseAmountDistributions,
    row.billingRaiseQuota,
    row.minimumInvestment,
    row.numberOfUnits,
    row.pricePerUnit,
    dealStatusLabel,
    dealVisibilityLabel,
  ]
    .join(" ")
    .toLowerCase()
}

export function InvestorClassAllocationToolbarNotice({
  totals,
}: {
  totals: InvestorClassAllocationTotals
}) {
  if (!totals.showNotice) return null

  const isAllocationWarning = totals.hasOver || totals.hasUnder
  const NoticeIcon = isAllocationWarning ? AlertCircle : Info
  const noticeToneClass = totals.hasOver
    ? "deal_inv_class_allocation_notice_over"
    : totals.hasUnder
      ? "deal_inv_class_allocation_notice_under"
      : "deal_inv_class_allocation_notice_exact"

  return (
    <div className="deal_inv_class_allocation_notice_wrap">
      <div
        className={["deal_inv_class_allocation_notice", noticeToneClass].join(
          " ",
        )}
        role={isAllocationWarning ? "alert" : "status"}
        aria-live="polite"
      >
        <NoticeIcon
          size={17}
          strokeWidth={2}
          className="deal_inv_class_allocation_notice_icon"
          aria-hidden
        />
        <div className="deal_inv_class_allocation_notice_text">
          {totals.messages.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      </div>
    </div>
  )
}

export function OfferingInformationSection({
  dealId,
  dealName,
  dealOfferingStatus,
  dealOfferingVisibility,
}: {
  dealId: string
  dealName?: string | null
  /** Same deal-level status as Offering Details → Overview (Deal Status). */
  dealOfferingStatus?: string | null
  /** Same deal-level visibility as Offering Details → Overview. */
  dealOfferingVisibility?: string | null
}) {
  const navigate = useNavigate()
  const [rows, setRows] = useState<DealInvestorClass[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<DealInvestorClass | null>(
    null,
  )
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null)
  const [exportModalOpen, setExportModalOpen] = useState(false)

  const dealStatusLabel = useMemo(
    () => offeringStatusLabelFromRaw(dealOfferingStatus),
    [dealOfferingStatus],
  )

  const dealVisibilityLabel = useMemo(
    () => offeringVisibilityLabelFromRaw(dealOfferingVisibility),
    [dealOfferingVisibility],
  )

  const load = useCallback(async () => {
    setLoading(true)
    const list = await fetchDealInvestorClasses(dealId)
    setRows(list)
    setLoading(false)
  }, [dealId])

  useEffect(() => {
    void load()
  }, [load])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      investorClassSearchBlob(r, dealStatusLabel, dealVisibilityLabel).includes(
        q,
      ),
    )
  }, [rows, query, dealStatusLabel, dealVisibilityLabel])

  const allocationTotals = useMemo(
    () => computeInvestorClassAllocationTotals(rows),
    [rows],
  )

  const classSetupHref = `/deals/${encodeURIComponent(dealId)}/class-setup`
  const addInvestorClassHref = `${classSetupHref}?mode=create`
  const distributionSetupHref = `/deals/${encodeURIComponent(dealId)}/distribution-setup`

  const emptyLabel = loading
    ? "Loading investor classes…"
    : rows.length === 0
      ? "No investor classes yet. Add an investor class to see it here."
      : query.trim()
        ? "No investor classes match your search."
        : "No investor classes to display."

  async function confirmDeleteInvestorClass() {
    const r = deleteTarget
    if (!r) return
    setDeleteBusy(true)
    try {
      await deleteDealInvestorClass(dealId, r.id)
      setDeleteTarget(null)
      await load()
    } catch (e) {
      setDeleteTarget(null)
      setNoticeMessage(
        e instanceof Error ? e.message : "Could not delete this investor class.",
      )
    } finally {
      setDeleteBusy(false)
    }
  }

  const canExportClasses = !loading && rows.length > 0

  const exportModalRows = useMemo(
    () =>
      rows.map((row) => ({
        key: row.id,
        label: row.name?.trim() || "—",
        meta: classTypeOptionLabel(row.subscriptionType) || undefined,
        searchText: investorClassSearchBlob(
          row,
          dealStatusLabel,
          dealVisibilityLabel,
        ),
      })),
    [rows, dealStatusLabel, dealVisibilityLabel],
  )

  const handleExportClasses = useCallback(
    (selectedKeys: string[]) => {
      const keySet = new Set(selectedKeys)
      const chosen = rows.filter((row) => keySet.has(row.id))
      if (chosen.length === 0) return
      const filename = downloadInvestorClassesExportCsv(
        dealName?.trim() || dealId,
        chosen,
        dealStatusLabel,
        dealVisibilityLabel,
      )
      toast.success("Investor classes exported", `Saved as ${filename}`)
    },
    [dealId, dealName, rows, dealStatusLabel, dealVisibilityLabel],
  )

  const columns: DataTableColumn<DealInvestorClass>[] = useMemo(
    () => [
      {
        id: "name",
        header: (
          <ClassTableColumnHeader
            label="Name"
            hint="Investor class name shown in the offering and Class Setup."
          />
        ),
        colWidth: "14rem",
        thClassName: "deal_classes_col_name",
        tdClassName: "um_td_user deal_classes_col_name",
        sortValue: (row) => row.name.toLowerCase(),
        cell: (row) => (
          <button
            type="button"
            className="deals_table_name_link deal_classes_name_btn"
            onClick={() =>
              navigate(
                `/deals/${encodeURIComponent(dealId)}/class-setup?classId=${encodeURIComponent(row.id)}`,
                { state: OFFERING_DETAILS_CLASSES_RETURN },
              )
            }
          >
            {row.name || "—"}
          </button>
        ),
      },
      {
        id: "type",
        header: (
          <ClassTableColumnHeader
            label="Type"
            hint="LP, GP, preferred equity, or mezzanine class type."
          />
        ),
        sortValue: (row) =>
          classTypeOptionLabel(row.subscriptionType).toLowerCase(),
        cell: (row) => investorClassListSummary(row).typeLabel,
      },
      {
        id: "funded",
        header: (
          <ClassTableColumnHeader
            label="Funded"
            hint="Sum of fund-approved investment commitments for this class."
            headerAlign="right"
            tooltipPanelAlign="end"
          />
        ),
        align: "right",
        thClassName: "deals_th_align_right",
        sortValue: (row) => {
          const n = parseFloat(
            String(investorClassListSummary(row).funded).replace(/[^0-9.-]/g, ""),
          )
          return Number.isFinite(n) ? n : 0
        },
        cell: (row) => (
          <CardCompactAmount
            amount={investorClassListSummary(row).funded}
            displayMode="table"
          />
        ),
      },
      {
        id: "ownership",
        header: (
          <ClassTableColumnHeader
            label="Ownership"
            hint="Equity ownership percentage, or fixed return for non-equity classes."
            headerAlign="right"
            tooltipPanelAlign="end"
          />
        ),
        align: "right",
        thClassName: "deals_th_align_right",
        sortValue: (row) => investorClassListSummary(row).ownershipValue,
        cell: (row) => {
          const s = investorClassListSummary(row)
          return (
            <span className="deal_classes_ownership_cell" title={s.ownershipLabel}>
              {s.ownershipValue}
            </span>
          )
        },
      },
      {
        id: "terms",
        header: (
          <ClassTableColumnHeader
            label="Terms"
            hint="Preferred return, promote stages, or interest terms for this class."
          />
        ),
        sortValue: (row) => investorClassListSummary(row).terms.toLowerCase(),
        cell: (row) => (
          <span className="deal_classes_terms_cell">
            {investorClassListSummary(row).terms}
          </span>
        ),
      },
      {
        id: "created",
        header: (
          <ClassTableColumnHeader
            label="Created"
            hint="Date this investor class was created."
          />
        ),
        sortValue: (row) => row.createdAt || "",
        cell: (row) => investorClassListSummary(row).created || "—",
      },
      {
        id: "actions",
        header: (
          <ClassTableColumnHeader
            label="Actions"
            hint="Edit class setup or delete this investor class."
            headerAlign="right"
            tooltipPanelAlign="end"
          />
        ),
        align: "right",
        thClassName: "um_th_actions deals_th_actions_head",
        tdClassName: "um_td_actions",
        cell: (row) => (
          <ClassRowActions
            rowName={row.name}
            onEdit={() =>
              navigate(
                `/deals/${encodeURIComponent(dealId)}/class-setup?classId=${encodeURIComponent(row.id)}`,
                { state: OFFERING_DETAILS_CLASSES_RETURN },
              )
            }
            onDelete={() => setDeleteTarget(row)}
          />
        ),
      },
    ],
    [dealId, navigate],
  )

  return (
    <div className="deal_offering_info">
      <ExportSelectableRowsModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        title="Export investor classes"
        hint="Search and select classes, then export to Excel (CSV format)."
        searchPlaceholder="Search classes…"
        searchAriaLabel="Search classes in export list"
        listAriaLabel="Investor classes to export"
        rows={exportModalRows}
        onExportExcel={handleExportClasses}
      />
      <div className="um_panel um_members_tab_panel deals_list_table_panel deals_list_card_surface deal_inv_table_panel deal_offering_info_panel deal_classes_datatable_panel">
        <InvestorClassAllocationToolbarNotice totals={allocationTotals} />
        <div
          className="um_toolbar um_toolbar_export_then_search deal_offering_section_toolbar"
          role="toolbar"
          aria-label="Investor classes"
        >
          <div className="um_search_wrap">
            <Search className="um_search_icon" size={18} aria-hidden />
            <input
              type="search"
              className="um_search_input"
              placeholder="Search classes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search investor classes"
              autoComplete="off"
            />
          </div>
          <div className="um_toolbar_actions">
            <button
              type="button"
              className="um_toolbar_export_btn"
              disabled={!canExportClasses}
              onClick={() => setExportModalOpen(true)}
              aria-label="Export all investor classes"
              title={
                canExportClasses ? undefined : "No investor classes to export"
              }
            >
              <Download size={18} strokeWidth={2} aria-hidden />
              <span>Export All</span>
            </button>
            <Link
              to={classSetupHref}
              state={OFFERING_DETAILS_CLASSES_RETURN}
              className="um_toolbar_export_btn"
            >
              Class Setup
            </Link>
            <Link
              to={distributionSetupHref}
              state={OFFERING_DETAILS_CLASSES_RETURN}
              className="um_toolbar_export_btn"
            >
              Distribution Setup
            </Link>
            <Link
              to={addInvestorClassHref}
              state={OFFERING_DETAILS_CLASSES_RETURN}
              className="um_btn_primary deals_list_add_link"
              title={
                allocationTotals.addDisabled
                  ? `${allocationTotals.messages.join(" ")} You can still open the class editor to adjust ownership or add classes.`
                  : undefined
              }
            >
              <Plus size={18} aria-hidden />
              Add Investor Class
            </Link>
          </div>
        </div>

        <DataTable
          visualVariant="members"
          membersTableClassName="um_table_members deal_inv_table"
          columns={columns}
          rows={loading ? [] : filteredRows}
          getRowKey={(row) => row.id}
          emptyLabel={emptyLabel}
          initialSort={{ columnId: "name", direction: "asc" }}
        />
      </div>

      <InvestorClassConfirmDeleteModal
        open={deleteTarget != null}
        classLabel={
          deleteTarget?.name.trim() || "this investor class"
        }
        busy={deleteBusy}
        onCancel={() => {
          if (deleteBusy) return
          setDeleteTarget(null)
        }}
        onConfirm={() => void confirmDeleteInvestorClass()}
      />

      <InvestorClassMessageModal
        open={noticeMessage != null}
        title="Could not delete"
        onClose={() => setNoticeMessage(null)}
      >
        <p className="deal_ic_dialog_message" role="alert">
          {noticeMessage}
        </p>
      </InvestorClassMessageModal>
    </div>
  )
}

export { rowToForm as investorClassRowToFormValues }
