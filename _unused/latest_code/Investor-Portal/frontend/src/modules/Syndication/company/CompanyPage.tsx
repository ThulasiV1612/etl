import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  Archive,
  Ban,
  Building2,
  ClipboardList,
  Contact2,
  CreditCard,
  Download,
  Eye,
  LayoutGrid,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Upload,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DataTable,
  type DataTableColumn,
} from "../../../common/components/data-table/DataTable";
import { TabsScrollStrip } from "../../../common/components/tabs-scroll-strip/TabsScrollStrip";
import { ViewReadonlyField } from "../../../common/components/ViewReadonlyField";
import { toast } from "../../../common/components/Toast";
import { getApiV1Base } from "../../../common/utils/apiBaseUrl";
import {
  SESSION_BEARER_KEY,
  SESSION_USER_DETAILS_KEY,
  SESSION_WORKSPACE_COMPANY_ID_KEY,
} from "../../../common/auth/sessionKeys";
import { getSessionOrganizationCompanyId, getActiveWorkspaceCompanyName } from "../../../common/auth/sessionOrganization";
import {
  canAccessCompanyPage,
  canAccessMembersPage,
  canEditCompanyWorkspace,
  isPlatformAdmin,
} from "../../../common/auth/roleUtils";
import { CompanyContactAttributesTab } from "./CompanyContactAttributesTab";
import { CompanyEmailSettingsTab } from "./CompanyEmailSettingsTab";
import { CompanyOfferingsPageTab } from "./CompanyOfferingsPageTab";
import { CompanyBillingTab } from "./CompanyBillingTab";
import { CompanySettingsTabPanel } from "./CompanySettingsTabPanel";
import { ExportCompaniesModal } from "./ExportCompaniesModal";
import { UserManagementPage } from "../usermanagement/UserManagementPage";
import {
  buildCompaniesCsv,
  downloadCompaniesCsv,
  exportAuditLinesForCompanies,
} from "./companyCsv";
import type { CompanyExportRow } from "./companyCsv";
import { notifyCompaniesExportAudit } from "./companiesExportNotifyApi";
import { buildTableExportFilename } from "../../../common/utils/tableExportFilename";
import "../Deals/deal-investors-tab.css";
import "../Deals/deals-list.css";
import "../usermanagement/user_management.css";
import "./company_page.css";
import "./company-settings-tab.css";
import "./company-email-settings-tab.css";

type CompanyPageTab =
  | "settings"
  | "email"
  | "contact"
  | "offerings"
  | "billing"
  | "members"
  | "companies";

/** Keep sign-in `userDetails` in sync when the user edits company name on Settings (client-side). */
function writeSessionCompanyDisplayName(next: string): void {
  const trimmed = next.trim();
  try {
    const raw = sessionStorage.getItem(SESSION_USER_DETAILS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed[0] &&
      typeof parsed[0] === "object" &&
      !Array.isArray(parsed[0])
    ) {
      const first = {
        ...(parsed[0] as Record<string, unknown>),
        companyName: trimmed,
        company_name: trimmed,
        organizationName: trimmed,
        organization_name: trimmed,
      };
      sessionStorage.setItem(
        SESSION_USER_DETAILS_KEY,
        JSON.stringify([first, ...parsed.slice(1)]),
      );
      return;
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const o = {
        ...(parsed as Record<string, unknown>),
        companyName: trimmed,
        company_name: trimmed,
        organizationName: trimmed,
        organization_name: trimmed,
      };
      sessionStorage.setItem(SESSION_USER_DETAILS_KEY, JSON.stringify(o));
    }
  } catch {
    /* ignore */
  }
}

/** Organization UUID for workspace settings API (same as `companies.id`). */
function readSessionOrganizationId(): string {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_DETAILS_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as unknown;
    let o: Record<string, unknown> | null = null;
    if (
      Array.isArray(parsed) &&
      parsed[0] &&
      typeof parsed[0] === "object" &&
      !Array.isArray(parsed[0])
    ) {
      o = parsed[0] as Record<string, unknown>;
    } else if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      o = parsed as Record<string, unknown>;
    }
    if (!o) return "";
    const id =
      o.organization_id ?? o.organizationId ?? o.organizationID;
    if (id == null || id === "") return "";
    return typeof id === "string" ? id.trim() : String(id).trim();
  } catch {
    /* ignore */
  }
  return "";
}

function readStoredWorkspaceCompanyId(): string {
  if (typeof sessionStorage === "undefined") return "";
  try {
    const s = sessionStorage.getItem(SESSION_WORKSPACE_COMPANY_ID_KEY);
    return typeof s === "string" ? s.trim() : "";
  } catch {
    return "";
  }
}

const COMPANY_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SYNDICATION_X_COMPANY_NAME = "SyndicationX";

type CompanyRow = CompanyExportRow;

const COMPANY_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const COMPANY_AUDIT_ACTION_EDIT = "company_edit";
const COMPANY_AUDIT_ACTION_SUSPEND = "company_suspend";

function companyStatusValueForEdit(row: CompanyRow): string {
  const s = String(row.status ?? "active").trim().toLowerCase();
  if (s === "inactive" || s === "suspended") return "inactive";
  return "active";
}

function companyRowIsArchived(row: CompanyRow): boolean {
  const s = String(row.status ?? "active").trim().toLowerCase();
  return s === "inactive" || s === "suspended";
}

function companyStatusForUi(row: CompanyRow): { positive: boolean; label: string } {
  const raw = String(row.status ?? "active").trim().toLowerCase();
  if (raw === "active") return { positive: true, label: "Active" };
  if (raw === "inactive" || raw === "suspended") {
    return { positive: false, label: "Inactive" };
  }
  const label = raw
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  return { positive: false, label: label || "—" };
}

function StatusWithDot({
  positive,
  label,
}: {
  positive: boolean;
  label: string;
}) {
  if (label === "—") {
    return <span className="um_status_muted">—</span>;
  }
  return (
    <span className="um_status_cell">
      <span
        className={
          positive
            ? "um_status_dot um_status_dot_active"
            : "um_status_dot um_status_dot_inactive"
        }
        aria-hidden
      />
      <span className="um_status_label">{label}</span>
    </span>
  );
}

type CustomersListTab = "active" | "archived";

export type CompanyPageVariant = "default" | "customers";

type CompanyPageProps = {
  variant?: CompanyPageVariant;
};

export default function CompanyPage({ variant = "default" }: CompanyPageProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const customersStandalone = variant === "customers";
  const apiV1 = getApiV1Base();
  const token = sessionStorage.getItem(SESSION_BEARER_KEY);
  const platformAdmin = isPlatformAdmin();
  const canEditWorkspace = canEditCompanyWorkspace();

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [toolbarNotice, setToolbarNotice] = useState("");
  const [companiesExportOpen, setCompaniesExportOpen] = useState(false);
  const [customersListTab, setCustomersListTab] =
    useState<CustomersListTab>("active");
  const [companyPageTab, setCompanyPageTab] = useState<CompanyPageTab>(() => {
    if (variant === "customers" && isPlatformAdmin()) return "companies";
    if (canAccessMembersPage()) return "members";
    return "settings";
  });
  const [companiesPage, setCompaniesPage] = useState(1);
  const [companiesPageSize, setCompaniesPageSize] = useState(10);

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addErr, setAddErr] = useState("");
  const [addOk, setAddOk] = useState("");

  const [viewRow, setViewRow] = useState<CompanyRow | null>(null);
  const [editRow, setEditRow] = useState<CompanyRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [editReason, setEditReason] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editErr, setEditErr] = useState("");

  const [suspendRow, setSuspendRow] = useState<CompanyRow | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendSubmitting, setSuspendSubmitting] = useState(false);
  const [suspendErr, setSuspendErr] = useState("");

  const [actionMenuCompanyId, setActionMenuCompanyId] = useState<string | null>(
    null,
  );
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const kebabPortalRef = useRef<HTMLUListElement | null>(null);

  const loadCompanies = useCallback(async () => {
    if (!token || !apiV1) {
      setCompaniesLoading(false);
      return;
    }
    setCompaniesLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`${apiV1}/companies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        companies?: CompanyRow[];
        message?: string;
      };
      if (!res.ok) {
        setLoadError(data.message || "Could not load companies");
        return;
      }
      const list = Array.isArray(data.companies) ? data.companies : [];

      function coalesceCount(
        row: CompanyRow & {
          user_count?: unknown
          deal_count?: unknown
          contact_count?: unknown
        },
        key: "userCount" | "dealCount" | "contactCount",
      ): number {
        const snake =
          key === "userCount"
            ? row.user_count
            : key === "dealCount"
              ? row.deal_count
              : row.contact_count;
        const v = row[key] ?? snake;
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (typeof v === "string" && v.trim() !== "") {
          const parsed = Number(v.trim());
          if (Number.isFinite(parsed)) return parsed;
        }
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      }

      setCompanies(
        list.map((c) => ({
          ...c,
          userCount: coalesceCount(c, "userCount"),
          dealCount: coalesceCount(c, "dealCount"),
          contactCount: coalesceCount(c, "contactCount"),
          status: c.status ?? "active",
        })),
      );
    } catch {
      setLoadError("Unable to connect.");
    } finally {
      setCompaniesLoading(false);
    }
  }, [token, apiV1]);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  const [userDetailsRev, setUserDetailsRev] = useState(0);

  const sessionCompanyName = useMemo(
    () => (token ? getActiveWorkspaceCompanyName() : ""),
    [token, userDetailsRev],
  );

  const sessionOrganizationId = useMemo(
    () => (token ? readSessionOrganizationId() : ""),
    [token, userDetailsRev],
  );

  const [platformAdminWorkspaceCompanyId, setPlatformAdminWorkspaceCompanyId] =
    useState<string>(() => readStoredWorkspaceCompanyId());

  useEffect(() => {
    if (sessionOrganizationId.trim()) return;
    if (!platformAdmin || companies.length === 0) return;
    const pid = platformAdminWorkspaceCompanyId.trim().toLowerCase();
    const storedOk =
      pid &&
      COMPANY_ID_UUID_RE.test(pid) &&
      companies.some((c) => c.id.trim().toLowerCase() === pid)
        ? pid
        : "";
    const syndicationX = companies.find(
      (c) =>
        c.name.trim().toLowerCase() === SYNDICATION_X_COMPANY_NAME.toLowerCase(),
    );
    const next = (
      storedOk ||
      syndicationX?.id ||
      companies[0].id
    )
      .trim()
      .toLowerCase();
    if (!COMPANY_ID_UUID_RE.test(next)) return;
    if (next === pid) return;
    setPlatformAdminWorkspaceCompanyId(next);
    try {
      sessionStorage.setItem(SESSION_WORKSPACE_COMPANY_ID_KEY, next);
    } catch {
      /* ignore */
    }
  }, [
    sessionOrganizationId,
    platformAdmin,
    companies,
    platformAdminWorkspaceCompanyId,
  ]);

  /**
   * Session org when present; otherwise platform admin uses stored/first company from directory
   * (no picker — still persists workspace JSON for that `companies.id`).
   *
   * For org-scoped users (not platform admin), use the same company id as other workspace
   * APIs: `getSessionOrganizationCompanyId()` (workspace key + `userDetails` org) so image
   * upload and settings GET/PUT have a real `companies.id` when the user can access this page.
   */
  const workspaceCompanyId = useMemo(() => {
    if (platformAdmin) {
      const fromSession = readSessionOrganizationId().trim().toLowerCase();
      if (COMPANY_ID_UUID_RE.test(fromSession)) return fromSession;
      if (
        platformAdminWorkspaceCompanyId &&
        COMPANY_ID_UUID_RE.test(platformAdminWorkspaceCompanyId)
      ) {
        return platformAdminWorkspaceCompanyId.trim().toLowerCase();
      }
      return "";
    }
    const g = getSessionOrganizationCompanyId();
    return g && COMPANY_ID_UUID_RE.test(g) ? g : "";
  }, [platformAdmin, platformAdminWorkspaceCompanyId, userDetailsRev]);

  /**
   * Settings → Members: platform admins use GET /users?organizationId=…
   * Prefer the signed-in org from session; if the profile has no `organization_id` yet,
   * use the same workspace company id (stored / first company in directory) as Settings.
   */
  const settingsMembersOrganizationScope = useMemo(():
    | string
    | false
    | undefined => {
    if (!platformAdmin) return undefined;
    const oid = readSessionOrganizationId().trim().toLowerCase();
    if (COMPANY_ID_UUID_RE.test(oid)) return oid;
    const wid = workspaceCompanyId.trim().toLowerCase();
    if (COMPANY_ID_UUID_RE.test(wid)) return wid;
    return false;
  }, [platformAdmin, userDetailsRev, workspaceCompanyId]);

  const handleCompanyDisplayNamePersisted = useCallback(
    (name: string) => {
      writeSessionCompanyDisplayName(name);
      const wid = workspaceCompanyId.trim().toLowerCase();
      if (wid) {
        setCompanies((prev) =>
          prev.map((c) =>
            c.id.trim().toLowerCase() === wid ? { ...c, name } : c,
          ),
        );
      }
      setUserDetailsRev((n) => n + 1);
    },
    [workspaceCompanyId],
  );

  /** Active workspace company name; directory is fallback (e.g. platform admin). */
  const effectiveCompanyName = useMemo(() => {
    const fromWorkspace = sessionCompanyName.trim();
    if (fromWorkspace) return fromWorkspace;
    if (workspaceCompanyId) {
      const row = companies.find(
        (c) => c.id.trim().toLowerCase() === workspaceCompanyId,
      );
      if (row?.name?.trim()) return row.name.trim();
    }
    return "Your company";
  }, [workspaceCompanyId, companies, sessionCompanyName]);

  const companyPageTabDefs = useMemo(() => {
    if (!canAccessCompanyPage()) {
      return [{ id: "billing" as const, label: "Billing", icon: CreditCard }];
    }
    const mainTabs: { id: CompanyPageTab; label: string; icon: LucideIcon }[] = [
      { id: "settings", label: "Settings", icon: Settings },
      { id: "email", label: "Email settings", icon: Mail },
      { id: "contact", label: "Contact attributes", icon: Contact2 },
      { id: "offerings", label: "Offerings page", icon: LayoutGrid },
      { id: "billing", label: "Billing", icon: CreditCard },
    ];
    if (canAccessMembersPage()) {
      return [{ id: "members", label: "Org Members", icon: Users } as const, ...mainTabs];
    }
    return mainTabs;
  }, [userDetailsRev]);

  const firstCompanyPageTab: CompanyPageTab = companyPageTabDefs[0]?.id ?? "settings";

  const activeCompanyPageTab = useMemo(() => {
    const allowed = new Set(companyPageTabDefs.map((t) => t.id));
    if (allowed.has(companyPageTab)) return companyPageTab;
    return firstCompanyPageTab;
  }, [companyPageTabDefs, companyPageTab, firstCompanyPageTab]);

  useEffect(() => {
    if (customersStandalone) return;
    const allowed = new Set(companyPageTabDefs.map((t) => t.id));
    if (!allowed.has(companyPageTab)) setCompanyPageTab(firstCompanyPageTab);
  }, [companyPageTabDefs, companyPageTab, customersStandalone, firstCompanyPageTab]);

  useEffect(() => {
    if (customersStandalone && platformAdmin) setCompanyPageTab("companies");
  }, [customersStandalone, platformAdmin]);

  /** Open Members first when visiting Settings or Company (sidebar), not the Settings sub-tab. */
  useEffect(() => {
    if (customersStandalone) return;
    const billing = new URLSearchParams(location.search).get("billing");
    if (
      billing === "success" ||
      billing === "cancel" ||
      billing === "portal_return" ||
      billing === "pay"
    ) {
      setCompanyPageTab("billing");
      return;
    }
    if (!canAccessMembersPage()) return;
    const p = location.pathname.replace(/\/$/, "") || "/";
    const segs = p.split("/").filter(Boolean);
    const last = segs[segs.length - 1] ?? "";
    if (last === "settings" || last === "company") {
      setCompanyPageTab("members");
    }
  }, [location.pathname, location.search, customersStandalone]);

  const customersArchivedCount = useMemo(
    () => companies.filter((c) => companyRowIsArchived(c)).length,
    [companies],
  );

  const customersActiveCount = useMemo(
    () => companies.filter((c) => !companyRowIsArchived(c)).length,
    [companies],
  );

  const customersTabRows = useMemo(() => {
    if (!customersStandalone) return companies;
    return companies.filter((c) =>
      customersListTab === "archived"
        ? companyRowIsArchived(c)
        : !companyRowIsArchived(c),
    );
  }, [companies, customersStandalone, customersListTab]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = customersStandalone ? customersTabRows : companies;
    if (!q) return base;
    return base.filter((c) => {
      const st = companyStatusForUi(c).label.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        String(c.userCount ?? "").includes(q) ||
        String(c.dealCount ?? "").includes(q) ||
        String(c.contactCount ?? "").includes(q) ||
        st.includes(q)
      );
    });
  }, [companies, customersStandalone, customersTabRows, searchQuery]);

  useEffect(() => {
    setCompaniesPage(1);
  }, [searchQuery, customersListTab]);

  const companiesTableTotalPages = Math.max(
    1,
    Math.ceil(filteredRows.length / companiesPageSize),
  );

  useEffect(() => {
    if (companiesPage > companiesTableTotalPages) {
      setCompaniesPage(companiesTableTotalPages);
    }
  }, [companiesPage, companiesTableTotalPages]);

  const companiesPageSafe = Math.min(companiesPage, companiesTableTotalPages);

  const openMenuContext = useMemo(() => {
    if (!actionMenuCompanyId) return null;
    return filteredRows.find((c) => c.id === actionMenuCompanyId) ?? null;
  }, [actionMenuCompanyId, filteredRows]);

  const customerCompaniesColumns: DataTableColumn<CompanyRow>[] = useMemo(
    () => [
      {
        id: "company",
        header: "Company",
        colWidth: "28%",
        sortValue: (row) => row.name.toLowerCase(),
        thClassName: "cp_company_list_name_th",
        tdClassName: "um_td_user cp_company_list_name_td",
        cell: (row) => (
          <div className="um_user_cell">
            <div
              className="um_user_avatar_ring cp_company_avatar"
              aria-hidden
            >
              <Building2 size={18} strokeWidth={2} />
            </div>
            <div className="um_user_meta">
              {customersStandalone && platformAdmin ? (
                <Link
                  className="um_user_meta_username cp_company_name_link"
                  to={`/customers/${encodeURIComponent(row.id)}/members`}
                >
                  {row.name}
                </Link>
              ) : (
                <span className="um_user_meta_username">{row.name}</span>
              )}
            </div>
          </div>
        ),
      },
      {
        id: "deals",
        header: "Deals",
        colWidth: "9%",
        sortValue: (row) => Number(row.dealCount ?? 0),
        align: "center",
        cell: (row) => String(row.dealCount ?? 0),
      },
      {
        id: "members",
        header: "Members",
        colWidth: "10%",
        sortValue: (row) => Number(row.userCount ?? 0),
        align: "center",
        tdClassName: "um_td_numeric",
        cell: (row) => String(row.userCount ?? 0),
      },
      {
        id: "contacts",
        header: "Contacts",
        colWidth: "10%",
        sortValue: (row) => Number(row.contactCount ?? 0),
        align: "center",
        tdClassName: "um_td_numeric",
        cell: (row) => String(row.contactCount ?? 0),
      },
      {
        id: "status",
        header: "Status",
        colWidth: "14%",
        sortValue: (row) => companyStatusForUi(row).label.toLowerCase(),
        cell: (row) => <StatusWithDot {...companyStatusForUi(row)} />,
      },
      {
        id: "actions",
        header: "Actions",
        colWidth: "9%",
        thClassName: "um_th_actions",
        tdClassName: "um_td_actions deal_inv_td_actions",
        align: "center",
        cell: (row) => {
          const menuOpen = actionMenuCompanyId === row.id;
          return (
            <div className="um_kebab_root" data-cp-kebab-root={row.id}>
              <button
                type="button"
                className="um_kebab_trigger"
                data-cp-kebab-trigger={row.id}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label={`Actions for ${row.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setActionMenuCompanyId((id) =>
                    id === row.id ? null : row.id,
                  );
                }}
              >
                <MoreHorizontal size={18} aria-hidden />
              </button>
            </div>
          );
        },
      },
    ],
    [customersStandalone, platformAdmin, actionMenuCompanyId],
  );

  const customersCompaniesPagination = useMemo(
    () => ({
      page: companiesPageSafe,
      pageSize: companiesPageSize,
      totalItems: filteredRows.length,
      onPageChange: setCompaniesPage,
      onPageSizeChange: setCompaniesPageSize,
      ariaLabel:
        customersListTab === "archived"
          ? "Archived companies table pagination"
          : "Active companies table pagination",
    }),
    [
      companiesPageSafe,
      companiesPageSize,
      filteredRows.length,
      customersListTab,
    ],
  );

  const updateKebabMenuPosition = useCallback(() => {
    if (!actionMenuCompanyId) {
      setMenuPos(null);
      return;
    }
    const el = document.querySelector(
      `[data-cp-kebab-trigger="${CSS.escape(actionMenuCompanyId)}"]`,
    );
    if (!el || !(el instanceof HTMLElement)) {
      setMenuPos(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const menuMinW = 168;
    const margin = 8;
    let left = r.right - menuMinW;
    left = Math.max(
      margin,
      Math.min(left, window.innerWidth - menuMinW - margin),
    );
    setMenuPos({ top: r.bottom + 4, left });
  }, [actionMenuCompanyId]);

  useLayoutEffect(() => {
    if (!actionMenuCompanyId) {
      setMenuPos(null);
      return;
    }
    updateKebabMenuPosition();
    window.addEventListener("scroll", updateKebabMenuPosition, true);
    window.addEventListener("resize", updateKebabMenuPosition);
    return () => {
      window.removeEventListener("scroll", updateKebabMenuPosition, true);
      window.removeEventListener("resize", updateKebabMenuPosition);
    };
  }, [actionMenuCompanyId, updateKebabMenuPosition]);

  useEffect(() => {
    if (actionMenuCompanyId == null) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      const root = document.querySelector(
        `[data-cp-kebab-root="${CSS.escape(actionMenuCompanyId)}"]`,
      );
      if (root?.contains(t)) return;
      if (kebabPortalRef.current?.contains(t)) return;
      setActionMenuCompanyId(null);
    };
    const tid = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
    }, 0);
    return () => {
      window.clearTimeout(tid);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [actionMenuCompanyId]);

  useEffect(() => {
    if (actionMenuCompanyId == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActionMenuCompanyId(null);
        setMenuPos(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [actionMenuCompanyId]);

  function exportRowCsv(row: CompanyRow) {
    const csv = buildCompaniesCsv([row]);
    const filename = buildTableExportFilename({ dealName: row.name });
    downloadCompaniesCsv(csv, filename);
    void notifyCompaniesExportAudit({
      rowCount: 1,
      exportedCompanyLines: exportAuditLinesForCompanies([row]),
    });
    setActionMenuCompanyId(null);
    setToolbarNotice("");
    toast.success("Company exported", `Saved as ${filename}`);
  }

  async function patchCompany(
    id: string,
    body: {
      name?: string;
      status?: string;
      reason: string;
      action: typeof COMPANY_AUDIT_ACTION_EDIT | typeof COMPANY_AUDIT_ACTION_SUSPEND;
    },
  ): Promise<{ ok: boolean; message: string }> {
    if (!token || !apiV1) {
      return { ok: false, message: "Not signed in." };
    }
    const res = await fetch(`${apiV1}/companies/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) {
      return { ok: false, message: data.message || "Update failed." };
    }
    return { ok: true, message: data.message || "Updated." };
  }

  function openAddModal() {
    setAddOpen(true);
    setAddName("");
    setAddErr("");
    setAddOk("");
  }

  function closeAddModal() {
    setAddOpen(false);
    setAddSubmitting(false);
    setAddErr("");
    setAddOk("");
  }

  async function submitAddCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      toast.error("Not signed in", "Sign in again, then try creating a company.");
      return;
    }
    if (!apiV1) {
      const msg =
        "API base URL is not configured. Set VITE_BASE_URL for production builds.";
      setAddErr(msg);
      toast.error("Cannot create company", msg);
      return;
    }
    if (!platformAdmin) {
      const msg =
        "Only platform administrators can create companies. If your role was updated, sign out and sign in again.";
      setAddErr(msg);
      toast.error("Cannot create company", msg);
      return;
    }
    setAddSubmitting(true);
    setAddErr("");
    setAddOk("");
    try {
      const res = await fetch(`${apiV1}/companies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: addName.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        ghlProvisioning?: {
          enabled?: boolean;
          ok?: boolean;
          message?: string;
          locationId?: string;
        };
      };
      if (!res.ok) {
        const msg = data.message || "Could not create company";
        setAddErr(msg);
        toast.error("Could not create company", msg);
        return;
      }
      const okMsg = data.message || "Company created";
      setAddOk(okMsg);
      toast.success("Company created", okMsg);
      const ghl = data.ghlProvisioning;
      if (ghl?.enabled && ghl.ok === false) {
        toast.error(
          "CRM sub-account not created",
          ghl.message ??
            "Check GHL_PER_ORG_LOCATIONS, GHL_COMPANY_ID, and agency API key in backend/.env.local.",
        );
      } else if (ghl?.enabled && ghl.ok === true) {
        toast.success("CRM sub-account created", ghl.locationId ?? "GoHighLevel location ready");
      }
      setAddName("");
      void loadCompanies();
      setTimeout(() => closeAddModal(), 800);
    } catch {
      const msg = "Unable to connect.";
      setAddErr(msg);
      toast.error("Could not create company", msg);
    } finally {
      setAddSubmitting(false);
    }
  }

  function closeEditModal() {
    setEditRow(null);
    setEditReason("");
    setEditErr("");
  }

  function openEdit(row: CompanyRow) {
    setEditRow(row);
    setEditName(row.name);
    setEditStatus(companyStatusValueForEdit(row));
    setEditReason("");
    setEditErr("");
  }

  function openSuspendModal(row: CompanyRow) {
    setSuspendRow(row);
    setSuspendReason("");
    setSuspendErr("");
  }

  function closeSuspendModal() {
    setSuspendRow(null);
    setSuspendReason("");
    setSuspendErr("");
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editRow || !token || !apiV1) return;
    const reason = editReason.trim();
    if (!reason) {
      setEditErr("Please enter a reason for this change.");
      return;
    }
    setEditSubmitting(true);
    setEditErr("");
    try {
      const result = await patchCompany(editRow.id, {
        name: editName.trim(),
        status: editStatus,
        reason,
        action: COMPANY_AUDIT_ACTION_EDIT,
      });
      if (!result.ok) {
        setEditErr(result.message);
        return;
      }
      closeEditModal();
      void loadCompanies();
      setToolbarNotice(result.message);
    } catch {
      setEditErr("Unable to connect.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function submitSuspendCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!suspendRow || !token || !apiV1 || !platformAdmin) return;
    const reason = suspendReason.trim();
    if (!reason) {
      setSuspendErr("Please enter a reason for suspending this company.");
      return;
    }
    setSuspendSubmitting(true);
    setSuspendErr("");
    setToolbarNotice("");
    try {
      const result = await patchCompany(suspendRow.id, {
        status: "inactive",
        reason,
        action: COMPANY_AUDIT_ACTION_SUSPEND,
      });
      if (!result.ok) {
        setSuspendErr(result.message);
        toast.error("Could not suspend company", result.message);
        return;
      }
      closeSuspendModal();
      void loadCompanies();
      toast.success("Company suspended", result.message);
    } catch {
      const msg = "Unable to connect.";
      setSuspendErr(msg);
      toast.error("Could not suspend company", msg);
    } finally {
      setSuspendSubmitting(false);
    }
  }

  if (!token) {
    return (
      <section className="um_page company_page">
        <h2 className="um_title um_title_with_icon">
          <Building2 className="um_title_icon" size={26} strokeWidth={1.75} aria-hidden />
          {customersStandalone ? "Customers" : "Settings"}
        </h2>
        <div className="um_panel">
          <p className="um_hint">
            <Link
              to="/signin"
              style={{ color: "var(--main-auth-button-color, #2563eb)" }}
            >
              Sign in
            </Link>{" "}
            {customersStandalone ? "to view customers." : "to access settings."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="um_page company_page">
      <div className="um_members_header_block">
        <div className="um_header_row">
          <h2 className="um_title um_title_with_icon">
            <Building2 className="um_title_icon" size={26} strokeWidth={1.75} aria-hidden />
            {customersStandalone ? "Customers" : "Settings"}
          </h2>
          {platformAdmin && customersStandalone ? (
            <button
              type="button"
              className="um_btn_primary"
              onClick={openAddModal}
            >
              <Plus size={18} aria-hidden />
              Add company
            </button>
          ) : null}
        </div>
      </div>

      {platformAdmin && customersStandalone ? (
        <div className="um_members_tabs_outer deals_tabs_outer um_segmented_tabs_outer">
          <TabsScrollStrip scrollClassName="deals_tabs_scroll um_segmented_tabs_scroll">
            <div
              className="um_members_tabs_row deals_tabs_row um_segmented_tabs_row"
              role="tablist"
              aria-label="Customer company lists"
            >
              <button
                type="button"
                id="cp-customers-tab-active"
                role="tab"
                aria-selected={customersListTab === "active"}
                aria-controls="cp-customers-panel-active"
                aria-label={`Active companies, ${customersActiveCount}`}
                className={`um_members_tab deals_tabs_tab um_segmented_tab${
                  customersListTab === "active" ? " um_members_tab_active" : ""
                }`}
                onClick={() => {
                  setCustomersListTab("active");
                  setToolbarNotice("");
                }}
              >
                <Activity
                  className="deals_tabs_icon um_segmented_tab_icon"
                  size={16}
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="deals_tabs_label um_segmented_tab_label">
                  Active
                </span>
                <span className="deals_tabs_count" aria-hidden>
                  ({customersActiveCount})
                </span>
              </button>
              <button
                type="button"
                id="cp-customers-tab-archived"
                role="tab"
                aria-selected={customersListTab === "archived"}
                aria-controls="cp-customers-panel-archived"
                aria-label={`Archived companies, ${customersArchivedCount}`}
                className={`um_members_tab deals_tabs_tab um_segmented_tab${
                  customersListTab === "archived" ? " um_members_tab_active" : ""
                }`}
                onClick={() => {
                  setCustomersListTab("archived");
                  setToolbarNotice("");
                }}
              >
                <Archive
                  className="deals_tabs_icon um_segmented_tab_icon"
                  size={16}
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="deals_tabs_label um_segmented_tab_label">
                  Archived
                </span>
                <span className="deals_tabs_count" aria-hidden>
                  ({customersArchivedCount})
                </span>
              </button>
            </div>
          </TabsScrollStrip>
        </div>
      ) : null}

      {!customersStandalone ? (
        <div className="um_members_tabs_outer deals_tabs_outer um_segmented_tabs_outer">
          <TabsScrollStrip scrollClassName="deals_tabs_scroll um_segmented_tabs_scroll">
            <div
              className="um_members_tabs_row deals_tabs_row um_segmented_tabs_row"
              role="tablist"
              aria-label="Settings page sections"
            >
              {companyPageTabDefs.map((tab) => {
                const TabIcon = tab.icon
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`cp-page-tab-${tab.id}`}
                    aria-selected={activeCompanyPageTab === tab.id}
                    aria-controls={`cp-page-panel-${tab.id}`}
                    className={`um_members_tab deals_tabs_tab um_segmented_tab${
                      activeCompanyPageTab === tab.id
                        ? " um_members_tab_active"
                        : ""
                    }`}
                    onClick={() => setCompanyPageTab(tab.id)}
                  >
                    <TabIcon
                      className="deals_tabs_icon um_segmented_tab_icon"
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                    />
                    <span className="deals_tabs_label um_segmented_tab_label">
                      {tab.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </TabsScrollStrip>
        </div>
      ) : null}

      <div className="um_members_tab_content">
        {!customersStandalone ? (
          <>
            <div
              className="um_panel um_members_tab_panel cp_settings_tab_panel"
              id="cp-page-panel-settings"
              role="tabpanel"
              aria-labelledby="cp-page-tab-settings"
              hidden={activeCompanyPageTab !== "settings"}
            >
              <CompanySettingsTabPanel
                initialCompanyName={effectiveCompanyName}
                readOnly={!canEditWorkspace}
                workspaceCompanyId={workspaceCompanyId || undefined}
                onCompanyDisplayNamePersisted={handleCompanyDisplayNamePersisted}
              />
            </div>

            <div
              className="um_panel um_members_tab_panel cp_settings_tab_panel"
              id="cp-page-panel-email"
              role="tabpanel"
              aria-labelledby="cp-page-tab-email"
              hidden={activeCompanyPageTab !== "email"}
            >
              <CompanyEmailSettingsTab
                companyName={effectiveCompanyName}
                readOnly={!canEditWorkspace}
                workspaceCompanyId={workspaceCompanyId || undefined}
              />
            </div>

            <div
              className="um_panel um_members_tab_panel"
              id="cp-page-panel-contact"
              role="tabpanel"
              aria-labelledby="cp-page-tab-contact"
              hidden={activeCompanyPageTab !== "contact"}
            >
              <CompanyContactAttributesTab
                companyName={effectiveCompanyName}
                readOnly={!canEditWorkspace}
                workspaceCompanyId={workspaceCompanyId || undefined}
              />
            </div>

            <div
              className="um_panel um_members_tab_panel"
              id="cp-page-panel-offerings"
              role="tabpanel"
              aria-labelledby="cp-page-tab-offerings"
              hidden={activeCompanyPageTab !== "offerings"}
            >
              <CompanyOfferingsPageTab
                companyName={effectiveCompanyName}
                readOnly={!canEditWorkspace}
                workspaceCompanyId={workspaceCompanyId || undefined}
              />
            </div>

            <div
              className="um_panel um_members_tab_panel"
              id="cp-page-panel-billing"
              role="tabpanel"
              aria-labelledby="cp-page-tab-billing"
              hidden={activeCompanyPageTab !== "billing"}
            >
              <CompanyBillingTab
                workspaceCompanyId={workspaceCompanyId || undefined}
                focusDealId={
                  new URLSearchParams(location.search).get("dealId")?.trim() ||
                  undefined
                }
                focusDealName={
                  new URLSearchParams(location.search).get("dealName")?.trim() ||
                  undefined
                }
              />
            </div>

            {canAccessMembersPage() ? (
              <div
                className="um_panel um_members_tab_panel cp_settings_members_tab"
                id="cp-page-panel-members"
                role="tabpanel"
                aria-labelledby="cp-page-tab-members"
                hidden={activeCompanyPageTab !== "members"}
              >
                <div className="cp_settings_members_embed">
                  <UserManagementPage
                    membersOrganizationScope={settingsMembersOrganizationScope}
                    membersWorkspaceCompanyName={effectiveCompanyName}
                  />
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {customersStandalone && !platformAdmin ? (
          <div className="um_panel um_members_tab_panel">
            <p className="um_hint">
              The customer company directory is available to platform administrators. Use{" "}
              <Link to="/settings" style={{ color: "var(--main-auth-button-color, #2563eb)" }}>
                Settings
              </Link>{" "}
              for your organization profile.
            </p>
          </div>
        ) : null}

        {platformAdmin && customersStandalone ? (
          <div
            className={`um_panel um_members_tab_panel cp_companies_tab_panel deals_list_table_panel deals_list_card_surface deal_inv_table_panel${
              companiesLoading ? " deals_list_table_panel_loading" : ""
            }`}
            id={
              customersListTab === "archived"
                ? "cp-customers-panel-archived"
                : "cp-customers-panel-active"
            }
            role="tabpanel"
            aria-label="Customer companies"
            aria-labelledby={
              customersListTab === "archived"
                ? "cp-customers-tab-archived"
                : "cp-customers-tab-active"
            }
            aria-busy={companiesLoading}
            hidden={false}
          >
            <div className="um_toolbar um_toolbar_export_then_search">
              <div className="um_toolbar_actions">
                <button
                  type="button"
                  className="um_btn_toolbar"
                  disabled={
                    companiesLoading ||
                    customersListTab === "archived" ||
                    customersTabRows.length === 0
                  }
                  onClick={() =>
                    setToolbarNotice("Bulk suspend for companies is not available yet.")
                  }
                >
                  <Ban size={18} strokeWidth={2} aria-hidden />
                  Suspend all
                </button>
                <button
                  type="button"
                  className="um_toolbar_export_btn"
                  onClick={() => setCompaniesExportOpen(true)}
                  disabled={companiesLoading || customersTabRows.length === 0}
                >
                  <Download size={18} strokeWidth={2} aria-hidden />
                  <span>Export All</span>
                </button>
              </div>
              <div className="um_search_wrap">
                <Search className="um_search_icon" size={18} aria-hidden />
                <input
                  type="search"
                  className="um_search_input"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setToolbarNotice("");
                  }}
                  disabled={companiesLoading}
                  aria-label={
                    customersListTab === "archived"
                      ? "Search archived companies"
                      : "Search active companies"
                  }
                />
              </div>
            </div>
            {toolbarNotice ? (
              <p className="um_toolbar_notice" role="status">
                {toolbarNotice}
              </p>
            ) : null}
            {loadError ? (
              <p className="um_msg_error">{loadError}</p>
            ) : null}
            {!loadError ? (
              <div className="cp_company_tab_table_wrap">
                <DataTable
                  visualVariant="members"
                  stickyFirstColumn={false}
                  membersTableClassName="um_table_members deal_inv_table"
                  initialSort={{ columnId: "company", direction: "asc" }}
                  columns={customerCompaniesColumns}
                  rows={companiesLoading ? [] : filteredRows}
                  getRowKey={(row) => row.id}
                  isLoading={companiesLoading}
                  emptyLabel={
                    companies.length === 0
                      ? ""
                      : customersTabRows.length === 0
                        ? customersListTab === "archived"
                          ? "No archived companies. Suspend a company from Active to move it here."
                          : "No active companies."
                        : "No companies match your search."
                  }
                  pagination={
                    !companiesLoading && filteredRows.length > 0
                      ? customersCompaniesPagination
                      : undefined
                  }
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {actionMenuCompanyId &&
      menuPos &&
      openMenuContext &&
      typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={kebabPortalRef}
              className="um_kebab_menu um_kebab_menu--portal"
              role="menu"
              aria-label="Company actions"
              style={{
                position: "fixed",
                top: menuPos.top,
                left: menuPos.left,
              }}
            >
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="um_kebab_menuitem"
                  onClick={() => {
                    setViewRow(openMenuContext);
                    setActionMenuCompanyId(null);
                  }}
                >
                  <Eye className="um_kebab_menuitem_icon" size={16} strokeWidth={2} aria-hidden />
                  View
                </button>
              </li>
              {customersStandalone && platformAdmin ? (
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="um_kebab_menuitem"
                    onClick={() => {
                      setActionMenuCompanyId(null);
                      navigate(
                        `/customers/${encodeURIComponent(openMenuContext.id)}/members`,
                      );
                    }}
                  >
                    <Users
                      className="um_kebab_menuitem_icon"
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                    />
                    Members &amp; deals
                  </button>
                </li>
              ) : null}
              {!(
                customersStandalone && customersListTab === "archived"
              ) ? (
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="um_kebab_menuitem"
                    disabled={!platformAdmin}
                    onClick={() => {
                      setActionMenuCompanyId(null);
                      if (!platformAdmin) {
                        setToolbarNotice(
                          "Only platform administrators can edit a company.",
                        );
                        return;
                      }
                      openEdit(openMenuContext);
                    }}
                  >
                    <Pencil className="um_kebab_menuitem_icon" size={16} strokeWidth={2} aria-hidden />
                    Edit
                  </button>
                </li>
              ) : null}
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="um_kebab_menuitem"
                  disabled={
                    !platformAdmin ||
                    suspendSubmitting ||
                    companyStatusForUi(openMenuContext).label !== "Active"
                  }
                  onClick={() => {
                    setActionMenuCompanyId(null);
                    if (!platformAdmin) {
                      setToolbarNotice(
                        "Only platform administrators can suspend a company.",
                      );
                      return;
                    }
                    openSuspendModal(openMenuContext);
                  }}
                >
                  <Ban className="um_kebab_menuitem_icon" size={16} strokeWidth={2} aria-hidden />
                  Suspend
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="um_kebab_menuitem"
                  onClick={() => exportRowCsv(openMenuContext)}
                >
                  <Upload className="um_kebab_menuitem_icon" size={16} strokeWidth={2} aria-hidden />
                  Export
                </button>
              </li>
            </ul>,
            document.body,
          )
        : null}

      {viewRow ? (
        <div
          className="um_modal_overlay"
          role="presentation"
        >
          <div
            className="um_modal um_modal_view cp_company_view_modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cp-view-title"
          >
            <div className="um_modal_head">
              <h3 id="cp-view-title" className="um_modal_title">
                Company details
              </h3>
              <button
                type="button"
                className="um_modal_close"
                aria-label="Close"
                onClick={() => setViewRow(null)}
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </div>
            <div className="cp_view_shell cp_view_shell_single">
              <div className="cp_view_panel">
                <div className="um_view_grid">
                  <ViewReadonlyField
                    Icon={Building2}
                    label="Company name"
                    value={viewRow.name}
                  />
                  <ViewReadonlyField
                    Icon={Activity}
                    label="Status"
                    value={<StatusWithDot {...companyStatusForUi(viewRow)} />}
                  />
                  <ViewReadonlyField
                    Icon={Users}
                    label="Members"
                    value={String(viewRow.userCount ?? 0)}
                  />
                  <ViewReadonlyField
                    Icon={Contact2}
                    label="No. of contacts"
                    value={String(viewRow.contactCount ?? 0)}
                  />
                  <ViewReadonlyField
                    Icon={LayoutGrid}
                    label="Deals"
                    value={String(viewRow.dealCount ?? 0)}
                  />
                </div>
              </div>
            </div>
            <div className="um_modal_actions um_modal_actions_view">
              <button
                type="button"
                className="um_btn_secondary"
                onClick={() => setViewRow(null)}
              >
                <X size={16} strokeWidth={2} aria-hidden />
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editRow ? (
        <div
          className="um_modal_overlay"
          role="presentation"
        >
          <div
            className="um_modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cp-edit-title"
          >
            <div className="um_modal_head">
              <h3 id="cp-edit-title" className="um_modal_title">
                Edit company
              </h3>
              <button
                type="button"
                className="um_modal_close"
                aria-label="Close"
                onClick={() => closeEditModal()}
                disabled={editSubmitting}
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </div>
            <form onSubmit={submitEdit}>
              <div className="um_field">
                <label htmlFor="cp-edit-name" className="um_field_label_row">
                  <Building2 className="um_field_label_icon" size={17} aria-hidden />
                  <span>Company name</span>
                </label>
                <input
                  id="cp-edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  disabled={editSubmitting}
                />
              </div>
              <div className="um_field">
                <label htmlFor="cp-edit-status" className="um_field_label_row">
                  <Activity className="um_field_label_icon" size={17} aria-hidden />
                  <span>Status</span>
                </label>
                <select
                  id="cp-edit-status"
                  className="um_field_select"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  disabled={editSubmitting}
                >
                  {COMPANY_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="um_field">
                <label htmlFor="cp-edit-reason" className="um_field_label_row">
                  <ClipboardList
                    className="um_field_label_icon"
                    size={17}
                    aria-hidden
                  />
                  <span>Reason</span>
                </label>
                <textarea
                  id="cp-edit-reason"
                  className="um_field_textarea"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  rows={3}
                  required
                  disabled={editSubmitting}
                  aria-required
                />
              </div>
              {editErr ? (
                <p className="um_msg_error um_modal_form_error" role="alert">
                  {editErr}
                </p>
              ) : null}
              <div className="um_modal_actions add_contact_modal_actions">
                <button
                  type="button"
                  className="um_btn_secondary"
                  onClick={() => closeEditModal()}
                  disabled={editSubmitting}
                >
                  <X size={16} strokeWidth={2} aria-hidden />
                  Close
                </button>
                <button
                  type="submit"
                  className="um_btn_primary"
                  disabled={
                    editSubmitting ||
                    !editName.trim() ||
                    !editReason.trim()
                  }
                >
                  <RefreshCw size={16} strokeWidth={2} aria-hidden />
                  {editSubmitting ? "Updating…" : "Update"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {suspendRow ? (
        <div
          className="um_modal_overlay"
          role="presentation"
        >
          <div
            className="um_modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cp-suspend-title"
          >
            <div className="um_modal_head">
              <h3 id="cp-suspend-title" className="um_modal_title">
                Suspend company
              </h3>
              <button
                type="button"
                className="um_modal_close"
                aria-label="Close"
                disabled={suspendSubmitting}
                onClick={() => closeSuspendModal()}
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </div>
            <p className="um_modal_desc">
              Are you sure you want to suspend{" "}
              <strong>{suspendRow.name}</strong>? The company will be marked inactive
              and affected users may lose access until it is reactivated.
            </p>
            <form onSubmit={submitSuspendCompany}>
              <div className="um_field">
                <label
                  htmlFor="cp-suspend-reason"
                  className="um_field_label_row"
                >
                  <Ban className="um_field_label_icon" size={17} aria-hidden />
                  <span>Reason</span>
                </label>
                <textarea
                  id="cp-suspend-reason"
                  className="um_field_textarea"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  rows={3}
                  required
                  disabled={suspendSubmitting}
                  aria-required
                />
              </div>
              {suspendErr ? (
                <p className="um_msg_error um_modal_form_error" role="alert">
                  {suspendErr}
                </p>
              ) : null}
              <div className="um_modal_actions add_contact_modal_actions">
                <button
                  type="button"
                  className="um_btn_secondary"
                  disabled={suspendSubmitting}
                  onClick={() => closeSuspendModal()}
                >
                  <X size={16} strokeWidth={2} aria-hidden />
                  Close
                </button>
                <button
                  type="submit"
                  className="um_btn_primary"
                  disabled={suspendSubmitting || !suspendReason.trim()}
                >
                  <Ban size={16} aria-hidden />
                  {suspendSubmitting ? "Suspending…" : "Suspend"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {addOpen ? (
        <div
          className="um_modal_overlay"
          role="presentation"
        >
          <div
            className="um_modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cp-add-title"
          >
            <div className="um_modal_head">
              <h3 id="cp-add-title" className="um_modal_title">
                Add company
              </h3>
              <button
                type="button"
                className="um_modal_close"
                aria-label="Close"
                onClick={closeAddModal}
                disabled={addSubmitting}
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </div>
            <p className="um_modal_desc">
              Register an organization that can use the portal.
            </p>
            <form onSubmit={submitAddCompany}>
              {addOk ? (
                <p className="um_msg_ok" role="status">
                  {addOk}
                </p>
              ) : null}
              <div className="um_field">
                <label htmlFor="cp-add-name" className="um_field_label_row">
                  <Building2 className="um_field_label_icon" size={17} aria-hidden />
                  <span>Company name</span>
                </label>
                <input
                  id="cp-add-name"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. Acme Capital LLC"
                  required
                  disabled={addSubmitting}
                />
              </div>
              {addErr ? (
                <p className="um_msg_error um_modal_form_error" role="alert">
                  {addErr}
                </p>
              ) : null}
              <div className="um_modal_actions add_contact_modal_actions">
                <button
                  type="button"
                  className="um_btn_secondary"
                  onClick={closeAddModal}
                  disabled={addSubmitting}
                >
                  <X size={16} strokeWidth={2} aria-hidden />
                  Close
                </button>
                <button
                  type="submit"
                  className="um_btn_primary"
                  disabled={addSubmitting || !addName.trim()}
                >
                  <Plus size={16} strokeWidth={2} aria-hidden />
                  {addSubmitting ? "Saving…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      <ExportCompaniesModal
        open={companiesExportOpen}
        onClose={() => setCompaniesExportOpen(false)}
        companies={customersTabRows}
        listKind={customersListTab}
      />
    </section>
  );
}
