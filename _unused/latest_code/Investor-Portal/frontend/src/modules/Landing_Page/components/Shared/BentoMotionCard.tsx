import type { CSSProperties } from "react"
import type { LucideIcon } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"

interface BentoMotionCardProps {
  icon: LucideIcon
  title: string
  description: string
  className?: string
  style?: CSSProperties
  delay?: number
}

export function BentoMotionCard({
  icon: Icon,
  title,
  description,
  className = "",
  style,
  delay = 0,
}: BentoMotionCardProps) {
  const reduce = useReducedMotion()
  return (
    <motion.article
      className={`sx-bento sx-glass ${className}`.trim()}
      style={style}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="sx-bento__icon" aria-hidden>
        <Icon size={22} strokeWidth={1.75} />
      </div>
      <h3 className="sx-bento__title">{title}</h3>
      <p className="sx-bento__desc">{description}</p>
    </motion.article>
  )
}
