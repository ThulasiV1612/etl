import { useEffect, useRef, type CSSProperties } from "react"

interface CursorGlowProps {
  className?: string
  style?: CSSProperties
}

/** Subtle spotlight that follows pointer inside hero (desktop). */
export function CursorGlow({ className = "", style }: CursorGlowProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (prefersReduced) return

    const glowEl = ref.current
    if (!glowEl) return

    const parentEl = glowEl.parentElement
    if (!parentEl) return

    function onMove(e: PointerEvent) {
      if (!glowEl || !parentEl) return
      const r = parentEl.getBoundingClientRect()
      const x = ((e.clientX - r.left) / r.width) * 100
      const y = ((e.clientY - r.top) / r.height) * 100
      glowEl.style.setProperty("--sx-glow-x", `${x}%`)
      glowEl.style.setProperty("--sx-glow-y", `${y}%`)
    }

    parentEl.addEventListener("pointermove", onMove)
    return () => parentEl.removeEventListener("pointermove", onMove)
  }, [])

  return (
    <div
      ref={ref}
      className={`sx-cursor-glow ${className}`.trim()}
      style={style}
      aria-hidden
    />
  )
}
