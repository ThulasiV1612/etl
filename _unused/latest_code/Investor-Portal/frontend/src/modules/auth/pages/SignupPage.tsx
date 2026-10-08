import AuthLayout from "../../../common/layout/AuthLayout";
import SignupForm from "../components/SignupForm";

export default function SignupPage() {
  // subtitle="Register to access syndication opportunities and investor materials."
  return (
    <AuthLayout title="Sign up" caption="Create your account">
      <SignupForm />
    </AuthLayout>
  );
}
