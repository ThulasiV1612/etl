import { Megaphone } from "lucide-react"
import "./deal-announcement-banner.css"

export type DealAnnouncementBannerProps = {
  title?: string | null
  message?: string | null
  /** Extra class on the root (e.g. page layout hooks). */
  className?: string
  /** Tighter spacing when embedded in offering preview columns. */
  variant?: "page" | "preview"
}

/** Published deal announcement shown at the top of deal detail / offering preview. */
export function DealAnnouncementBanner({
  title,
  message,
  className = "",
  variant = "page",
}: DealAnnouncementBannerProps) {
  const trimmedTitle = title?.trim() ?? ""
  const trimmedMessage = message?.trim() ?? ""
  if (!trimmedTitle && !trimmedMessage) return null

  const rootClass = [
    "deal_announcement_banner",
    variant === "preview"
      ? "deal_announcement_banner--preview"
      : "deal_announcement_banner--page",
    className,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className={rootClass} role="region" aria-label="Deal announcement">
      <div className="deal_announcement_banner_icon_wrap" aria-hidden>
        <Megaphone size={variant === "page" ? 16 : 17} strokeWidth={2} />
      </div>
      <div className="deal_announcement_banner_content">
        <div className="deal_announcement_banner_head">
          <span className="deal_announcement_banner_eyebrow">Announcement</span>
          {trimmedTitle ? (
            <p className="deal_announcement_banner_title">{trimmedTitle}</p>
          ) : null}
        </div>
        {trimmedMessage ? (
          <p className="deal_announcement_banner_message">{trimmedMessage}</p>
        ) : null}
      </div>
    </div>
  )
}
