import { NavLink, Outlet } from 'react-router-dom'

const TOP_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: '◉' },
]

const ETL_NAV = [
  { to: '/etl-upload', label: 'Existing ETL Modules', icon: '↑' },
  { to: '/etl/cash-flow', label: 'Profile & Investor Mapping', icon: '⇄' },
  { to: '/etl/classes', label: 'PDF Classes Mapping', icon: '▦' },
  { to: '/etl/distributions', label: 'Distribution Mapping', icon: '◈' },
  { to: '/etl/page-info', label: 'Page Info', icon: 'ⓘ' },
]

export function AppLayout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">SX</div>
          <div>
            <p className="brand-title">SyndicationX</p>
            <p className="brand-subtitle">ETL Migration Platform</p>
          </div>
        </div>

        <nav className="nav">
          {TOP_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          <div className="nav-section">
            <p className="nav-section-label">ETL</p>
            {ETL_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-link nav-link-nested${isActive ? ' active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
