import { Bell, Inbox, Loader2 } from "lucide-react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useNotifications } from "../hooks/useNotifications"
import type { PortalNotification } from "../types/notification.types"
import { NotificationListItem } from "../components/NotificationListItem"
import "@/modules/Syndication/usermanagement/user_management.css"
import "./notifications-page.css"

type NotificationsFilter = "all" | "unread"

export function NotificationsPage() {
  const navigate = useNavigate()
  const {
    notifications,
    unreadCount,
    isLoading,
    loadError,
    refresh,
    markRead,
    markAllRead,
  } = useNotifications()
  const [filter, setFilter] = useState<NotificationsFilter>("all")

  const visible = useMemo(() => {
    const sorted = [...notifications].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    if (filter === "unread") return sorted.filter((n) => !n.read)
    return sorted
  }, [notifications, filter])

  function handleOpen(item: PortalNotification) {
    if (!item.read) markRead(item.id)
    if (item.href?.trim()) navigate(item.href)
  }

  return (
    <section
      className="um_page notifications_page"
      aria-labelledby="notifications-page-title"
    >
      <div className="um_members_header_block notifications_page_header">
        <div className="um_header_row notifications_page_header_row">
          <h2 className="um_title um_title_with_icon" id="notifications-page-title">
            <Bell
              className="um_title_icon"
              size={26}
              strokeWidth={1.75}
              aria-hidden
            />
            Notifications
          </h2>
          <div className="notifications_page_header_actions">
            <button
              type="button"
              className="notifications_refresh_btn"
              onClick={() => void refresh()}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="notifications_refresh_spinner" size={16} aria-hidden />
              ) : null}
              Refresh
            </button>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="notifications_mark_all_btn"
                onClick={markAllRead}
              >
                Mark all as read
              </button>
            ) : null}
          </div>
        </div>
        <p className="notifications_page_lead">
          Alerts from your deals — e-signatures, fund approvals, and investment updates.
        </p>
      </div>

      <div
        className="um_members_tabs_outer deals_tabs_outer um_segmented_tabs_outer notifications_page_tabs_outer"
        role="presentation"
      >
        <div
          className="um_members_tabs_row deals_tabs_row um_segmented_tabs_row"
          role="tablist"
          aria-label="Notification filters"
        >
          <button
            type="button"
            role="tab"
            aria-selected={filter === "all"}
            className={`um_members_tab deals_tabs_tab um_segmented_tab${
              filter === "all" ? " um_members_tab_active" : ""
            }`}
            onClick={() => setFilter("all")}
          >
            All
            <span className="notifications_tab_count">{notifications.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "unread"}
            className={`um_members_tab deals_tabs_tab um_segmented_tab${
              filter === "unread" ? " um_members_tab_active" : ""
            }`}
            onClick={() => setFilter("unread")}
          >
            Unread
            {unreadCount > 0 ? (
              <span className="notifications_tab_count notifications_tab_count--accent">
                {unreadCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      <div className="notifications_page_panel">
        {isLoading && notifications.length === 0 ? (
          <div className="notifications_empty" role="status">
            <Loader2 className="notifications_refresh_spinner" size={32} aria-hidden />
            <p className="notifications_empty_title">Loading notifications…</p>
          </div>
        ) : loadError && notifications.length === 0 ? (
          <div className="notifications_empty" role="alert">
            <p className="notifications_empty_title">{loadError}</p>
            <button
              type="button"
              className="notifications_empty_link_btn"
              onClick={() => void refresh()}
            >
              Try again
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="notifications_empty" role="status">
            <Inbox size={40} strokeWidth={1.5} aria-hidden />
            <p className="notifications_empty_title">
              {filter === "unread" ? "You're all caught up" : "No notifications right now"}
            </p>
            <p className="notifications_empty_hint">
              {filter === "unread"
                ? "Unread alerts appear when you have documents to sign or investments awaiting approval."
                : "When something needs your attention on a deal, it will show up here."}
            </p>
            {filter === "unread" ? (
              <button
                type="button"
                className="notifications_empty_link_btn"
                onClick={() => setFilter("all")}
              >
                View all
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="notifications_list">
            {visible.map((item) => (
              <NotificationListItem key={item.id} item={item} onOpen={handleOpen} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
