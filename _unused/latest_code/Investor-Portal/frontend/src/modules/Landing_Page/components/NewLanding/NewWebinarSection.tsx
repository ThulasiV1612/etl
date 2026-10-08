import { CalendarPlus, Mail } from "lucide-react"
import { webinarCta, scheduleDemoUrl } from "../../data/content"

export function Files2WebinarSection() {
  const scheduleDemoIsHttp = scheduleDemoUrl.startsWith("http")

  return (
    <section className="f2-webinar-section" id="webinar-cta" aria-labelledby="f2-webinar-title">
      <div className="wrap">
        <div className="f2-webinar-card scroll-in">
          <p className="f2-webinar-eyebrow">LIVE SESSION</p>
          <h2 id="f2-webinar-title" className="sec-h2 centered">
            {webinarCta.title}
          </h2>
          <p className="f2-webinar-desc">{webinarCta.description}</p>
          <div className="f2-webinar-actions">
            <a
              href={scheduleDemoUrl}
              className="btn-primary magnetic"
              {...(scheduleDemoIsHttp ? { target: "_blank", rel: "noreferrer noopener" } : {})}
            >
              <span className="btn-txt">
                <CalendarPlus size={18} strokeWidth={2} aria-hidden />
                {webinarCta.buttonLabel}
              </span>
              <span className="btn-fill" />
            </a>
            <a href="mailto:support@syndicationx.com" className="btn-ghost magnetic">
              <Mail size={18} strokeWidth={2} aria-hidden />
              <span>Talk to sales</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
