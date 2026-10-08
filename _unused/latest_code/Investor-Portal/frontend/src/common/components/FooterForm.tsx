import poweredBy from "@/assets/images/poweredby.svg"
import "./footer_form.css";
const FooterForm = () => {
  return (
    <>
    <div className="copyright">
        <p>© 2026 SyndicationX</p>
      </div>
      <div className="poweredBy">
        <p>
          <img src={poweredBy} alt="qualesce" />
        </p>
      </div>
      
    </>
  );
};

export default FooterForm;
