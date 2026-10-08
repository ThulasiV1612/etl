import {
  Briefcase,
  ClipboardList,
  DollarSign,
  LineChart,
  Plus,
  UserRound,
  Users,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ToolStyleCard } from "../../../common/components/tool-style-card/ToolStyleCard"
import { cardCompactAmountOrDash } from "../../../common/components/card-compact-amount/CardCompactAmount"
import { usePortalMode } from "@/modules/Investing/context/PortalModeContext"
import { InvestingDashboardPage } from "@/modules/Investing/pages/dashboard"
import { SyndicatingDealsSection } from "../Deals/SyndicatingDealsSection"
import {
  loadSyndicationDashboardSummary,
  type SyndicationDashboardSummary,
} from "./syndicationDashboardData"
import "../usermanagement/user_management.css"
import "./sponsor-dashboard.css"

function SyndicatingDashboard() {
  const [summary, setSummary] = useState<SyndicationDashboardSummary | null>(
    null,
  )
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const s = await loadSyndicationDashboardSummary()
        if (!cancelled) setSummary(s)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="um_page sponsor_dash sponsor_dash_syndicating">
      <header className="sponsor_dash_hero">
        <div className="sponsor_dash_hero_copy">
          <p className="sponsor_dash_hero_eyebrow">Portfolio Overview</p>
          <h1 className="sponsor_dash_hero_title">Syndicating dashboard</h1>
        </div>
        <div className="sponsor_dash_hero_actions">
          <Link
            className="um_btn_primary sponsor_dash_add_link"
            to="/deals/create"
          >
            <Plus size={18} aria-hidden />
            Add deal
          </Link>
        </div>
      </header>

      <section
        className="sponsor_dash_metrics"
        aria-label="Dashboard summary"
        aria-busy={loading}
      >
        <ToolStyleCard
          variant="metric"
          icon={LineChart}
          title="Total target amount"
          loading={loading}
          description={cardCompactAmountOrDash(summary?.totalTargetDisplay)}
        />
        <ToolStyleCard
          variant="metric"
          icon={DollarSign}
          title="Total distributions"
          loading={loading}
          description={cardCompactAmountOrDash(summary?.totalDistributionsDisplay)}
        />
        <ToolStyleCard
          variant="metric"
          icon={UserRound}
          title="# of investors"
          loading={loading}
          description={
            summary != null ? String(summary.totalInvestorRows) : "—"
          }
          hintTitle="Sum of investors on each deal (same as the row count on the deal Investors tab), added across all your deals."
        />
        <ToolStyleCard
          variant="metric"
          icon={Users}
          title="# of contacts"
          loading={loading}
          description={
            summary != null ? String(summary.contactsCount) : "—"
          }
          hintTitle="Same list as the Contacts page for your account."
        />
        <ToolStyleCard
          variant="metric"
          icon={ClipboardList}
          title="# of reviews"
          loading={loading}
          description="—"
        />
      </section>

      <section
        className="investing_dash_deals_section"
        aria-labelledby="sponsor-deals-heading"
      >
        <header className="investing_dash_deals_header">
          <h2
            id="sponsor-deals-heading"
            className="sponsor_dash_section_title investing_dash_deals_title"
          >
            <Briefcase
              className="investing_dash_deals_title_icon"
              size={22}
              strokeWidth={1.75}
              aria-hidden
            />
            All Deals
          </h2>
        </header>

        <div className="sponsor_dash_deals_block um_panel deals_list_card_surface deal_inv_table_panel">
          <SyndicatingDealsSection
            hideDealsHeading
            dealsHeadingId="sponsor-deals-heading"
            searchPlaceholder="Search deals…"
          />
        </div>
      </section>
    </section>
  )
}

function SponsorDashboardPage() {
  const { mode } = usePortalMode()

  if (mode === "investing") return <InvestingDashboardPage />

  return <SyndicatingDashboard />
}

export default SponsorDashboardPage
