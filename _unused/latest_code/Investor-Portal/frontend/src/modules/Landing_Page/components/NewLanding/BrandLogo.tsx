interface BrandLogoProps {
  /** Large gradient mark on the preloader */
  variant?: "preloader" | "icon"
  /** Show “SyndicationX” next to the icon (navbar / footer) */
  showWordmark?: boolean
}

export function BrandLogo({ variant = "icon", showWordmark = false }: BrandLogoProps) {
  if (variant === "preloader") {
    return (
      <span className="pre-x" aria-hidden>
        SX
      </span>
    )
  }

  return (
    <>
      <div className="brand-icon" aria-hidden>
        SX
      </div>
      {showWordmark ? <span>SyndicationX</span> : null}
    </>
  )
}
