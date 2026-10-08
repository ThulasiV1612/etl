import { ArrowRight, Building2, CircleAlert, Loader2, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthLayout from "../../../common/layout/AuthLayout";
import {
  AUTH_RETURN_NEXT_KEY,
  SESSION_BEARER_KEY,
} from "../../../common/auth/sessionKeys";
import { parseSafeNextPath } from "../../../common/auth/parseSafeNextPath";
import { getApiV1Base } from "../../../common/utils/apiBaseUrl";
import "../components/signup_form.css";
import "./deal-invite.css";

type VerifyOk = {
  valid: true;
  email: string;
  companyName: string;
  dealId: string;
  accountExists?: boolean;
};

export default function DealInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token")?.trim() ?? "";
  const nextPath = parseSafeNextPath(searchParams.get("next"));
  const isEsignNext = Boolean(nextPath?.includes("/esign"));
  const api = getApiV1Base();

  const [phase, setPhase] = useState<"loading" | "invalid" | "ready">(
    "loading",
  );
  const [ctx, setCtx] = useState<VerifyOk | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token || !api) {
      setPhase("invalid");
      setMessage(
        !api
          ? "Portal is not configured (missing API URL)."
          : "Missing invitation token.",
      );
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `${api}/auth/deal-invite/verify?token=${encodeURIComponent(token)}`,
        );
        const data = (await res.json().catch(() => ({}))) as {
          valid?: boolean;
          email?: string;
          companyName?: string;
          dealId?: string;
          accountExists?: boolean;
          message?: string;
        };
        if (cancelled) return;
        if (!data.valid || !data.dealId || !data.email) {
          setPhase("invalid");
          setMessage(
            typeof data.message === "string" && data.message.trim()
              ? data.message
              : "This invitation link is invalid or has expired.",
          );
          return;
        }
        setCtx({
          valid: true,
          email: data.email,
          companyName: String(data.companyName ?? "").trim() || "—",
          dealId: data.dealId,
          accountExists: Boolean(data.accountExists),
        });
        setPhase("ready");
      } catch {
        if (!cancelled) {
          setPhase("invalid");
          setMessage("Could not validate this link. Try again later.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, api]);

  useEffect(() => {
    if (phase !== "ready" || !ctx) return;
    const session = sessionStorage.getItem(SESSION_BEARER_KEY);
    if (session) {
      const dest =
        nextPath ?? `/deals/${encodeURIComponent(ctx.dealId)}`;
      navigate(dest, { replace: true });
    }
  }, [phase, ctx, navigate, nextPath]);

  if (phase === "loading") {
    return (
      <AuthLayout
        title="Investor Portal | Invitation"
        caption="Checking your invitation link"
      >
        <div className="deal_invite_shell">
          <Loader2 className="deal_invite_spin" size={28} aria-hidden />
          <p className="deal_invite_muted">Checking your invitation…</p>
        </div>
      </AuthLayout>
    );
  }

  if (phase === "invalid") {
    return (
      <AuthLayout
        title="Investor Portal | Invitation"
        caption="We could not open this invitation"
      >
        <div className="deal_invite_shell deal_invite_panel">
          <CircleAlert
            className="deal_invite_icon_warn"
            size={36}
            aria-hidden
          />
          <h1 className="deal_invite_title">Invitation unavailable</h1>
          <p className="deal_invite_body">{message}</p>
          <Link
            to={
              nextPath
                ? `/signin?next=${encodeURIComponent(nextPath)}`
                : "/signin"
            }
            className="deal_invite_btn_primary"
          >
            Sign in <ArrowRight size={18} aria-hidden />
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (!ctx) return null;

  const signupHref = `/signup/${encodeURIComponent(token)}`;
  const afterAuthPath =
    nextPath ?? `/deals/${encodeURIComponent(ctx.dealId)}`;
  const signinTo =
    nextPath != null
      ? `/signin?next=${encodeURIComponent(nextPath)}`
      : "/signin";
  const signinState = { from: afterAuthPath };
  if (nextPath) {
    sessionStorage.setItem(AUTH_RETURN_NEXT_KEY, nextPath);
  }
  const accountExists = Boolean(ctx.accountExists);

  return (
    <AuthLayout
      title="Investor Portal | Invitation"
      caption={
        isEsignNext
          ? "Sign your deal documents"
          : accountExists
            ? "Sign in to continue"
            : "Complete access to your deal"
      }
    >
      <div className="deal_invite_shell deal_invite_panel">
        <p className="deal_invite_kicker">
          {isEsignNext ? "eSign documents" : "Deal invitation"}
        </p>
        <h1 className="deal_invite_title">
          {isEsignNext
            ? accountExists
              ? "Sign in to complete your documents"
              : "Create an account to sign your documents"
            : accountExists
              ? "Sign in to open this deal"
              : "You need an account to open this deal"}
        </h1>
        <p className="deal_invite_body">
          {isEsignNext
            ? accountExists
              ? "Your eSign documents are ready. Sign in with the email below, then you can review and sign in the portal."
              : "Your eSign documents are ready. Create an account with the email below (or sign in if you already have one), then complete signing in the portal."
            : accountExists
              ? "You already have a SyndicationX account for this email. You’ve been added to a new deal — sign in below to open it and continue."
              : "No account was found for this invitation. Create one with the email below, or sign in if you already use the portal."}
        </p>

        <div className="deal_invite_summary">
          <div className="deal_invite_summary_row">
            <Mail size={18} aria-hidden />
            <span>{ctx.email}</span>
          </div>
          <div className="deal_invite_summary_row">
            <Building2 size={18} aria-hidden />
            <span>{ctx.companyName}</span>
          </div>
        </div>

        <div className="deal_invite_actions">
          {!accountExists ? (
            <Link to={signupHref} className="deal_invite_btn_primary">
              Sign up <ArrowRight size={18} aria-hidden />
            </Link>
          ) : null}
          <Link
            to={signinTo}
            state={signinState}
            className={accountExists ? "deal_invite_btn_primary" : "deal_invite_btn_secondary"}
          >
            {isEsignNext
              ? "Sign in to sign"
              : accountExists
                ? "Sign in to open deal"
                : "Sign in"}
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
