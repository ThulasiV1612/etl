import AuthLayout from "../../../common/layout/AuthLayout";
import ForgotPasswordForm from "../components/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Forgot password"
      caption="Forgot password"
      subtitle="We will email you a secure link to choose a new password."
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
