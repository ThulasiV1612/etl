import "./Navbar.css"
import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, CalendarPlus, Menu, Video, X } from "lucide-react"
import { SX_LOGO_SRC } from "@/assets/branding"
import { navLinks, scheduleDemoUrl } from "../../data/content"
import { observeSections, scrollToSection } from "../../utils/helpers"

interface NavbarProps {
  onNavigateSection?: (sectionId: string) => void
}

export function Navbar({ onNavigateSection }: NavbarProps) {
  const [activeSection, setActiveSection] = useState(navLinks[0]?.sectionId ?? "")
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const ids = navLinks.map((l) => l.sectionId)
    return observeSections({
      sectionIds: ids,
      onChange: setActiveSection,
    })
  }, [])

  const go = useCallback(
    (sectionId: string) => {
      scrollToSection({
        sectionId,
        onHighlight: onNavigateSection,
      })
      setMenuOpen(false)
    },
    [onNavigateSection],
  )

  const scheduleDemoIsHttp = scheduleDemoUrl.startsWith("http")

  return (
    <>
      <header className="sx-nav sx-glass" role="banner">
        <div className="sx-nav__inner">
          <button
            type="button"
            className="sx-nav__brand"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: "smooth" })
              setMenuOpen(false)
            }}
            aria-label="SyndicationX home"
          >
            <img
              className="sx-nav__logo-img"
              src={SX_LOGO_SRC}
              alt=""
              width={600}
              height={220}
              decoding="async"
              fetchPriority="high"
            />
            {/* <span className="sx-nav__brand-text">
              <span className="sx-nav__tag">{brand.tagline}</span>
            </span> */}
          </button>

          <nav className="sx-nav__links" aria-label="Primary">
            {navLinks.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`sx-nav__link ${
                  activeSection === item.sectionId ? "sx-nav__link--active" : ""
                }`.trim()}
                onClick={() => go(item.sectionId)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="sx-nav__actions">
            <a
              href={scheduleDemoUrl}
              className="sx-btn-outline"
              {...(scheduleDemoIsHttp
                ? { target: "_blank", rel: "noreferrer noopener" }
                : {})}
            >
              <CalendarPlus size={18} strokeWidth={2} aria-hidden />
              Schedule a demo
            </a>
            <button
              type="button"
              className="sx-btn-outline"
              onClick={() => go("webinar-cta")}
            >
              <Video size={18} strokeWidth={2} aria-hidden />
              Webinar
            </button>
            <Link to="/signin" className="sx-btn-glow sx-btn-glow--wide">
              Start Raising & Investing
              <ArrowRight size={18} strokeWidth={2} aria-hidden />
            </Link>
          </div>

          <button
            type="button"
            className="sx-nav__toggle"
            aria-expanded={menuOpen}
            aria-controls="sx-nav-mobile"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <div
          className={`sx-nav__sheet sx-glass ${menuOpen ? "sx-nav__sheet--open" : ""}`.trim()}
          id="sx-nav-mobile"
        >
          {navLinks.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`sx-nav__sheet-link ${
                activeSection === item.sectionId ? "sx-nav__sheet-link--active" : ""
              }`.trim()}
              onClick={() => go(item.sectionId)}
            >
              {item.label}
            </button>
          ))}
          <div className="sx-nav__sheet-actions">
            <a
              href={scheduleDemoUrl}
              className="sx-btn-outline"
              onClick={() => setMenuOpen(false)}
              {...(scheduleDemoIsHttp
                ? { target: "_blank", rel: "noreferrer noopener" }
                : {})}
            >
              <CalendarPlus size={18} strokeWidth={2} aria-hidden />
              Schedule a demo
            </a>
            <button
              type="button"
              className="sx-btn-outline"
              onClick={() => go("webinar-cta")}
            >
              <Video size={18} strokeWidth={2} aria-hidden />
              Webinar
            </button>
            <Link to="/signin" className="sx-btn-glow sx-btn-glow--wide" onClick={() => setMenuOpen(false)}>
               Start Raising & Investing
              <ArrowRight size={18} strokeWidth={2} aria-hidden />
            </Link>
          </div>
        </div>
      </header>
      <button
        type="button"
        className={`sx-nav__backdrop ${menuOpen ? "sx-nav__backdrop--open" : ""}`.trim()}
        aria-label="Close menu"
        tabIndex={menuOpen ? 0 : -1}
        onClick={() => setMenuOpen(false)}
      />
    </>
  )
}
