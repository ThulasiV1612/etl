import { Suspense, lazy, useCallback, useMemo, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Navbar } from "../components/Navbar/Navbar"
import { Hero } from "../components/Hero/Hero"
import { LandingPreloader } from "../components/Preloader/LandingPreloader"
import { WhatWeDoSection } from "../sections/WhatWeDo/WhatWeDoSection"
import { WhoWeServeSection } from "../sections/WhoWeServe/WhoWeServeSection"
import { WhatWeAreSection } from "../sections/WhatWeAre/WhatWeAreSection"
import { WebinarCTA } from "../components/WebinarCTA/WebinarCTA"
import { Footer } from "../components/Footer/Footer"

const PlatformSpecialSection = lazy(async () => {
  const m = await import("../sections/PlatformSpecial/PlatformSpecialSection")
  return { default: m.PlatformSpecialSection }
})

function SectionFallback() {
  return (
    <div
      className="sx-wrap"
      style={{ minHeight: 280, paddingBlock: "3rem" }}
      aria-hidden
    />
  )
}

/** Original SyndicationX marketing landing (pre–files2 redesign). */
export default function ClassicLandingPage() {
  const reduceMotion = useReducedMotion()
  const [pulseSectionId, setPulseSectionId] = useState<string | null>(null)
  const [isLandingRevealed, setIsLandingRevealed] = useState(false)

  const triggerSectionPulse = useCallback((sectionId: string) => {
    setPulseSectionId(sectionId)
    window.setTimeout(() => setPulseSectionId(null), 900)
  }, [])

  const handlePreloaderRevealStart = useCallback(() => setIsLandingRevealed(true), [])

  const revealContainer = useMemo(
    () => ({
      hidden: {},
      visible: {
        transition: reduceMotion
          ? { staggerChildren: 0.02, delayChildren: 0 }
          : { staggerChildren: 0.08, delayChildren: 0.06 },
      },
    }),
    [reduceMotion],
  )

  const revealNav = useMemo(
    () => ({
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: reduceMotion
          ? { duration: 0.18, ease: "easeOut" as const }
          : { duration: 0.58, ease: [0.16, 1, 0.3, 1] as const },
      },
    }),
    [reduceMotion],
  )

  const revealFade = useMemo(
    () => ({
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: reduceMotion
          ? { duration: 0.18, ease: "easeOut" as const }
          : { duration: 0.52, ease: [0.16, 1, 0.3, 1] as const },
      },
    }),
    [reduceMotion],
  )

  return (
    <div className="sx-landing">
      <LandingPreloader onRevealStart={handlePreloaderRevealStart} />
      <div className="sx-ambient" aria-hidden>
        <div className="sx-ambient__orb sx-ambient__orb--1" />
        <div className="sx-ambient__orb sx-ambient__orb--2" />
      </div>

      <motion.div
        className="sx-landing__reveal"
        initial="hidden"
        animate={isLandingRevealed ? "visible" : "hidden"}
        variants={revealContainer}
      >
        <motion.div variants={revealNav} className="sx-landing__reveal-nav">
          <Navbar onNavigateSection={triggerSectionPulse} />
        </motion.div>

        <motion.main variants={revealFade} className="sx-landing__reveal-main">
          <Hero isEntranceReady={isLandingRevealed} />
          <WhatWeDoSection pulse={pulseSectionId === "solution"} />
          <WhoWeServeSection pulse={pulseSectionId === "audience"} />
          <WhatWeAreSection pulse={pulseSectionId === "identity"} />
          <Suspense fallback={<SectionFallback />}>
            <PlatformSpecialSection pulse={pulseSectionId === "platform-special"} />
          </Suspense>
          <WebinarCTA />
        </motion.main>

        <motion.div variants={revealFade} className="sx-landing__reveal-footer">
          <Footer />
        </motion.div>
      </motion.div>
    </div>
  )
}
