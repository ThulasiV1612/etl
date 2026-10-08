import "./PlatformSpecial.css"
import { motion, useReducedMotion } from "framer-motion"
import { platformSpecial } from "../../data/content"
import { resolveLucideIcon } from "../../utils/helpers"
import { FadeIn } from "../../components/Shared/FadeIn"

interface PlatformSpecialSectionProps {
  pulse?: boolean
}

const barHeights = [38, 62, 48, 78, 55, 88, 44, 70, 52]

export function PlatformSpecialSection({ pulse }: PlatformSpecialSectionProps) {
  const reduce = useReducedMotion()

  return (
    <section
      id="platform-special"
      className={`sx-section sx-platform ${pulse ? "sx-section-pulse" : ""}`.trim()}
      aria-labelledby="sx-plat-title"
    >
      <div className="sx-wrap">
        <FadeIn>
          <p className="sx-section__label">Differentiation</p>
          <h2 id="sx-plat-title" className="sx-section__title">
            What&apos;s special about this platform
          </h2>
          <p className="sx-section__lead">
            {/* AI-assisted copy removed — nothing model-based is live in the product yet */}
            A control tower for capital formation—where your team stays in control,
            and every workflow is engineered for institutional rigor.
          </p>
        </FadeIn>

        <div className="sx-platform__shell">
          <div className="sx-platform__grid">
            <div className="sx-platform__viz">
              <div className="sx-platform__viz-header">
                <div>
                  <h3 className="sx-platform__viz-title">Live raise momentum</h3>
                  <p className="sx-platform__viz-sub">
                    Modeled pipeline health across syndicates (illustrative)
                  </p>
                </div>
              </div>
              <div className="sx-platform__metrics" aria-hidden>
                <span className="sx-platform__metric sx-animate-metric">+18% WoW</span>
                <span className="sx-platform__metric">Commit velocity</span>
                <span className="sx-platform__metric">Risk-off ready</span>
              </div>
              <div className="sx-platform__chart" role="img" aria-label="Animated bar chart">
                {barHeights.map((h, i) => (
                  <motion.div
                    key={i}
                    className="sx-platform__bar"
                    initial={reduce ? false : { scaleY: 0.2, opacity: 0.4 }}
                    whileInView={reduce ? undefined : { scaleY: 1, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{
                      delay: 0.04 * i,
                      duration: 0.65,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>

            <div className="sx-platform__cards">
              {platformSpecial.map((item, i) => {
                const Icon = resolveLucideIcon(item.iconName)
                return (
                  <motion.article
                    key={item.title}
                    className="sx-platform-card"
                    initial={reduce ? false : { opacity: 0, y: 12 }}
                    whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-30px" }}
                    transition={{ duration: 0.45, delay: 0.04 * i }}
                    whileHover={reduce ? undefined : { y: -2 }}
                  >
                    <div className="sx-platform-card__top">
                      <div className="sx-platform-card__icon" aria-hidden>
                        <Icon size={18} strokeWidth={1.85} />
                      </div>
                      {item.metric ? (
                        <span className="sx-platform-card__metric">{item.metric}</span>
                      ) : null}
                    </div>
                    <h3 className="sx-platform-card__title">{item.title}</h3>
                    <p className="sx-platform-card__desc">{item.description}</p>
                  </motion.article>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
