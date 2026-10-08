import { useMemo, useState } from "react";
import {
  ArrowRight,
  LockKeyhole,
  Eye,
  EyeOff,
  Mail,
  CheckCircle,
  CircleAlert,
  Loader2,
} from "lucide-react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import FooterForm from "../../../common/components/FooterForm";
import Input from "../../../common/components/Input";
import { getApiV1Base } from "../../../common/utils/apiBaseUrl";
import "./reset_password_form.css";
import { decodeJwtPayload } from "../utils/decode-jwt-payload";

interface ResetTokenPayload extends Record<string, unknown> {
  email?: string;
  purpose?: string;
  exp?: number;
}

const SIGNIN_PATH = "/signin";

export default function ResetPasswordForm() {
  const apiV1 = getApiV1Base();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const decodedToken = useMemo(() => {
    if (!token) return null;
    return decodeJwtPayload<ResetTokenPayload>(token);
  }, [token]);

  const isTokenExpired =
    decodedToken?.exp != null && decodedToken.exp < Date.now() / 1000;

  const emailFromToken = decodedToken?.email ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [isVisibleConfirm, setIsVisibleConfirm] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  function passwordVisible() {
    setIsVisible((prev) => !prev);
  }

  function confirmPasswordVisible() {
    setIsVisibleConfirm((prev) => !prev);
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!token || !decodedToken || isTokenExpired) {
      setMessage("Invalid or expired reset link.");
      setStatus("error");
      return;
    }
    if (!apiV1) {
      setMessage("API base URL is not configured (VITE_BASE_URL).");
      setStatus("error");
      return;
    }

    if (newPassword.length < 8) {
      setMessage("Password must be at least 8 characters.");
      setStatus("error");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch(`${apiV1}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          newPassword,
          email: (emailFromToken ?? "").toString().trim().toLowerCase(),
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setStatus("success");
        setMessage(data.message || "Password reset successfully.");
        setTimeout(() => {
          navigate(SIGNIN_PATH, { state: { resetSuccess: true } });
        }, 2000);
      } else {
        setStatus("error");
        setMessage(data.message || "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Unable to connect. Please try again later.");
    }
  };

  const linkInvalid = !token || !decodedToken || isTokenExpired;

  if (linkInvalid) {
    return (
      <>
        <div
          className="authMessage authMessage--error"
          style={{ marginTop: "0.5em", marginBottom: 0 }}
        >
          <CircleAlert className="authMessage__icon" size={16} aria-hidden />
          <p className="orgError">
            Invalid or expired reset link. Please use the link from your email
            or{" "}
            <Link to="/forgotPassword" className="redirecting_links">
              request a new one
            </Link>
            .
          </p>
        </div>
        <div className="loginBtn">
          <Link to={SIGNIN_PATH} className="login-btn">
            Back to sign in
          </Link>
        </div>
        <div className="auth_help companyContent">
          <FooterForm />
        </div>
      </>
    );
  }

  const passwordSuffix = (visible: boolean, toggle: () => void) => (
    <span
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
      className="passwordVisible"
      role="button"
      tabIndex={0}
      aria-label={visible ? "Hide password" : "Show password"}
    >
      {visible ? (
        <Eye size={20} strokeWidth={1.5} aria-hidden />
      ) : (
        <EyeOff size={20} strokeWidth={1.5} aria-hidden />
      )}
    </span>
  );

  const isBusy = status === "loading" || status === "success";
  const submitDisabled =
    isBusy ||
    !newPassword.trim() ||
    !confirmPassword.trim() ||
    newPassword.length < 8;

  return (
    <>
      <form onSubmit={handleSubmit} autoComplete="off">
        <div className="emailData">
          <Input
            labelName="Account email (from reset link)"
            id="resetEmail"
            icon={<Mail width={20} strokeWidth={1.5} aria-hidden />}
            type="email"
            name="email"
            value={emailFromToken}
            readOnly
            inputClassName="resetMail readOnlyField"
          />
        </div>

        <div className="passwordData">
          <Input
            labelName="New password"
            id="newPassword"
            icon={<LockKeyhole width={20} strokeWidth={1.5} aria-hidden />}
            type={isVisible ? "text" : "password"}
            name="newPassword"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
            minLength={8}
            maxLength={128}
            disabled={isBusy}
            required
            suffix={passwordSuffix(isVisible, passwordVisible)}
          />
        </div>

        <div className="passwordData">
          <Input
            labelName="Confirm password"
            id="confirmPassword"
            icon={<LockKeyhole width={20} strokeWidth={1.5} aria-hidden />}
            type={isVisibleConfirm ? "text" : "password"}
            name="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            maxLength={128}
            disabled={isBusy}
            required
            suffix={passwordSuffix(isVisibleConfirm, confirmPasswordVisible)}
          />
        </div>

        {message ? (
          <div
            className={
              status === "success"
                ? "authMessage authMessage--success"
                : "authMessage authMessage--error"
            }
          >
            {status === "success" ? (
              <CheckCircle className="authMessage__icon" size={16} aria-hidden />
            ) : (
              <CircleAlert className="authMessage__icon" size={16} aria-hidden />
            )}
            <p className={status === "success" ? "loginSuccess" : "orgError"}>
              {message}
            </p>
          </div>
        ) : null}

        <div className="loginBtn">
          <button
            type="submit"
            className={`login-btn ${submitDisabled ? "disabled_css" : ""} ${status === "loading" ? "auth_btn_loading" : ""}`}
            disabled={submitDisabled}
            aria-busy={status === "loading"}
          >
            {status === "loading" ? (
              <>
                Resetting…
                <Loader2 className="auth_spinner" size={20} aria-hidden />
              </>
            ) : (
              <>
                Reset password <ArrowRight width={20} aria-hidden />
              </>
            )}
          </button>
        </div>

        <p className="auth_footer_links">
          Remember your password? <Link to="/signin">Sign in</Link>
        </p>

        <div className="auth_help companyContent">
          <FooterForm />
        </div>
      </form>
    </>
  );
}
