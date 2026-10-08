import "./WebinarCTA.css"
import { motion, useReducedMotion } from "framer-motion"
import { CalendarPlus, Mail } from "lucide-react"
import { webinarCta } from "../../data/content"

export function WebinarCTA() {
  const reduce = useReducedMotion()

  return (
    <section
      id="webinar-cta"
      className="sx-section sx-webinar"
      aria-labelledby="sx-webinar-title"
    >
      <div className="sx-wrap">
        <motion.div
          className="sx-webinar__card sx-glass"
          initial={reduce ? false : { opacity: 0, y: 16 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="sx-webinar__inner">
            <h2 id="sx-webinar-title" className="sx-webinar__title">
              {webinarCta.title}
            </h2>
            <p className="sx-webinar__desc">{webinarCta.description}</p>
            <div className="sx-webinar__actions">
              <button type="button" className="sx-btn-glow">
                <CalendarPlus size={18} strokeWidth={2} aria-hidden />
                {webinarCta.buttonLabel}
              </button>
              <a href="mailto:support@syndicationx.com" className="sx-btn-outline">
                <Mail size={18} strokeWidth={2} aria-hidden />
                Talk to sales
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
