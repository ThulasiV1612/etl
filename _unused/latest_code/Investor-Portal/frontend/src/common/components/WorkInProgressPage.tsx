import { Link } from "react-router-dom"
import "./work_in_progress_page.css"

interface WorkInProgressPageProps {
  title: string
  backTo?: string
  backLabel?: string
  /** When true, `backLabel` is plain text (not a link — e.g. section label only). */
  parentCrumbPlain?: boolean
}

export function WorkInProgressPage({
  title,
  backTo = "/dashboard",
  backLabel = "Home",
  parentCrumbPlain = false,
}: WorkInProgressPageProps) {
  return (
    <section className="wip_page">
      <nav className="wip_breadcrumb" aria-label="Breadcrumb">
        {parentCrumbPlain ? (
          <span className="wip_breadcrumb_plain">{backLabel}</span>
        ) : (
          <Link to={backTo}>{backLabel}</Link>
        )}
        <span className="wip_breadcrumb_sep" aria-hidden>
          /
        </span>
        <span aria-current="page">{title}</span>
      </nav>
      <h1 className="wip_title">{title}</h1>
      <p className="wip_message">Work in progress</p>
    </section>
  )
}
