import { useNavigate } from "react-router-dom"
import "../usermanagement/user_management.css"
import "./contacts.css"
import "./crm-overview.css"

type CrmSectionPlaceholderPageProps = {
  title: string
  description: string
}

export default function CrmSectionPlaceholderPage({
  title,
  description,
}: CrmSectionPlaceholderPageProps) {
  const navigate = useNavigate()

  return (
    <section className="um_page contacts_page crm_overview_page">
      <header className="crm_overview_header">
        <div>
          <h1 className="crm_overview_title">{title}</h1>
          <p className="crm_overview_subtitle">{description}</p>
        </div>
        <div className="crm_overview_header_actions">
          <button
            type="button"
            className="um_btn_secondary"
            onClick={() => navigate("/contacts")}
          >
            All contacts
          </button>
          <button
            type="button"
            className="um_btn_primary"
            onClick={() => navigate("/contacts/overview")}
          >
            Overview
          </button>
        </div>
      </header>

      <div className="crm_overview_panel">
        <h2 className="crm_overview_panel_title">Coming soon</h2>
        <p className="crm_overview_panel_hint" style={{ marginTop: "0.75rem" }}>
          This section is part of the Capital Raising CRM. Use Overview and All
          contacts for now — full {title.toLowerCase()} tooling will land here.
        </p>
      </div>
    </section>
  )
}
