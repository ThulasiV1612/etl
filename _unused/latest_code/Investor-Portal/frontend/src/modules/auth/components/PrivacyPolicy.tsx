import { useEffect } from "react";
import "./termpolicy.css";
import companyLogo from "@/assets/images/massive-capital-logo.png";
import { useNavigate } from "react-router-dom";
import { formatTitle } from "@/utils/title";

const PrivacyPolicy = () => {
  useEffect(() => {
    document.title = formatTitle("Privacy Policy");
  }, []);
  const navigate = useNavigate();

  const handleHomeClick = () => {
    const isLoggedIn = !!sessionStorage.getItem("bearerToken");
    if (isLoggedIn) {
      navigate("/dashboard", { replace: true });
    } else {
      sessionStorage.clear();
      navigate("/signup", { replace: true });
    }
  };
  return (
    <>
      <div className="terms-policy">
        <p className="companyLogo">
          <img src={companyLogo} alt="company logo" style={{ width: "15em" }} />
        </p>
        <p>Privacy Policy</p>
        <p className="go_Back">
          Go back to{" "}
          <button type="button" className="page-not-home-link" onClick={handleHomeClick}>
            Sign Up
          </button>
        </p>
      </div>
    </>
  );
};

export default PrivacyPolicy;
