import { Loader2 } from "lucide-react"
import "./portal-switch-loader.css"

interface PortalSwitchLoaderProps {
  caption: string
}

export function PortalSwitchLoader({ caption }: PortalSwitchLoaderProps) {
  return (
    <div
      className="portal_switch_overlay"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="portal_switch_card">
        <Loader2
          className="portal_switch_spinner"
          size={36}
          strokeWidth={2.25}
          aria-hidden
        />
        <p className="portal_switch_caption">{caption}</p>
      </div>
    </div>
  )
}
