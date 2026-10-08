import "./LandingPreloader.css"
import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
// import sxPngUrl from "@/assets/images/sx_logo_without_bg.png"
import sxPngUrl from "@/assets/images/syndicationx_high_resolution_logo.png"
// import { brand } from "../../data/content"

type PreloaderStage = "logo" | "tagline" | "exit" | "done"

/**
 * Strict order: (1) logo only → (2) tagline under logo → (3) website.
 * Phase 3: `exit` fades this overlay; parent should start the page reveal when `onRevealStart` runs
 * (after tagline has held for `taglineHold`), then this component unmounts after `exitAnim`.
 */
const TIMINGS_MS = {
  logoHold: 1400,
  taglineHold: 1600,
  exitAnim: 1050,
} as const

const TIMINGS_REDUCED_MS = {
  logoHold: 320,
  taglineHold: 320,
  exitAnim: 220,
} as const

interface LandingPreloaderProps {
  /** Fired when the overlay begins its exit — start revealing the page underneath. */
  onRevealStart?: () => void
}

export function LandingPreloader({ onRevealStart }: LandingPreloaderProps) {
  const reduce = useReducedMotion()
  const [stage, setStage] = useState<PreloaderStage>("logo")
  const revealCalled = useRef(false)

  useEffect(() => {
    const t = reduce ? TIMINGS_REDUCED_MS : TIMINGS_MS
    const body = document.body
    const prevOverflow = body.style.overflow
    body.style.overflow = "hidden"

    const t1 = window.setTimeout(() => setStage("tagline"), t.logoHold)
    const t2 = window.setTimeout(() => {
      setStage("exit")
      if (!revealCalled.current) {
        revealCalled.current = true
        onRevealStart?.()
      }
    }, t.logoHold + t.taglineHold)
    const t3 = window.setTimeout(() => {
      setStage("done")
      body.style.overflow = prevOverflow
    }, t.logoHold + t.taglineHold + t.exitAnim)

    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
      body.style.overflow = prevOverflow
    }
  }, [reduce, onRevealStart])

  if (stage === "done") return null

  // Tagline must not show during `logo`; website reveal runs only after `tagline` (see effect t2).
  // const showTagline = stage === "tagline" || stage === "exit"

  return (
    <div
      className={`sx-preloader ${stage === "exit" ? "sx-preloader--exit" : ""}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy={stage !== "exit"}
      aria-label="Loading SyndicationX"
    >
      <motion.div
        className="sx-preloader__inner"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduce ? 0.12 : 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="sx-preloader__mark">
          <motion.img
            className="sx-preloader__img"
            src={sxPngUrl}
            alt=""
            decoding="async"
            fetchPriority="high"
            initial={reduce ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: reduce ? 0.18 : 0.65, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>

        {/* <div
          className={`sx-preloader__tagline ${
            showTagline ? "sx-preloader__tagline--visible" : ""
          }`.trim()}
        >
          <p className="sx-preloader__line">{brand.tagline}</p>
          <span className="sx-preloader__accent" aria-hidden />
        </div> */}
      </motion.div>
    </div>
  )
}
