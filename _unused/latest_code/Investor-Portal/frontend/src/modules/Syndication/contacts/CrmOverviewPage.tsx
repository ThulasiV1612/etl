import { useNavigate } from "react-router-dom"
import "../usermanagement/user_management.css"
import "./contacts.css"
import "./crm-overview.css"

const FUNNEL = [
  { stage: "Leads", count: "—", sub: "New contacts", color: "#4A4390" },
  { stage: "Prospects", count: "—", sub: "Engaged with a deal", color: "#2E5E7E" },
  { stage: "Soft Commits", count: "—", sub: "Indicated interest", color: "var(--portal-gold-accent, #C9A24B)" },
  { stage: "Investors", count: "—", sub: "Committed capital", color: "#3D6B2E" },
  { stage: "Nurture", count: "—", sub: "Long-term drip", color: "#5b6270" },
] as const

const ATTENTION = [
  {
    who: "Get started",
    what: "Import contacts or open All Contacts to manage your pipeline.",
    action: "All contacts",
    to: "/contacts",
    dot: "var(--portal-gold-accent, #C9A24B)",
  },
  {
    who: "Campaigns",
    what: "Create email campaigns and nurture drips from one place.",
    action: "Campaigns",
    to: "/contacts/campaigns",
    dot: "#3D6B2E",
  },
  {
    who: "Import",
    what: "Bring leads from spreadsheets, forms, or your CRM.",
    action: "Import",
    to: "/contacts/import",
    dot: "#2E5E7E",
  },
] as const

const SOURCES = [
  { name: "Web forms", pct: "42%", n: "—", color: "#4A4390" },
  { name: "Landing pages", pct: "28%", n: "—", color: "#2E5E7E" },
  { name: "Referrals", pct: "18%", n: "—", color: "var(--portal-gold-accent, #C9A24B)" },
  { name: "Ads", pct: "8%", n: "—", color: "#3D6B2E" },
  { name: "Manual", pct: "4%", n: "—", color: "#5b6270" },
] as const

export default function CrmOverviewPage() {
  const navigate = useNavigate()

  return (
    <section className="um_page contacts_page crm_overview_page">
      <header className="crm_overview_header">
        <div>
          <h1 className="crm_overview_title">Capital Raising</h1>
          <p className="crm_overview_subtitle">
            Everything your contacts do — marketing, conversations, meetings — in
            one place.
          </p>
        </div>
        <div className="crm_overview_header_actions">
          <button
            type="button"
            className="um_btn_secondary"
            onClick={() => navigate("/contacts/import")}
          >
            Import contacts
          </button>
          <button
            type="button"
            className="um_btn_primary"
            onClick={() => navigate("/contacts/campaigns")}
          >
            + New campaign
          </button>
        </div>
      </header>

      <div className="crm_overview_funnel">
        {FUNNEL.map((f) => (
          <div
            key={f.stage}
            className="crm_overview_funnel_card"
            style={{ borderTopColor: f.color }}
          >
            <div className="crm_overview_funnel_label">{f.stage}</div>
            <div className="crm_overview_funnel_count">{f.count}</div>
            <div className="crm_overview_funnel_sub">{f.sub}</div>
          </div>
        ))}
      </div>

      <div className="crm_overview_grid">
        <div className="crm_overview_panel">
          <h2 className="crm_overview_panel_title">Needs your attention</h2>
          <ul className="crm_overview_attention_list">
            {ATTENTION.map((a) => (
              <li key={a.to} className="crm_overview_attention_row">
                <span
                  className="crm_overview_attention_dot"
                  style={{ background: a.dot }}
                  aria-hidden
                />
                <div className="crm_overview_attention_text">
                  <strong>{a.who}</strong>{" "}
                  <span>{a.what}</span>
                </div>
                <button
                  type="button"
                  className="um_btn_secondary crm_overview_attention_btn"
                  onClick={() => navigate(a.to)}
                >
                  {a.action}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="crm_overview_panel">
          <h2 className="crm_overview_panel_title">Where contacts come from</h2>
          <p className="crm_overview_panel_hint">Last 30 days</p>
          <div className="crm_overview_sources">
            {SOURCES.map((s) => (
              <div key={s.name} className="crm_overview_source_row">
                <div className="crm_overview_source_name">{s.name}</div>
                <div className="crm_overview_source_track">
                  <div
                    className="crm_overview_source_fill"
                    style={{ width: s.pct, background: s.color }}
                  />
                </div>
                <div className="crm_overview_source_n">{s.n}</div>
              </div>
            ))}
          </div>
          <p className="crm_overview_sources_note">
            Ads, landing pages and web forms feed contacts here automatically —
            no manual entry.
          </p>
        </div>
      </div>
    </section>
  )
}
