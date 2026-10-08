import {
  Bell,
  Briefcase,
  FileText,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"
import type { NotificationCategory, PortalNotification } from "../types/notification.types"
import { formatNotificationTime } from "../utils/formatNotificationTime"

const CATEGORY_META: Record<
  NotificationCategory,
  { label: string; icon: LucideIcon }
> = {
  deal: { label: "Deal", icon: Briefcase },
  document: { label: "Document", icon: FileText },
  investment: { label: "Investment", icon: TrendingUp },
  system: { label: "System", icon: Bell },
}

export function NotificationListItem({
  item,
  onOpen,
  compact = false,
}: {
  item: PortalNotification
  onOpen: (item: PortalNotification) => void
  compact?: boolean
}) {
  const meta = CATEGORY_META[item.category]
  const Icon = meta.icon

  return (
    <li
      className={
        item.read
          ? "notifications_item"
          : "notifications_item notifications_item--unread"
      }
    >
      <button
        type="button"
        className={`notifications_item_btn${compact ? " notifications_item_btn--compact" : ""}`}
        onClick={() => onOpen(item)}
      >
        <span
          className={`notifications_item_icon notifications_item_icon--${item.category}`}
          aria-hidden
        >
          <Icon size={compact ? 16 : 18} strokeWidth={2} />
        </span>
        <span className="notifications_item_body">
          <span className="notifications_item_top">
            <span className="notifications_item_title">{item.title}</span>
            <time className="notifications_item_time" dateTime={item.createdAt}>
              {formatNotificationTime(item.createdAt)}
            </time>
          </span>
          <span className="notifications_item_message">{item.message}</span>
          {!compact ? (
            <span className="notifications_item_category">{meta.label}</span>
          ) : null}
        </span>
        {!item.read ? (
          <span className="notifications_item_unread_dot" aria-hidden />
        ) : null}
      </button>
    </li>
  )
}
