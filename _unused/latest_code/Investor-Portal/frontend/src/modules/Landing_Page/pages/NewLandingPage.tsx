import { useCallback, useRef } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useReducedMotion } from "framer-motion"
import { BrandLogo } from "../components/NewLanding/BrandLogo"
import { Files2NavActions } from "../components/NewLanding/NewNavActions"
import { Files2WebinarSection } from "../components/NewLanding/NewWebinarSection"
import { Files2LandingBody } from "../components/NewLanding/NewLandingBody"
import { useFiles2Landing } from "../hooks/useNewLanding"
import { hero, scheduleDemoUrl } from "../data/content"
import "../styles/new_landing.css"

export default function Files2LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const reducedMotion = useReducedMotion()
  useFiles2Landing(rootRef, reducedMotion)

  const closeMobileMenu = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    root.querySelector("#mmenu")?.classList.remove("open")
    root.querySelector("#hamburger")?.classList.remove("open")
    root.classList.remove("menu-open")
    root.dispatchEvent(new CustomEvent("files2:close-menu"))
  }, [])

  const goSignIn = useCallback(() => {
    closeMobileMenu()
    navigate("/signin")
  }, [closeMobileMenu, navigate])

  const demoIsExternal = scheduleDemoUrl.startsWith("http")

  return (
    <div ref={rootRef} className="files2-landing">
      <div className="preloader" id="preloader">
        <div className="pre-bg-left" />
        <div className="pre-bg-right" />
        <div className="pre-content">
          <div className="pre-logo">
            <BrandLogo variant="preloader" />
          </div>
          <div className="pre-count" id="pre-count">
            0
          </div>
          <div className="pre-bar-wrap">
            <div className="pre-bar" id="pre-bar" />
          </div>
          <p className="pre-label">LOADING PLATFORM</p>
        </div>
      </div>

      <div className="noise-overlay" aria-hidden="true" />

      <header className="navbar" id="navbar">
        <div className="nav-wrap">
          <a href="#" className="brand" onClick={(e) => e.preventDefault()}>
            <BrandLogo showWordmark />
          </a>
          <nav className="nav-center">
            <a href="#about" className="nl">
              About
            </a>
            <a href="#services" className="nl">
              Services
            </a>
            <a href="#security" className="nl">
              Security
            </a>
            <a href="#process" className="nl">
              Process
            </a>
            <a href="#contact" className="nl">
              Contact
            </a>
          </nav>
          <div className="nav-right">
            <Files2NavActions className="f2-nav-actions--desktop" />
          </div>
          <button type="button" className="hamburger" id="hamburger" aria-label="Menu">
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      <div className="mmenu" id="mmenu">
        <div className="mmenu-inner">
          <nav>
            <a href="#about" className="mlink">
              About
            </a>
            <a href="#services" className="mlink">
              Services
            </a>
            <a href="#security" className="mlink">
              Security
            </a>
            <a href="#process" className="mlink">
              Process
            </a>
            <a href="#contact" className="mlink">
              Contact
            </a>
          </nav>
          <Files2NavActions className="mmenu-actions" onAfterAction={closeMobileMenu} />
        </div>
      </div>

      <section className="hero" id="hero">
        <div className="hero-grid" />
        <div className="hero-glow g1" />
        <div className="hero-glow g2" />
        <div className="hero-glow g3" />

        <div className="hero-inner">
          <div className="hero-badge">
            <span className="badge-dot" />
            <span>LIVE — Global Capital Markets</span>
            <span className="badge-sep">|</span>
            <span className="badge-markets">18 Markets Active</span>
          </div>

          <h1 className="hero-h1">
            <span className="hl hl-1">Where Capital,</span>
            <span className="hl hl-2">
              Intelligence<em> &amp;</em>
            </span>
            <span className="hl hl-3">Opportunity</span>
            <span className="hl hl-4 outline-text">Converge.</span>
          </h1>

          <p className="hero-sub">
            SyndicationX connects founders, institutions, and strategic capital through intelligent
            syndication, structured finance, and modern investment infrastructure — secured at every
            layer.
          </p>

          <div className="hero-btns">
            <button type="button" className="btn-primary" onClick={goSignIn}>
              <span className="btn-txt">{hero.primaryCta}</span>
              <span className="btn-fill" />
            </button>
            <a href="#security" className="btn-ghost">
              <svg viewBox="0 0 20 20" fill="none">
                <path
                  d="M10 2l6 2.5v5C16 13.5 13 17 10 18 7 17 4 13.5 4 9.5v-5L10 2z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
              <span>Security Overview</span>
            </a>
          </div>

          <div className="hero-stats">
            <div className="hstat">
              <strong>$500M+</strong>
              <span>Structured Opportunities</span>
            </div>
            <div className="hstat-div" />
            <div className="hstat">
              <strong>120+</strong>
              <span>Investor Connections</span>
            </div>
            <div className="hstat-div" />
            <div className="hstat">
              <strong>18</strong>
              <span>Global Markets</span>
            </div>
            <div className="hstat-div" />
            <div className="hstat">
              <strong>98%</strong>
              <span>Retention Rate</span>
            </div>
          </div>
        </div>

        <div className="hero-scroll">
          <div className="scroll-track">
            <div className="scroll-thumb" />
          </div>
          <span>SCROLL TO EXPLORE</span>
        </div>

        <div className="ticker-bar">
          <div className="ticker-inner">
            <div className="ticker-track" id="ticker">
              <span>Capital Syndication</span>
              <span className="tdot">◆</span>
              <span>Strategic Advisory</span>
              <span className="tdot">◆</span>
              <span>Investor Intelligence</span>
              <span className="tdot">◆</span>
              <span>Global Deal Flow</span>
              <span className="tdot">◆</span>
              <span>Structured Finance</span>
              <span className="tdot">◆</span>
              <span>M&amp;A Execution</span>
              <span className="tdot">◆</span>
              <span>Secondary Markets</span>
              <span className="tdot">◆</span>
              <span>AES-256 Encryption</span>
              <span className="tdot">◆</span>
              <span>SOC 2 Type II</span>
              <span className="tdot">◆</span>
              <span>Capital Syndication</span>
              <span className="tdot">◆</span>
              <span>Strategic Advisory</span>
              <span className="tdot">◆</span>
              <span>Investor Intelligence</span>
              <span className="tdot">◆</span>
              <span>Global Deal Flow</span>
              <span className="tdot">◆</span>
              <span>Structured Finance</span>
              <span className="tdot">◆</span>
              <span>M&amp;A Execution</span>
              <span className="tdot">◆</span>
              <span>Secondary Markets</span>
              <span className="tdot">◆</span>
              <span>AES-256 Encryption</span>
              <span className="tdot">◆</span>
              <span>SOC 2 Type II</span>
              <span className="tdot">◆</span>
            </div>
          </div>
        </div>
      </section>

      <Files2LandingBody />

      <Files2WebinarSection />

      <section className="cta-section" id="contact">
        <div className="cta-glow" />
        <div className="wrap">
          <div className="cta-inner">
            <p className="cta-eyebrow">FUTURE INFRASTRUCTURE</p>
            <h2 className="cta-h2 scroll-in">
              Build The Next
              <br />
              Generation Of <em>Capital.</em>
            </h2>
            <p className="cta-body scroll-in">
              Partner with SyndicationX to unlock strategic capital opportunities — from first round
              to global markets, secured at every layer.
            </p>
            <div className="cta-btns scroll-in">
              <a
                href={scheduleDemoUrl}
                className="btn-primary magnetic"
                {...(demoIsExternal ? { target: "_blank", rel: "noreferrer noopener" } : {})}
              >
                <span className="btn-txt">Start A Conversation</span>
                <span className="btn-fill" />
              </a>
              <a href="#security" className="btn-ghost magnetic">
                <svg viewBox="0 0 20 20" fill="none">
                  <path
                    d="M10 2l6 2.5v5C16 13.5 13 17 10 18 7 17 4 13.5 4 9.5v-5L10 2z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                </svg>
                <span>View Security Docs</span>
              </a>
            </div>
            <div className="cta-trust scroll-in">
              <div className="ct-item">
                <span className="ct-dot" />
                Available 24/7
              </div>
              <div className="ct-item">
                <span className="ct-dot" />
                No commitment required
              </div>
              <div className="ct-item">
                <span className="ct-dot" />
                NDA available
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="wrap footer-grid">
          <div className="fg-brand">
            <div className="brand">
              <BrandLogo showWordmark />
            </div>
            <p>
              Intelligent Capital Infrastructure
              <br />
              for the modern global economy.
            </p>
            <div className="fg-socials">
              <a href="#" className="fs-link" aria-label="LinkedIn">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" />
                  <circle cx="4" cy="4" r="2" fill="currentColor" />
                </svg>
              </a>
              <a href="#" className="fs-link" aria-label="Twitter">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a href="mailto:support@syndicationx.com" className="fs-link" aria-label="Email">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </a>
            </div>
          </div>

          <div className="fg-links">
            <div className="fl-col">
              <h4>Platform</h4>
              <ul>
                <li>
                  <a href="#services">Capital Syndication</a>
                </li>
                <li>
                  <a href="#services">Strategic Advisory</a>
                </li>
                <li>
                  <a href="#services">Investor Intelligence</a>
                </li>
                <li>
                  <a href="#services">Global Deal Flow</a>
                </li>
              </ul>
            </div>
            <div className="fl-col">
              <h4>Company</h4>
              <ul>
                <li>
                  <a href="#about">About Us</a>
                </li>
                <li>
                  <a href="#">Insights</a>
                </li>
                <li>
                  <a href="#">Careers</a>
                </li>
                <li>
                  <a href="#contact">Contact</a>
                </li>
              </ul>
            </div>
            <div className="fl-col">
              <h4>Security &amp; Legal</h4>
              <ul>
                <li>
                  <a href="#security">Security Overview</a>
                </li>
                <li>
                  <Link to="/privacypolicy">Privacy Policy</Link>
                </li>
                <li>
                  <Link to="/termsandservices">Terms of Service</Link>
                </li>
                <li>
                  <a href="#security">Compliance</a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="wrap fb-inner">
            <span>© 2026 SyndicationX. All rights reserved.</span>
            <Link to="/landing-classic" className="fb-tag">
              CLASSIC EXPERIENCE
            </Link>
            <div className="fb-security">
              <svg viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 1.5l5.5 2v4.5C13.5 11 11 13.5 8 14.5 5 13.5 2.5 11 2.5 8V3.5L8 1.5z"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>
              <span>SOC 2 Certified</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
