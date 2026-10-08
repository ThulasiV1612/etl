import type { InvestmentSignStatus } from "@/modules/Investing/api/investmentSignatureApi"

const SIGN_STATUS_STEPS: Array<{
  key: InvestmentSignStatus
  label: string
}> = [
  { key: "Sent", label: "Sent" },
  { key: "Viewed", label: "Viewed" },
  { key: "Signed", label: "Signed" },
  { key: "Completed", label: "Completed" },
]

const STATUS_RANK: Record<InvestmentSignStatus, number> = {
  Sent: 1,
  Viewed: 2,
  Signed: 3,
  Completed: 4,
}

export interface InvestNowSignStatusBadgesProps {
  status: InvestmentSignStatus | null
  loading?: boolean
}

export function InvestNowSignStatusBadges({
  status,
  loading,
}: InvestNowSignStatusBadgesProps) {
  const current = status ?? "Sent"
  const currentRank = STATUS_RANK[current]

  return (
    <div
      className="invest_now_sign_status_badges"
      role="list"
      aria-label="E-sign progress"
    >
      {SIGN_STATUS_STEPS.map((step) => {
        const done = currentRank >= STATUS_RANK[step.key]
        const active = current === step.key
        return (
          <span
            key={step.key}
            role="listitem"
            className={[
              "invest_now_sign_status_badge",
              done ? "invest_now_sign_status_badge--done" : "",
              active ? "invest_now_sign_status_badge--active" : "",
              loading ? "invest_now_sign_status_badge--loading" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {step.label}
          </span>
        )
      })}
    </div>
  )
}
