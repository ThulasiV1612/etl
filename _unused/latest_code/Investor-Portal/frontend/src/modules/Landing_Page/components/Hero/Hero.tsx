import "./Hero.css"
import { Link } from "react-router-dom"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowRight, Video } from "lucide-react"
import { brand, hero } from "../../data/content"
import { CursorGlow } from "../Shared/CursorGlow"

/** One curve for hero tweens — matches landing `revealFade` feel. */
const heroEase = [0.16, 1, 0.3, 1] as const

export function Hero({ isEntranceReady = true }: HeroProps) {
  const reduce = useReducedMotion()
  const runEntrance = !reduce && isEntranceReady

  return (
    <section className="sx-hero" aria-labelledby="sx-hero-title">
      <div className="sx-hero__media" aria-hidden>
        <div className="sx-hero__image" />
        <div className="sx-hero__veil" />
        <div className="sx-hero__grid sx-hero-grid sx-animate-grid" />
        <CursorGlow />
      </div>

      <div className="sx-hero__content">
        <div>
          {/* <p className="sx-hero__eyebrow">{brand.tagline}</p> */}
          <p className="sx-hero__eyebrow">{brand.taglineHero}</p>
          <motion.h1
            id="sx-hero-title"
            className="sx-hero__title"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={
              reduce
                ? undefined
                : isEntranceReady
                  ? { opacity: 1, y: 0 }
                  : { opacity: 0, y: 12 }
            }
            transition={{
              duration: 0.56,
              delay: runEntrance ? 0.06 : 0,
              ease: heroEase,
            }}
          >
            {hero.headline}
          </motion.h1>
          <motion.p
            className="sx-hero__lead"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={
              reduce
                ? undefined
                : isEntranceReady
                  ? { opacity: 1, y: 0 }
                  : { opacity: 0, y: 10 }
            }
            transition={{
              duration: 0.5,
              delay: runEntrance ? 0.11 : 0,
              ease: heroEase,
            }}
          >
            {hero.subheadline}
          </motion.p>
          <motion.div
            className="sx-hero__ctas"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={
              reduce
                ? undefined
                : isEntranceReady
                  ? { opacity: 1, y: 0 }
                  : { opacity: 0, y: 8 }
            }
            transition={{
              duration: 0.46,
              delay: runEntrance ? 0.16 : 0,
              ease: heroEase,
            }}
          >
            <Link to="/signin" className="sx-btn-glow sx-btn-glow--wide">
              {hero.primaryCta}
              <ArrowRight size={18} strokeWidth={2} aria-hidden />
            </Link>
            <button
              type="button"
              className="sx-btn-outline"
              onClick={() =>
                document.getElementById("webinar-cta")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
              }
            >
              <Video size={18} strokeWidth={2} aria-hidden />
              {hero.secondaryCta}
            </button>
          </motion.div>
          {/* <motion.div
            className="sx-hero__trust"
            initial={reduce ? false : { opacity: 0 }}
            animate={reduce ? undefined : { opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.28 }}
          >
            {hero.trust.map((label) => (
              <span key={label} className="sx-hero__pill">
                <CheckCircle2 size={14} strokeWidth={2.25} aria-hidden />
                {label}
              </span>
            ))}
          </motion.div> */}
        </div>

        <div className="sx-hero__aside" aria-hidden>
          {hero.floatingCardsTrust.map((card, i) => {
            const floatAnim = i === 1 ? "sx-animate-float-delayed" : "sx-animate-float"
            return (
            <motion.div
              key={card.title}
              className={`sx-hero__float sx-glass ${floatAnim} sx-hero__float--${i + 1}`.trim()}
              initial={reduce ? false : { opacity: 0 }}
              animate={
                reduce
                  ? undefined
                  : isEntranceReady
                    ? { opacity: 1 }
                    : { opacity: 0 }
              }
              transition={{
                duration: 0.48,
                delay: runEntrance ? 0.12 + i * 0.05 : 0,
                ease: heroEase,
              }}
              whileHover={reduce ? undefined : { y: -4, scale: 1.02 }}
            >
              <div className="sx-hero__float-label">{card.title}</div>
              {/* <div className="sx-hero__float-value">{card.value}</div> */}
              {/* <div className="sx-hero__float-meta">{card.label}</div> */}
            </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

interface HeroProps {
  /** When false, hero motion stays at `initial` until the landing preloader finishes (avoids “dead” hero). */
  isEntranceReady?: boolean
}
