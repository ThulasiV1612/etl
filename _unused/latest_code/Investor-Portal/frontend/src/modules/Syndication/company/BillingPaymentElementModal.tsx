import { useEffect, useState, type FormEvent } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { CreditCard, LockKeyhole, ShieldCheck, X } from "lucide-react";
import {
  resolveStripePublishableKey,
  syncCompanyBillingPayment,
  syncCompanyBillingPaymentMethods,
} from "./companyBillingApi";

export type BillingPaymentModalMode = "subscription" | "setup";

type BillingPaymentElementModalProps = {
  open: boolean;
  mode: BillingPaymentModalMode;
  companyId: string;
  clientSecret: string;
  publishableKeyHint?: string | null;
  subscriptionId?: string | null;
  title: string;
  subtitle?: string;
  submitLabel?: string;
  onClose: () => void;
  onSuccess: () => void;
};

let stripePromiseCache: {
  key: string;
  promise: Promise<Stripe | null>;
} | null = null;

function getStripePromise(publishableKey: string): Promise<Stripe | null> {
  if (stripePromiseCache?.key === publishableKey) {
    return stripePromiseCache.promise;
  }
  const promise = loadStripe(publishableKey);
  stripePromiseCache = { key: publishableKey, promise };
  return promise;
}

function PaymentForm({
  mode,
  companyId,
  subscriptionId,
  submitLabel,
  onClose,
  onSuccess,
}: {
  mode: BillingPaymentModalMode;
  companyId: string;
  subscriptionId?: string | null;
  submitLabel: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const returnUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.set(
      "billing",
      mode === "setup" ? "setup_return" : "payment_return",
    );
    if (subscriptionId) {
      url.searchParams.set("subscription_id", subscriptionId);
    }
    return url.toString();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!stripe || !elements) return;

    setSubmitting(true);
    try {
      if (mode === "setup") {
        const { error: confirmError, setupIntent } =
          await stripe.confirmSetup({
            elements,
            confirmParams: { return_url: returnUrl() },
            redirect: "if_required",
          });
        if (confirmError) {
          setError(confirmError.message || "Could not save payment method.");
          setSubmitting(false);
          return;
        }
        if (
          setupIntent?.status === "succeeded" ||
          setupIntent?.status === "processing"
        ) {
          await syncCompanyBillingPaymentMethods(companyId);
          onSuccess();
          return;
        }
        setInfo(
          "Additional verification may be required. Complete the bank verification if prompted.",
        );
        setSubmitting(false);
        return;
      }

      const { error: confirmError, paymentIntent } =
        await stripe.confirmPayment({
          elements,
          confirmParams: { return_url: returnUrl() },
          redirect: "if_required",
        });

      if (confirmError) {
        setError(confirmError.message || "Payment failed.");
        setSubmitting(false);
        return;
      }

      const status = paymentIntent?.status;
      if (status === "succeeded" || status === "processing") {
        await syncCompanyBillingPayment(companyId, {
          subscriptionId: subscriptionId || undefined,
          paymentIntentId: paymentIntent?.id,
        });
        if (status === "processing") {
          setInfo(
            "Bank payment is processing. ACH usually settles in a few business days. Your subscription will activate when Stripe confirms the payment.",
          );
        }
        onSuccess();
        return;
      }

      setInfo(
        `Payment status: ${status ?? "unknown"}. If you used a bank account, verification may still be in progress.`,
      );
      setSubmitting(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unexpected payment error.",
      );
      setSubmitting(false);
    }
  };

  return (
    <form className="cp_billing_pe_form" onSubmit={(e) => void handleSubmit(e)}>
      <div className="cp_billing_pe_element">
        <PaymentElement
          options={{
            layout: "tabs",
          }}
        />
      </div>
      {error ? (
        <p className="cp_billing_pe_error" role="alert">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="cp_billing_pe_info" role="status">
          {info}
        </p>
      ) : null}
      <div className="cp_billing_pe_security">
        <span className="cp_billing_pe_security_icon" aria-hidden="true">
          <ShieldCheck size={18} />
        </span>
        <span>
          <strong>Secure payment</strong>
          <small>
            Card payments confirm instantly. ACH bank payments can take a few
            business days to settle.
          </small>
        </span>
      </div>
      <div className="um_modal_actions cp_billing_pe_actions">
        <button
          type="button"
          className="um_btn_secondary"
          onClick={onClose}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={
            mode === "subscription"
              ? "um_btn_primary cp_billing_pay_btn"
              : "um_btn_primary"
          }
          disabled={!stripe || !elements || submitting}
        >
          <LockKeyhole size={15} aria-hidden="true" />
          {submitting ? "Processing…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

export function BillingPaymentElementModal({
  open,
  mode,
  companyId,
  clientSecret,
  publishableKeyHint,
  subscriptionId,
  title,
  subtitle,
  submitLabel,
  onClose,
  onSuccess,
}: BillingPaymentElementModalProps) {
  const [stripePromise, setStripePromise] =
    useState<Promise<Stripe | null> | null>(null);
  const [loadError, setLoadError] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(
    () => document.documentElement.dataset.theme === "dark",
  );

  useEffect(() => {
    if (!open || !clientSecret) return;
    let cancelled = false;
    setLoadError("");
    void (async () => {
      const key = await resolveStripePublishableKey(publishableKeyHint);
      if (cancelled) return;
      if (!key) {
        setLoadError(
          "Stripe publishable key is missing. Set VITE_STRIPE_PUBLISHABLE_KEY or STRIPE_PUBLISHABLE_KEY.",
        );
        setStripePromise(null);
        return;
      }
      setStripePromise(getStripePromise(key));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, clientSecret, publishableKeyHint]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setIsDarkMode(root.dataset.theme === "dark");
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  if (!open) return null;

  return (
    <div
      className="um_modal_overlay cp_billing_pe_overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="um_modal um_modal_view cp_billing_pe_modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cp-billing-pe-title"
      >
        <div className="um_modal_head cp_billing_pe_head">
          <div className="cp_billing_pe_heading">
            <span className="cp_billing_pe_title_icon" aria-hidden="true">
              <CreditCard size={21} />
            </span>
            <div>
              <h3 id="cp-billing-pe-title" className="um_modal_title">
                {title}
              </h3>
              {subtitle ? (
                <p className="cp_billing_pe_subtitle">{subtitle}</p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="um_modal_close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        {loadError ? (
          <p className="cp_billing_pe_error" role="alert">
            {loadError}
          </p>
        ) : null}
        {stripePromise && clientSecret ? (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: isDarkMode ? "night" : "stripe",
                variables: {
                  colorPrimary: "#155abf",
                  colorText: isDarkMode ? "#f8fafc" : "#0f172a",
                  colorTextSecondary: isDarkMode ? "#94a3b8" : "#64748b",
                  colorBackground: isDarkMode ? "#182231" : "#ffffff",
                  colorDanger: "#b91c1c",
                  borderRadius: "10px",
                  fontFamily:
                    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  spacingUnit: "4px",
                },
                rules: {
                  ".Tab": {
                    border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}`,
                    boxShadow: "none",
                  },
                  ".Tab:hover": {
                    borderColor: isDarkMode ? "#64748b" : "#94a3b8",
                  },
                  ".Tab--selected": {
                    borderColor: "#155abf",
                    boxShadow: "0 0 0 1px #155abf",
                  },
                  ".Input": {
                    border: `1px solid ${isDarkMode ? "#475569" : "#cbd5e1"}`,
                    boxShadow: "none",
                  },
                  ".Input:focus": {
                    borderColor: "#155abf",
                    boxShadow: "0 0 0 3px rgba(21, 90, 191, 0.12)",
                  },
                },
              },
            }}
          >
            <PaymentForm
              mode={mode}
              companyId={companyId}
              subscriptionId={subscriptionId}
              submitLabel={
                submitLabel ??
                (mode === "setup" ? "Save payment method" : "Pay now")
              }
              onClose={onClose}
              onSuccess={onSuccess}
            />
          </Elements>
        ) : !loadError ? (
          <div className="cp_billing_pe_loading" role="status">
            <span aria-hidden="true" />
            Loading secure payment form…
          </div>
        ) : null}
      </div>
    </div>
  );
}
