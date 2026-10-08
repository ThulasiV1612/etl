import {
  Activity,
  BarChart3,
  Briefcase,
  Building2,
  ContactRound,
  DollarSign,
  LayoutDashboard,
  PieChart,
  TrendingUp,
  Users,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { DonutChart, type DonutSegment } from "./components/DonutChart"
import { MetricKpiCard } from "./components/MetricKpiCard"
import { FundPerformanceChart } from "./components/FundPerformanceChart"
import { ProgressRing } from "./components/ProgressRing"
import { UserActivityTable } from "./components/UserActivityTable"
import {
  fetchPlatformMetrics,
  fetchPlatformUserActivity,
  formatPlatformUsd,
  formatRoleLabel,
  type PlatformMetrics,
  type UserActivityRow,
} from "./platformMetricsApi"
import "../usermanagement/user_management.css"
import "./platform-metrics.css"

const ROLE_CHART_COLORS = [
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#f97316",
  "#8b5cf6",
  "#64748b",
  "#ec4899",
]

function pct(part: number, total: number): string {
  if (total <= 0) return "0%"
  return `${Math.round((part / total) * 100)}%`
}

function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(n)
}

export default function PlatformMetricsPage() {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userActivity, setUserActivity] = useState<UserActivityRow[]>([])
  const [activityLoading, setActivityLoading] = useState(true)
  const [activityError, setActivityError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [metricsResult, activityResult] = await Promise.all([
        fetchPlatformMetrics(),
        fetchPlatformUserActivity(),
      ])
      if (cancelled) return
      if (metricsResult.ok) {
        setMetrics(metricsResult.metrics)
        setError(null)
      } else {
        setMetrics(null)
        setError(metricsResult.message)
      }
      if (activityResult.ok) {
        setUserActivity(activityResult.userActivity)
        setActivityError(null)
      } else {
        setUserActivity([])
        setActivityError(activityResult.message)
      }
      setLoading(false)
      setActivityLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const roleSegments = useMemo((): DonutSegment[] => {
    if (!metrics) return []
    return metrics.usersByRole.map((row, i) => ({
      id: row.role,
      label: formatRoleLabel(row.role),
      value: row.count,
      color: ROLE_CHART_COLORS[i % ROLE_CHART_COLORS.length] ?? "#64748b",
    }))
  }, [metrics])

  const activeCompanyPct =
    metrics && metrics.companyCount > 0
      ? (metrics.activeCompanyCount / metrics.companyCount) * 100
      : 0

  const totalUsersByRole =
    metrics?.usersByRole.reduce((s, r) => s + r.count, 0) ?? 0

  return (
    <section className="um_page platform_metrics_page">
      <header className="um_members_header_block">
        <div className="um_header_row">
          <h2 className="um_title um_title_with_icon">
            <BarChart3
              className="um_title_icon"
              size={26}
              strokeWidth={1.75}
              aria-hidden
            />
            Platform Metrics
          </h2>
          <div className="pm_header_actions">
            <Link
              className="um_btn_secondary sponsor_dash_add_link"
              to="/customers"
            >
              <Building2 size={18} aria-hidden />
              Customers
            </Link>
            <Link
              className="um_btn_primary sponsor_dash_add_link"
              to="/dashboard"
            >
              <LayoutDashboard size={18} aria-hidden />
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      {error ? (
        <p className="pm_empty_state" role="alert">
          {error}
        </p>
      ) : null}

      <section className="pm_section" aria-label="Platform metrics">
        <h2 className="pm_section_title">Platform metrics</h2>
        <div className="pm_kpi_grid">
          <MetricKpiCard
            label="Customer companies"
            value={formatCount(metrics?.companyCount ?? 0)}
            icon={Building2}
            tone="blue"
            sparkSeed={11}
            loading={loading}
            footer={`${formatCount(metrics?.activeCompanyCount ?? 0)} active`}
            subfooter={
              metrics
                ? `${formatCount(metrics.suspendedCompanyCount)} suspended`
                : undefined
            }
          />
          <MetricKpiCard
            label="Platform users"
            value={formatCount(metrics?.userCount ?? 0)}
            icon={Users}
            tone="green"
            sparkSeed={23}
            loading={loading}
            footer={
              metrics
                ? `${formatCount(metrics.userCount)} registered · ${metrics.usersByRole.length} roles`
                : "All organizations"
            }
          />
          <MetricKpiCard
            label="Deals"
            value={formatCount(metrics?.dealCount ?? 0)}
            icon={Briefcase}
            tone="violet"
            sparkSeed={37}
            loading={loading}
            footer="Across platform"
          />
          <MetricKpiCard
            label="Contacts"
            value={formatCount(metrics?.contactCount ?? 0)}
            icon={ContactRound}
            tone="slate"
            sparkSeed={41}
            loading={loading}
            footer="CRM directory"
          />
          <MetricKpiCard
            label="Investments"
            value={formatCount(metrics?.investmentCount ?? 0)}
            icon={TrendingUp}
            tone="amber"
            sparkSeed={53}
            loading={loading}
            footer={
              metrics
                ? `${formatCount(metrics.lpInvestorCount)} LP investors`
                : undefined
            }
          />
          <MetricKpiCard
            label="Total committed"
            value={
              loading
                ? "—"
                : formatPlatformUsd(metrics?.totalCommittedUsd ?? 0)
            }
            icon={DollarSign}
            tone="rose"
            sparkSeed={67}
            loading={loading}
            footer={
              metrics
                ? `${formatCount(metrics.investorProfileCount)} profiles`
                : undefined
            }
          />
        </div>
      </section>

      <section className="pm_section" aria-label="Fund performance">
        <FundPerformanceChart />
      </section>

      {!loading && metrics ? (
        <section className="pm_section" aria-label="Platform breakdown">
          <h2 className="pm_section_title">Platform breakdown</h2>
          <BreakdownPanels
            metrics={metrics}
            roleSegments={roleSegments}
            activeCompanyPct={activeCompanyPct}
            totalUsersByRole={totalUsersByRole}
          />
        </section>
      ) : null}

      <section className="pm_section" aria-label="User activity">
        <h2 className="pm_section_title">User activity</h2>
        <UserActivityTable
          rows={userActivity}
          loading={activityLoading}
          error={activityError}
        />
      </section>
    </section>
  )
}

type BreakdownProps = {
  metrics: PlatformMetrics
  roleSegments: DonutSegment[]
  activeCompanyPct: number
  totalUsersByRole: number
}

function BreakdownPanels({
  metrics,
  roleSegments,
  activeCompanyPct,
  totalUsersByRole,
}: BreakdownProps) {
  return (
    <div className="pm_analysis_grid">
      <article className="pm_panel">
        <div className="pm_panel_head">
          <div className="pm_panel_title_row">
            <span className="pm_panel_icon pm_panel_icon_warn" aria-hidden>
              <PieChart size={18} />
            </span>
            <h3 className="pm_panel_title">Users by role</h3>
          </div>
          <span className="pm_panel_badge">
            Total: <strong>{formatCount(totalUsersByRole)}</strong>
          </span>
        </div>
        <DistributionTable
          segments={roleSegments}
          total={totalUsersByRole}
          centerLabel={formatCount(totalUsersByRole)}
          centerSub="users"
          note="Distribution of registered users by assigned role across all customer workspaces."
        />
      </article>

      <article className="pm_panel">
        <div className="pm_panel_head">
          <div className="pm_panel_title_row">
            <span className="pm_panel_icon pm_panel_icon_info" aria-hidden>
              <Activity size={18} />
            </span>
            <h3 className="pm_panel_title">Company health</h3>
          </div>
          <span className="pm_panel_badge">
            Active rate: <strong>{activeCompanyPct.toFixed(1)}%</strong>
          </span>
        </div>
        <div className="pm_composition_body">
          <ProgressRing
            percent={activeCompanyPct}
            label={`${activeCompanyPct.toFixed(1)}%`}
            sublabel="Active companies vs total in directory"
            color="#3b82f6"
            size={196}
          />
          <div className="pm_breakdown_list">
            <BreakdownRow
              label="Active companies"
              value={formatCount(metrics.activeCompanyCount)}
              tone="high"
            />
            <BreakdownRow
              label="Suspended"
              value={formatCount(metrics.suspendedCompanyCount)}
              tone="mid"
            />
            <BreakdownRow
              label="Total companies"
              value={formatCount(metrics.companyCount)}
            />
            <BreakdownRow
              label="Deals on platform"
              value={formatCount(metrics.dealCount)}
            />
            <BreakdownRow
              label="Investor profiles"
              value={formatCount(metrics.investorProfileCount)}
            />
          </div>
        </div>
      </article>
    </div>
  )
}

function DistributionTable({
  segments,
  total,
  centerLabel,
  centerSub,
  colStatus = "Role",
  note,
}: {
  segments: DonutSegment[]
  total: number
  centerLabel: string
  centerSub: string
  colStatus?: string
  note: string
}) {
  return (
    <>
      <div className="pm_distribution_body">
        <DonutChart
          segments={segments}
          centerLabel={centerLabel}
          centerSub={centerSub}
        />
        <div className="pm_dist_table">
          <div className="pm_dist_table_head">
            <span>{colStatus}</span>
            <span>Share</span>
            <span style={{ textAlign: "right" }}>Count</span>
          </div>
          {segments.map((seg) => (
            <div key={seg.id} className="pm_dist_row">
              <span className="pm_dist_label">
                <span
                  className="pm_dist_dot"
                  style={{ background: seg.color }}
                />
                {seg.label}
              </span>
              <span className="pm_dist_pct">{pct(seg.value, total)}</span>
              <span className="pm_dist_count">{formatCount(seg.value)}</span>
            </div>
          ))}
          <div className="pm_dist_total">
            <span>Total</span>
            <span>{formatCount(total)}</span>
          </div>
        </div>
      </div>
      <p className="pm_panel_note">{note}</p>
    </>
  )
}

function BreakdownRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "high" | "mid" | "low"
}) {
  const cls =
    tone === "high"
      ? "pm_breakdown_value pm_breakdown_value_high"
      : tone === "mid"
        ? "pm_breakdown_value pm_breakdown_value_mid"
        : tone === "low"
          ? "pm_breakdown_value pm_breakdown_value_low"
          : "pm_breakdown_value"
  return (
    <div className="pm_breakdown_row">
      <span className="pm_breakdown_label">{label}</span>
      <span className={cls}>{value}</span>
    </div>
  )
}
