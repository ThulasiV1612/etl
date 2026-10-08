import AuthLayout from "../../../common/layout/AuthLayout";
import ResetPasswordForm from "../components/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <AuthLayout
      title="Reset password"
      caption="Reset password"
      subtitle="Choose a strong password for your investor account."
      authPageClassName="authPage--resetPassword"
    >
      <ResetPasswordForm />
    </AuthLayout>
  );
}
