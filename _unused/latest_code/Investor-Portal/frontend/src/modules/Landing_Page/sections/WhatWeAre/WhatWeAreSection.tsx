import "./WhatWeAre.css"
import { motion, useReducedMotion } from "framer-motion"
import { whatWeAre } from "../../data/content"
import { FadeIn } from "../../components/Shared/FadeIn"

interface WhatWeAreSectionProps {
  pulse?: boolean
}

export function WhatWeAreSection({ pulse }: WhatWeAreSectionProps) {
  const reduce = useReducedMotion()

  return (
    <section
      id="identity"
      className={`sx-section ${pulse ? "sx-section-pulse" : ""}`.trim()}
      aria-labelledby="sx-id-title"
    >
      <div className="sx-wrap">
        <FadeIn>
          <p className="sx-section__label">Positioning</p>
          <h2 id="sx-id-title" className="sx-section__title">
            What we are
          </h2>
          <p className="sx-section__lead">
            SyndicationX is not “another portal.” It is the operating layer for modern
            capital formation—where compliance, storytelling, and execution converge.
          </p>
        </FadeIn>
        <div className="sx-identity-grid">
          {whatWeAre.map((item, i) => (
            <motion.article
              key={item.title}
              className="sx-identity-card"
              initial={reduce ? false : { opacity: 0, y: 16 }}
              whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: 0.05 * i, ease: [0.22, 1, 0.36, 1] }}
              whileHover={reduce ? undefined : { y: -3 }}
            >
              <div className="sx-identity-card__inner">
                <h3 className="sx-identity-card__title">{item.title}</h3>
                <p className="sx-identity-card__desc">{item.description}</p>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  )
}
