import type { LucideIcon } from "lucide-react"
import * as LucideIcons from "lucide-react"

interface ScrollToSectionParams {
  sectionId: string
  onHighlight?: (sectionId: string) => void
}

export function scrollToSection({
  sectionId,
  onHighlight,
}: ScrollToSectionParams): void {
  const el = document.getElementById(sectionId)
  if (!el) return

  const landingRoot = document.querySelector(".files2-landing")
  if (landingRoot) {
    landingRoot.dispatchEvent(
      new CustomEvent("files2:scroll-to", { detail: { sectionId } }),
    )
  } else {
    el.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  onHighlight?.(sectionId)
}

export function resolveLucideIcon(iconName: string): LucideIcon {
  const map = LucideIcons as unknown as Record<string, LucideIcon | undefined>
  const Icon = map[iconName]
  if (Icon) return Icon
  return LucideIcons.Sparkles
}

interface ObserveSectionsParams {
  sectionIds: string[]
  onChange: (activeId: string) => void
  rootMargin?: string
}

export function observeSections({
  sectionIds,
  onChange,
  rootMargin = `-${Math.round(92 + 8)}px 0px -55% 0px`,
}: ObserveSectionsParams): () => void {
  const elements = sectionIds
    .map((id) => document.getElementById(id))
    .filter((n): n is HTMLElement => Boolean(n))

  if (!elements.length) return () => {}

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
      const top = visible[0]
      if (top?.target?.id) onChange(top.target.id)
    },
    { root: null, rootMargin, threshold: [0.08, 0.18, 0.35] },
  )

  for (const el of elements) observer.observe(el)
  return () => observer.disconnect()
}
