import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  Building2,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  Info,
  LayoutGrid,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Upload,
  User,
  UserCog,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  SESSION_BEARER_KEY,
  SESSION_USER_DETAILS_KEY,
} from "../../../common/auth/sessionKeys";
import { decodeJwtPayload } from "../../auth/utils/decode-jwt-payload";
import { formatUsPhoneStoredForUi } from "../../../common/phone/usPhoneNumber";
import { getApiV1Base } from "../../../common/utils/apiBaseUrl";
import { isCompanyAdmin, isPlatformAdmin } from "../../../common/auth/roleUtils";
import {
  getSessionOrganizationCompanyId,
  resolvePlatformAdminMembersListScope,
} from "../../../common/auth/sessionOrganization";
import { DataTablePagination } from "../../../common/components/DataTablePagination/DataTablePagination";
import { TableHScrollShell } from "../../../common/components/data-table/TableHScrollShell";
import { ViewReadonlyField } from "../../../common/components/ViewReadonlyField";
import { toast } from "../../../common/components/Toast";
import { MemberRoleBadge } from "./MemberRoleBadge";
import {
  COMPANY_EDIT_ROLE_OPTIONS,
  COMPANY_INVITE_ROLE_OPTIONS,
  MEMBER_AUDIT_ACTION_EDIT,
  MEMBER_AUDIT_ACTION_SUSPEND,
  MEMBER_STATUS_EDIT_OPTIONS,
  PLATFORM_INVITE_ROLE_OPTIONS,
  accountInviteIsExpired,
  accountStatusForUi,
  accountStatusLabel,
  // assignedDealCountFromRow,
  formatMemberUsername,
  formatOrganizationsCsvCell,
  formatRoleCsvCell,
  formatValue,
  isOrgStaffPortalRole,
  memberUserCellPrimaryLabel,
  memberInvitePending,
  memberRowIsCurrentUser,
  memberRowIsInactive,
  membershipsSortValue,
  normalizeMemberStatusForEdit,
  organizationsSortValue,
  primaryRoleLabelFromRow,
  resolveOrganizationDisplayScope,
  rowDisplayName,
  roleSortValue,
  syncSessionUserDetailsById,
  userStatusForUi,
  type OrganizationDisplayScope,
} from "./memberAdminShared";
import { UserOrganizationsCell } from "./UserOrganizationsCell";
import { ExportMembersModal } from "./ExportMembersModal";
import { buildMembersCsv, downloadMembersCsv, exportAuditLinesForMembers } from "./memberCsv";
import { notifyMembersExportAudit } from "./membersExportNotifyApi";
import { buildTableExportFilename } from "../../../common/utils/tableExportFilename";
import {
  displayEmail,
  isDisplayableEmail,
} from "../../../common/utils/displayEmail";
import {
  getCurrentSessionUserEmail,
  openSendMailDraft,
  parseEmailInput,
} from "../../../common/features/send-mail";
import {
  SendMailEmailPreviewModal,
  type SendMailEmailPreviewPayload,
} from "../contacts/components/SendMailEmailPreviewModal";
import { RadioPillGroup } from "../../../common/components/radio-pill-group/RadioPillGroup";
import { TabsScrollStrip } from "../../../common/components/tabs-scroll-strip/TabsScrollStrip";
import { DealsCreateDropdownSelect } from "../Deals/components/DealsCreateDropdownSelect";
import {
  loadEmailTemplates,
  type EmailTemplateRow,
} from "../contacts/emailTemplatesStorage";
import "../../../common/components/data-table/data-table.css";
import "../contacts/contacts.css";
import "./user_management.css";
import "../Deals/deals-list.css";
import "../Deals/tabs/investors/add-investment-modal.css";

function initialsFromRow(row: Record<string, unknown>): string {
  const first = String(row.firstName ?? row.first_name ?? "").trim();
  const last = String(row.lastName ?? row.last_name ?? "").trim();
  if (first && last) {
    return (first[0] + last[0]).toUpperCase();
  }
  if (first.length >= 2) return first.slice(0, 2).toUpperCase();
  const u = String(row.username ?? "").trim();
  if (u.length >= 2) return u.slice(0, 2).toUpperCase();
  const e = String(row.email ?? "").trim();
  if (e.length >= 2) return e.slice(0, 2).toUpperCase();
  return "?";
}

function StatusWithDot({
  positive,
  label,
  dotTone,
}: {
  positive: boolean;
  label: string;
  dotTone?: "invited";
}) {
  if (label === "—") {
    return <span className="um_status_muted">—</span>;
  }
  const dotClass =
    dotTone === "invited"
      ? "um_status_dot um_status_dot_invited"
      : positive
        ? "um_status_dot um_status_dot_active"
        : "um_status_dot um_status_dot_inactive";
  return (
    <span className="um_status_cell">
      <span className={dotClass} aria-hidden />
      <span className="um_status_label">{label}</span>
    </span>
  );
}

/** Label used in badge, sort, export, and search (hides portal “Deal Participant”). */
function roleBadgeLabel(row: Record<string, unknown>): string {
  return primaryRoleLabelFromRow(row);
}

function rowOrganizationId(row: Record<string, unknown>): string | undefined {
  const v = row.organizationId ?? row.organization_id;
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

function rowStableId(row: Record<string, unknown>, index: number): string {
  const id = row.id;
  if (typeof id === "string" && id) return id;
  if (typeof id === "number") return String(id);
  return `idx-${index}`;
}

function rowMatchesSearch(
  row: Record<string, unknown>,
  query: string,
  organizationScope?: OrganizationDisplayScope | null,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    rowDisplayName(row),
    formatValue(row.email),
    formatMemberUsername(row.username),
    formatValue(row.companyName),
    formatUsPhoneStoredForUi(row.phone),
    formatValue(row.role),
    roleBadgeLabel(row),
    primaryRoleLabelFromRow(row),
    membershipsSortValue(row),
    organizationsSortValue(row, organizationScope),
    formatRoleCsvCell(row),
    formatOrganizationsCsvCell(row, organizationScope),
    formatValue(row.userStatus),
    accountStatusLabel(row),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

type MemberSortKey =
  | "user"
  | "role"
  | "organizations"
  | "status"
  | "accountStatus";

function memberSortValue(
  row: Record<string, unknown>,
  key: MemberSortKey,
  organizationScope?: OrganizationDisplayScope | null,
): string {
  switch (key) {
    case "user":
      return `${rowDisplayName(row)} ${formatMemberUsername(row.username)}`.toLowerCase();
    case "role":
      return roleSortValue(row);
    case "organizations":
      return organizationsSortValue(row, organizationScope);
    case "status":
      return userStatusForUi(row).label;
    case "accountStatus":
      return accountStatusForUi(row).label;
    default:
      return "";
  }
}

function buildSortColumns(organizationScoped = false): {
  key: MemberSortKey;
  label: string;
}[] {
  return [
    { key: "user", label: "User" },
    { key: "role", label: "Roles" },
    {
      key: "organizations",
      label: organizationScoped ? "Organization" : "Organizations",
    },
    { key: "status", label: "User Status" },
    { key: "accountStatus", label: "Account status" },
    /* Deals: hidden on /members only; still shown on /customers/:companyId/members (CompanyMembersPage).
    { key: "deals", label: "Deals" },
    */
  ];
}

function readSessionMemberRows(): Record<string, unknown>[] {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_DETAILS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (x): x is Record<string, unknown> =>
            x !== null && typeof x === "object" && !Array.isArray(x),
        );
      }
    }
  } catch {
    /* ignore */
  }
  return [];
}

type RoleMatrixCardIcon = "shield-check" | "layout-grid";

type RoleMatrixCardDef = {
  id: string;
  title: string;
  description: string;
  cardIcon: RoleMatrixCardIcon;
};

type RoleMatrixGroupDef = {
  id: string;
  sectionTitle: string;
  sectionDescription: string;
  headerIcon: LucideIcon;
  cards: RoleMatrixCardDef[];
};

const ROLE_MATRIX_GROUPS: RoleMatrixGroupDef[] = [
  {
    id: "platform",
    sectionTitle: "Platform Users",
    sectionDescription: "Platform-level roles for system administration.",
    headerIcon: Shield,
    cards: [
      {
        id: "platform-administrator",
        title: "Platform Admin",
        description:
          "Full access across the platform. Register organizations, view all members and the company column, and send invites tied to any company.",
        cardIcon: "shield-check",
      },
      {
        id: "platform-user",
        title: "Platform user",
        description:
          "Standard access without org-admin tools. Use assigned modules (for example Deals), view the company directory, and sign in at the platform layer.",
        cardIcon: "layout-grid",
      },
    ],
  },
  {
    id: "company",
    sectionTitle: "Company Members",
    sectionDescription:
      "Organization-level roles for people tied to a company and its membership.",
    headerIcon: Building2,
    cards: [
      {
        id: "company-administrator",
        title: "Company Admin",
        description:
          "Manage members and invitations for your organization. First signup that creates a new company name is promoted to this role automatically.",
        cardIcon: "shield-check",
      },
      {
        id: "company-member",
        title: "Company Member",
        description:
          "Day-to-day portal use for your team, including invites to an existing organization and typical employees without admin privileges (for example when assigned via a platform-admin invite).",
        cardIcon: "layout-grid",
      },
    ],
  },
];

const CARD_ICON_MAP: Record<RoleMatrixCardIcon, LucideIcon> = {
  "shield-check": ShieldCheck,
  "layout-grid": LayoutGrid,
};

function MembersRoleIconBox({
  Icon,
  size = "sm",
}: {
  Icon: LucideIcon;
  size?: "sm" | "lg";
}) {
  return (
    <span
      className={
        size === "lg" ? "um_role_icon_shell um_role_icon_shell_lg" : "um_role_icon_shell"
      }
      aria-hidden
    >
      <Icon className="um_role_icon_svg" size={size === "lg" ? 28 : 20} strokeWidth={1.65} />
    </span>
  );
}

function MembersRoleInfoPanel() {
  // Company admins: Company Members section only. Platform admins (and other non–company-admin viewers here): Platform + Company.
  const roleMatrixGroups = isCompanyAdmin()
    ? ROLE_MATRIX_GROUPS.filter((g) => g.id === "company")
    : ROLE_MATRIX_GROUPS;

  return (
    <div className="um_role_definitions">
      <header className="um_role_definitions_page_head">
        <h2 className="um_role_definitions_title">Role Definitions</h2>
        <p className="um_role_definitions_subtitle">
          Permissions matrix for available roles by user type.
        </p>
      </header>

      {roleMatrixGroups.map((group) => {
        const HeaderIcon = group.headerIcon;
        return (
          <section key={group.id} className="um_role_matrix_section">
            <div className="um_role_matrix_section_head">
              <MembersRoleIconBox Icon={HeaderIcon} size="lg" />
              <div className="um_role_matrix_section_head_text">
                <h3 className="um_role_matrix_section_title">{group.sectionTitle}</h3>
                <p className="um_role_matrix_section_desc">{group.sectionDescription}</p>
              </div>
            </div>
            <div className="um_role_matrix_cards">
              {group.cards.map((card) => {
                const CardIcon = CARD_ICON_MAP[card.cardIcon];
                return (
                  <article key={`${group.id}-${card.id}`} className="um_role_matrix_card">
                    <div className="um_role_matrix_card_top">
                      <MembersRoleIconBox Icon={CardIcon} />
                      <div className="um_role_matrix_card_titles">
                        <h4 className="um_role_matrix_card_title">{card.title}</h4>
                      </div>
                    </div>
                    <p className="um_role_matrix_card_desc">{card.description}</p>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const ORG_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Platform-admin invite modal: this org name gets platform roles only; others get company roles only. */
const SYNDICATION_X_INVITE_COMPANY_NAME = "SyndicationX";

export type UserManagementPageProps = {
  /**
   * **Settings → Members (embedded):** pass the platform admin’s target
   * `organizationId` so the list is `GET /users?organizationId=…` for that org.
   * Use `false` when they have no org. Omit on standalone `/members` to resolve
   * the org from session/workspace (same as this page embedded in Company settings).
   */
  membersOrganizationScope?: string | false;
  /** Display name for the workspace company (Settings → Org Members embed). */
  membersWorkspaceCompanyName?: string;
};

function usersListUrl(
  api: string,
  membersOrganizationScope: string | false | undefined,
): string | null {
  const base = `${api}/users`;
  if (membersOrganizationScope === false) return null;
  if (
    typeof membersOrganizationScope === "string" &&
    ORG_UUID_RE.test(membersOrganizationScope)
  ) {
    return `${base}?organizationId=${encodeURIComponent(membersOrganizationScope)}`;
  }
  return base;
}

export default function UserManagementPage({
  membersOrganizationScope,
  membersWorkspaceCompanyName,
}: UserManagementPageProps = {}) {
  const token = sessionStorage.getItem(SESSION_BEARER_KEY);
  const apiV1 = getApiV1Base();
  const navigate = useNavigate();
  const suspendAllTitleId = useId();

  const currentUserId = useMemo(() => {
    if (!token) return "";
    const p = decodeJwtPayload<{ id?: unknown }>(token);
    const id = p?.id;
    if (id == null || id === "") return "";
    return String(id).trim().toLowerCase();
  }, [token]);

  const membersListScope = useMemo((): string | false | undefined => {
    if (membersOrganizationScope !== undefined) {
      return membersOrganizationScope;
    }
    const platformScope = resolvePlatformAdminMembersListScope();
    if (platformScope !== undefined) return platformScope;
    const active = getSessionOrganizationCompanyId();
    if (active && ORG_UUID_RE.test(active)) return active;
    return undefined;
  }, [membersOrganizationScope, token, currentUserId]);

  const organizationDisplayScope = useMemo((): OrganizationDisplayScope | undefined => {
    if (typeof membersListScope !== "string" || !ORG_UUID_RE.test(membersListScope)) {
      return undefined;
    }
    return resolveOrganizationDisplayScope(
      membersListScope,
      membersWorkspaceCompanyName,
    );
  }, [membersListScope, membersWorkspaceCompanyName]);

  const [memberRows, setMemberRows] =
    useState<Record<string, unknown>[]>(readSessionMemberRows);
  const [membersLoadError, setMembersLoadError] = useState("");
  const [membersLoading, setMembersLoading] = useState(true);

  useEffect(() => {
    if (!token || !apiV1) {
      setMembersLoading(false);
      return;
    }
    if (membersListScope === false) {
      setMemberRows([]);
      setMembersLoadError("");
      setMembersLoading(false);
      return;
    }
    const listUrl = usersListUrl(apiV1, membersListScope);
    if (listUrl == null) {
      setMembersLoading(false);
      return;
    }
    let cancelled = false;
    setMembersLoading(true);
    setMembersLoadError("");
    void (async () => {
      try {
        const res = await fetch(listUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json().catch(() => ({}))) as {
          users?: unknown;
          message?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setMembersLoadError(data.message || "Could not load members.");
          return;
        }
        const list = Array.isArray(data.users) ? data.users : [];
        const normalized = list.filter(
          (x): x is Record<string, unknown> =>
            x !== null &&
            typeof x === "object" &&
            !Array.isArray(x) &&
            isOrgStaffPortalRole(x.role),
        );
        setMemberRows(normalized);
        setActionMenuRowId(null);
        setActionMenuRow(null);
        setMenuPos(null);
      } catch {
        if (!cancelled) setMembersLoadError("Unable to connect.");
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, apiV1, membersListScope]);

  const refreshMembersAfterInvite = useCallback(async () => {
    if (!token || !apiV1) return;
    if (membersListScope === false) {
      setMemberRows([]);
      return;
    }
    const listUrl = usersListUrl(apiV1, membersListScope);
    if (listUrl == null) return;
    try {
      const res = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        users?: unknown;
      };
      if (!res.ok) return;
      const list = Array.isArray(data.users) ? data.users : [];
      const normalized = list.filter(
        (x): x is Record<string, unknown> =>
          x !== null &&
          typeof x === "object" &&
          !Array.isArray(x) &&
          isOrgStaffPortalRole(x.role),
      );
      setMemberRows(normalized);
    } catch {
      /* ignore */
    }
  }, [token, apiV1, membersListScope]);

  useEffect(() => {
    if (!token || !apiV1) return;
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshMembersAfterInvite();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [token, apiV1, refreshMembersAfterInvite]);

  /**
   * Platform admins invite via `/companies` picker + assignable roles; company admins use
   * the current members list organization only (no picker).
   */
  const showCompanyColumn = isPlatformAdmin();
  const showInviteRolePicker = showCompanyColumn || isCompanyAdmin();
  const sortColumns = useMemo(
    () => buildSortColumns(Boolean(organizationDisplayScope?.companyId)),
    [organizationDisplayScope],
  );
  const membersTableColSpan = 1 + sortColumns.length + 1;

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCompanyId, setInviteCompanyId] = useState("");
  const [inviteInvitedRole, setInviteInvitedRole] = useState("");
  const [inviteCompanies, setInviteCompanies] = useState<
    { id: string; name: string }[]
  >([]);
  const [inviteCompaniesError, setInviteCompaniesError] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [membersTab, setMembersTab] = useState<"users" | "general">("users");
  const [searchQuery, setSearchQuery] = useState("");
  const [membersPage, setMembersPage] = useState(1);
  const [membersPageSize, setMembersPageSize] = useState(10);
  const [toolbarNotice, setToolbarNotice] = useState("");
  const [membersExportOpen, setMembersExportOpen] = useState(false);
  const [selectedMemberRowIds, setSelectedMemberRowIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [sendMailModalOpen, setSendMailModalOpen] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplateRow[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [sendMailCc, setSendMailCc] = useState("");
  const [sendMailEmailPreview, setSendMailEmailPreview] =
    useState<SendMailEmailPreviewPayload | null>(null);
  const memberSelectAllRef = useRef<HTMLInputElement | null>(null);
  const [sortKey, setSortKey] = useState<MemberSortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [actionMenuRowId, setActionMenuRowId] = useState<string | null>(null);
  const [actionMenuRow, setActionMenuRow] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [viewRow, setViewRow] = useState<Record<string, unknown> | null>(null);
  const [reinviteBusyId, setReinviteBusyId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [editOrganizationId, setEditOrganizationId] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editUserStatus, setEditUserStatus] = useState("active");
  const [editReason, setEditReason] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState("");
  const [suspendRow, setSuspendRow] = useState<Record<string, unknown> | null>(
    null,
  );
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendSaving, setSuspendSaving] = useState(false);
  const [suspendErr, setSuspendErr] = useState("");
  const [suspendAllOpen, setSuspendAllOpen] = useState(false);
  const [suspendAllReason, setSuspendAllReason] = useState("");
  const [suspendAllErr, setSuspendAllErr] = useState("");
  const [suspendAllBusy, setSuspendAllBusy] = useState(false);
  const kebabPortalRef = useRef<HTMLUListElement | null>(null);
  const kebabTriggerRef = useRef<HTMLButtonElement | null>(null);

  const closeActionMenu = useCallback(() => {
    setActionMenuRowId(null);
    setActionMenuRow(null);
    setMenuPos(null);
  }, []);

  const filteredRows = useMemo(
    () =>
      memberRows.filter((row) =>
        rowMatchesSearch(row, searchQuery, organizationDisplayScope),
      ),
    [memberRows, searchQuery, organizationDisplayScope],
  );

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    if (!sortColumns.some((c) => c.key === sortKey)) {
      return filteredRows;
    }
    const mult = sortDir === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const va = memberSortValue(a, sortKey, organizationDisplayScope).toLowerCase();
      const vb = memberSortValue(b, sortKey, organizationDisplayScope).toLowerCase();
      return va.localeCompare(vb, undefined, { sensitivity: "base" }) * mult;
    });
  }, [filteredRows, sortKey, sortDir, sortColumns, organizationDisplayScope]);

  useEffect(() => {
    setMembersPage(1);
  }, [searchQuery, sortKey, sortDir]);

  const membersTableTotalPages = Math.max(
    1,
    Math.ceil(sortedRows.length / membersPageSize),
  );

  useEffect(() => {
    if (membersPage > membersTableTotalPages) {
      setMembersPage(membersTableTotalPages);
    }
  }, [membersPage, membersTableTotalPages]);

  const membersPageSafe = Math.min(membersPage, membersTableTotalPages);

  const membersPaginatedRows = useMemo(() => {
    const start = (membersPageSafe - 1) * membersPageSize;
    return sortedRows.slice(start, start + membersPageSize);
  }, [sortedRows, membersPageSafe, membersPageSize]);

  const sortedRowStableIds = useMemo(
    () => sortedRows.map((row, i) => rowStableId(row, i)),
    [sortedRows],
  );

  const selectedMemberRows = useMemo(
    () =>
      sortedRows.filter((row, i) =>
        selectedMemberRowIds.has(rowStableId(row, i)),
      ),
    [sortedRows, selectedMemberRowIds],
  );
  const membersToSuspend = useMemo(
    () =>
      sortedRows.filter(
        (row) =>
          !memberRowIsInactive(row) &&
          !memberRowIsCurrentUser(row, currentUserId),
      ),
    [sortedRows, currentUserId],
  );
  const senderEmail = useMemo(() => getCurrentSessionUserEmail(), []);
  const selectedTemplate = useMemo(
    () => emailTemplates.find((t) => t.id === selectedTemplateId) ?? null,
    [emailTemplates, selectedTemplateId],
  );
  const allMembersFilteredSelected =
    sortedRows.length > 0 &&
    sortedRowStableIds.every((id) => selectedMemberRowIds.has(id));
  const someMembersSelected =
    sortedRowStableIds.some((id) => selectedMemberRowIds.has(id)) &&
    !allMembersFilteredSelected;

  useLayoutEffect(() => {
    const el = memberSelectAllRef.current;
    if (el) {
      el.indeterminate = someMembersSelected;
    }
  }, [someMembersSelected, allMembersFilteredSelected]);

  useEffect(() => {
    const valid = new Set(
      sortedRows.map((row, i) => rowStableId(row, i)),
    );
    setSelectedMemberRowIds((prev) => {
      if (prev.size === 0) {
        return prev;
      }
      const next = new Set<string>();
      for (const id of prev) {
        if (valid.has(id)) {
          next.add(id);
        }
      }
      if (next.size === prev.size) {
        for (const id of prev) {
          if (!next.has(id)) {
            return next;
          }
        }
        return prev;
      }
      return next;
    });
  }, [sortedRows]);

  const toggleMemberRowSelected = useCallback(
    (row: Record<string, unknown>, indexInSorted: number) => {
      const id = rowStableId(row, indexInSorted);
      setSelectedMemberRowIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [],
  );

  const toggleSelectAllMembersFiltered = useCallback(() => {
    if (sortedRowStableIds.length === 0) {
      return;
    }
    if (allMembersFilteredSelected) {
      setSelectedMemberRowIds((prev) => {
        const next = new Set(prev);
        for (const id of sortedRowStableIds) {
          next.delete(id);
        }
        return next;
      });
    } else {
      setSelectedMemberRowIds(
        (prev) => new Set([...prev, ...sortedRowStableIds]),
      );
    }
  }, [sortedRowStableIds, allMembersFilteredSelected]);

  const openMenuContext =
    actionMenuRowId && actionMenuRow
      ? { row: actionMenuRow, rowId: actionMenuRowId }
      : null;

  const updateKebabMenuPosition = useCallback(() => {
    if (!actionMenuRowId) {
      setMenuPos(null);
      return;
    }
    const el = kebabTriggerRef.current;
    if (!(el instanceof HTMLElement)) {
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
  }, [actionMenuRowId]);

  useLayoutEffect(() => {
    if (!actionMenuRowId) {
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
  }, [actionMenuRowId, updateKebabMenuPosition]);

  useEffect(() => {
    if (actionMenuRowId == null) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (kebabTriggerRef.current?.contains(t)) return;
      if (kebabPortalRef.current?.contains(t)) return;
      closeActionMenu();
    };
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [actionMenuRowId, closeActionMenu]);

  useEffect(() => {
    if (actionMenuRowId == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeActionMenu();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [actionMenuRowId, closeActionMenu]);

  const toggleSort = useCallback((key: MemberSortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  const sendInviteForEmail = useCallback(
    async (
      email: string,
      companyId?: string,
      invitedRole?: string,
    ): Promise<{
      ok: boolean;
      message: string;
      signupUrl?: string;
      emailSent?: boolean;
    }> => {
      if (!token || !apiV1) {
        return { ok: false, message: "Not signed in." };
      }
      const body: {
        email: string;
        companyId?: string;
        invitedRole?: string;
      } = {
        email: email.trim().toLowerCase(),
      };
      if (companyId) body.companyId = companyId;
      if (invitedRole) body.invitedRole = invitedRole;
      const response = await fetch(`${apiV1}/auth/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        signupUrl?: string;
        emailSent?: boolean;
      };
      if (!response.ok) {
        return { ok: false, message: data.message || "Could not send invite." };
      }
      return {
        ok: true,
        message: data.message || "Invitation sent.",
        signupUrl: data.signupUrl,
        emailSent: data.emailSent,
      };
    },
    [token, apiV1],
  );

  function exportRowCsv(row: Record<string, unknown>) {
    const csv = buildMembersCsv([row], organizationDisplayScope);
    const filename = buildTableExportFilename({
      dealName: rowDisplayName(row),
      tableSlug: "member",
    });
    downloadMembersCsv(csv, filename);
    void notifyMembersExportAudit({
      rowCount: 1,
      exportedMemberLines: exportAuditLinesForMembers([row]),
    });
    closeActionMenu();
    setToolbarNotice("");
    toast.success("Member exported", `Saved as ${filename}`);
  }

  async function reinviteRow(row: Record<string, unknown>, rowId: string) {
    const email = String(row.email ?? "").trim();
    if (!email) {
      toast.error("Cannot reinvite", "No email on file for this user.");
      closeActionMenu();
      return;
    }
    setReinviteBusyId(rowId);
    setToolbarNotice("");
    try {
      const orgId = showCompanyColumn ? rowOrganizationId(row) : undefined;
      const invitedRole = showCompanyColumn
        ? String(row.role ?? "").trim() || undefined
        : isCompanyAdmin()
          ? String(row.role ?? "").trim() || "company_user"
          : undefined;
      const result = await sendInviteForEmail(email, orgId, invitedRole);
      if (result.ok) {
        toast.success("User invited successfully");
        void refreshMembersAfterInvite();
      } else {
        toast.error("Reinvite failed", result.message);
      }
    } catch {
      toast.error("Reinvite failed", "Unable to connect. Try again later.");
    } finally {
      setReinviteBusyId(null);
      closeActionMenu();
    }
  }

  function handleSuspendAll() {
    if (membersToSuspend.length === 0) return;
    setToolbarNotice("");
    setSuspendAllErr("");
    setSuspendAllReason("");
    setSuspendAllOpen(true);
  }

  function closeSuspendAllModal() {
    if (suspendAllBusy) return;
    setSuspendAllOpen(false);
    setSuspendAllErr("");
    setSuspendAllReason("");
  }

  async function confirmSuspendAll(e: FormEvent) {
    e.preventDefault();
    if (!token || !apiV1 || membersToSuspend.length === 0) return;
    const reason = suspendAllReason.trim();
    if (!reason) {
      setSuspendAllErr("Please enter a reason for suspending these members.");
      return;
    }
    setSuspendAllBusy(true);
    setSuspendAllErr("");
    const targets = [...membersToSuspend];
    const n = targets.length;
    let failed = 0;
    const updatedUsers: Record<string, Record<string, unknown>> = {};
    try {
      for (const row of targets) {
        const id = String(row.id ?? "").trim();
        if (!id) {
          failed += 1;
          continue;
        }
        const res = await fetch(`${apiV1}/users/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            userStatus: "inactive",
            reason,
            action: MEMBER_AUDIT_ACTION_SUSPEND,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
          user?: Record<string, unknown>;
        };
        if (!res.ok) {
          failed += 1;
          continue;
        }
        if (data.user && typeof data.user === "object") {
          updatedUsers[id] = data.user;
          syncSessionUserDetailsById(id, data.user);
        }
      }
      if (Object.keys(updatedUsers).length > 0) {
        setMemberRows((prev) =>
          prev.map((r) => {
            const id = String(r.id ?? "").trim();
            const u = updatedUsers[id];
            return u ? { ...r, ...u } : r;
          }),
        );
      }
      setSelectedMemberRowIds(new Set());
      setSuspendAllOpen(false);
      setSuspendAllReason("");
      const succeeded = n - failed;
      if (failed > 0) {
        toast.error(
          "Could not suspend all members",
          succeeded > 0
            ? `Suspended ${succeeded} of ${n}; ${failed} failed. Refresh and try again for the rest.`
            : "None of the members could be suspended. Try again.",
        );
        if (succeeded > 0) {
          toast.success(
            "Members suspended",
            `Marked ${succeeded} member${succeeded === 1 ? "" : "s"} inactive.`,
          );
        }
        return;
      }
      toast.success(
        "Members suspended",
        `Marked ${n} member${n === 1 ? "" : "s"} inactive.`,
      );
    } catch {
      setSuspendAllErr("Unable to connect.");
      toast.error("Could not suspend members", "Unable to connect.");
    } finally {
      setSuspendAllBusy(false);
    }
  }

  const openSendMailModal = useCallback(() => {
    void (async () => {
      const templates = (await loadEmailTemplates()).filter((t) => !t.archived);
      setEmailTemplates(templates);
      setSelectedTemplateId((prev) =>
        prev && templates.some((t) => t.id === prev)
          ? prev
          : (templates[0]?.id ?? ""),
      );
      setSendMailCc("");
      setSendMailModalOpen(true);
    })();
  }, []);

  const closeSendMailModal = useCallback(() => {
    setSendMailModalOpen(false);
    setSendMailEmailPreview(null);
  }, []);

  const goNewTemplateFromSendMail = useCallback(() => {
    navigate("/contacts/email-templates/new");
  }, [navigate]);

  const openSendMailEmailPreview = useCallback(
    (mode: "view" | "edit") => {
      const template = emailTemplates.find((t) => t.id === selectedTemplateId);
      if (!template) {
        toast.error("Template required", "Choose an email template first.");
        return;
      }
      const emails = [
        ...new Set(
          selectedMemberRows
            .map((r) => String(r.email ?? "").trim())
            .filter((e) => e.includes("@")),
        ),
      ];
      if (emails.length === 0) {
        toast.error("No email recipients", "Selected members have no valid email.");
        return;
      }
      setSendMailEmailPreview({
        templateId: template.id,
        templateName: template.name,
        templateArchived: Boolean(template.archived),
        createdBy: template.createdBy,
        createdAt: template.createdAt,
        subject: template.subject,
        bodyHtml: template.body,
        toEmails: emails,
        ccEmails: parseEmailInput(sendMailCc),
        attachment: template.attachment,
        startInEditMode: mode === "edit",
      });
    },
    [emailTemplates, selectedMemberRows, selectedTemplateId, sendMailCc],
  );

  const handleSendMailPreviewSaved = useCallback(
    (patch: { subject: string; bodyHtml: string }) => {
      setSendMailEmailPreview((p) =>
        p ? { ...p, ...patch, startInEditMode: false } : null,
      );
      void loadEmailTemplates().then((rows) => {
        setEmailTemplates(rows.filter((t) => !t.archived));
      });
    },
    [],
  );

  const handleSendMailToSelectedMembers = useCallback(async () => {
    const emails = [
      ...new Set(
        selectedMemberRows
          .map((r) => String(r.email ?? "").trim())
          .filter((e) => e.includes("@")),
      ),
    ];
    if (emails.length === 0) {
      toast.error("No email recipients", "Selected members have no valid email.");
      return;
    }
    const template = emailTemplates.find((t) => t.id === selectedTemplateId);
    if (!template) {
      toast.error("Template required", "Choose an email template first.");
      return;
    }
    const result = await openSendMailDraft({
      to: emails,
      ccRaw: sendMailCc,
      templateSubject: template.subject,
      templateBodyHtml: template.body,
      senderEmail,
    });
    if (!result.ok) {
      toast.error("Could not send email", result.message);
      return;
    }
    toast.success("Email sent", "Message was sent from server.");
    closeSendMailModal();
  }, [
    emailTemplates,
    selectedMemberRows,
    selectedTemplateId,
    sendMailCc,
    senderEmail,
    closeSendMailModal,
  ]);

  function openInviteModal() {
    setInviteOpen(true);
    setInviteEmail("");
    const scopedOrg =
      typeof membersListScope === "string" && ORG_UUID_RE.test(membersListScope)
        ? membersListScope
        : ""
    setInviteCompanyId(showCompanyColumn ? scopedOrg : "");
    setInviteInvitedRole(
      showCompanyColumn ? "" : isCompanyAdmin() ? "company_user" : "",
    );
    setInviteCompaniesError("");
    setInviteError("");
  }

  function closeInviteModal() {
    setInviteOpen(false);
    setInviteLoading(false);
    setInviteError("");
  }

  function openEditMember(row: Record<string, unknown>) {
    if (memberRowIsCurrentUser(row, currentUserId)) {
      toast.error("Cannot edit", "You cannot edit your own account here.");
      return;
    }
    setEditRow(row);
    setEditOrganizationId(rowOrganizationId(row) ?? "");
    const rawRole = String(row.role ?? "").trim();
    const roleForEdit =
      rawRole === "user" || rawRole === "" ? "platform_user" : rawRole;
    setEditRole(roleForEdit);
    setEditUserStatus(normalizeMemberStatusForEdit(row));
    setEditReason("");
    setEditErr("");
  }

  function closeEditMember() {
    setEditRow(null);
    setEditOrganizationId("");
    setEditReason("");
    setEditErr("");
  }
  const companyDropdownOptions = useMemo(
    () => inviteCompanies.map((c) => ({ value: c.id, label: c.name })),
    [inviteCompanies],
  );

  function openSuspendMember(row: Record<string, unknown>) {
    if (memberRowIsCurrentUser(row, currentUserId)) {
      toast.error("Cannot change status", "You cannot suspend or activate your own account here.");
      return;
    }
    setSuspendRow(row);
    setSuspendReason("");
    setSuspendErr("");
  }

  function closeSuspendMember() {
    setSuspendRow(null);
    setSuspendReason("");
    setSuspendErr("");
  }

  async function submitEditMember(e: React.FormEvent) {
    e.preventDefault();
    if (!editRow || !token || !apiV1) return;
    if (memberRowIsCurrentUser(editRow, currentUserId)) {
      setEditErr("You cannot edit your own account.");
      return;
    }
    const id = String(editRow.id ?? "").trim();
    if (!id) {
      setEditErr("Missing member id.");
      return;
    }
    const reason = editReason.trim();
    if (!reason) {
      setEditErr("Please enter a reason for this change.");
      return;
    }
    setEditSaving(true);
    setEditErr("");
    try {
      const prevOrg = (rowOrganizationId(editRow) ?? "").trim();
      const nextOrg = editOrganizationId.trim();
      const organizationPayload =
        showCompanyColumn &&
        nextOrg &&
        prevOrg.toLowerCase() !== nextOrg.toLowerCase()
          ? { organizationId: nextOrg }
          : {};
      const res = await fetch(`${apiV1}/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          role: editRole,
          userStatus: editUserStatus,
          reason,
          action: MEMBER_AUDIT_ACTION_EDIT,
          ...organizationPayload,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        user?: Record<string, unknown>;
      };
      if (!res.ok) {
        const msg = data.message || "Could not save changes.";
        setEditErr(msg);
        toast.error("Could not update member", msg);
        return;
      }
      const u = data.user;
      if (u && typeof u === "object") {
        setMemberRows((prev) =>
          prev.map((r) => (String(r.id) === id ? { ...r, ...u } : r)),
        );
        syncSessionUserDetailsById(id, u);
      }
      const okMsg = data.message || "Member updated.";
      toast.success("Member updated", okMsg);
      closeEditMember();
    } catch {
      setEditErr("Unable to connect.");
      toast.error("Could not update member", "Unable to connect.");
    } finally {
      setEditSaving(false);
    }
  }

  async function submitSuspendMember(e: React.FormEvent) {
    e.preventDefault();
    if (!suspendRow || !token || !apiV1) return;
    if (memberRowIsCurrentUser(suspendRow, currentUserId)) {
      setSuspendErr("You cannot suspend or activate your own account.");
      return;
    }
    const id = String(suspendRow.id ?? "").trim();
    if (!id) {
      setSuspendErr("Missing member id.");
      return;
    }
    const activating = memberRowIsInactive(suspendRow);
    const reason = suspendReason.trim();
    if (!reason) {
      setSuspendErr(
        activating
          ? "Please enter a reason for activating this member."
          : "Please enter a reason for suspending this member.",
      );
      return;
    }
    setSuspendSaving(true);
    setSuspendErr("");
    try {
      const res = await fetch(`${apiV1}/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          activating
            ? {
                userStatus: "active",
                reason,
                action: MEMBER_AUDIT_ACTION_EDIT,
              }
            : {
                userStatus: "inactive",
                reason,
                action: MEMBER_AUDIT_ACTION_SUSPEND,
              },
        ),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        user?: Record<string, unknown>;
      };
      if (!res.ok) {
        const msg =
          data.message ||
          (activating
            ? "Could not activate member."
            : "Could not suspend member.");
        setSuspendErr(msg);
        toast.error(
          activating ? "Could not activate member" : "Could not suspend member",
          msg,
        );
        return;
      }
      const u = data.user;
      if (u && typeof u === "object") {
        setMemberRows((prev) =>
          prev.map((r) => (String(r.id) === id ? { ...r, ...u } : r)),
        );
        syncSessionUserDetailsById(id, u);
      }
      const okMsg =
        data.message ||
        (activating ? "Member marked active." : "Member marked inactive.");
      toast.success(
        activating ? "Member activated" : "Member suspended",
        okMsg,
      );
      closeSuspendMember();
    } catch {
      setSuspendErr("Unable to connect.");
      toast.error(
        activating ? "Could not activate member" : "Could not suspend member",
        "Unable to connect.",
      );
    } finally {
      setSuspendSaving(false);
    }
  }

  const editRoleSelectOptions = useMemo(
    () =>
      showCompanyColumn
        ? PLATFORM_INVITE_ROLE_OPTIONS
        : COMPANY_EDIT_ROLE_OPTIONS,
    [showCompanyColumn],
  );

  const inviteModalRoleOptions = useMemo(() => {
    if (!showCompanyColumn || !inviteCompanyId.trim()) return [];
    const company = inviteCompanies.find((c) => c.id === inviteCompanyId);
    if (!company) return [];
    const name = String(company.name ?? "").trim();
    const isSyndicationX = name === SYNDICATION_X_INVITE_COMPANY_NAME;
    if (isSyndicationX) {
      return PLATFORM_INVITE_ROLE_OPTIONS.filter((o) =>
        o.value === "platform_admin" || o.value === "platform_user",
      );
    }
    return PLATFORM_INVITE_ROLE_OPTIONS.filter(
      (o) => o.value === "company_admin" || o.value === "company_user",
    );
  }, [showCompanyColumn, inviteCompanies, inviteCompanyId]);

  const inviteRolePickerOptions = useMemo(() => {
    if (showCompanyColumn) return inviteModalRoleOptions;
    if (isCompanyAdmin()) return COMPANY_INVITE_ROLE_OPTIONS;
    return [];
  }, [showCompanyColumn, inviteModalRoleOptions]);

  useEffect(() => {
    if (!inviteOpen || !showInviteRolePicker) return;
    if (!inviteInvitedRole.trim()) return;
    const allowed = inviteRolePickerOptions.map((o) => o.value);
    if (allowed.length === 0) return;
    if (!allowed.includes(inviteInvitedRole)) setInviteInvitedRole("");
  }, [
    inviteOpen,
    showInviteRolePicker,
    inviteInvitedRole,
    inviteRolePickerOptions,
  ]);

  useEffect(() => {
    if ((!inviteOpen && !editRow) || !showCompanyColumn || !token || !apiV1)
      return;
    let cancelled = false;
    setInviteCompaniesError("");
    void (async () => {
      const r = await fetch(`${apiV1}/companies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await r.json().catch(() => ({}))) as {
        companies?: unknown;
        message?: string;
      };
      if (cancelled) return;
      if (!r.ok) {
        setInviteCompanies([]);
        const msg = data.message || "Could not load companies.";
        setInviteCompaniesError(msg);
        toast.error("Could not load companies", msg);
        return;
      }
      const list = Array.isArray(data.companies) ? data.companies : [];
      const normalized = list
        .filter(
          (x): x is Record<string, unknown> =>
            x !== null && typeof x === "object" && !Array.isArray(x),
        )
        .map((c) => ({
          id: String(c.id ?? ""),
          name: String(c.name ?? ""),
        }))
        .filter((c) => c.id);
      setInviteCompanies(normalized);
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteOpen, editRow, showCompanyColumn, token, apiV1]);

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !apiV1) return;
    if (showInviteRolePicker && !inviteInvitedRole.trim()) {
      setInviteError("Please select a role.");
      return;
    }
    setInviteLoading(true);
    setInviteError("");
    try {
      const orgForSingleCompanyInvite =
        !showCompanyColumn &&
        typeof membersListScope === "string" &&
        ORG_UUID_RE.test(membersListScope)
          ? membersListScope
          : undefined;
      const result = await sendInviteForEmail(
        inviteEmail,
        showCompanyColumn
          ? inviteCompanyId
          : orgForSingleCompanyInvite,
        showInviteRolePicker ? inviteInvitedRole.trim() : undefined,
      );
      if (!result.ok) {
        setInviteError(result.message);
        toast.error("Invite failed", result.message);
        return;
      }
      toast.success("User invited successfully");
      void refreshMembersAfterInvite();
      closeInviteModal();
    } catch {
      const msg = "Unable to connect. Try again later.";
      setInviteError(msg);
      toast.error("Invite failed", msg);
    } finally {
      setInviteLoading(false);
    }
  }

  if (!token) {
    return (
      <section className="um_page">
        <h2 className="um_title um_title_with_icon">
          <Users className="um_title_icon" size={26} strokeWidth={1.75} aria-hidden />
          Members
        </h2>
        <div className="um_panel">
          <p className="um_hint">
            Sign in to view user details.{" "}
            <Link
              to="/signin"
              style={{ color: "var(--main-auth-button-color, #2563eb)" }}
            >
              Go to sign in
            </Link>
          </p>
        </div>
      </section>
    );
  }

  if (membersListScope === false) {
    return (
      <section className="um_page">
        <h2 className="um_title um_title_with_icon">
          <Users className="um_title_icon" size={26} strokeWidth={1.75} aria-hidden />
          Members
        </h2>
        <div className="um_panel">
          <p className="um_hint">
            No company organization is on your user profile, so there is no member
            list to show here. Associate your account with a company, then return to
            this tab to manage members for that organization.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="um_page" aria-label="Members">
      <div className="um_members_top_row">
        <div className="um_members_tabs_outer deals_tabs_outer um_segmented_tabs_outer">
          <TabsScrollStrip scrollClassName="deals_tabs_scroll um_segmented_tabs_scroll">
            <div
              className="um_members_tabs_row deals_tabs_row um_segmented_tabs_row"
              role="tablist"
              aria-label="Members sections"
            >
              <button
                type="button"
                id="um-members-tab-users"
                role="tab"
                aria-selected={membersTab === "users"}
                aria-controls="um-members-panel-users"
                className={`um_members_tab deals_tabs_tab um_segmented_tab${
                  membersTab === "users" ? " um_members_tab_active" : ""
                }`}
                onClick={() => setMembersTab("users")}
              >
                <Users
                  className="deals_tabs_icon um_segmented_tab_icon"
                  size={16}
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="deals_tabs_label um_segmented_tab_label">
                  Users &amp; Roles
                </span>
              </button>
              <button
                type="button"
                id="um-members-tab-general"
                role="tab"
                aria-selected={membersTab === "general"}
                aria-controls="um-members-panel-general"
                className={`um_members_tab deals_tabs_tab um_segmented_tab${
                  membersTab === "general" ? " um_members_tab_active" : ""
                }`}
                onClick={() => setMembersTab("general")}
              >
                <Info
                  className="deals_tabs_icon um_segmented_tab_icon"
                  size={16}
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="deals_tabs_label um_segmented_tab_label">
                  General Info
                </span>
              </button>
            </div>
          </TabsScrollStrip>
        </div>
        {membersTab === "users" ? (
          <div className="um_members_top_row_actions">
            <button
              type="button"
              className="um_btn_primary"
              onClick={openInviteModal}
            >
              <UserPlus size={18} aria-hidden />
              Invite Member
            </button>
          </div>
        ) : null}
      </div>

      <div className="um_members_tab_content">
      {membersTab === "users" ? (
      <div
        className={`um_panel um_members_tab_panel deal_inv_table_panel deals_list_table_panel${
          membersLoading ? " deals_list_table_panel_loading" : ""
        }`}
        id="um-members-panel-users"
        role="tabpanel"
        aria-labelledby="um-members-tab-users"
        aria-busy={membersLoading}
      >
        <div className="um_toolbar um_toolbar_export_then_search">
          <div className="um_toolbar_actions">
            <button
              type="button"
              className="um_btn_toolbar"
              onClick={openSendMailModal}
              disabled={membersLoading || selectedMemberRows.length === 0}
            >
              <Send size={18} strokeWidth={2} aria-hidden />
              Send email
            </button>
            <button
              type="button"
              className="um_btn_toolbar"
              onClick={handleSuspendAll}
              disabled={membersLoading || membersToSuspend.length === 0}
            >
              <Ban size={18} strokeWidth={2} aria-hidden />
              Suspend All
            </button>
            <button
              type="button"
              className="um_toolbar_export_btn"
              onClick={() => setMembersExportOpen(true)}
              disabled={membersLoading || memberRows.length === 0}
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
              disabled={membersLoading}
              aria-label="Search members"
            />
          </div>
        </div>
        {toolbarNotice ? (
          <p className="um_toolbar_notice" role="status">
            {toolbarNotice}
          </p>
        ) : null}
        {membersLoadError ? (
          <p className="um_msg_error" role="alert">
            {membersLoadError}
          </p>
        ) : null}
        {!membersLoadError ? (
          <div className="um_table_wrap">
            <TableHScrollShell
              active={!membersLoading && sortedRows.length > 0}
              ariaLabel="Members columns"
            >
            <table className="um_table um_table_sortable um_table_members">
              <thead>
                <tr>
                  <th scope="col" className="um_th_checkbox">
                    <input
                      ref={memberSelectAllRef}
                      type="checkbox"
                      className="um_table_header_select_cb"
                      checked={allMembersFilteredSelected}
                      onChange={toggleSelectAllMembersFiltered}
                      disabled={membersLoading || sortedRows.length === 0}
                      aria-label="Select all members in this list"
                    />
                  </th>
                  {sortColumns.map(({ key, label }) => {
                    const active = sortKey === key;
                    const ariaSort = active
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none";
                    return (
                      <th key={key} scope="col" aria-sort={ariaSort}>
                        <button
                          type="button"
                          className="um_sort_header_ctl"
                          onClick={() => toggleSort(key)}
                          aria-label={
                            active
                              ? `${label}, sorted ${sortDir === "asc" ? "ascending" : "descending"}. Click to reverse.`
                              : `Sort by ${label}`
                          }
                        >
                          <span className="um_sort_header_label">{label}</span>
                          {active ? (
                            sortDir === "asc" ? (
                              <ArrowUp
                                size={14}
                                className="um_sort_header_icon"
                                aria-hidden
                              />
                            ) : (
                              <ArrowDown
                                size={14}
                                className="um_sort_header_icon"
                                aria-hidden
                              />
                            )
                          ) : (
                            <ArrowUpDown
                              size={14}
                              className="um_sort_header_icon um_sort_header_icon_idle"
                              aria-hidden
                            />
                          )}
                        </button>
                      </th>
                    );
                  })}
                  <th scope="col" className="um_th_actions">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {membersLoading ? (
                  <tr>
                    <td
                      colSpan={membersTableColSpan}
                      className="data_table_empty_members_cell data_table_members_loading_cell"
                      role="status"
                      aria-label="Loading"
                    >
                      <div
                        className="data_table_loader_spinner"
                        aria-hidden
                      />
                    </td>
                  </tr>
                ) : membersPaginatedRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={membersTableColSpan}
                      className="data_table_empty_members_cell"
                    >
                      <p className="um_hint" role="status">
                        {memberRows.length === 0
                          ? ""
                          : "No members match your search."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  membersPaginatedRows.map((row, i) => {
                  const globalIndex =
                    (membersPageSafe - 1) * membersPageSize + i;
                  const rowId = rowStableId(row, globalIndex);
                  const initials = initialsFromRow(row);
                  const displayName = memberUserCellPrimaryLabel(row);
                  const rawEmail = String(row.email ?? "").trim();
                  const email = displayEmail(row.email);
                  const menuOpen = actionMenuRowId === rowId;
                  const rowUserStatus = userStatusForUi(row);
                  const rowAccountStatus = accountStatusForUi(row);
                  return (
                    <tr
                      key={rowId}
                      className={
                        i % 2 === 0
                          ? "data_table_row_odd"
                          : "data_table_row_even"
                      }
                    >
                      <td className="um_td_checkbox">
                        <input
                          type="checkbox"
                          className="um_table_row_select_cb"
                          checked={selectedMemberRowIds.has(rowId)}
                          onChange={() =>
                            toggleMemberRowSelected(row, globalIndex)
                          }
                          onClick={(e) => e.stopPropagation()}
                          aria-label={
                            rawEmail
                              ? `Select member ${rawEmail}`
                              : "Select member"
                          }
                        />
                      </td>
                      <td className="um_td_user">
                        <div className="um_user_cell">
                          <div className="um_user_avatar_ring" aria-hidden>
                            <span className="um_user_initials">
                              {initials}
                            </span>
                          </div>
                          <div className="um_user_meta">
                            <span
                              className={`um_user_meta_username${
                                displayName === "—"
                                  ? " um_user_meta_username--placeholder"
                                  : ""
                              }`}
                            >
                              {displayName}
                            </span>
                            {isDisplayableEmail(rawEmail) ? (
                              <a
                                href={`mailto:${encodeURIComponent(rawEmail)}`}
                                className="um_user_meta_email um_user_meta_email_link"
                              >
                                {rawEmail}
                              </a>
                            ) : (
                              <span className="um_user_meta_email um_status_muted">
                                {email}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="um_td_memberships um_td_role">
                        <MemberRoleBadge row={row} />
                      </td>
                      <td className="um_td_memberships">
                        <UserOrganizationsCell
                          row={row}
                          organizationScope={organizationDisplayScope}
                        />
                      </td>
                      <td>
                        <StatusWithDot {...rowUserStatus} />
                      </td>
                      <td>
                        <StatusWithDot {...rowAccountStatus} />
                      </td>
                      {/* Deals column: hidden here; customers company Members tab uses CompanyMembersPage.
                      <td className="um_td_numeric">
                        {assignedDealCountFromRow(row)}
                      </td>
                      */}
                      <td className="um_td_actions">
                        <div className="um_kebab_root">
                          <button
                            type="button"
                            className="um_kebab_trigger"
                            aria-expanded={menuOpen}
                            aria-haspopup="menu"
                            aria-label={`Actions for ${displayName !== "—" ? displayName : rawEmail || email}`}
                            ref={
                              menuOpen
                                ? (el) => {
                                    kebabTriggerRef.current = el;
                                  }
                                : undefined
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setActionMenuRowId((current) => {
                                if (current === rowId) {
                                  setActionMenuRow(null);
                                  setMenuPos(null);
                                  return null;
                                }
                                setActionMenuRow(row);
                                return rowId;
                              });
                            }}
                          >
                            <MoreHorizontal size={18} aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                  })
                )}
              </tbody>
            </table>
            </TableHScrollShell>
            {!membersLoading && sortedRows.length > 0 ? (
              <DataTablePagination
                page={membersPageSafe}
                pageSize={membersPageSize}
                totalItems={sortedRows.length}
                onPageChange={setMembersPage}
                onPageSizeChange={setMembersPageSize}
                ariaLabel="Members table pagination"
              />
            ) : null}
          </div>
        ) : null}
      </div>
      ) : (
      <div
        className="um_panel um_members_tab_panel deals_list_card_surface um_members_general_panel"
        id="um-members-panel-general"
        role="tabpanel"
        aria-labelledby="um-members-tab-general"
      >
        <MembersRoleInfoPanel />
      </div>
      )}
      </div>

      {actionMenuRowId &&
      menuPos &&
      openMenuContext &&
      typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={kebabPortalRef}
              className="um_kebab_menu um_kebab_menu--portal"
              role="menu"
              aria-label="Row actions"
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
                    setViewRow(openMenuContext.row);
                    closeActionMenu();
                  }}
                >
                  <Eye className="um_kebab_menuitem_icon" size={16} strokeWidth={2} aria-hidden />
                  View
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="um_kebab_menuitem"
                  disabled={
                    memberInvitePending(openMenuContext.row) ||
                    memberRowIsCurrentUser(openMenuContext.row, currentUserId)
                  }
                  title={
                    memberRowIsCurrentUser(openMenuContext.row, currentUserId)
                      ? "You cannot edit your own account here."
                      : undefined
                  }
                  onClick={() => {
                    closeActionMenu();
                    openEditMember(openMenuContext.row);
                  }}
                >
                  <Pencil className="um_kebab_menuitem_icon" size={16} strokeWidth={2} aria-hidden />
                  Edit
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="um_kebab_menuitem"
                  disabled={
                    memberInvitePending(openMenuContext.row) ||
                    memberRowIsCurrentUser(openMenuContext.row, currentUserId)
                  }
                  title={
                    memberRowIsCurrentUser(openMenuContext.row, currentUserId)
                      ? "You cannot suspend or activate your own account here."
                      : undefined
                  }
                  onClick={() => {
                    closeActionMenu();
                    openSuspendMember(openMenuContext.row);
                  }}
                >
                  {memberRowIsInactive(openMenuContext.row) ? (
                    <CheckCircle2
                      className="um_kebab_menuitem_icon"
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                    />
                  ) : (
                    <Ban
                      className="um_kebab_menuitem_icon"
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                    />
                  )}
                  {memberRowIsInactive(openMenuContext.row)
                    ? "Activate"
                    : "Suspend"}
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="um_kebab_menuitem"
                  disabled={
                    !accountInviteIsExpired(openMenuContext.row) ||
                    reinviteBusyId === openMenuContext.rowId
                  }
                  onClick={() =>
                    void reinviteRow(
                      openMenuContext.row,
                      openMenuContext.rowId,
                    )
                  }
                >
                  <Mail className="um_kebab_menuitem_icon" size={16} strokeWidth={2} aria-hidden />
                  {reinviteBusyId === openMenuContext.rowId
                    ? "Reinviting…"
                    : "Reinvite"}
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="um_kebab_menuitem"
                  onClick={() => exportRowCsv(openMenuContext.row)}
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
            className="um_modal um_modal_view"
            role="dialog"
            aria-modal="true"
            aria-labelledby="um-view-title"
          >
            <div className="um_modal_head">
              <h3 id="um-view-title" className="um_modal_title">
                Member details
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
            <div className="um_view_grid">
              <ViewReadonlyField
                Icon={User}
                label="User name"
                value={formatMemberUsername(viewRow.username)}
              />
              <ViewReadonlyField
                Icon={Mail}
                label="Email"
                value={displayEmail(viewRow.email)}
              />
              <ViewReadonlyField
                Icon={User}
                label="First name"
                value={formatValue(viewRow.firstName)}
              />
              <ViewReadonlyField
                Icon={User}
                label="Last name"
                value={formatValue(viewRow.lastName)}
              />
              <ViewReadonlyField
                Icon={Shield}
                label="Roles"
                value={<MemberRoleBadge row={viewRow} />}
              />
              <ViewReadonlyField
                Icon={Building2}
                label={organizationDisplayScope ? "Organization" : "Organizations"}
                value={
                  <UserOrganizationsCell
                    row={viewRow}
                    organizationScope={organizationDisplayScope}
                  />
                }
                fieldClassName="um_view_field_span_full"
              />
              <ViewReadonlyField
                Icon={Phone}
                label="Phone"
                value={formatUsPhoneStoredForUi(viewRow.phone)}
              />
              <ViewReadonlyField
                Icon={Activity}
                label="User Status"
                value={<StatusWithDot {...userStatusForUi(viewRow)} />}
              />
              <ViewReadonlyField
                Icon={ClipboardList}
                label="Account status"
                value={<StatusWithDot {...accountStatusForUi(viewRow)} />}
              />
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
            className="um_modal um_modal_view"
            role="dialog"
            aria-modal="true"
            aria-labelledby="um-edit-member-title"
          >
            <div className="um_modal_head">
              <h3 id="um-edit-member-title" className="um_modal_title">
                Edit member
              </h3>
              <button
                type="button"
                className="um_modal_close"
                aria-label="Close"
                disabled={editSaving}
                onClick={() => closeEditMember()}
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </div>
            <div className="um_view_grid um_view_grid_member_action">
              <ViewReadonlyField
                Icon={User}
                label="User name"
                value={formatMemberUsername(editRow.username)}
              />
              <ViewReadonlyField
                Icon={Mail}
                label="Email"
                value={displayEmail(editRow.email)}
              />
            </div>
            <form onSubmit={submitEditMember}>
              {showCompanyColumn ? (
                <div className="um_field">
                  <label
                    htmlFor="um-edit-member-company"
                    className="um_field_label_row"
                  >
                    <Building2 className="um_field_label_icon" size={17} aria-hidden />
                    <span>Company</span>
                  </label>
                  <DealsCreateDropdownSelect
                    id="um-edit-member-company"
                    className="um_company_dropdown"
                    searchable
                    searchPlaceholder="Search company"
                    searchAriaLabel="Search company"
                    searchShowOptionCountHint
                    options={companyDropdownOptions}
                    value={editOrganizationId}
                    onChange={(v) => setEditOrganizationId(v)}
                    placeholder="Select a company"
                    disabled={editSaving || !!inviteCompaniesError}
                    invalid={!!inviteCompaniesError}
                    ariaLabel="Company"
                  />
                  {inviteCompaniesError ? (
                    <p className="um_msg_error um_modal_form_error" role="alert">
                      {inviteCompaniesError}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="um_edit_role_status_row">
                <div className="um_field">
                  <div
                    id="um-edit-member-role-heading"
                    className="um_field_label_row"
                  >
                    <UserCog className="um_field_label_icon" size={17} aria-hidden />
                    <span>Role</span>
                  </div>
                  <div
                    className={
                      editSaving ? "um_role_pills_interaction_lock" : undefined
                    }
                  >
                    <RadioPillGroup
                      name="umEditMemberRole"
                      className="um_role_radio_group"
                      value={editRole}
                      options={editRoleSelectOptions}
                      onChange={(v) => setEditRole(v)}
                      ariaLabelledBy="um-edit-member-role-heading"
                    />
                  </div>
                </div>
                <div className="um_field">
                  <label
                    htmlFor="um-edit-member-status"
                    className="um_field_label_row"
                  >
                    <Activity className="um_field_label_icon" size={17} aria-hidden />
                    <span>User Status</span>
                  </label>
                  <select
                    id="um-edit-member-status"
                    className="um_field_select"
                    value={editUserStatus}
                    onChange={(e) => setEditUserStatus(e.target.value)}
                    required
                    disabled={editSaving}
                  >
                    {MEMBER_STATUS_EDIT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="um_field">
                <label
                  htmlFor="um-edit-member-reason"
                  className="um_field_label_row"
                >
                  <ClipboardList
                    className="um_field_label_icon"
                    size={17}
                    aria-hidden
                  />
                  <span>Reason</span>
                </label>
                <textarea
                  id="um-edit-member-reason"
                  className="um_field_textarea"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  rows={3}
                  required
                  disabled={editSaving}
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
                  disabled={editSaving}
                  onClick={() => closeEditMember()}
                >
                  <X size={16} strokeWidth={2} aria-hidden />
                  Close
                </button>
                <button
                  type="submit"
                  className="um_btn_primary"
                  disabled={
                    editSaving ||
                    !editReason.trim() ||
                    (showCompanyColumn &&
                      (!editOrganizationId.trim() || !!inviteCompaniesError))
                  }
                >
                  <RefreshCw size={16} strokeWidth={2} aria-hidden />
                  {editSaving ? "Updating…" : "Update"}
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
            className="um_modal um_modal_view"
            role="dialog"
            aria-modal="true"
            aria-labelledby="um-suspend-member-title"
          >
            <div className="um_modal_head">
              <h3 id="um-suspend-member-title" className="um_modal_title">
                {memberRowIsInactive(suspendRow)
                  ? "Activate member"
                  : "Suspend member"}
              </h3>
              <button
                type="button"
                className="um_modal_close"
                aria-label="Close"
                disabled={suspendSaving}
                onClick={() => closeSuspendMember()}
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </div>
            <div className="um_view_grid um_view_grid_member_action">
              <ViewReadonlyField
                Icon={User}
                label="User name"
                value={formatMemberUsername(suspendRow.username)}
              />
              <ViewReadonlyField
                Icon={Mail}
                label="Email"
                value={displayEmail(suspendRow.email)}
              />
            </div>
            <form onSubmit={submitSuspendMember}>
              <div className="um_field">
                <label
                  htmlFor="um-suspend-member-reason"
                  className="um_field_label_row"
                >
                  {memberRowIsInactive(suspendRow) ? (
                    <CheckCircle2
                      className="um_field_label_icon"
                      size={17}
                      aria-hidden
                    />
                  ) : (
                    <Ban className="um_field_label_icon" size={17} aria-hidden />
                  )}
                  <span>Reason</span>
                </label>
                <textarea
                  id="um-suspend-member-reason"
                  className="um_field_textarea"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  rows={3}
                  required
                  disabled={suspendSaving}
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
                  disabled={suspendSaving}
                  onClick={() => closeSuspendMember()}
                >
                  <X size={16} strokeWidth={2} aria-hidden />
                  Close
                </button>
                <button
                  type="submit"
                  className="um_btn_primary"
                  disabled={suspendSaving || !suspendReason.trim()}
                >
                  {memberRowIsInactive(suspendRow) ? (
                    <CheckCircle2 size={16} aria-hidden />
                  ) : (
                    <Ban size={16} aria-hidden />
                  )}
                  {suspendSaving
                    ? memberRowIsInactive(suspendRow)
                      ? "Activating…"
                      : "Suspending…"
                    : memberRowIsInactive(suspendRow)
                      ? "Activate"
                      : "Suspend"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {inviteOpen ? (
        <div
          className="um_modal_overlay deals_add_inv_modal_overlay"
          role="presentation"
        >
          <div
            className="um_modal um_modal_view deals_add_inv_modal_panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="um-invite-title"
          >
            <div className="um_modal_head">
              <h3 id="um-invite-title" className="um_modal_title">
                Invite member
              </h3>
              <button
                type="button"
                className="um_modal_close"
                aria-label="Close"
                onClick={closeInviteModal}
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </div>
            <form
              className="deals_add_inv_modal_form"
              onSubmit={submitInvite}
            >
              <div className="deals_add_inv_modal_scroll">
                <div className="um_field">
                  <label htmlFor="um-invite-email" className="um_field_label_row">
                    <Mail className="um_field_label_icon" size={17} aria-hidden />
                    <span>Email</span>
                  </label>
                  <input
                    id="um-invite-email"
                    type="email"
                    autoComplete="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="name@company.com"
                    required
                    disabled={inviteLoading}
                  />
                </div>
                {showCompanyColumn ? (
                  <div className="um_field">
                    <label htmlFor="um-invite-company" className="um_field_label_row">
                      <Building2 className="um_field_label_icon" size={17} aria-hidden />
                      <span>Company</span>
                    </label>
                    <DealsCreateDropdownSelect
                      id="um-invite-company"
                      className="um_company_dropdown"
                      searchable
                      searchPlaceholder="Search company"
                      searchAriaLabel="Search company"
                      searchShowOptionCountHint
                      options={companyDropdownOptions}
                      value={inviteCompanyId}
                      onChange={(v) => setInviteCompanyId(v)}
                      placeholder="Select a company"
                      disabled={inviteLoading || !!inviteCompaniesError}
                      invalid={!!inviteCompaniesError}
                      ariaLabel="Company"
                    />
                  </div>
                ) : null}
                {showInviteRolePicker ? (
                  <div className="um_field">
                    <div id="um-invite-role-heading" className="um_field_label_row">
                      <UserCog className="um_field_label_icon" size={17} aria-hidden />
                      <span>Role</span>
                    </div>
                    {inviteRolePickerOptions.length > 0 ? (
                      <div
                        className={
                          inviteLoading ||
                          (showCompanyColumn &&
                            (!inviteCompanyId.trim() || !!inviteCompaniesError))
                            ? "um_role_pills_interaction_lock"
                            : undefined
                        }
                      >
                        <RadioPillGroup
                          name="umInviteMemberRole"
                          className="um_role_radio_group"
                          value={inviteInvitedRole}
                          options={inviteRolePickerOptions}
                          onChange={(v) => setInviteInvitedRole(v)}
                          ariaLabelledBy="um-invite-role-heading"
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {inviteError ? (
                  <p className="um_msg_error um_modal_form_error" role="alert">
                    {inviteError}
                  </p>
                ) : null}
                {inviteCompaniesError ? (
                  <p className="um_msg_error um_modal_form_error" role="alert">
                    {inviteCompaniesError}
                  </p>
                ) : null}
              </div>
              <div className="um_modal_actions add_contact_modal_actions">
                <button
                  type="button"
                  className="um_btn_secondary"
                  onClick={closeInviteModal}
                >
                  <X size={16} strokeWidth={2} aria-hidden />
                  Close
                </button>
                <button
                  type="submit"
                  className="um_btn_primary"
                  disabled={
                    inviteLoading ||
                    !inviteEmail.trim() ||
                    ((showCompanyColumn &&
                      (!inviteCompanyId.trim() ||
                        !!inviteCompaniesError)) ||
                      (showInviteRolePicker &&
                        (!inviteInvitedRole.trim() ||
                          inviteRolePickerOptions.length === 0)))
                  }
                >
                  <Send size={16} aria-hidden />
                  {inviteLoading ? "Sending…" : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {sendMailModalOpen ? (
        <div className="um_modal_overlay contacts_suspend_overlay" role="presentation">
          <div
            className="um_modal contacts_suspend_modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="um-send-mail-title"
          >
            <div className="um_modal_head">
              <h3 id="um-send-mail-title" className="um_modal_title um_title_with_icon">
                <Mail
                  className="um_title_icon contacts_suspend_title_icon contacts_suspend_title_icon_info"
                  size={22}
                  strokeWidth={2}
                  aria-hidden
                />
                <span>Send email</span>
              </h3>
              <button
                type="button"
                className="um_modal_close"
                aria-label="Close"
                onClick={closeSendMailModal}
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </div>
            <p className="contacts_suspend_modal_desc contacts_suspend_modal_desc_info">
              <Info
                className="contacts_suspend_modal_desc_icon"
                size={18}
                strokeWidth={2}
                aria-hidden
              />
              <span>
                Sending to {selectedMemberRows.length} selected member
                {selectedMemberRows.length === 1 ? "" : "s"}.
              </span>
            </p>
            {/* <div className="um_field contacts_suspend_reason_field">
              <label className="um_field_label_row" htmlFor="um-send-mail-from">
                <span>From</span>
              </label>
              <input
                id="um-send-mail-from"
                type="text"
                className="um_input"
                value={senderEmail || "Current user"}
                readOnly
              />
            </div> */}
            <div className="um_field contacts_suspend_reason_field">
              <label className="um_field_label_row" htmlFor="um-send-mail-cc">
                <span>CC</span>
              </label>
              <input
                id="um-send-mail-cc"
                type="text"
                className="um_input"
                placeholder="email1@domain.com, email2@domain.com"
                value={sendMailCc}
                onChange={(e) => setSendMailCc(e.target.value)}
              />
            </div>
            <div className="um_field contacts_suspend_reason_field">
              <div className="contacts_send_mail_template_head">
                <label className="um_field_label_row" htmlFor="um-send-mail-template">
                  <span>Email template</span>
                </label>
              </div>
              <div className="contacts_send_mail_template_select_row">
                <select
                  id="um-send-mail-template"
                  className="um_field_select contacts_send_mail_template_select"
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                >
                  {emailTemplates.length === 0 ? (
                    <option value="">No active templates</option>
                  ) : null}
                  {emailTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </option>
                  ))}
                </select>
                {selectedTemplate ? (
                  <>
                    <button
                      type="button"
                      className="contacts_send_mail_template_edit_btn"
                      aria-label="View"
                      title="View"
                      onClick={() => openSendMailEmailPreview("view")}
                    >
                      <Eye size={16} strokeWidth={2} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="contacts_send_mail_template_edit_btn"
                      aria-label="Edit"
                      title="Edit"
                      onClick={() => openSendMailEmailPreview("edit")}
                    >
                      <Pencil size={16} strokeWidth={2} aria-hidden />
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="contacts_send_mail_template_edit_btn"
                  aria-label="New template"
                  title="New template"
                  onClick={goNewTemplateFromSendMail}
                >
                  <Plus size={16} strokeWidth={2} aria-hidden />
                </button>
              </div>
              {emailTemplates.length === 0 ? (
                <p className="um_hint" role="status">
                  Create an email template first in Email Templates.
                </p>
              ) : null}
            </div>
            <div className="um_modal_actions contacts_suspend_modal_actions">
              <button
                type="button"
                className="um_btn_secondary"
                onClick={closeSendMailModal}
              >
                <X size={16} strokeWidth={2} aria-hidden />
                Close
              </button>
              <button
                type="button"
                className="um_btn_primary"
                disabled={!selectedTemplateId || selectedMemberRows.length === 0}
                onClick={handleSendMailToSelectedMembers}
              >
                <Send size={16} strokeWidth={2} aria-hidden />
                Send
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <SendMailEmailPreviewModal
        preview={sendMailEmailPreview}
        onClose={() => setSendMailEmailPreview(null)}
        onSaved={handleSendMailPreviewSaved}
      />
      <ExportMembersModal
        open={membersExportOpen}
        onClose={() => setMembersExportOpen(false)}
        members={sortedRows}
        organizationScope={organizationDisplayScope}
      />
      {suspendAllOpen ? (
        <div
          className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSuspendAllModal();
          }}
        >
          <div
            className="um_modal um_modal_view deals_add_inv_modal_panel deals_suspend_all_modal_panel"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={suspendAllTitleId}
          >
            <div className="um_modal_head">
              <h3 id={suspendAllTitleId} className="um_modal_title">
                Suspend all members?
              </h3>
              <button
                type="button"
                className="um_modal_close"
                onClick={closeSuspendAllModal}
                disabled={suspendAllBusy}
                aria-label="Close"
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </div>
            <form onSubmit={(e) => void confirmSuspendAll(e)}>
              <div className="deals_suspend_all_modal_body">
                <p className="deals_suspend_all_modal_message">
                  Mark {membersToSuspend.length} active member
                  {membersToSuspend.length === 1 ? "" : "s"} inactive? Your own
                  account is excluded. You can activate members again from the
                  row menu.
                </p>
                <div className="um_field contacts_suspend_reason_field">
                  <label htmlFor="um-suspend-all-reason">Reason</label>
                  <textarea
                    id="um-suspend-all-reason"
                    className="um_field_textarea contacts_suspend_reason_textarea"
                    rows={3}
                    value={suspendAllReason}
                    onChange={(e) => {
                      setSuspendAllReason(e.target.value);
                      setSuspendAllErr("");
                    }}
                    disabled={suspendAllBusy}
                    placeholder="Why are these members being suspended?"
                  />
                </div>
                {suspendAllErr ? (
                  <p
                    className="um_msg_error um_modal_form_error contacts_suspend_modal_error"
                    role="alert"
                  >
                    {suspendAllErr}
                  </p>
                ) : null}
              </div>
              <div className="um_modal_actions add_contact_modal_actions">
                <button
                  type="button"
                  className="um_btn_secondary"
                  onClick={closeSuspendAllModal}
                  disabled={suspendAllBusy}
                >
                  <X size={16} strokeWidth={2} aria-hidden />
                  Close
                </button>
                <button
                  type="submit"
                  className="um_btn_primary"
                  disabled={suspendAllBusy || !suspendAllReason.trim()}
                >
                  <Ban size={16} strokeWidth={2} aria-hidden />
                  {suspendAllBusy ? "Suspending…" : "Suspend all"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export { UserManagementPage };
