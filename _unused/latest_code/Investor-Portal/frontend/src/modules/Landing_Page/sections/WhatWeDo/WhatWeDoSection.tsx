import "./WhatWeDo.css"
import { whatWeDo } from "../../data/content"
import { resolveLucideIcon } from "../../utils/helpers"
import { BentoMotionCard } from "../../components/Shared/BentoMotionCard"
import { FadeIn } from "../../components/Shared/FadeIn"

interface WhatWeDoSectionProps {
  pulse?: boolean
}

export function WhatWeDoSection({ pulse }: WhatWeDoSectionProps) {
  return (
    <section
      id="solution"
      className={`sx-section ${pulse ? "sx-section-pulse" : ""}`.trim()}
      aria-labelledby="sx-wwd-title"
    >
      <div className="sx-wrap">
        <FadeIn>
          <p className="sx-section__label">Solution</p>
          <h2 id="sx-wwd-title" className="sx-section__title">
            What we do
          </h2>
          <p className="sx-section__lead">
            SyndicationX unifies the entire raise—from first touch to final wire—so
            sponsors move faster with fewer operational seams and clearer investor
            trust.
          </p>
        </FadeIn>
        <div className="sx-bento-grid-wwd">
          {whatWeDo.map((item, i) => {
            const Icon = resolveLucideIcon(item.iconName)
            return (
              <BentoMotionCard
                key={item.title}
                icon={Icon}
                title={item.title}
                description={item.description}
                delay={0.04 * i}
              />
            )
          })}
        </div>
      </div>
    </section>
  )
}
