import "./Footer.css";
import { Linkedin } from "lucide-react";
import { Link } from "react-router-dom";
import { SX_LOGO_SRC } from "@/assets/branding";
import { footer } from "../../data/content";
import { scrollToSection } from "../../utils/helpers";

function XIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="sx-footer" role="contentinfo">
      <div className="sx-wrap">
        <div className="sx-footer__grid">
          <div className="sx-footer__brand-block">
            <img
              className="sx-footer__logo"
              src={SX_LOGO_SRC}
              alt="SyndicationX"
              width={400}
              height={100}
              loading="lazy"
              decoding="async"
            />
            <p className="sx-footer__tag">{footer.tagline}</p>
            <div className="sx-footer__social">
              {footer.social.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={s.label}
                >
                  {s.label === "LinkedIn" ? <Linkedin size={18} /> : <XIcon />}
                </a>
              ))}
            </div>
          </div>
          <div>
            <h3 className="sx-footer__col-title">Quick links</h3>
            <ul className="sx-footer__list">
              {footer.quickLinks.map((l) => (
                <li key={l.label}>
                  <button
                    type="button"
                    onClick={() => scrollToSection({ sectionId: l.sectionId })}
                  >
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="sx-footer__col-title">Investor resources</h3>
            <ul className="sx-footer__list">
              {footer.resources.map((r) => (
                <li key={r.label}>
                  <a href={r.href}>{r.label}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="sx-footer__bottom">
          <span>{footer.copyright}</span>
          <Link to="/" className="sx-footer__classic-link">
            New experience
          </Link>
        </div>
      </div>
    </footer>
  );
}
