import {
  Briefcase,
  DollarSign,
  LineChart,
  PiggyBank,
} from "lucide-react"
import { useEffect, useState } from "react"
import { ToolStyleCard } from "@/common/components/tool-style-card/ToolStyleCard"
import { cardCompactAmountOrDash } from "@/common/components/card-compact-amount/CardCompactAmount"
import { InvestingDashboardDealsSection } from "./InvestingDashboardDealsSection"
import "@/modules/Syndication/usermanagement/user_management.css"
import "@/modules/Syndication/Deals/deals-list.css"
import "@/modules/Syndication/Dashboard/sponsor-dashboard.css"
import {
  loadInvestingDashboardMetrics,
  type InvestingDashboardMetrics,
} from "./investingDashboardMetrics"

export function InvestingDashboardPage() {
  const [metrics, setMetrics] = useState<InvestingDashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const m = await loadInvestingDashboardMetrics()
        if (!cancelled) setMetrics(m)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="um_page sponsor_dash sponsor_dash_investing">
      <header className="sponsor_dash_hero">
        <div className="sponsor_dash_hero_copy">
          <p className="sponsor_dash_hero_eyebrow">Portfolio Overview</p>
          <h1 className="sponsor_dash_hero_title">Investor dashboard</h1>
        </div>
        {/* <div className="sponsor_dash_hero_actions">
          <NavLink
            className="um_btn_primary sponsor_dash_add_link"
            to="/investing/investments"
          >
            All deals
          </NavLink>
        </div> */}
      </header>

      {/* <section
        className="investing_dash_panel"
        aria-label="Investing workspace shortcuts"
      >
        <p className="investing_dash_lead">
          Metrics reflect active (non-archived) deals in your investing scope —
          organization deals plus deals where you are on the roster.
        </p>
        <div className="investing_dash_links">
          <NavLink className="investing_dash_link" to="/investing/investments">
            Deals table
          </NavLink>
          <NavLink className="investing_dash_link" to="/investing/opportunities">
            Opportunities
          </NavLink>
        </div>
      </section> */}

      <section
        className="sponsor_dash_metrics"
        aria-label="Investing summary"
        aria-busy={loading}
      >
        <ToolStyleCard
          variant="metric"
          icon={PiggyBank}
          title="Total invested"
          loading={loading}
          description={cardCompactAmountOrDash(metrics?.totalInvestedDisplay)}
          hintTitle="Sum of your committed amounts on each active deal you are invested in."
        />
        <ToolStyleCard
          variant="metric"
          icon={DollarSign}
          title="Total distributed"
          loading={loading}
          description={cardCompactAmountOrDash(metrics?.totalDistributedDisplay)}
          hintTitle="Sum of distribution payments credited to you across deals you can access."
        />
        <ToolStyleCard
          variant="metric"
          icon={Briefcase}
          title="# of deals"
          loading={loading}
          description={metrics != null ? String(metrics.dealCount) : "—"}
          hintTitle="Active deals where you have a positive committed amount."
        />
        <ToolStyleCard
          variant="metric"
          icon={LineChart}
          title="Total in-progress"
          loading={loading}
          description={cardCompactAmountOrDash(metrics?.totalInProgressDisplay)}
          hintTitle="Calculated as the sum of active investments that have not been countersigned."
        />
      </section>

      <InvestingDashboardDealsSection />
    </section>
  )
}
