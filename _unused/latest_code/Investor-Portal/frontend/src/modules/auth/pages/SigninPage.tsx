import AuthLayout from "../../../common/layout/AuthLayout";
import SigninForm from "../components/SigninForm";
import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { showIdleSessionTimeoutToastIfNeeded } from "../../../common/auth/idleSession";
// import "./signin.css";

const SigninPage = () => {
  const location = useLocation();

  useLayoutEffect(() => {
    showIdleSessionTimeoutToastIfNeeded(location.state?.idleLogout === true);
  }, [location.key, location.state?.idleLogout]);

  return (
    <AuthLayout title="Sign in" caption="Sign in">
      <SigninForm />
    </AuthLayout>
  );
};

export default SigninPage;