import type { ReactNode } from "react"

export interface InvestNowStepLayoutProps {
  titleId: string
  title: string
  hint?: string
  error?: string
  children: ReactNode
}

export function InvestNowStepLayout({
  titleId,
  title,
  hint,
  error,
  children,
}: InvestNowStepLayoutProps) {
  return (
    <section
      className="deals_create_card invest_now_step_card"
      aria-labelledby={titleId}
    >
      <h2
        id={titleId}
        className="deals_create_section_title deals_create_step_card_title"
      >
        {title}
      </h2>
      {hint ? <p className="deals_create_hint">{hint}</p> : null}
      {error ? (
        <p className="deals_create_field_error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="deals_create_fields">{children}</div>
    </section>
  )
}
