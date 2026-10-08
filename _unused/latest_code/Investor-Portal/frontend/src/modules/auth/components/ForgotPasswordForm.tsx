import { useState } from "react";
import {
  Mail,
  ArrowRight,
  CheckCircle,
  CircleAlert,
  Loader2,
} from "lucide-react";
import { Link } from "react-router-dom";
import FooterForm from "../../../common/components/FooterForm";
import Input from "../../../common/components/Input";
import { getApiV1Base } from "../../../common/utils/apiBaseUrl";
import "./forgot_password_form.css";

const ForgotPasswordForm = () => {
  const apiV1 = getApiV1Base();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim()) {
      setStatus("error");
      setMessage("Please enter your email address.");
      return;
    }
    if (!apiV1) {
      setStatus("error");
      setMessage("API base URL is not configured (VITE_BASE_URL).");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch(`${apiV1}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setStatus("success");
        setMessage(
          data.message ||
            "If an account exists with this email, you will receive a password reset link shortly.",
        );
      } else {
        setStatus("error");
        setMessage(data.message || "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Unable to connect. Please try again later.");
    }
  };

  const isDisabled = !email.trim() || status === "loading";

  return (
    <>
      <form onSubmit={handleSubmit} autoComplete="off">
        <div className="emailData">
          <Input
            labelName="Email"
            id="forgotEmail"
            icon={<Mail width={20} strokeWidth={1.5} aria-hidden />}
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="johndoe@domain.com"
            required
            disabled={status === "loading"}
            aria-invalid={status === "error" && !!message}
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
            className={`login-btn ${isDisabled ? "disabled_css" : ""} ${status === "loading" ? "auth_btn_loading" : ""}`}
            disabled={isDisabled}
            aria-busy={status === "loading"}
          >
            {status === "loading" ? (
              <>
                Sending…
                <Loader2 className="auth_spinner" size={20} aria-hidden />
              </>
            ) : (
              <>
                Submit <ArrowRight width={20} aria-hidden />
              </>
            )}
          </button>
        </div>

        <p className="auth_footer_links">
          Back to <Link to="/signin">Sign in</Link>
        </p>

        <div className="auth_help companyContent">
          <FooterForm />
        </div>
      </form>
    </>
  );
};

export default ForgotPasswordForm;
