import { Link } from "react-router-dom";
import pageNotFoundImg from "@/assets/images/pageNotFound.svg";

export default function PageNotFound() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2em",
        textAlign: "center",
        gap: "1em",
      }}
    >
      <img src={pageNotFoundImg} alt="" width={280} height={200} />
      <p style={{ margin: 0, fontSize: "1.1em", fontWeight: 600 }}>
        Page not found
      </p>
      <Link to="/signin" style={{ color: "var(--main-auth-button-color, #2563eb)" }}>
        Back to sign in
      </Link>
    </div>
  );
}
