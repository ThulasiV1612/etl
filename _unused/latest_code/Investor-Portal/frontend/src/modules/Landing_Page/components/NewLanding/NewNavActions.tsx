import { useNavigate } from "react-router-dom"
import { ArrowRight, CalendarPlus, Video } from "lucide-react"
import { scheduleDemoUrl } from "../../data/content"
import { scrollToSection } from "../../utils/helpers"

interface Files2NavActionsProps {
  /** Called after navigation (e.g. close mobile menu) */
  onAfterAction?: () => void
  className?: string
}

export function Files2NavActions({ onAfterAction, className = "" }: Files2NavActionsProps) {
  const navigate = useNavigate()
  const scheduleDemoIsHttp = scheduleDemoUrl.startsWith("http")

  const goWebinar = () => {
    scrollToSection({ sectionId: "webinar-cta" })
    onAfterAction?.()
  }

  const goSignIn = () => {
    onAfterAction?.()
    navigate("/signin")
  }

  return (
    <div className={`f2-nav-actions ${className}`.trim()}>
      <a
        href={scheduleDemoUrl}
        className="f2-nav-btn f2-nav-btn--outline"
        onClick={onAfterAction}
        {...(scheduleDemoIsHttp ? { target: "_blank", rel: "noreferrer noopener" } : {})}
      >
        <CalendarPlus size={18} strokeWidth={2} aria-hidden />
        Schedule a demo
      </a>
      <button type="button" className="f2-nav-btn f2-nav-btn--outline" onClick={goWebinar}>
        <Video size={18} strokeWidth={2} aria-hidden />
        Webinar
      </button>
      <button type="button" className="f2-nav-btn f2-nav-btn--primary" onClick={goSignIn}>
        <span>Start Raising & Investing</span>
        <ArrowRight className="f2-nav-btn__arrow" size={18} strokeWidth={2} aria-hidden />
      </button>
    </div>
  )
}
