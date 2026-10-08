import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Briefcase, Users } from "lucide-react";
import { getApiV1Base } from "../../../common/utils/apiBaseUrl";
import { SESSION_BEARER_KEY } from "../../../common/auth/sessionKeys";
import {
  canAccessCompanyPage,
  isPlatformAdmin,
} from "../../../common/auth/roleUtils";
import "../usermanagement/user_management.css";
import "./company_page.css";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CompanyRow = {
  id: string;
  name: string;
  userCount?: unknown;
  user_count?: unknown;
  dealCount?: unknown;
  deal_count?: unknown;
};

function coalesceCompanyCount(
  row: CompanyRow,
  key: "userCount" | "dealCount",
): number {
  const snake = key === "userCount" ? row.user_count : row.deal_count;
  const v = row[key] ?? snake;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const parsed = Number(v.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type CustomerCompanyOutletContext = {
  companyDisplayName: string;
  companyId: string;
};

export default function CustomerCompanyLayout() {
  const { companyId = "" } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const apiV1 = getApiV1Base();
  const token = sessionStorage.getItem(SESSION_BEARER_KEY);

  const [companyName, setCompanyName] = useState("");
  const [memberCount, setMemberCount] = useState(0);
  const [dealCount, setDealCount] = useState(0);

  const idTrim = companyId.trim();

  const loadCompanyName = useCallback(async () => {
    if (!token || !apiV1 || !UUID_RE.test(idTrim)) {
      setCompanyName("");
      setMemberCount(0);
      setDealCount(0);
      return;
    }
    try {
      const compRes = await fetch(`${apiV1}/companies`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const compData = (await compRes.json().catch(() => ({}))) as {
        companies?: CompanyRow[];
      };
      if (compRes.ok && Array.isArray(compData.companies)) {
        const c = compData.companies.find((x) => x.id === idTrim);
        setCompanyName(c?.name ? String(c.name) : "");
        if (c) {
          setMemberCount(coalesceCompanyCount(c, "userCount"));
          setDealCount(coalesceCompanyCount(c, "dealCount"));
        } else {
          setMemberCount(0);
          setDealCount(0);
        }
      } else {
        setCompanyName("");
        setMemberCount(0);
        setDealCount(0);
      }
    } catch {
      setCompanyName("");
      setMemberCount(0);
      setDealCount(0);
    }
  }, [idTrim, token, apiV1]);

  useEffect(() => {
    if (!token) {
      navigate("/signin", { replace: true });
      return;
    }
    if (!canAccessCompanyPage()) {
      navigate("/dashboard", { replace: true });
      return;
    }
    if (!isPlatformAdmin()) {
      navigate("/customers", { replace: true });
      return;
    }
    if (!UUID_RE.test(idTrim)) {
      navigate("/customers", { replace: true });
      return;
    }
    void loadCompanyName();
  }, [idTrim, token, navigate, loadCompanyName]);

  if (!token || !canAccessCompanyPage() || !isPlatformAdmin()) {
    return null;
  }

  if (!UUID_RE.test(idTrim)) {
    return null;
  }

  const companyDisplayName = companyName.trim() || "Company";
  const base = `/customers/${encodeURIComponent(idTrim)}`;

  const outletContext: CustomerCompanyOutletContext = {
    companyDisplayName,
    companyId: idTrim,
  };

  return (
    <section className="um_page company_page">
      <header className="cp_company_members_page_header">
        <Link
          to="/customers"
          className="cp_company_members_back_btn"
          aria-label="Back to customers"
          title="Back to customers"
        >
          <ArrowLeft size={22} strokeWidth={2} aria-hidden />
        </Link>
        <div className="cp_company_members_title_block">
          <h1 className="cp_company_members_company_title">
            {companyDisplayName}
          </h1>
        </div>
      </header>

      <div className="um_members_tabs_outer">
        <div
          className="um_members_tabs_row"
          role="tablist"
          aria-label="Company sections"
        >
          <NavLink
            to={`${base}/members`}
            id="cp-company-tab-members"
            role="tab"
            aria-label={`Members, ${memberCount}`}
            className={({ isActive }) =>
              `um_members_tab cp_company_detail_tab${
                isActive ? " um_members_tab_active" : ""
              }`
            }
          >
            <Users size={18} strokeWidth={1.75} aria-hidden />
            <span>Members</span>
            <span className="cp_company_detail_tab_count" aria-hidden>
              ({memberCount})
            </span>
          </NavLink>
          <NavLink
            to={`${base}/deals`}
            id="cp-company-tab-deals"
            role="tab"
            aria-label={`Deals, ${dealCount}`}
            className={({ isActive }) =>
              `um_members_tab cp_company_detail_tab${
                isActive ? " um_members_tab_active" : ""
              }`
            }
          >
            <Briefcase size={18} strokeWidth={1.75} aria-hidden />
            <span>Deals</span>
            <span className="cp_company_detail_tab_count" aria-hidden>
              ({dealCount})
            </span>
          </NavLink>
        </div>
      </div>

      <div className="um_members_tab_content">
        <Outlet context={outletContext} />
      </div>
    </section>
  );
}
