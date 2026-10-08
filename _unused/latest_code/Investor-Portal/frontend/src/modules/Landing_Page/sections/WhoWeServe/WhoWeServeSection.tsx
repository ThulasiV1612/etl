import "./WhoWeServe.css"
import { whoWeServe } from "../../data/content"
import { resolveLucideIcon } from "../../utils/helpers"
import { BentoMotionCard } from "../../components/Shared/BentoMotionCard"
import { FadeIn } from "../../components/Shared/FadeIn"

interface WhoWeServeSectionProps {
  pulse?: boolean
}

export function WhoWeServeSection({ pulse }: WhoWeServeSectionProps) {
  return (
    <section
      id="audience"
      className={`sx-section ${pulse ? "sx-section-pulse" : ""}`.trim()}
      aria-labelledby="sx-aud-title"
    >
      <div className="sx-wrap">
        <FadeIn>
          <p className="sx-section__label">Target audience</p>
          <h2 id="sx-aud-title" className="sx-section__title">
            Who we serve
          </h2>
          <p className="sx-section__lead">
            Built for teams where reputation, compliance, and speed all matter—whether
            you are syndicating real assets or running institutional SPVs at scale.
          </p>
        </FadeIn>
        <div className="sx-bento-grid-audience">
          {whoWeServe.map((item, i) => {
            const Icon = resolveLucideIcon(item.iconName)
            return (
              <BentoMotionCard
                key={item.title}
                icon={Icon}
                title={item.title}
                description={item.description}
                delay={0.035 * i}
              />
            )
          })}
        </div>
      </div>
    </section>
  )
}
