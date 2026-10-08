import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Check, TriangleAlert, X } from "lucide-react";
import {
  dismissToast,
  getToastSnapshot,
  subscribeToasts,
  type ToastRecord,
} from "./toastStore";
import "./toast.css";

function ToastItem({ t }: { t: ToastRecord }) {
  const isSuccess = t.variant === "success";
  const isWarning = t.variant === "warning";
  const variantClass = isSuccess
    ? "toast_pill--success"
    : isWarning
      ? "toast_pill--warning"
      : "toast_pill--error";
  const iconClass = isSuccess
    ? "toast_pill_icon--success"
    : isWarning
      ? "toast_pill_icon--warning"
      : "toast_pill_icon--error";

  return (
    <div
      className={`toast_pill ${variantClass}`}
      role="alert"
      aria-live={isSuccess ? "polite" : "assertive"}
    >
      <div className={`toast_pill_icon ${iconClass}`} aria-hidden>
        {isSuccess ? (
          <Check size={18} strokeWidth={2.5} />
        ) : isWarning ? (
          <TriangleAlert size={18} strokeWidth={2.5} />
        ) : (
          <X size={18} strokeWidth={2.5} />
        )}
      </div>
      <div className="toast_pill_body">
        <div className="toast_pill_title">{t.title}</div>
        {t.description ? (
          <div className="toast_pill_desc">{t.description}</div>
        ) : null}
      </div>
      <button
        type="button"
        className="toast_pill_close"
        aria-label="Dismiss"
        onClick={() => dismissToast(t.id)}
      >
        <X size={16} strokeWidth={2} aria-hidden />
      </button>
      <div
        className="toast_pill_timer"
        style={{ animationDuration: `${t.duration}ms` }}
        aria-hidden
      />
    </div>
  );
}

export default function ToastHost() {
  const list = useSyncExternalStore(
    subscribeToasts,
    getToastSnapshot,
    () => [],
  );

  if (typeof document === "undefined" || list.length === 0) {
    return null;
  }

  const topCenter = list.filter((t) => t.placement === "top-center");
  const bottomRight = list.filter((t) => t.placement === "bottom-right");

  return createPortal(
    <>
      {topCenter.length > 0 ? (
        <div className="toast_viewport toast_viewport--top-center">
          {topCenter.map((t) => (
            <ToastItem key={t.id} t={t} />
          ))}
        </div>
      ) : null}
      {bottomRight.length > 0 ? (
        <div className="toast_viewport toast_viewport--bottom-right">
          {bottomRight.map((t) => (
            <ToastItem key={t.id} t={t} />
          ))}
        </div>
      ) : null}
    </>,
    document.body,
  );
}
