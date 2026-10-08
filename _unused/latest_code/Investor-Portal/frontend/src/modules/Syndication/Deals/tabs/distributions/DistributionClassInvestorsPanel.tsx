import { Landmark, Loader2, Search } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  DataTable,
  type DataTableColumn,
} from "../../../../../common/components/data-table/DataTable"
import { TableCompactAmountCell } from "../../../../../common/components/card-compact-amount/CardCompactAmount"
import { FormTooltip } from "../../../../../common/components/form-tooltip/FormTooltip"
import { toast } from "../../../../../common/components/Toast"
import {
  displayEmail,
  isDisplayableEmail,
} from "../../../../../common/utils/displayEmail"
import {
  executeDistributionAchPayouts,
  fetchDistributionPayouts,
  type DistributionPayout,
} from "@/modules/Investing/api/stripeInvestorPaymentsApi"
import { patchDistributionInvestorPercent } from "../../distribution-setup/api/distributionSetupApi"
import type { DistributionSetupBundle } from "../../distribution-setup/types/distribution-setup.types"
import {
  formatCurrencyUsdTypeInput,
  formatPercentTypeInputBare,
  moneyAmountOnBlur,
  parseMoneyDigits,
  sanitizePercentTypingInput,
} from "../../utils/offeringMoneyFormat"
import { AchPayoutConfirmModal } from "./AchPayoutConfirmModal"
import type { DistributionClassInvestorRow } from "./utils/distributionListDisplay"
import "./distribution-details.css"

type DistributionClassInvestorsPanelProps = {
  classLabel: string
  rows: DistributionClassInvestorRow[]
  dealId: string
  distributionId: string
  fundingReady: boolean
  payouts: DistributionPayout[]
  onPayoutsChange: (payouts: DistributionPayout[]) => void
  onSaved: (
    saved: DistributionSetupBundle,
    investorId: string,
    nextPct?: number,
    nextDealPct?: number,
  ) => void
  onReload: () => void
}

function ColumnHeader({
  label,
  hint,
}: {
  label: string
  hint: string
}) {
  return (
    <span className="deals_table_col_header">
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
          panelAlign="start"
          nativeButtonTrigger={false}
        />
      </span>
    </span>
  )
}

function blurFormatPercentClamped(raw: string): string {
  const t = sanitizePercentTypingInput(raw)
  if (!t) return ""
  const n = parseFloat(t)
  if (!Number.isFinite(n)) return ""
  return Math.max(0, Math.min(100, n)).toFixed(2)
}

function achStatusSlug(status: string): string {
  const raw = status.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
  return raw || "not-sent"
}

function achStatusLabel(status: string): string {
  const slug = achStatusSlug(status)
  const labels: Record<string, string> = {
    "not-sent": "Not sent",
    pending: "Pending",
    processing: "Processing",
    paid: "Paid",
    transferred: "Transferred",
    failed: "Failed",
    canceled: "Canceled",
    cancelled: "Canceled",
    reversed: "Reversed",
  }
  if (labels[slug]) return labels[slug]
  return status
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function achStatusTone(status: string): string {
  const slug = achStatusSlug(status)
  if (slug === "paid" || slug === "transferred") return "success"
  if (slug === "processing" || slug === "pending") return "info"
  if (
    slug === "failed" ||
    slug === "canceled" ||
    slug === "cancelled" ||
    slug === "reversed"
  ) {
    return "danger"
  }
  return "neutral"
}

/**
 * Per-investor totals for one class on one completed distribution run.
 * Percent of class and payment are editable; ACH can be sent per investor.
 */
export function DistributionClassInvestorsPanel({
  classLabel,
  rows,
  dealId,
  distributionId,
  fundingReady,
  payouts,
  onPayoutsChange,
  onSaved,
  onReload,
}: DistributionClassInvestorsPanelProps) {
  const [query, setQuery] = useState("")
  const [pctDrafts, setPctDrafts] = useState<Record<string, string>>({})
  const [dealPctDrafts, setDealPctDrafts] = useState<Record<string, string>>(
    {},
  )
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, string>>(
    {},
  )
  const [savingInvestorId, setSavingInvestorId] = useState<string | null>(null)
  const [sendingInvestorId, setSendingInvestorId] = useState<string | null>(
    null,
  )
  const [achConfirm, setAchConfirm] = useState<{
    row: DistributionClassInvestorRow
    amountLabel: string
  } | null>(null)

  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const rowsKey = useMemo(
    () =>
      rows
        .map(
          (row) =>
            `${row.id}:${row.percentOfClass}:${row.percentOfDeal}:${row.payment}:${row.required}`,
        )
        .join("|"),
    [rows],
  )

  useEffect(() => {
    const pctNext: Record<string, string> = {}
    const dealPctNext: Record<string, string> = {}
    const payNext: Record<string, string> = {}
    for (const row of rowsRef.current) {
      pctNext[row.id] = Number.isFinite(row.percentOfClass)
        ? `${(Math.round(row.percentOfClass * 100) / 100).toFixed(2)}`
        : ""
      dealPctNext[row.id] = Number.isFinite(row.percentOfDeal)
        ? `${(Math.round(row.percentOfDeal * 100) / 100).toFixed(2)}`
        : ""
      payNext[row.id] = Number.isFinite(row.payment)
        ? moneyAmountOnBlur(String(Math.round(row.payment * 100) / 100))
        : ""
    }
    setPctDrafts(pctNext)
    setDealPctDrafts(dealPctNext)
    setPaymentDrafts(payNext)
  }, [rowsKey])

  const payoutByInvestmentId = useMemo(
    () => new Map(payouts.map((p) => [p.investmentId, p])),
    [payouts],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      [
        row.name,
        row.email,
        String(row.capital),
        String(row.percentOfClass),
        String(row.percentOfDeal),
        String(row.payment),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    )
  }, [rows, query])

  const canSendInvestorPayout = useCallback(
    (investorId: string, payment: number) => {
      if (!(payment > 0)) return false
      const payout = payoutByInvestmentId.get(investorId)
      if (!payout) return true
      const status = payout.status.trim().toLowerCase()
      return (
        status === "failed" ||
        status === "canceled" ||
        status === "reversed" ||
        status === "pending"
      )
    },
    [payoutByInvestmentId],
  )

  const isInvestorPayoutLocked = useCallback(
    (investorId: string) => {
      const payout = payoutByInvestmentId.get(investorId)
      if (!payout) return false
      const status = payout.status.trim().toLowerCase()
      return (
        status === "processing" ||
        status === "paid" ||
        status === "transferred"
      )
    },
    [payoutByInvestmentId],
  )

  const persistShare = useCallback(
    async (
      investorId: string,
      payload: {
        percentOfClass?: number
        percentOfDeal?: number
        payment?: number
      },
    ) => {
      if (!dealId || !distributionId) return
      setSavingInvestorId(investorId)
      try {
        const saved = await patchDistributionInvestorPercent(
          dealId,
          distributionId,
          { investorId, ...payload },
        )
        onSaved(
          saved,
          investorId,
          payload.percentOfClass,
          payload.percentOfDeal,
        )
        toast.success(
          "Saved",
          payload.percentOfDeal != null &&
            payload.payment == null &&
            payload.percentOfClass == null
            ? "Percent of deal saved as entered. Change is logged."
            : payload.payment != null &&
                payload.percentOfClass == null &&
                payload.percentOfDeal == null
              ? "Payment saved as entered. Change is logged."
              : payload.percentOfClass != null &&
                  payload.payment == null &&
                  payload.percentOfDeal == null
                ? "Percent of class saved as entered. Change is logged."
                : "Distribution share saved. Change is logged.",
        )
      } catch (err) {
        toast.error(
          "Could not save",
          err instanceof Error ? err.message : "Try again.",
        )
        onReload()
      } finally {
        setSavingInvestorId(null)
      }
    },
    [dealId, distributionId, onSaved, onReload],
  )

  const savePercent = useCallback(
    async (investorId: string, raw: string) => {
      const t = sanitizePercentTypingInput(raw)
      const n = t ? parseFloat(t) : NaN
      if (!Number.isFinite(n)) {
        toast.error("Invalid percent", "Enter a number between 0 and 100.")
        return
      }
      const nextPct = Math.max(0, Math.min(100, n))
      setPctDrafts((prev) => ({
        ...prev,
        [investorId]: `${(Math.round(nextPct * 100) / 100).toFixed(2)}`,
      }))
      await persistShare(investorId, { percentOfClass: nextPct })
    },
    [persistShare],
  )

  const saveDealPercent = useCallback(
    async (investorId: string, raw: string) => {
      const t = sanitizePercentTypingInput(raw)
      const n = t ? parseFloat(t) : NaN
      if (!Number.isFinite(n)) {
        toast.error("Invalid percent", "Enter a number between 0 and 100.")
        return
      }
      const nextPct = Math.max(0, Math.min(100, n))
      setDealPctDrafts((prev) => ({
        ...prev,
        [investorId]: `${(Math.round(nextPct * 100) / 100).toFixed(2)}`,
      }))
      await persistShare(investorId, { percentOfDeal: nextPct })
    },
    [persistShare],
  )

  const savePayment = useCallback(
    async (investorId: string, raw: string) => {
      const amount = parseMoneyDigits(raw)
      if (!Number.isFinite(amount) || amount < 0) {
        toast.error("Invalid payment", "Enter a valid dollar amount.")
        return
      }
      setPaymentDrafts((prev) => ({
        ...prev,
        [investorId]: moneyAmountOnBlur(
          String(Math.round(amount * 100) / 100),
        ),
      }))
      await persistShare(investorId, { payment: amount })
    },
    [persistShare],
  )

  const requestSendInvestorAchPayout = useCallback(
    (row: DistributionClassInvestorRow) => {
      if (
        !dealId ||
        !distributionId ||
        sendingInvestorId ||
        !canSendInvestorPayout(row.id, row.payment)
      ) {
        return
      }
      const amountLabel = row.payment.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      setAchConfirm({ row, amountLabel })
    },
    [dealId, distributionId, sendingInvestorId, canSendInvestorPayout],
  )

  const sendInvestorAchPayout = useCallback(
    async (row: DistributionClassInvestorRow, amountLabel: string) => {
      if (
        !dealId ||
        !distributionId ||
        sendingInvestorId ||
        !canSendInvestorPayout(row.id, row.payment)
      ) {
        return
      }
      setSendingInvestorId(row.id)
      try {
        const result = await executeDistributionAchPayouts(
          dealId,
          distributionId,
          { investmentId: row.id },
        )
        const refreshed = await fetchDistributionPayouts(
          dealId,
          distributionId,
        )
        onPayoutsChange(refreshed)
        setAchConfirm(null)
        const lineResult = result.results[0]
        if (result.failed > 0 || lineResult?.status === "failed") {
          toast.error(
            "Payment failed",
            lineResult?.message || "Could not send this investor payout.",
          )
        } else if (result.skipped > 0 || lineResult?.status === "skipped") {
          toast.error(
            "Cannot send payment",
            lineResult?.message ||
              "This investor must add a bank account first (Investing → Profiles → Bank accounts).",
          )
        } else {
          toast.success(
            "ACH payment submitted",
            `$${amountLabel} is processing for ${row.name}.`,
          )
        }
      } catch (err) {
        toast.error(
          "Could not send payment",
          err instanceof Error ? err.message : "Please try again.",
        )
      } finally {
        setSendingInvestorId(null)
      }
    },
    [
      dealId,
      distributionId,
      sendingInvestorId,
      canSendInvestorPayout,
      onPayoutsChange,
    ],
  )

  const columns: DataTableColumn<DistributionClassInvestorRow>[] = useMemo(
    () => [
      {
        id: "investor",
        header: (
          <ColumnHeader
            label="Investor"
            hint="Investor in this class on this distribution."
          />
        ),
        colWidth: "14rem",
        thClassName: "deal_dist_th_investor",
        tdClassName: "deal_dist_td_investor",
        sortValue: (row) => `${row.name} ${row.email}`.toLowerCase(),
        cell: (row) => {
          const emailShown = displayEmail(row.email)
          return (
            <div className="deal_dist_class_investor_cell">
              <span className="deal_dist_class_investor_name">
                {row.name || "—"}
              </span>
              <span
                className={`deal_dist_class_investor_email${
                  isDisplayableEmail(row.email) ? "" : " um_status_muted"
                }`}
                title={emailShown}
              >
                {emailShown}
              </span>
            </div>
          )
        },
      },
      {
        id: "capital",
        header: (
          <ColumnHeader
            label="Capital"
            hint="Invested capital used to allocate this investor’s share."
          />
        ),
        align: "right",
        thClassName: "deals_th_align_right",
        sortValue: (row) => row.capital,
        cell: (row) => <TableCompactAmountCell amount={row.capital} />,
      },
      {
        id: "pct",
        header: (
          <ColumnHeader
            label="% of class"
            hint="This investor’s share of the class. Edits are saved as entered and do not auto-change Payment."
          />
        ),
        align: "right",
        colWidth: "7.25rem",
        thClassName: "deals_th_align_right deal_dist_th_pct",
        tdClassName: "um_td_numeric deals_td_align_right deal_dist_td_pct",
        sortValue: (row) => row.percentOfClass,
        cell: (row) => (
          <div className="deal_dist_pct_input_wrap">
            <input
              type="text"
              className="deal_dist_details_pct_input"
              inputMode="decimal"
              aria-label={`Percent of class (distributions) for ${row.name}`}
              value={pctDrafts[row.id] ?? ""}
              disabled={
                savingInvestorId === row.id || isInvestorPayoutLocked(row.id)
              }
              placeholder="0.00"
              onChange={(e) => {
                const next = formatPercentTypeInputBare(e.target.value, 100)
                setPctDrafts((prev) => ({
                  ...prev,
                  [row.id]: next,
                }))
              }}
              onBlur={(e) => {
                const formatted = blurFormatPercentClamped(e.target.value)
                setPctDrafts((prev) => ({
                  ...prev,
                  [row.id]: formatted,
                }))
                const nextN = formatted
                  ? parseFloat(sanitizePercentTypingInput(formatted))
                  : NaN
                if (
                  !Number.isFinite(nextN) ||
                  Math.abs(nextN - row.percentOfClass) < 0.0005
                ) {
                  return
                }
                void savePercent(row.id, formatted)
              }}
            />
            <span className="deal_dist_pct_suffix" aria-hidden>
              %
            </span>
          </div>
        ),
      },
      {
        id: "pctDeal",
        header: (
          <ColumnHeader
            label="% of deal"
            hint="This investor’s share of the whole deal. Edits are saved as entered and do not auto-change Payment or % of class."
          />
        ),
        align: "right",
        colWidth: "7.25rem",
        thClassName: "deals_th_align_right deal_dist_th_pct",
        tdClassName: "um_td_numeric deals_td_align_right deal_dist_td_pct",
        sortValue: (row) => row.percentOfDeal,
        cell: (row) => (
          <div className="deal_dist_pct_input_wrap">
            <input
              type="text"
              className="deal_dist_details_pct_input"
              inputMode="decimal"
              aria-label={`Percent of deal for ${row.name}`}
              value={dealPctDrafts[row.id] ?? ""}
              disabled={
                savingInvestorId === row.id || isInvestorPayoutLocked(row.id)
              }
              placeholder="0.00"
              onChange={(e) => {
                const next = formatPercentTypeInputBare(e.target.value, 100)
                setDealPctDrafts((prev) => ({
                  ...prev,
                  [row.id]: next,
                }))
              }}
              onBlur={(e) => {
                const formatted = blurFormatPercentClamped(e.target.value)
                setDealPctDrafts((prev) => ({
                  ...prev,
                  [row.id]: formatted,
                }))
                const nextN = formatted
                  ? parseFloat(sanitizePercentTypingInput(formatted))
                  : NaN
                if (
                  !Number.isFinite(nextN) ||
                  Math.abs(nextN - row.percentOfDeal) < 0.0005
                ) {
                  return
                }
                void saveDealPercent(row.id, formatted)
              }}
            />
            <span className="deal_dist_pct_suffix" aria-hidden>
              %
            </span>
          </div>
        ),
      },
      {
        id: "required",
        header: (
          <ColumnHeader
            label="Accumulated Pref"
            hint="Preferred due for this investor in the distribution period."
          />
        ),
        align: "right",
        thClassName: "deals_th_align_right",
        sortValue: (row) => row.required,
        cell: (row) => <TableCompactAmountCell amount={row.required} />,
      },
      {
        id: "payment",
        header: (
          <ColumnHeader
            label="Payment"
            hint="Cash paid to this investor in this distribution. Edits are saved as entered and do not auto-change percent of class."
          />
        ),
        align: "right",
        colWidth: "9.5rem",
        thClassName: "deals_th_align_right deal_dist_th_payment",
        tdClassName: "um_td_numeric deals_td_align_right deal_dist_td_payment",
        sortValue: (row) => row.payment,
        cell: (row) => (
          <input
            type="text"
            className="deal_dist_details_pct_input deal_dist_details_pay_input"
            inputMode="decimal"
            aria-label={`Payment for ${row.name}`}
            value={paymentDrafts[row.id] ?? ""}
            disabled={
              savingInvestorId === row.id || isInvestorPayoutLocked(row.id)
            }
            placeholder="$0.00"
            onChange={(e) => {
              setPaymentDrafts((prev) => ({
                ...prev,
                [row.id]: formatCurrencyUsdTypeInput(e.target.value),
              }))
            }}
            onBlur={(e) => {
              const formatted = moneyAmountOnBlur(e.target.value)
              setPaymentDrafts((prev) => ({
                ...prev,
                [row.id]: formatted,
              }))
              const nextN = parseMoneyDigits(formatted)
              if (
                !Number.isFinite(nextN) ||
                Math.abs(nextN - row.payment) < 0.005
              ) {
                return
              }
              void savePayment(row.id, formatted)
            }}
          />
        ),
      },
      {
        id: "unpaid",
        header: (
          <ColumnHeader
            label="Unpaid"
            hint="Accumulated Pref minus payment for this investor on this run."
          />
        ),
        align: "right",
        thClassName: "deals_th_align_right",
        sortValue: (row) => row.unpaid,
        cell: (row) => <TableCompactAmountCell amount={row.unpaid} />,
      },
      {
        id: "payoutStatus",
        header: (
          <span className="deal_dist_th_stack_label">
            <span>ACH</span>
            <span>status</span>
          </span>
        ),
        align: "center",
        colWidth: "8.5rem",
        thClassName: "deal_dist_th_ach deals_th_align_center",
        tdClassName: "deal_dist_td_ach",
        sortValue: (row) =>
          payoutByInvestmentId.get(row.id)?.status ?? "not sent",
        cell: (row) => {
          const payout = payoutByInvestmentId.get(row.id)
          const status = payout?.status ?? "not sent"
          const slug = achStatusSlug(status)
          const tone = achStatusTone(status)
          return (
            <span
              className={`deal_dist_ach_badge deal_dist_ach_badge--${tone} is-${slug}`}
              title={payout?.failureMessage ?? undefined}
            >
              {achStatusLabel(status)}
            </span>
          )
        },
      },
      {
        id: "actions",
        header: "Actions",
        align: "center",
        colWidth: "12rem",
        thClassName: "deal_dist_th_actions deals_th_align_center",
        tdClassName: "deal_dist_td_actions",
        cell: (row) => {
          const sending = sendingInvestorId === row.id
          const canSend = canSendInvestorPayout(row.id, row.payment)
          const payout = payoutByInvestmentId.get(row.id)
          const label =
            payout &&
            ["failed", "canceled", "reversed"].includes(
              payout.status.trim().toLowerCase(),
            )
              ? "Retry payment"
              : "Send payment"
          return (
            <button
              type="button"
              className="um_btn_secondary deal_dist_details_send_btn"
              disabled={
                !canSend ||
                !fundingReady ||
                sendingInvestorId != null ||
                savingInvestorId === row.id
              }
              title={
                !fundingReady
                  ? "Lead sponsor must add this deal's bank account on Distributions → Bank account first"
                  : canSend
                    ? `Send ACH payment to ${row.name}`
                    : payout
                      ? `ACH already ${payout.status}`
                      : "Payment amount must be greater than zero"
              }
              aria-label={`${label} for ${row.name}`}
              onClick={() => requestSendInvestorAchPayout(row)}
            >
              {sending ? (
                <Loader2
                  size={14}
                  className="deals_create_loading_icon"
                  aria-hidden
                />
              ) : (
                <Landmark size={14} aria-hidden />
              )}
              {sending ? "Sending…" : label}
            </button>
          )
        },
      },
    ],
    [
      pctDrafts,
      dealPctDrafts,
      paymentDrafts,
      savingInvestorId,
      sendingInvestorId,
      fundingReady,
      payoutByInvestmentId,
      canSendInvestorPayout,
      isInvestorPayoutLocked,
      requestSendInvestorAchPayout,
      savePercent,
      saveDealPercent,
      savePayment,
    ],
  )

  const label = classLabel.trim() || "class"

  return (
    <div
      className="deal_dist_class_investors_panel"
      role="region"
      aria-label={`Investors in ${label}`}
    >
      <div className="deal_dist_classes_panel_head">
        <h4 className="deal_dist_classes_panel_title">{label} investors</h4>
        <FormTooltip
          label="More information: Class investors"
          content={
            <p className="deals_table_header_tooltip_p">
              Edit percent of class or payment, then send ACH to investors in{" "}
              {label}.
            </p>
          }
          panelAlign="start"
          nativeButtonTrigger={false}
        />
      </div>
      <div
        className="um_toolbar um_toolbar_export_then_search deal_offering_section_toolbar deal_dist_classes_toolbar"
        role="toolbar"
        aria-label={`${label} investors`}
      >
        <div className="um_search_wrap">
          <Search className="um_search_icon" size={18} aria-hidden />
          <input
            type="search"
            className="um_search_input"
            placeholder="Search investors…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={`Search investors in ${label}`}
            autoComplete="off"
          />
        </div>
      </div>
      <DataTable
        visualVariant="members"
        membersTableClassName="um_table_members deal_inv_table deal_dist_table"
        columns={columns}
        rows={filtered}
        getRowKey={(row) => row.id}
        emptyLabel={
          query.trim()
            ? "No investors match your search."
            : "No investors in this class for this distribution."
        }
        initialSort={{ columnId: "payment", direction: "desc" }}
        stickyFirstColumn={false}
        forceHorizontalScroll
      />
      <AchPayoutConfirmModal
        open={achConfirm != null}
        title="Send ACH payment?"
        summaryRows={
          achConfirm
            ? [
                {
                  label: "Investor",
                  value: achConfirm.row.name.trim() || "—",
                },
                {
                  label: "Amount",
                  value: `$${achConfirm.amountLabel}`,
                },
              ]
            : undefined
        }
        message={
          achConfirm
            ? `Send an ACH payment of $${achConfirm.amountLabel} to ${achConfirm.row.name.trim() || "this investor"} from the deal bank account.`
            : ""
        }
        confirmLabel="Send ACH payment"
        busy={sendingInvestorId != null}
        onCancel={() => {
          if (sendingInvestorId != null) return
          setAchConfirm(null)
        }}
        onConfirm={() => {
          if (!achConfirm) return
          void sendInvestorAchPayout(achConfirm.row, achConfirm.amountLabel)
        }}
      />
    </div>
  )
}
