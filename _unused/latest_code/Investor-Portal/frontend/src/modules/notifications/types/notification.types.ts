export type NotificationCategory =
  | "deal"
  | "document"
  | "investment"
  | "system"

export interface PortalNotification {
  id: string
  title: string
  message: string
  category: NotificationCategory
  createdAt: string
  read: boolean
  href?: string
}
