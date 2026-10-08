import {
  ArrowLeft,
  ChevronRight,
  CircleCheck,
  Loader2,
  RotateCcw,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react"
import type { ButtonHTMLAttributes, ReactNode } from "react"

type ModalButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean
  busyLabel?: string
}

export function ModalFooterActions({
  className = "",
  children,
}: {
  className?: string
  children: ReactNode
}) {
  const classes = ["um_modal_actions", "add_contact_modal_actions", className]
    .filter(Boolean)
    .join(" ")
  return <div className={classes}>{children}</div>
}

export function ModalFooterTrailing({ children }: { children: ReactNode }) {
  return <div className="add_contact_modal_actions_trailing">{children}</div>
}

export function ModalCancelButton({
  children = "Close",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="um_btn_secondary" {...rest}>
      <X size={16} strokeWidth={2} aria-hidden />
      {children}
    </button>
  )
}

export function ModalSaveButton({
  children = "Save",
  busy = false,
  busyLabel = "Saving…",
  type = "button",
  className = "um_btn_primary",
  ...rest
}: ModalButtonProps) {
  return (
    <button type={type} className={className} {...rest}>
      {busy ? (
        <>
          <Loader2 size={16} strokeWidth={2} aria-hidden />
          {busyLabel}
        </>
      ) : (
        <>
          <Save size={16} strokeWidth={2} aria-hidden />
          {children}
        </>
      )}
    </button>
  )
}

export function ModalSendButton({
  children = "Send",
  busy = false,
  busyLabel = "Sending…",
  type = "button",
  className = "um_btn_primary",
  ...rest
}: ModalButtonProps) {
  return (
    <button type={type} className={className} {...rest}>
      {busy ? (
        <>
          <Loader2 size={16} strokeWidth={2} aria-hidden />
          {busyLabel}
        </>
      ) : (
        <>
          <Send size={16} strokeWidth={2} aria-hidden />
          {children}
        </>
      )}
    </button>
  )
}

export function ModalOkButton({
  children = "OK",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="um_btn_primary" {...rest}>
      <CircleCheck size={16} strokeWidth={2} aria-hidden />
      {children}
    </button>
  )
}

export function ModalBackButton({
  children = "Back",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="um_btn_secondary" {...rest}>
      <ArrowLeft size={16} strokeWidth={2} aria-hidden />
      {children}
    </button>
  )
}

export function ModalResetButton({
  children = "Reset",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="um_btn_secondary" {...rest}>
      <RotateCcw size={17} strokeWidth={2} aria-hidden />
      {children}
    </button>
  )
}

export function ModalNextButton({
  children = "Next",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="um_btn_primary" {...rest}>
      {children}
      <ChevronRight size={18} strokeWidth={2} aria-hidden />
    </button>
  )
}

export function ModalCloseButton({
  children = "Close",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="um_btn_primary" {...rest}>
      <X size={16} strokeWidth={2} aria-hidden />
      {children}
    </button>
  )
}

export function ModalDeleteButton({
  children = "Delete",
  busy = false,
  busyLabel = "Deleting…",
  type = "button",
  className = "um_btn_primary deal_member_delete_confirm_btn",
  ...rest
}: ModalButtonProps) {
  return (
    <button type={type} className={className} {...rest}>
      {busy ? (
        <>
          <Loader2 size={16} strokeWidth={2} aria-hidden />
          {busyLabel}
        </>
      ) : (
        <>
          <Trash2 size={16} strokeWidth={2} aria-hidden />
          {children}
        </>
      )}
    </button>
  )
}
