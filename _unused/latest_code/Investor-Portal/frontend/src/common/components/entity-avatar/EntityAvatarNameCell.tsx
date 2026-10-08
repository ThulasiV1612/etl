import type { ReactNode } from "react"
import { Briefcase } from "lucide-react"
import { Link } from "react-router-dom"
import { initialsFromDisplayName } from "../../utils/displayInitials"

export function AvatarInitialsRing({
  name,
  className = "",
}: {
  name: string
  className?: string
}) {
  const initials = initialsFromDisplayName(name.trim() || "?")
  return (
    <div
      className={["um_user_avatar_ring", className].filter(Boolean).join(" ")}
      aria-hidden
    >
      <span className="um_user_initials">{initials}</span>
    </div>
  )
}

/** Deal rows — Briefcase icon (matches sidebar Deals nav) instead of initials. */
export function DealAvatarIconRing({ className = "" }: { className?: string }) {
  return (
    <div
      className={["um_user_avatar_ring deals_avatar_icon_ring", className]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    >
      <Briefcase size={16} strokeWidth={2} />
    </div>
  )
}

type EntityAvatarNameCellProps = {
  displayName: string
  placeholder?: string
  linkTo?: string
  onClick?: () => void
  linkClassName?: string
  cellClassName?: string
  trailing?: ReactNode
}

export function EntityAvatarNameCell({
  displayName,
  placeholder = "—",
  linkTo,
  onClick,
  linkClassName = "um_user_meta_username",
  cellClassName = "",
  trailing,
}: EntityAvatarNameCellProps) {
  const trimmed = displayName.trim()
  const label = trimmed || placeholder
  const isPlaceholder = !trimmed

  let nameNode: ReactNode
  if (linkTo) {
    nameNode = (
      <Link
        className={`${linkClassName}${isPlaceholder ? " um_user_meta_username--placeholder" : ""}`}
        to={linkTo}
      >
        {label}
      </Link>
    )
  } else if (onClick) {
    nameNode = (
      <button
        type="button"
        className={`${linkClassName}${isPlaceholder ? " um_user_meta_username--placeholder" : ""}`}
        onClick={onClick}
      >
        {label}
      </button>
    )
  } else {
    nameNode = (
      <span
        className={`${linkClassName}${isPlaceholder ? " um_user_meta_username--placeholder" : ""}`}
      >
        {label}
      </span>
    )
  }

  return (
    <div className={["um_user_cell", cellClassName].filter(Boolean).join(" ")}>
      <AvatarInitialsRing name={trimmed || "?"} />
      <div className="um_user_meta">
        {nameNode}
        {trailing}
      </div>
    </div>
  )
}
