import { Loader2 } from "lucide-react"
import { useCallback, useEffect, useRef, type RefObject } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useNotifications } from "../hooks/useNotifications"
import type { PortalNotification } from "../types/notification.types"
import { NotificationListItem } from "./NotificationListItem"
import "./notifications-popup.css"

const POPUP_PREVIEW_LIMIT = 6
const NOTIFICATIONS_PATH = "/notifications"

interface NotificationsPopupProps {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
}

export function NotificationsPopup({
  open,
  onClose,
  anchorRef,
}: NotificationsPopupProps) {
  const navigate = useNavigate()
  const panelRef = useRef<HTMLDivElement>(null)
  const {
    notifications,
    unreadCount,
    isLoading,
    loadError,
    refresh,
    markRead,
    markAllRead,
  } = useNotifications()

  const preview = notifications.slice(0, POPUP_PREVIEW_LIMIT)

  const handleOpen = useCallback(
    (item: PortalNotification) => {
      if (!item.read) markRead(item.id)
      onClose()
      if (item.href?.trim()) navigate(item.href)
    },
    [markRead, navigate, onClose],
  )

  useEffect(() => {
    if (!open) return
    void refresh()
  }, [open, refresh])

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", onDocMouseDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  return (
    <div
      ref={panelRef}
      className="notifications_popup"
      role="dialog"
      aria-label="Notifications"
    >
      <div className="notifications_popup_head">
        <h2 className="notifications_popup_title">Notifications</h2>
        {unreadCount > 0 ? (
          <button
            type="button"
            className="notifications_popup_mark_all"
            onClick={markAllRead}
          >
            Mark all read
          </button>
        ) : null}
      </div>

      <div className="notifications_popup_body">
        {isLoading ? (
          <div className="notifications_popup_status" role="status">
            <Loader2 className="notifications_popup_spinner" size={22} aria-hidden />
            <span>Loading…</span>
          </div>
        ) : loadError ? (
          <p className="notifications_popup_status notifications_popup_status--error" role="alert">
            {loadError}
          </p>
        ) : preview.length === 0 ? (
          <p className="notifications_popup_status" role="status">
            You&apos;re all caught up — no new alerts right now.
          </p>
        ) : (
          <ul className="notifications_list notifications_list--popup">
            {preview.map((item) => (
              <NotificationListItem
                key={item.id}
                item={item}
                compact
                onOpen={handleOpen}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="notifications_popup_footer">
        <Link
          to={NOTIFICATIONS_PATH}
          className="notifications_popup_view_all"
          onClick={onClose}
        >
          View all notifications
        </Link>
      </div>
    </div>
  )
}
