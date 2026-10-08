import {
  Activity,
  BadgeCheck,
  CircleDollarSign,
  DollarSign,
  Download,
  Eye,
  FileCheck,
  Info,
  Landmark,
  Mail,
  Pencil,
  PiggyBank,
  Plus,
  Search,
  Send,
  Tag,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AddInvestmentModal } from "../deal_members";
import {
  addInvestmentFormToRow,
  ADD_MEMBER_DRAFT_ROW_ID,
  buildAddMemberDraftInvestorRow,
  investorRowShowsDraftBadge,
} from "../deal_members/add-investment/addMemberDraftInvestorRow";
import {
  ADD_MEMBER_DRAFT_UPDATED_EVENT,
  clearAddMemberDraft,
  isAddMemberSessionDraftRedundantWithApiRows,
  loadAddMemberDraft,
} from "../deal_members/add-investment/addMemberFormDraftStorage";
import { notifyDealInvestorsExportAudit } from "../../api/dealInvestorsExportNotifyApi";
import { InviteMailStatusBadge } from "./InviteMailStatusBadge";
import { DealInvestorIdentityCell } from "./DealInvestorIdentityCell";
import { DealInvestorCommittedAmountCell } from "./DealInvestorCommittedAmountCell";
// import { DealInvestorRoleCell } from "./DealInvestorRoleBadge"; // Role column commented out
import { ExportDealInvestorRowsModal } from "./ExportDealInvestorRowsModal";
import { DealInvestorSignedCell } from "./DealInvestorSignedCell";
import { logInvestorsDataTableDebug } from "./investorsTabDebug";
import { applyInvitationMailSentMarks } from "../../utils/dealInvitationMailStatus";
import {
  investorEsignIsFullyCompletedForRow,
  resolveInvestorRowEsignStatus,
} from "../../utils/investorEsignStatus";
import { InvestorEsignStatusModal } from "./InvestorEsignStatusModal";
import { SendEsignDocumentsModal } from "./SendEsignDocumentsModal";
import { InvestorClassPillsDisplay } from "./InvestorClassPillsDisplay";
import { DealMemberRowActions } from "../deal_members/components/DealMemberRowActions";
import { AddLpInvestorModal } from "./AddLpInvestorModal";
import { DealInvestorViewModal } from "./DealInvestorViewModal";
import type { AddInvestmentFormValues } from "../deal_members";
import {
  displayInvestorCommittedAmount,
  fundedAmountForTotalFundedKpi,
  formatMoneyFieldDisplay,
  investorRowCommittedAmountIsZero,
  parseMoneyDigits,
} from "../../utils/offeringMoneyFormat";
import {
  DataTable,
  type DataTableColumn,
} from "../../../../../common/components/data-table/DataTable";
import {
  DropdownSelect,
  type DropdownSelectOption,
} from "../../../../../common/components/dropdown-select";
import { FormTooltip } from "../../../../../common/components/form-tooltip/FormTooltip";
import { toast } from "../../../../../common/components/Toast";
import { ToolStyleCard } from "../../../../../common/components/tool-style-card/ToolStyleCard";
import { cardCompactAmountOrDash } from "../../../../../common/components/card-compact-amount/CardCompactAmount";
import { getApiV1Base } from "../../../../../common/utils/apiBaseUrl";
import {
  TABLE_PAGE_SIZE_ID,
  usePersistedTablePageSize,
} from "@/common/hooks/usePersistedTablePageSize";
import {
  upsertRuntimeForViewerFromInvestorsPayload,
  upsertRuntimeFromViewerAddInvestmentForm,
} from "@/modules/Investing/pages/investments/upsertRuntimeFromDealSession";
import {
  areRequiredDealDetailFieldsIncomplete,
  fetchDealInvestorClasses,
  fetchDealInvestors,
  postDealInvestment,
  postDealLpInvestor,
  putDealInvestment,
  putDealLpInvestor,
  type DealDetailApi,
} from "../../api/dealsApi";
import {
  ExtraCompanyUserPaymentRequiredError,
} from "../../utils/extraCompanyUserBilling";
import { isDealStageDraft } from "../../constants/deal-lifecycle";
import type { DealInvestorClass } from "../../types/deal-investor-class.types";
import {
  formatInvestorClassTableLabel,
  investorRowIsGeneralPartner,
} from "../../utils/investorClassOverviewFields";
import {
  investorProfileIdFromLabel,
  investorRoleSelectValueFromStored,
  isDealMembersTabRole,
  isGeneralPartnerRole,
  isLpInvestorRole,
  dealInvestorProfileDisplayName,
  type DealInvestmentModalEntry,
} from "../../constants/investor-profile";
import { INVESTMENT_STATUS_APPROVE_FUND } from "../../constants/investment-status";
import { formatMemberUsername } from "../../../usermanagement/memberAdminShared";
import {
  buildDealInvestorsExportCsv,
  downloadDealExportCsv,
  exportAuditLinesForDealInvestorRows,
} from "../../utils/dealInvestorExportCsv";
import { buildTableExportFilename } from "@/common/utils/tableExportFilename";
import {
  dealInvestorStatusDisplayLabel,
  investorFundedColumnLabel,
  investorRowIsFundApproved,
} from "../../utils/dealInvestorTableDisplay";
import type {
  DealInvestorRow,
  DealInvestorsKpis,
  DealInvestorsPayload,
} from "../../types/deal-investors.types";
import {
  loadEmailTemplates,
  type EmailTemplateRow,
} from "../../../contacts/emailTemplatesStorage";
import {
  SendMailEmailPreviewModal,
  type SendMailEmailPreviewPayload,
} from "../../../contacts/components/SendMailEmailPreviewModal";
import {
  getCurrentSessionUserEmail,
  openSendMailDraft,
  parseEmailInput,
} from "../../../../../common/features/send-mail";
import { useNavigate } from "react-router-dom";
import { getSessionUserId } from "@/common/auth/sessionUserId";
import {
  isUsableInvestorEmail,
  resolveViewerDealMemberRole,
  scopeDealInvestorRowsForViewer,
  type ViewerDealMemberRole,
} from "../../utils/dealDetailTabVisibility";
import { getSessionUserEmail } from "../../../../../common/auth/sessionUserEmail";
import "../../../usermanagement/user_management.css";
import "../../../Dashboard/sponsor-dashboard.css";
import "../../deals-list.css";
import "../../deal-investors-tab.css";
import "../deal_members/tab/deal-members.css";
import "../../../contacts/contacts.css";

export interface DealInvestorsTabHandle {
  openViewInvestor: (row: DealInvestorRow) => void;
  openEditInvestor: (row: DealInvestorRow) => void;
  /** Refetch LP investors from the API without remounting (e.g. after member delete). */
  refetchInvestors: () => Promise<void>;
}

/** Same compact “Add Investors” modal as add — `deal_lp_investor` rows, not full investment form. */
function shouldUseLpInvestorsModalForEdit(row: DealInvestorRow): boolean {
  if (row.id === ADD_MEMBER_DRAFT_ROW_ID) return false;
  if (isGeneralPartnerRole(row.investorRole ?? "")) return false;
  if (row.investorKind === "lp_roster") return true;
  /** Investment list rows that are LP role still edit via LP modal (percents live on roster). */
  return isLpInvestorRole(row.investorRole ?? "");
}

/** LP tab row, or add-member draft with a contact picked but role not set yet. */
function isLpInvestorsTabRow(r: DealInvestorRow): boolean {
  if (isGeneralPartnerRole(r.investorRole ?? "")) return false
  if (isDealMembersTabRole(r.investorRole ?? "")) return false
  if (r.id === ADD_MEMBER_DRAFT_ROW_ID) {
    if (isLpInvestorRole(r.investorRole ?? "")) return true;
    const role = String(r.investorRole ?? "").trim();
    const unset = !role || role === "—";
    return unset && Boolean(r.contactId?.trim());
  }
  return isLpInvestorRole(r.investorRole ?? "");
}

interface DealInvestorsTabProps {
  dealId: string;
  dealName: string;
  /** When set, KPI cards can show offering size from deal / investor classes if API KPIs are empty. */
  dealDetail?: DealDetailApi | null;
  addInvestmentOpen: boolean;
  /** Hide KPI/table; only host Add Investment modal (e.g. when Deal Members tab is open). */
  modalOnly?: boolean;
  onAddInvestmentClose: () => void;
  /** Opens the full add/edit investment modal (Deal Members flow + draft “Continue editing”). */
  onOpenFullInvestmentModal?: () => void;
  /** Mirrors deal detail state: drives “Add Investor” vs “Add Member” modal title. */
  addInvestmentEntry?: DealInvestmentModalEntry;
  /**
   * Add mode: restore autosaved add-member draft (default true). Deal detail sets false for
   * “Add Member” (empty form without clearing the table draft row); draft “Continue editing” uses true.
   */
  restoreAddMemberSessionDraft?: boolean;
  /** Called after investors are added or updated — refreshes the Deal Members table only. */
  onInvestorsChanged?: () => void;
  /** Send investor invitation email from the Investors table row menu. */
  onSendInvitationMail?: (row: DealInvestorRow) => void | Promise<void>;
  /** Send eSign after sponsor picks documents in the modal. */
  onSendEsignConfirm?: (
    row: DealInvestorRow,
    fileIds: string[],
  ) => void | Promise<void>;
  /** When true, Send E-sign is visible but disabled (e.g. no templates uploaded). */
  sendEsignDisabled?: boolean;
  sendEsignDisabledTitle?: string;
  /** When false, “Approve fund” is hidden/disabled (lead or admin sponsor only). */
  canApproveFund?: boolean;
  /** Copy offering link (same as Deal Members). */
  onCopyOfferingLink?: (row: DealInvestorRow) => void;
  /**
   * When true, “Copy offering link” is enabled (Offering Details → “Only visible with link”).
   */
  offeringLinkAvailable?: boolean;
  offeringLinkBlockedBecauseDraft?: boolean;
  /** Remove member / roster row (same as Deal Members). */
  onDeleteMember?: (row: DealInvestorRow) => void | Promise<void>;
  /** Fires when Add or Edit investment modal is open — hide session draft row in Deal Members table. */
  onSharedInvestmentModalOpenChange?: (open: boolean) => void;
  /**
   * Increment when investors change outside this tab (e.g. LP “Invest now” on the deal)
   * so the table and KPIs refetch from the API.
   */
  investorsListRefreshKey?: number;
  /**
   * After send-invitation API succeeds, rows marked here show Mail sent / Re-send
   * until the list response includes `send_invitation_mail` / `invitationMailSent`.
   */
  invitationMailStatusByRowId?: Record<string, true>;
  /** From GET `/deals/:id/members` — drives co-sponsor investor list scope. */
  viewerDealMemberRole?: ViewerDealMemberRole;
  /** Deal roster (same as members tab) — resolve co-sponsor role before API role returns. */
  dealMembersRoster?: DealInvestorRow[];
}

function parseCommittedCellToNumber(s: string | undefined): number {
  if (!s || s === "—") return 0;
  const n = parseFloat(String(s).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatUsdKpiDisplay(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Total Funded tile: always show USD (including `$0`); never em dash. */
function formatUsdKpiTotalFunded(n: number): string {
  const v = Number.isFinite(n) ? Math.max(0, n) : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

/**
 * Same source order as the deals list Investor Class column: investor-classes API
 * first, then list-row snapshot from deal detail when the API has not loaded classes yet.
 */
function buildDealClassNamesLine(
  investorClasses: DealInvestorClass[],
  dealDetail: DealDetailApi | null | undefined,
): string {
  const fromClasses = investorClasses
    .map((c) => formatInvestorClassTableLabel(c.name, [c]))
    .filter(Boolean)
    .join(", ");
  if (fromClasses) return fromClasses;
  const raw = dealDetail?.listRow?.investorClass?.trim();
  if (!raw || raw === "—") return "";
  return raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
}

function dealInvestorRowToFormValues(
  row: DealInvestorRow,
): AddInvestmentFormValues {
  const profileId =
    row.profileId?.trim() ||
    investorProfileIdFromLabel(row.entitySubtitle) ||
    "";
  return {
    offeringId: row.offeringId?.trim() || "primary",
    contactId: row.contactId ?? "",
    contactDisplayName: row.displayName,
    contactEmail:
      row.userEmail && isUsableInvestorEmail(row.userEmail)
        ? row.userEmail
        : undefined,
    contactUsername:
      row.userDisplayName && row.userDisplayName !== "—"
        ? row.userDisplayName
        : undefined,
    profileId,
    investorRole: investorRoleSelectValueFromStored(row.investorRole),
    status: row.status && row.status !== "—" ? row.status : "",
    investorClass:
      row.investorClass && row.investorClass !== "—" ? row.investorClass : "",
    docSignedDate: row.docSignedDateIso?.trim() ?? "",
    commitmentAmount: row.commitmentAmountRaw?.trim() ?? "",
    extraContributionAmounts: [...(row.extraContributionAmounts ?? [])],
    documentFileName: null,
    sendInvitationMail: "no",
    fundApproved:
      typeof row.fundApproved === "boolean"
        ? row.fundApproved
        : investorRowIsFundApproved(row),
  };
}

function investorRowSupportsApproveFund(row: DealInvestorRow): boolean {
  if (row.id === ADD_MEMBER_DRAFT_ROW_ID) return false;
  if (row.investorKind === "lp_roster") return false;
  return true;
}

/** True when status is already at/after “Approve fund” or terminal — action disabled. */
function investorRowApproveFundNotApplicable(row: DealInvestorRow): boolean {
  if (investorRowIsFundApproved(row)) return true;
  const s = (row.status ?? "").trim();
  if (!s || s === "—") return false;
  if (s.startsWith("Inactive")) return true;
  if (s.startsWith("Canceled")) return true;
  return false;
}

function resolveInvestorClassLabelForRow(
  formValue: string,
  classes: DealInvestorClass[],
): string {
  return formatInvestorClassTableLabel(formValue, classes)
}

function VerifiedAccBadge({ label }: { label: string }) {
  const t = String(label ?? "").trim() || "—";
  const hint = t !== "—" ? t : undefined;
  return (
    <span
      className="deal_inv_verified_badge deal_inv_verified_badge_ellipsis"
      title={hint}
    >
      <span className="deal_inv_verified_badge_inner">{t}</span>
    </span>
  );
}

function DealInvestorFundedBadge({ row }: { row: DealInvestorRow }) {
  const approved = investorRowIsFundApproved(row);
  const label = approved ? "Approved" : "Not Approved";
  return (
    <span
      className={`deal_inv_funded_badge${
        approved
          ? " deal_inv_funded_badge--approved"
          : " deal_inv_funded_badge--not_approved"
      }`}
      title={label}
    >
      {label}
    </span>
  );
}

/** Single-line cell: ellipsis + native tooltip (`title`) for overflow; full text stays in DOM for screen readers. */
function DealInvEllipsisText({
  text,
  alignEnd = false,
  className = "",
  title: titleProp,
}: {
  text: string;
  alignEnd?: boolean;
  className?: string;
  /** Optional richer tooltip (e.g. name + `addedByUserId`). */
  title?: string;
}) {
  const display = String(text ?? "").trim() || "—";
  const hint = titleProp?.trim() || (display !== "—" ? display : undefined);
  return (
    <span
      className={`deal_inv_ellipsis_text${alignEnd ? " deal_inv_ellipsis_text_end" : ""}${className ? ` ${className}` : ""}`.trim()}
      title={hint}
    >
      {display}
    </span>
  );
}

/**
 * Same basis as the Offering Size KPI tile — numeric dollars, or `null` when unknown.
 */
function resolveOfferingSizeKpiAmount(
  base: DealInvestorsKpis,
  dealDetail: DealDetailApi | null | undefined,
  investorClasses: DealInvestorClass[],
): number | null {
  let sumFromClasses = 0;
  let hasAnyClassAmount = false;
  for (const c of investorClasses) {
    const n = parseMoneyDigits(String(c.offeringSize ?? ""));
    if (Number.isFinite(n)) {
      hasAnyClassAmount = true;
      sumFromClasses += n;
    }
  }
  if (hasAnyClassAmount) return sumFromClasses;

  if (dealDetail?.offeringSize?.trim()) {
    const n = parseMoneyDigits(dealDetail.offeringSize);
    return Number.isFinite(n) ? n : null;
  }

  const raise = dealDetail?.listRow?.raiseTarget?.trim();
  if (raise && raise !== "—") {
    const n = parseMoneyDigits(raise);
    return Number.isFinite(n) ? n : null;
  }

  const apiOs = base.offeringSize?.trim();
  if (apiOs && apiOs !== "—") {
    const n = parseMoneyDigits(apiOs);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

/**
 * Offering Size KPI: sum of all investor-class offering sizes (Offering Information),
 * then deal `offeringSize` / list `raiseTarget`, then API KPIs.
 */
function resolveOfferingSizeKpi(
  base: DealInvestorsKpis,
  dealDetail: DealDetailApi | null | undefined,
  investorClasses: DealInvestorClass[],
): string {
  const amt = resolveOfferingSizeKpiAmount(base, dealDetail, investorClasses);
  return amt != null && Number.isFinite(amt)
    ? formatMoneyFieldDisplay(String(amt))
    : "—";
}

const DEAL_INVESTORS_KPI_CARD_SPECS: ReadonlyArray<{
  icon: LucideIcon;
  title: string;
}> = [
  { icon: CircleDollarSign, title: "Offering Size" },
  { icon: DollarSign, title: "Committed" },
  { icon: FileCheck, title: "Document signed" },
  { icon: BadgeCheck, title: "Approved" },
  { icon: Landmark, title: "Total Funded" },
  { icon: PiggyBank, title: "Remaining" },
];

function DealInvestorsKpiSkeletonSection() {
  return (
    <section
      className="sponsor_dash_metrics deal_inv_kpi_metrics"
      aria-label="Deal investment summary"
      aria-busy
    >
      {DEAL_INVESTORS_KPI_CARD_SPECS.map((item) => (
        <ToolStyleCard
          key={item.title}
          variant="metric"
          icon={item.icon}
          title={item.title}
          description="—"
          loading
        />
      ))}
    </section>
  );
}

function DealInvestorsPopulated({
  initialPayload,
  dealId,
  dealName,
  dealDetail,
  investorClasses,
  onEditInvestor,
  onViewInvestor,
  onAddInvestor,
  onContinueDraftEdit,
  onSendInvitationMail,
  onSendEsignRequest,
  sendEsignDisabled = false,
  sendEsignDisabledTitle,
  onCopyOfferingLink,
  onDeleteMember,
  offeringLinkAvailable,
  offeringLinkBlockedBecauseDraft = false,
  onRefreshInvestors,
  canApproveFund = false,
}: {
  initialPayload: DealInvestorsPayload;
  dealId: string;
  dealName: string;
  dealDetail?: DealDetailApi | null;
  investorClasses: DealInvestorClass[];
  onEditInvestor: (row: DealInvestorRow) => void;
  onViewInvestor: (row: DealInvestorRow) => void;
  onAddInvestor: () => void;
  onContinueDraftEdit?: () => void;
  onSendInvitationMail?: (row: DealInvestorRow) => void | Promise<void>;
  onSendEsignRequest?: (row: DealInvestorRow) => void;
  sendEsignDisabled?: boolean;
  sendEsignDisabledTitle?: string;
  onCopyOfferingLink?: (row: DealInvestorRow) => void;
  onDeleteMember?: (row: DealInvestorRow) => void | Promise<void>;
  offeringLinkAvailable: boolean;
  offeringLinkBlockedBecauseDraft?: boolean;
  onRefreshInvestors?: () => void | Promise<void>;
  canApproveFund?: boolean;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [esignStatusRow, setEsignStatusRow] = useState<DealInvestorRow | null>(
    null,
  );
  const [rows, setRows] = useState<DealInvestorRow[]>(initialPayload.investors);
  const [approveFundBusyId, setApproveFundBusyId] = useState<string | null>(
    null,
  );
  const [selectedInvestorIds, setSelectedInvestorIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [sendMailModalOpen, setSendMailModalOpen] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplateRow[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [sendMailCc, setSendMailCc] = useState("");
  const [sendMailEmailPreview, setSendMailEmailPreview] =
    useState<SendMailEmailPreviewPayload | null>(null);
  const investorSelectAllRef = useRef<HTMLInputElement | null>(null);

  const handleApproveFund = useCallback(
    async (row: DealInvestorRow) => {
      if (!canApproveFund) {
        toast.error(
          "Not authorized",
          "Only the lead sponsor, admin sponsor, or company admin can approve the fund.",
        );
        return;
      }
      if (!getApiV1Base()) {
        toast.error(
          "Not available",
          "Configure the API base URL to update investments.",
        );
        return;
      }
      if (
        !investorRowSupportsApproveFund(row) ||
        investorRowApproveFundNotApplicable(row) ||
        investorRowCommittedAmountIsZero(row) ||
        !investorEsignIsFullyCompletedForRow(row)
      ) {
        if (
          investorRowSupportsApproveFund(row) &&
          !investorRowApproveFundNotApplicable(row) &&
          !investorRowCommittedAmountIsZero(row) &&
          !investorEsignIsFullyCompletedForRow(row)
        ) {
          toast.error(
            "E-sign required",
            "Complete e-sign before approving the fund.",
          );
        }
        return;
      }
      setApproveFundBusyId(row.id);
      try {
        const values: AddInvestmentFormValues = {
          ...dealInvestorRowToFormValues(row),
          status: INVESTMENT_STATUS_APPROVE_FUND,
          fundApproved: true,
        };
        const res = await putDealInvestment(dealId, row.id, values, null);
        if (!res.ok) {
          toast.error("Could not approve fund", res.message);
          return;
        }
        if (res.mode !== "api") {
          toast.error("Not available", "API is not configured.");
          return;
        }
        toast.success("Fund approved", "Investment status updated.");
        await onRefreshInvestors?.();
      } finally {
        setApproveFundBusyId(null);
      }
    },
    [canApproveFund, dealId, onRefreshInvestors],
  );

  const kpis = useMemo((): DealInvestorsKpis => {
    const base = initialPayload.kpis;
    const sum = rows.reduce(
      (acc, r) =>
        acc + parseCommittedCellToNumber(displayInvestorCommittedAmount(r)),
      0,
    );
    const count = rows.length;
    const avg = count > 0 && sum > 0 ? sum / count : 0;
    const approvedInvestorCount = rows.filter(
      (r) => r.id !== ADD_MEMBER_DRAFT_ROW_ID && investorRowIsFundApproved(r),
    ).length;
    const fundedSum = rows
      .filter((r) => r.id !== ADD_MEMBER_DRAFT_ROW_ID)
      .reduce((acc, r) => acc + fundedAmountForTotalFundedKpi(r), 0);
    const offeringAmt = resolveOfferingSizeKpiAmount(
      base,
      dealDetail,
      investorClasses,
    );
    return {
      ...base,
      offeringSize: resolveOfferingSizeKpi(base, dealDetail, investorClasses),
      committed: formatUsdKpiDisplay(sum),
      totalApproved: formatUsdKpiDisplay(sum),
      /** Headcount of fund-approved investors (matches Funded column / investorRowIsFundApproved). */
      approvedCount: String(approvedInvestorCount),
      averageApproved: count > 0 && sum > 0 ? formatUsdKpiDisplay(avg) : "—",
      /** Sum of funded $: fund-approved or funds received (fully/partially); pending re-approval uses snapshot. */
      totalFunded: formatUsdKpiTotalFunded(fundedSum),
      /** Offering size (same basis as tile) minus total funded; unknown offering → "—". */
      remaining:
        offeringAmt != null && Number.isFinite(offeringAmt)
          ? formatUsdKpiTotalFunded(offeringAmt - fundedSum)
          : "—",
    };
  }, [initialPayload.kpis, rows, dealDetail, investorClasses]);
  const [filterClass, setFilterClass] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterEsign, setFilterEsign] = useState("");
  const [filterFunding, setFilterFunding] = useState("");
  const [filterAccreditation, setFilterAccreditation] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePersistedTablePageSize(
    TABLE_PAGE_SIZE_ID.dealInvestors,
  );

  /** Count of investors with a signed date (excludes add-member draft row). */
  const documentSignedKpi = useMemo(() => {
    const dataRows = rows.filter((r) => r.id !== ADD_MEMBER_DRAFT_ROW_ID);
    const signedCount = dataRows.filter((r) => {
      const s = String(r.signedDate ?? "").trim().toLowerCase();
      const inProgress = new Set(["sent", "pending", "viewed", "signed"]);
      return s && s !== "—" && !inProgress.has(s);
    }).length;
    return dataRows.length > 0 ? `${signedCount} of ${dataRows.length}` : "—";
  }, [rows]);

  useEffect(() => {
    setRows(initialPayload.investors);
  }, [initialPayload]);

  /** Classes on this deal: Offering Information API, else list row (matches deals list column). */
  const dealAllClassNamesLine = useMemo(
    () => buildDealClassNamesLine(investorClasses, dealDetail),
    [investorClasses, dealDetail],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const mailLabel =
          r.invitationMailSent === true ? "email sent" : "not sent";
        const haystack =
          `${r.displayName} ${r.entitySubtitle} ${r.userInvestorProfileName ?? ""} ${r.userDisplayName} ${r.userEmail} ${r.firstName ?? ""} ${r.lastName ?? ""} ${r.addedByDisplayName ?? ""} ${mailLabel} ${investorFundedColumnLabel(r)}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filterClass) {
        const rowClass = (r.investorClass ?? "").trim();
        if (rowClass) {
          if (rowClass !== filterClass) return false;
        } else {
          const dealLine = dealAllClassNamesLine.trim();
          const tokens = dealLine
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (!tokens.includes(filterClass)) return false;
        }
      }
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterAccreditation && r.selfAccredited !== filterAccreditation)
        return false;
      if (filterEsign === "not_started") {
        if (!String(r.verifiedAccLabel).toLowerCase().includes("not started"))
          return false;
      }
      if (filterEsign === "complete") {
        if (String(r.verifiedAccLabel).toLowerCase().includes("not started"))
          return false;
      }
      if (filterFunding === "funded") {
        if (!investorRowIsFundApproved(r)) return false;
      }
      if (filterFunding === "pending") {
        if (investorRowIsFundApproved(r)) return false;
      }
      return true;
    });
  }, [
    rows,
    query,
    filterClass,
    filterStatus,
    filterEsign,
    filterFunding,
    filterAccreditation,
    dealAllClassNamesLine,
  ]);

  // Commented for now — Approved / Not approved $ summary at end of filters.
  // const fundingAmountSummary = useMemo(() => {
  //   const q = query.trim().toLowerCase();
  //   let approved = 0;
  //   let notApproved = 0;
  //   for (const r of rows) {
  //     if (r.id === ADD_MEMBER_DRAFT_ROW_ID) continue;
  //     if (q) {
  //       const mailLabel =
  //         r.invitationMailSent === true ? "email sent" : "not sent";
  //       const haystack =
  //         `${r.displayName} ${r.entitySubtitle} ${r.userDisplayName} ${r.userEmail} ${r.addedByDisplayName ?? ""} ${mailLabel} ${investorFundedColumnLabel(r)}`.toLowerCase();
  //       if (!haystack.includes(q)) continue;
  //     }
  //     if (filterClass) {
  //       const rowClass = (r.investorClass ?? "").trim();
  //       if (rowClass) {
  //         if (rowClass !== filterClass) continue;
  //       } else {
  //         const dealLine = dealAllClassNamesLine.trim();
  //         const tokens = dealLine
  //           .split(",")
  //           .map((s) => s.trim())
  //           .filter(Boolean);
  //         if (!tokens.includes(filterClass)) continue;
  //       }
  //     }
  //     if (filterStatus && r.status !== filterStatus) continue;
  //     if (filterAccreditation && r.selfAccredited !== filterAccreditation)
  //       continue;
  //     if (filterEsign === "not_started") {
  //       if (!String(r.verifiedAccLabel).toLowerCase().includes("not started"))
  //         continue;
  //     }
  //     if (filterEsign === "complete") {
  //       if (String(r.verifiedAccLabel).toLowerCase().includes("not started"))
  //         continue;
  //     }
  //     const amt = investorRowCommittedAmountNumeric(r);
  //     if (investorRowIsFundApproved(r)) approved += amt;
  //     else notApproved += amt;
  //   }
  //   return { approved, notApproved };
  // }, [
  //   rows,
  //   query,
  //   filterClass,
  //   filterStatus,
  //   filterEsign,
  //   filterAccreditation,
  //   dealAllClassNamesLine,
  // ]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      logInvestorsDataTableDebug({
        context: "DataTable rows (DealInvestorsPopulated filtered)",
        dealId,
        rows: filtered,
        extra: {
          totalRows: rows.length,
          hasOpenEsignStatusModal: true,
        },
      });
    }
  }, [dealId, filtered, rows.length]);

  /** Poll Dropbox while any row has an in-flight eSign (Send e-sign actions menu). */
  useEffect(() => {
    if (!onRefreshInvestors) return;
    const hasInFlight = rows.some((r) => {
      if (investorEsignIsFullyCompletedForRow(r)) return false;
      const st = resolveInvestorRowEsignStatus(r);
      return Boolean(st?.sentAt?.trim()) && !st?.completedAt?.trim();
    });
    if (!hasInFlight) return;
    const timer = window.setInterval(() => {
      void onRefreshInvestors();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [rows, onRefreshInvestors]);

  const allFilteredInvestorsSelected = useMemo(
    () =>
      filtered.length > 0 &&
      filtered.every((r) => selectedInvestorIds.has(r.id)),
    [filtered, selectedInvestorIds],
  );

  const someFilteredInvestorsSelected = useMemo(
    () =>
      filtered.some((r) => selectedInvestorIds.has(r.id)) &&
      !allFilteredInvestorsSelected,
    [filtered, selectedInvestorIds, allFilteredInvestorsSelected],
  );

  useLayoutEffect(() => {
    const el = investorSelectAllRef.current;
    if (el) el.indeterminate = someFilteredInvestorsSelected;
  }, [
    someFilteredInvestorsSelected,
    allFilteredInvestorsSelected,
    filtered.length,
  ]);

  useEffect(() => {
    setSelectedInvestorIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(filtered.map((r) => r.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
      }
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [filtered]);

  const toggleSelectInvestor = useCallback((id: string) => {
    setSelectedInvestorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAllFilteredInvestors = useCallback(() => {
    if (filtered.length === 0) return;
    if (allFilteredInvestorsSelected) {
      setSelectedInvestorIds((prev) => {
        const next = new Set(prev);
        for (const r of filtered) next.delete(r.id);
        return next;
      });
      return;
    }
    setSelectedInvestorIds((prev) => {
      const next = new Set(prev);
      for (const r of filtered) next.add(r.id);
      return next;
    });
  }, [filtered, allFilteredInvestorsSelected]);

  const selectedInvestorRows = useMemo(
    () => filtered.filter((r) => selectedInvestorIds.has(r.id)),
    [filtered, selectedInvestorIds],
  );
  const senderEmail = useMemo(() => getCurrentSessionUserEmail(), []);
  const selectedTemplate = useMemo(
    () => emailTemplates.find((t) => t.id === selectedTemplateId) ?? null,
    [emailTemplates, selectedTemplateId],
  );
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

  const openEsignStatusModal = useCallback((row: DealInvestorRow) => {
    setEsignStatusRow(row);
  }, []);

  const closeEsignStatusModal = useCallback(() => {
    setEsignStatusRow(null);
    void onRefreshInvestors?.();
  }, [onRefreshInvestors]);

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
          selectedInvestorRows
            .map((r) => String(r.userEmail ?? "").trim())
            .filter((e) => isUsableInvestorEmail(e)),
        ),
      ];
      if (emails.length === 0) {
        toast.error(
          "No email recipients",
          "Selected investors have no valid email.",
        );
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
    [emailTemplates, selectedInvestorRows, selectedTemplateId, sendMailCc],
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

  useEffect(() => {
    setPage(1);
  }, [
    query,
    filterClass,
    filterStatus,
    filterEsign,
    filterFunding,
    filterAccreditation,
  ]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [filtered.length, pageSize, page]);

  const classFilterOptions = useMemo((): DropdownSelectOption[] => {
    const s = new Set(
      rows.map((r) => r.investorClass).filter(Boolean) as string[],
    );
    for (const c of investorClasses) {
      const n = String(c.name ?? "").trim();
      if (n) s.add(n);
    }
    const listRaw = dealDetail?.listRow?.investorClass?.trim();
    if (listRaw && listRaw !== "—") {
      for (const p of listRaw.split(/[;,]/)) {
        const t = p.trim();
        if (t) s.add(t);
      }
    }
    return [
      { value: "", label: "All classes" },
      ...[...s].sort().map((c) => ({ value: c, label: c })),
    ];
  }, [rows, investorClasses, dealDetail]);

  const statusFilterOptions = useMemo((): DropdownSelectOption[] => {
    const s = new Set(rows.map((r) => r.status).filter(Boolean));
    return [
      { value: "", label: "All statuses" },
      ...[...s].sort().map((c) => ({ value: c, label: c })),
    ];
  }, [rows]);

  const esignFilterOptions = useMemo(
    (): DropdownSelectOption[] => [
      { value: "", label: "All" },
      { value: "not_started", label: "Not started" },
      { value: "complete", label: "Complete" },
    ],
    [],
  );

  const fundingFilterOptions = useMemo(
    (): DropdownSelectOption[] => [
      { value: "", label: "All" },
      { value: "funded", label: "Approved" },
      { value: "pending", label: "Not Approved" },
    ],
    [],
  );

  const accreditationFilterOptions = useMemo(
    (): DropdownSelectOption[] => [
      { value: "", label: "All" },
      { value: "Yes", label: "Yes" },
      { value: "No", label: "No" },
    ],
    [],
  );
  const pagination = useMemo(
    () => ({
      page,
      pageSize,
      totalItems: filtered.length,
      onPageChange: setPage,
      onPageSizeChange: setPageSize,
      ariaLabel: "Investors table pagination",
    }),
    [page, pageSize, filtered.length],
  );

  const exportModalRows = useMemo(
    () => filtered.filter((r) => r.id !== ADD_MEMBER_DRAFT_ROW_ID),
    [filtered],
  );

  const columns: DataTableColumn<DealInvestorRow>[] = useMemo(
    () => [
      {
        id: "select",
        header: (
          <input
            ref={investorSelectAllRef}
            type="checkbox"
            className="um_table_header_select_cb"
            checked={allFilteredInvestorsSelected}
            onChange={toggleSelectAllFilteredInvestors}
            disabled={filtered.length === 0}
            aria-label="Select all investors in this list"
          />
        ),
        align: "center",
        thClassName: "um_th_checkbox",
        tdClassName: "um_td_checkbox",
        cell: (row) => (
          <input
            type="checkbox"
            className="um_table_row_select_cb"
            checked={selectedInvestorIds.has(row.id)}
            onChange={() => toggleSelectInvestor(row.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select investor ${row.displayName || row.userEmail || row.id}`}
          />
        ),
      },
      {
        id: "investor",
        header: "Investor",
        sortValue: (row) =>
          `${row.displayName} ${row.entitySubtitle} ${formatMemberUsername(row.userDisplayName)} ${row.userEmail} ${row.firstName ?? ""} ${row.lastName ?? ""}`.toLowerCase(),
        tdClassName: "deal_inv_td_member deal_inv_td_investor_identity",
        cell: (row) => (
          <DealInvestorIdentityCell
            row={row}
            isDraft={investorRowShowsDraftBadge(row)}
            onNameClick={
              row.id === ADD_MEMBER_DRAFT_ROW_ID
                ? onContinueDraftEdit
                  ? () => onContinueDraftEdit()
                  : undefined
                : onViewInvestor
            }
          />
        ),
      },
      /* Role column — re-enable when needed
      {
        id: "role",
        header: "Role",
        thClassName: "deal_inv_th_role",
        sortValue: (row) => (row.investorRole ?? "").trim().toLowerCase(),
        tdClassName: "deal_inv_td_role deal_inv_td_role_badge_cell",
        cell: (row) => <DealInvestorRoleCell row={row} />,
      },
      */
      {
        id: "profile",
        header: "Profile",
        colWidth: "14rem",
        thClassName: "deal_inv_th_profile",
        tdClassName: "deal_inv_td_profile",
        sortValue: (row) =>
          dealInvestorProfileDisplayName(row).toLowerCase(),
        cell: (row) => {
          const text = dealInvestorProfileDisplayName(row)
          if (!text || text === "—")
            return <span className="um_status_muted">—</span>
          return <span className="deal_inv_profile_full_text">{text}</span>
        },
      },
      {
        id: "investorClass",
        align: "center",
        header: (
          <span className="deal_inv_th_investor_class_head">
            <span>Investor Class</span>
            {investorClasses.length === 0 ? (
              <FormTooltip
                label="Please complete the Offering Details section to assign an investor class."
                content={
                  <p className="deal_inv_class_tooltip_p">
                    Please complete the Offering Details section to assign an
                    investor class.
                  </p>
                }
                placement="bottom"
                panelAlign="start"
                openOnHover={false}
                nativeButtonTrigger={false}
              />
            ) : null}
          </span>
        ),
        thClassName: "deals_th_align_center",
        tdClassName:
          "deal_inv_td_investor_class deal_inv_td_investor_class_cell deal_inv_td_investor_class_center",
        sortValue: (row) => {
          const a = formatInvestorClassTableLabel(
            row.investorClass,
            investorClasses,
          );
          if (a) return a.toLowerCase();
          return dealAllClassNamesLine.toLowerCase();
        },
        cell: (row) => {
          const assignedRaw = formatInvestorClassTableLabel(
            row.investorClass,
            investorClasses,
          );
          const dealLine = dealAllClassNamesLine.trim();
          const pillSource = assignedRaw || dealLine;
          if (!pillSource.trim())
            return <span className="deal_inv_class_pill_muted">—</span>;
          const titleForTooltip =
            assignedRaw && dealLine && assignedRaw !== dealLine
              ? `${assignedRaw} · Deal: ${dealLine}`
              : pillSource;
          return (
            <InvestorClassPillsDisplay
              pillSource={pillSource}
              titleForTooltip={titleForTooltip}
              disableHoverTooltip
            />
          );
        },
      },
      {
        id: "status",
        header: "Status",
        sortValue: (row) => dealInvestorStatusDisplayLabel(row).toLowerCase(),
        tdClassName: "deal_inv_td_ellipsis",
        cell: (row) => (
          <DealInvEllipsisText text={dealInvestorStatusDisplayLabel(row)} />
        ),
      },
      {
        id: "added_by",
        header: "Sponsor name",
        sortValue: (row) => String(row.addedByDisplayName ?? "").toLowerCase(),
        tdClassName: "deal_inv_td_ellipsis",
        cell: (row) => {
          const s = String(row.addedByDisplayName ?? "").trim();
          const display = s && s !== "—" ? s : "—";
          const email = String(row.addedByEmail ?? "").trim();
          if (display === "—" || !email)
            return <DealInvEllipsisText text={display} />;
          return (
            <FormTooltip
              triggerMode="inline"
              placement="top"
              panelAlign="start"
              openOnHover
              label={`Sponsor email for ${display}`}
              content={
                <p className="deal_inv_sponsor_email_tooltip">{email}</p>
              }
            >
              <span className="deal_inv_ellipsis_text deal_inv_sponsor_name_hover">
                {display}
              </span>
            </FormTooltip>
          );
        },
      },
      {
        id: "committed",
        header: "Committed",
        align: "right",
        thClassName: "deals_th_align_right",
        sortValue: (row) =>
          parseMoneyDigits(displayInvestorCommittedAmount(row)),
        tdClassName: "deal_inv_td_ellipsis deal_inv_td_committed um_td_numeric",
        cell: (row) => <DealInvestorCommittedAmountCell row={row} />,
      },
      {
        id: "signed",
        header: "Signed",
        sortValue: (row) =>
          row.esignStatus?.completedAt ??
          row.esignStatus?.signedAt ??
          row.esignStatus?.viewedAt ??
          row.esignStatus?.sentAt ??
          row.signedDate ??
          "",
        tdClassName: "deal_inv_td_ellipsis",
        cell: (row) => (
          <DealInvestorSignedCell
            row={row}
            onOpenEsignStatus={openEsignStatusModal}
          />
        ),
      },
      {
        id: "funded",
        header: "Funded",
        sortValue: (row) => (investorRowIsFundApproved(row) ? "1" : "0"),
        tdClassName: "deal_inv_td_funded",
        cell: (row) => <DealInvestorFundedBadge row={row} />,
      },
      {
        id: "selfAcc",
        header: "Self Acc",
        sortValue: (row) => row.selfAccredited ?? "",
        tdClassName: "deal_inv_td_ellipsis",
        cell: (row) => <DealInvEllipsisText text={row.selfAccredited ?? "—"} />,
      },
      {
        id: "verifiedAcc",
        header: "Verified Acc",
        sortValue: (row) => row.verifiedAccLabel ?? "",
        tdClassName: "deal_inv_td_ellipsis deal_inv_td_verified",
        cell: (row) => <VerifiedAccBadge label={row.verifiedAccLabel ?? "—"} />,
      },
      {
        id: "mailStatus",
        header: "Email status",
        sortValue: (row) =>
          row.id === ADD_MEMBER_DRAFT_ROW_ID
            ? -1
            : row.invitationMailSent === true
              ? 1
              : 0,
        tdClassName: "deal_inv_td_mail_status",
        cell: (row) => <InviteMailStatusBadge row={row} />,
      },
      {
        id: "actions",
        header: "Actions",
        align: "center",
        thClassName: "um_th_actions",
        tdClassName: "um_td_actions deal_inv_td_actions",
        cell: (row) => (
          <div className="deal_members_actions_cell">
            <DealMemberRowActions
              row={row}
              draftRow={row.id === ADD_MEMBER_DRAFT_ROW_ID}
              invitationMailSent={row.invitationMailSent === true}
              offeringLinkAvailable={offeringLinkAvailable}
              offeringLinkBlockedBecauseDraft={offeringLinkBlockedBecauseDraft}
              onEdit={(r) => {
                if (r.id === ADD_MEMBER_DRAFT_ROW_ID) {
                  if (onContinueDraftEdit) onContinueDraftEdit();
                  else onAddInvestor();
                  return;
                }
                onEditInvestor(r);
              }}
              onCopyLink={(r) => onCopyOfferingLink?.(r)}
              onSendEsign={onSendEsignRequest}
              sendEsignDisabled={sendEsignDisabled}
              sendEsignDisabledTitle={sendEsignDisabledTitle}
              onSendInvite={(r) => {
                void onSendInvitationMail?.(r);
              }}
              onApproveFund={canApproveFund ? handleApproveFund : undefined}
              approveFundDisabled={
                !canApproveFund ||
                approveFundBusyId === row.id ||
                !investorRowSupportsApproveFund(row) ||
                investorRowApproveFundNotApplicable(row) ||
                investorRowCommittedAmountIsZero(row) ||
                !investorEsignIsFullyCompletedForRow(row)
              }
              approveFundDisabledTitle={
                !canApproveFund
                  ? "Only the lead sponsor, admin sponsor, or company admin can approve the fund"
                  : approveFundBusyId === row.id
                  ? "Approving…"
                  : !investorRowSupportsApproveFund(row)
                    ? "Available only for investors with an investment record"
                    : investorRowApproveFundNotApplicable(row)
                      ? "Already past this step or closed"
                      : investorRowCommittedAmountIsZero(row)
                        ? "Committed amount must be greater than $0"
                        : !investorEsignIsFullyCompletedForRow(row)
                          ? "Complete e-sign before approving the fund"
                          : undefined
              }
              onDelete={(r) => {
                void onDeleteMember?.(r);
              }}
            />
          </div>
        ),
      },
    ],
    [
      dealAllClassNamesLine,
      investorClasses,
      allFilteredInvestorsSelected,
      toggleSelectAllFilteredInvestors,
      selectedInvestorIds,
      toggleSelectInvestor,
      filtered.length,
      onEditInvestor,
      onViewInvestor,
      onAddInvestor,
      onContinueDraftEdit,
      onSendInvitationMail,
      onSendEsignRequest,
      sendEsignDisabled,
      sendEsignDisabledTitle,
      onCopyOfferingLink,
      onDeleteMember,
      offeringLinkAvailable,
      handleApproveFund,
      approveFundBusyId,
      canApproveFund,
      openEsignStatusModal,
    ],
  );

  function handleExportInvestors(selected: DealInvestorRow[]) {
    const csv = buildDealInvestorsExportCsv(selected, dealAllClassNamesLine);
    const filename = buildTableExportFilename({
      dealName,
      tableSlug: "investor",
    });
    downloadDealExportCsv(csv, filename);
    void notifyDealInvestorsExportAudit(dealId, {
      rowCount: selected.length,
      exportedLines: exportAuditLinesForDealInvestorRows(selected),
    });
    toast.success("Investors exported", `Saved as ${filename}`);
  }

  const handleSendMailToSelectedInvestors = useCallback(async () => {
    const emails = [
      ...new Set(
        selectedInvestorRows
          .map((r) => String(r.userEmail ?? "").trim())
          .filter((e) => isUsableInvestorEmail(e)),
      ),
    ];
    if (emails.length === 0) {
      toast.error(
        "No email recipients",
        "Selected investors have no valid email.",
      );
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
    selectedInvestorRows,
    selectedTemplateId,
    sendMailCc,
    senderEmail,
    closeSendMailModal,
  ]);

  const kpiMetricCards = useMemo(
    () =>
      DEAL_INVESTORS_KPI_CARD_SPECS.map((item) => {
        let description: ReactNode = "—";
        switch (item.title) {
          case "Offering Size":
            description = cardCompactAmountOrDash(kpis.offeringSize);
            break;
          case "Committed":
            description = cardCompactAmountOrDash(kpis.committed);
            break;
          case "Document signed":
            description = documentSignedKpi;
            break;
          case "Approved":
            description = kpis.approvedCount;
            break;
          case "Total Funded":
            description = cardCompactAmountOrDash(kpis.totalFunded);
            break;
          case "Remaining":
            description = cardCompactAmountOrDash(kpis.remaining);
            break;
        }
        return (
          <ToolStyleCard
            key={item.title}
            variant="metric"
            icon={item.icon}
            title={item.title}
            description={description}
          />
        );
      }),
    [kpis, documentSignedKpi],
  );

  return (
    <div className="deal_inv_populated deal_members_tab">
      <section
        className="sponsor_dash_metrics deal_inv_kpi_metrics"
        aria-label="Deal investment summary"
      >
        {kpiMetricCards}
      </section>

      <ExportDealInvestorRowsModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        title="Export deal investors"
        hint="Search and select investors, then export to Excel (CSV format)."
        searchPlaceholder="Search investors…"
        searchAriaLabel="Search investors in export list"
        listAriaLabel="Deal investors to export"
        rows={exportModalRows}
        onExportExcel={handleExportInvestors}
      />
      <InvestorEsignStatusModal
        open={esignStatusRow != null}
        dealId={dealId}
        row={esignStatusRow}
        onClose={closeEsignStatusModal}
      />
      {sendMailModalOpen ? (
        <div
          className="um_modal_overlay contacts_suspend_overlay"
          role="presentation"
        >
          <div
            className="um_modal contacts_suspend_modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deal-investors-send-mail-title"
          >
            <div className="um_modal_head">
              <h3
                id="deal-investors-send-mail-title"
                className="um_modal_title um_title_with_icon"
              >
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
                Sending to {selectedInvestorRows.length} selected investor
                {selectedInvestorRows.length === 1 ? "" : "s"}.
              </span>
            </p>
            {/* <div className="um_field contacts_suspend_reason_field">
              <label
                className="um_field_label_row"
                htmlFor="deal-investors-send-mail-from"
              >
                <span>From</span>
              </label>
              <input
                id="deal-investors-send-mail-from"
                type="text"
                className="um_input"
                value={senderEmail || "Current user"}
                readOnly
              />
            </div> */}
            <div className="um_field contacts_suspend_reason_field">
              <label
                className="um_field_label_row"
                htmlFor="deal-investors-send-mail-cc"
              >
                <span>CC</span>
              </label>
              <input
                id="deal-investors-send-mail-cc"
                type="text"
                className="um_input"
                placeholder="email1@domain.com, email2@domain.com"
                value={sendMailCc}
                onChange={(e) => setSendMailCc(e.target.value)}
              />
            </div>
            <div className="um_field contacts_suspend_reason_field">
              <div className="contacts_send_mail_template_head">
                <label
                  className="um_field_label_row"
                  htmlFor="deal-investors-send-mail-template"
                >
                  <span>Email template</span>
                </label>
              </div>
              <div className="contacts_send_mail_template_select_row">
                <select
                  id="deal-investors-send-mail-template"
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
                disabled={
                  !selectedTemplateId || selectedInvestorRows.length === 0
                }
                onClick={handleSendMailToSelectedInvestors}
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

      <div className="um_panel um_members_tab_panel deal_inv_table_panel">
        <div className="deal_inv_controls">
          {/* Share with lead sponsor + Send email (deferred)
          <div className="deal_inv_toolbar">
            <div className="deal_inv_toolbar_leading">
              <button
                type="button"
                className="um_btn_toolbar deal_inv_toolbar_share_btn"
              >
                Share Investor Details with Lead Sponsor
              </button>
            </div>
            <div
              className="deal_inv_toolbar_actions"
              role="toolbar"
              aria-label="Investor list actions"
            >
              <button type="button" className="um_btn_toolbar" disabled>
                <Mail size={16} strokeWidth={2} aria-hidden />
                Send email
              </button>
            </div>
          </div>
          */}

          <div
            className="um_toolbar deal_inv_table_um_toolbar um_toolbar_export_then_search deal_investors_filters_toolbar"
            role="toolbar"
            aria-label="Investor list actions"
          >
            <div className="um_toolbar_actions deal_inv_table_toolbar_actions deal_investors_filters_toolbar_actions">
              <button
                type="button"
                className="um_btn_toolbar"
                onClick={openSendMailModal}
                disabled={selectedInvestorRows.length === 0}
              >
                <Send size={18} strokeWidth={2} aria-hidden />
                Send email
              </button>
              <button
                type="button"
                className="um_toolbar_export_btn"
                onClick={() => setExportModalOpen(true)}
                aria-label="Export All"
              >
                <Download size={18} strokeWidth={2} aria-hidden />
                <span>Export All</span>
              </button>
            </div>
            <div className="um_toolbar_actions deal_inv_table_toolbar_actions deal_investors_filters_toolbar_trailing">
              <div className="um_search_wrap deal_inv_filters_search">
                <Search className="um_search_icon" size={18} aria-hidden />
                <input
                  type="search"
                  className="um_search_input"
                  placeholder="Search investors…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search investors"
                />
              </div>
              <button
                type="button"
                className="um_btn_primary deal_investors_add_investor_btn"
                onClick={onAddInvestor}
              >
                <Plus size={18} strokeWidth={2} aria-hidden />
                Add Investor
              </button>
            </div>
          </div>

          <section
            className="deal_inv_filters_section"
            aria-labelledby="deal-inv-filters-heading"
          >
            <h3
              id="deal-inv-filters-heading"
              className="deal_inv_filters_heading"
            >
              Filters
            </h3>
            <div
              className="deal_inv_filters_grid"
              role="group"
              aria-label="Investor list filters"
            >
              <div className="deal_inv_filter_field">
                <label
                  className="deal_inv_filter_label"
                  htmlFor={`deal-inv-filter-class-${dealId}`}
                >
                  <Tag size={14} strokeWidth={2} aria-hidden />
                  Investor class
                </label>
                <DropdownSelect
                  id={`deal-inv-filter-class-${dealId}`}
                  className="deal_inv_filter_dropdown"
                  triggerClassName="deal_inv_filter_select"
                  value={filterClass}
                  options={classFilterOptions}
                  onChange={setFilterClass}
                  ariaLabel="Filter by investor class"
                  useFixedPanel
                />
              </div>
              <div className="deal_inv_filter_field">
                <label
                  className="deal_inv_filter_label"
                  htmlFor={`deal-inv-filter-status-${dealId}`}
                >
                  <Activity size={14} strokeWidth={2} aria-hidden />
                  Investment status
                </label>
                <DropdownSelect
                  id={`deal-inv-filter-status-${dealId}`}
                  className="deal_inv_filter_dropdown"
                  triggerClassName="deal_inv_filter_select"
                  value={filterStatus}
                  options={statusFilterOptions}
                  onChange={setFilterStatus}
                  ariaLabel="Filter by investment status"
                  useFixedPanel
                />
              </div>
              <div className="deal_inv_filter_field">
                <label
                  className="deal_inv_filter_label"
                  htmlFor={`deal-inv-filter-esign-${dealId}`}
                >
                  <BadgeCheck size={14} strokeWidth={2} aria-hidden />
                  eSign status
                </label>
                <DropdownSelect
                  id={`deal-inv-filter-esign-${dealId}`}
                  className="deal_inv_filter_dropdown"
                  triggerClassName="deal_inv_filter_select"
                  value={filterEsign}
                  options={esignFilterOptions}
                  onChange={setFilterEsign}
                  ariaLabel="Filter by eSign status"
                  useFixedPanel
                />
              </div>
              <div className="deal_inv_filter_field">
                <label
                  className="deal_inv_filter_label"
                  htmlFor={`deal-inv-filter-funding-${dealId}`}
                >
                  <Landmark size={14} strokeWidth={2} aria-hidden />
                  Funded
                </label>
                <DropdownSelect
                  id={`deal-inv-filter-funding-${dealId}`}
                  className="deal_inv_filter_dropdown"
                  triggerClassName="deal_inv_filter_select"
                  value={filterFunding}
                  options={fundingFilterOptions}
                  onChange={setFilterFunding}
                  ariaLabel="Filter by funded status"
                  useFixedPanel
                />
              </div>
              <div className="deal_inv_filter_field">
                <label
                  className="deal_inv_filter_label"
                  htmlFor={`deal-inv-filter-accred-${dealId}`}
                >
                  <UserRound size={14} strokeWidth={2} aria-hidden />
                  Accreditation
                </label>
                <DropdownSelect
                  id={`deal-inv-filter-accred-${dealId}`}
                  className="deal_inv_filter_dropdown"
                  triggerClassName="deal_inv_filter_select"
                  value={filterAccreditation}
                  options={accreditationFilterOptions}
                  onChange={setFilterAccreditation}
                  ariaLabel="Filter by accreditation"
                  useFixedPanel
                />
              </div>
              {/* Commented for now — Approved / Not approved amounts at end of filters.
              <div
                className="deal_inv_funding_summary"
                aria-label="Committed amounts by funded status"
              >
                <div className="deal_inv_funding_stat is-approved">
                  <span className="deal_inv_funding_stat_label">Approved</span>
                  <span className="deal_inv_funding_stat_value">
                    {formatUsdKpiTotalFunded(fundingAmountSummary.approved)}
                  </span>
                </div>
                <span className="deal_inv_funding_summary_sep" aria-hidden>
                  ·
                </span>
                <div className="deal_inv_funding_stat is-pending">
                  <span className="deal_inv_funding_stat_label">
                    Not approved
                  </span>
                  <span className="deal_inv_funding_stat_value">
                    {formatUsdKpiTotalFunded(fundingAmountSummary.notApproved)}
                  </span>
                </div>
              </div>
              */}
            </div>
          </section>
        </div>

        <DataTable
          visualVariant="members"
          membersTableClassName="um_table_members deal_inv_table"
          stickyColumnCount={2}
          forceHorizontalScroll
          columns={columns}
          rows={filtered}
          getRowKey={(row, i) =>
            row.id ? `${row.id}::${i}` : `inv-${dealId}-${i}`
          }
          getRowClassName={(row) =>
            investorRowShowsDraftBadge(row) ? "deal_inv_row_draft" : undefined
          }
          emptyLabel="No LP investors match your filters."
          pagination={pagination}
        />
      </div>
    </div>
  );
}

export const DealInvestorsTab = forwardRef<
  DealInvestorsTabHandle,
  DealInvestorsTabProps
>(function DealInvestorsTab(
  {
    dealId,
    dealName,
    dealDetail,
    addInvestmentOpen,
    modalOnly = false,
    onAddInvestmentClose,
    onOpenFullInvestmentModal,
    addInvestmentEntry = "member",
    restoreAddMemberSessionDraft = true,
    onInvestorsChanged,
    onSendInvitationMail,
    onSendEsignConfirm,
    sendEsignDisabled = false,
    sendEsignDisabledTitle,
    canApproveFund = false,
    onCopyOfferingLink,
    onDeleteMember,
    onSharedInvestmentModalOpenChange,
    offeringLinkAvailable = false,
    offeringLinkBlockedBecauseDraft = false,
    investorsListRefreshKey = 0,
    invitationMailStatusByRowId,
    viewerDealMemberRole = null,
    dealMembersRoster = [],
  },
  ref,
) {
  const sessionUserId = getSessionUserId();
  const sessionEmail = getSessionUserEmail();
  const [addLpInvestorOpen, setAddLpInvestorOpen] = useState(false);
  /** “Continue editing” on draft row: prefill AddLpInvestorModal from session add-member draft. */
  const [lpResumeAddMemberDraft, setLpResumeAddMemberDraft] = useState(false);
  const [payload, setPayload] = useState<DealInvestorsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [localAddedInvestors, setLocalAddedInvestors] = useState<
    DealInvestorRow[]
  >([]);
  const [investorClasses, setInvestorClasses] = useState<DealInvestorClass[]>(
    [],
  );
  const [editRow, setEditRow] = useState<DealInvestorRow | null>(null);
  const [editLpRow, setEditLpRow] = useState<DealInvestorRow | null>(null);
  const [viewInvestorRow, setViewInvestorRow] =
    useState<DealInvestorRow | null>(null);
  const [sendEsignModalRow, setSendEsignModalRow] =
    useState<DealInvestorRow | null>(null);
  const [addMemberDraftTick, setAddMemberDraftTick] = useState(0);

  useEffect(() => {
    function onDraftUpdated() {
      setAddMemberDraftTick((t) => t + 1);
    }
    window.addEventListener(ADD_MEMBER_DRAFT_UPDATED_EVENT, onDraftUpdated);
    return () =>
      window.removeEventListener(
        ADD_MEMBER_DRAFT_UPDATED_EVENT,
        onDraftUpdated,
      );
  }, []);

  const editFormInitialValues = useMemo(
    () => (editRow ? dealInvestorRowToFormValues(editRow) : null),
    [editRow],
  );

  const dealClassNamesLineForView = useMemo(
    () => buildDealClassNamesLine(investorClasses, dealDetail),
    [investorClasses, dealDetail],
  );

  // Separate investor distributions page (kept for later; use popup for now).
  // const openInvestorDistributionsPage = useCallback(
  //   (row: DealInvestorRow) => {
  //     const id = String(row.id ?? "").trim()
  //     if (!dealId || !id) return
  //     navigate(
  //       `/deals/${encodeURIComponent(dealId)}/investors/${encodeURIComponent(id)}/distributions`,
  //     )
  //   },
  //   [dealId, navigate],
  // )

  const handleEditInvestor = useCallback(
    (row: DealInvestorRow) => {
      setViewInvestorRow(null);
      setLpResumeAddMemberDraft(false);
      /** Dismiss “Add investment” so `addInvestmentOpen` is false; otherwise the effect
       * below clears `editRow` while the modal stays in add mode and session draft POSTs again. */
      onAddInvestmentClose();
      if (shouldUseLpInvestorsModalForEdit(row)) {
        setEditRow(null);
        setEditLpRow(row);
        return;
      }
      setEditLpRow(null);
      setEditRow(row);
    },
    [onAddInvestmentClose],
  );

  const handleContinueDraftInvestor = useCallback(() => {
    const draft = loadAddMemberDraft(dealId);
    if (draft && isLpInvestorRole(draft.form.investorRole ?? "")) {
      setLpResumeAddMemberDraft(true);
      setAddLpInvestorOpen(true);
      return;
    }
    onOpenFullInvestmentModal?.();
  }, [dealId, onOpenFullInvestmentModal]);

  useImperativeHandle(
    ref,
    () => ({
      openViewInvestor: (row: DealInvestorRow) => {
        setViewInvestorRow(row);
      },
      openEditInvestor: (row: DealInvestorRow) => {
        setViewInvestorRow(null);
        setLpResumeAddMemberDraft(false);
        onAddInvestmentClose();
        if (shouldUseLpInvestorsModalForEdit(row)) {
          setEditRow(null);
          setEditLpRow(row);
          return;
        }
        setEditLpRow(null);
        setEditRow(row);
      },
      refetchInvestors: async () => {
        const data = await fetchDealInvestors(dealId, {
          lpInvestorsOnly: true,
        });
        setPayload(data);
      },
    }),
    [dealId, onAddInvestmentClose],
  );

  useEffect(() => {
    if (addInvestmentOpen) {
      setEditRow(null);
      setEditLpRow(null);
    }
  }, [addInvestmentOpen]);

  useLayoutEffect(() => {
    onSharedInvestmentModalOpenChange?.(
      Boolean(
        addInvestmentOpen ||
        editRow !== null ||
        editLpRow !== null ||
        addLpInvestorOpen,
      ),
    );
  }, [
    addInvestmentOpen,
    editRow,
    editLpRow,
    addLpInvestorOpen,
    onSharedInvestmentModalOpenChange,
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const data = await fetchDealInvestors(dealId, { lpInvestorsOnly: true });
      if (!cancelled) {
        setPayload(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dealId, investorsListRefreshKey]);

  useEffect(() => {
    let cancelled = false;
    void fetchDealInvestorClasses(dealId).then((list) => {
      if (!cancelled) setInvestorClasses(list);
    });
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  useEffect(() => {
    setLocalAddedInvestors([]);
  }, [dealId]);

  const sessionDraftRow = useMemo((): DealInvestorRow | null => {
    void addMemberDraftTick;
    return buildAddMemberDraftInvestorRow(dealId, investorClasses);
  }, [dealId, investorClasses, addMemberDraftTick]);

  const effectiveViewerRole = useMemo((): ViewerDealMemberRole => {
    if (viewerDealMemberRole != null) return viewerDealMemberRole;
    if (dealMembersRoster.length > 0) {
      return resolveViewerDealMemberRole(
        dealMembersRoster,
        sessionEmail,
        sessionUserId,
      );
    }
    return null;
  }, [
    viewerDealMemberRole,
    dealMembersRoster,
    sessionEmail,
    sessionUserId,
  ]);

  const mergedInvestors = useMemo(() => {
    const combined = [...(payload?.investors ?? []), ...localAddedInvestors]
    /**
     * Investors API (`lpInvestorsOnly=1`) is already the tab list — one row per
     * investment. Do not drop rows with a second FE role filter (that was hiding
     * valid commitments when role metadata differed).
     */
    const fromApi = combined.filter((r) => {
      if (r.id === ADD_MEMBER_DRAFT_ROW_ID) return false
      return !investorRowIsGeneralPartner(r, investorClasses)
    })
    const scopedLpOnly = scopeDealInvestorRowsForViewer(
      fromApi,
      effectiveViewerRole,
      sessionUserId,
    )
    const draftRedundantWithApi = isAddMemberSessionDraftRedundantWithApiRows(
      dealId,
      combined,
    )
    const showDraft =
      sessionDraftRow &&
      !draftRedundantWithApi &&
      !editRow &&
      !editLpRow &&
      !addInvestmentOpen &&
      !addLpInvestorOpen &&
      isLpInvestorsTabRow(sessionDraftRow)
    if (showDraft) return [...scopedLpOnly, sessionDraftRow]
    return scopedLpOnly
  }, [
    dealId,
    payload,
    localAddedInvestors,
    sessionDraftRow,
    editRow,
    editLpRow,
    addInvestmentOpen,
    addLpInvestorOpen,
    effectiveViewerRole,
    sessionUserId,
    investorClasses,
  ]);

  const mergedPayload = useMemo((): DealInvestorsPayload | null => {
    if (!payload) return null;
    return {
      ...payload,
      investors: applyInvitationMailSentMarks(
        mergedInvestors,
        invitationMailStatusByRowId,
      ),
    };
  }, [payload, mergedInvestors, invitationMailStatusByRowId]);

  async function handleSaveAddInvestment(
    values: AddInvestmentFormValues,
    subscriptionDocument: File | null,
  ) {
    const draftMeta = loadAddMemberDraft(dealId);
    const autosavedLpId = draftMeta?.backendLpInvestorId?.trim();
    const autosavedInvId = draftMeta?.backendInvestmentId?.trim();
    const result = isLpInvestorRole(values.investorRole)
      ? autosavedLpId
        ? await putDealLpInvestor(dealId, autosavedLpId, values)
        : await postDealLpInvestor(dealId, values)
      : autosavedInvId
        ? await putDealInvestment(
            dealId,
            autosavedInvId,
            values,
            subscriptionDocument,
          )
        : await postDealInvestment(dealId, values, subscriptionDocument);
    if (!result.ok) {
      if (result.extraCompanyUserPayment) {
        throw new ExtraCompanyUserPaymentRequiredError(
          result.extraCompanyUserPayment,
        );
      }
      throw new Error(result.message);
    }
    upsertRuntimeFromViewerAddInvestmentForm({
      dealId,
      values,
      dealDetail: dealDetail ?? null,
    });
    const valuesForDisplay: AddInvestmentFormValues = {
      ...values,
      investorClass: resolveInvestorClassLabelForRow(
        values.investorClass,
        investorClasses,
      ),
    };
    if (result.mode === "client") {
      setLocalAddedInvestors((prev) => [
        ...prev,
        addInvestmentFormToRow(valuesForDisplay, dealId),
      ]);
    } else {
      setLocalAddedInvestors([]);
      const data = await fetchDealInvestors(dealId, { lpInvestorsOnly: true });
      setPayload(data);
      const full = await fetchDealInvestors(dealId, { lpInvestorsOnly: false });
      upsertRuntimeForViewerFromInvestorsPayload(
        dealId,
        full,
        dealDetail ?? null,
      );
    }
    onAddInvestmentClose();
    onInvestorsChanged?.();
  }

  function handleCloseInvestmentModal() {
    setEditRow(null);
    setEditLpRow(null);
    onAddInvestmentClose();
  }

  async function handleSaveInvestmentModal(
    values: AddInvestmentFormValues,
    subscriptionDocument: File | null,
  ) {
    if (editRow) {
      const result =
        editRow.investorKind === "lp_roster"
          ? await putDealLpInvestor(dealId, editRow.id, values)
          : await putDealInvestment(
              dealId,
              editRow.id,
              values,
              subscriptionDocument,
            );
      if (!result.ok) {
        if (result.extraCompanyUserPayment) {
          throw new ExtraCompanyUserPaymentRequiredError(
            result.extraCompanyUserPayment,
          );
        }
        throw new Error(result.message);
      }
      /** Stale add-member session draft would still append a draft row — same person appears twice. */
      clearAddMemberDraft(dealId);
      upsertRuntimeFromViewerAddInvestmentForm({
        dealId,
        values,
        dealDetail: dealDetail ?? null,
      });
      if (result.mode === "client") {
        setPayload((prev) => {
          if (!prev) return prev;
          const valuesForDisplay: AddInvestmentFormValues = {
            ...values,
            investorClass: resolveInvestorClassLabelForRow(
              values.investorClass,
              investorClasses,
            ),
          };
          const merged: DealInvestorRow = {
            ...addInvestmentFormToRow(valuesForDisplay, dealId),
            id: editRow.id,
          };
          return {
            ...prev,
            investors: prev.investors.map((r) =>
              r.id === editRow.id ? merged : r,
            ),
          };
        });
        setEditRow(null);
        onAddInvestmentClose();
        onInvestorsChanged?.();
        return;
      }
      setEditRow(null);
      onAddInvestmentClose();
      const data = await fetchDealInvestors(dealId, { lpInvestorsOnly: true });
      setPayload(data);
      const full = await fetchDealInvestors(dealId, { lpInvestorsOnly: false });
      upsertRuntimeForViewerFromInvestorsPayload(
        dealId,
        full,
        dealDetail ?? null,
      );
      onInvestorsChanged?.();
      return;
    }
    await handleSaveAddInvestment(values, subscriptionDocument);
  }

  /** Investors table/KPI (`modalOnly` false): always use Add/Edit Investor chrome. Deal Members tab (`modalOnly` true) follows parent `addInvestmentEntry` for Add/Edit Member vs shared flows. */
  const addEntryForModal = modalOnly ? addInvestmentEntry : "investor";

  const requiredDealDetailsIncomplete =
    dealDetail != null && areRequiredDealDetailFieldsIncomplete(dealDetail);

  const addModalBlocksInvites =
    requiredDealDetailsIncomplete ||
    (addEntryForModal !== "investor" &&
      dealDetail != null &&
      isDealStageDraft(dealDetail.dealStage));

  const lpBlocksInvites = requiredDealDetailsIncomplete;

  const refreshInvestorsFromApi = useCallback(async () => {
    const data = await fetchDealInvestors(dealId, { lpInvestorsOnly: true });
    setPayload(data);
    const full = await fetchDealInvestors(dealId, { lpInvestorsOnly: false });
    upsertRuntimeForViewerFromInvestorsPayload(
      dealId,
      full,
      dealDetail ?? null,
    );
    onInvestorsChanged?.();
  }, [dealId, dealDetail, onInvestorsChanged]);

  const refreshInvestorsListOnly = useCallback(async () => {
    const data = await fetchDealInvestors(dealId, { lpInvestorsOnly: true });
    setPayload(data);
    const full = await fetchDealInvestors(dealId, { lpInvestorsOnly: false });
    upsertRuntimeForViewerFromInvestorsPayload(
      dealId,
      full,
      dealDetail ?? null,
    );
  }, [dealId, dealDetail]);

  const modal = (
    <AddInvestmentModal
      dealId={dealId}
      open={addInvestmentOpen || editRow !== null}
      onClose={handleCloseInvestmentModal}
      onSave={handleSaveInvestmentModal}
      defaultOfferingLabel={dealName}
      mode={editRow ? "edit" : "add"}
      initialValues={editFormInitialValues}
      prefillKey={
        editRow?.id ??
        (restoreAddMemberSessionDraft ? "add-restore-draft" : "add-fresh")
      }
      addEntry={addEntryForModal}
      restoreAddMemberSessionDraft={restoreAddMemberSessionDraft}
      onBackendAutosave={async (detail) => {
        const data = await fetchDealInvestors(dealId, {
          lpInvestorsOnly: true,
        });
        setPayload(data);
        const full = await fetchDealInvestors(dealId, {
          lpInvestorsOnly: false,
        });
        upsertRuntimeForViewerFromInvestorsPayload(
          dealId,
          full,
          dealDetail ?? null,
        );
        if (detail?.createdInvestment) onInvestorsChanged?.();
      }}
      dealBlocksInvitationEmails={addModalBlocksInvites}
    />
  );

  const existingInvestorRowsForAddModal = useMemo(
    () => mergedInvestors.filter((r) => r.id !== ADD_MEMBER_DRAFT_ROW_ID),
    [mergedInvestors],
  );

  const lpInvestorModal = (
    <AddLpInvestorModal
      dealId={dealId}
      open={addLpInvestorOpen || editLpRow !== null}
      mode={editLpRow ? "edit" : "add"}
      editRow={editLpRow}
      resumeAddMemberDraft={lpResumeAddMemberDraft}
      dealBlocksInvitationEmails={lpBlocksInvites}
      existingInvestorRows={existingInvestorRowsForAddModal}
      onClose={() => {
        setAddLpInvestorOpen(false);
        setEditLpRow(null);
        setLpResumeAddMemberDraft(false);
      }}
      onListRefresh={refreshInvestorsListOnly}
      onSaved={async () => {
        setAddLpInvestorOpen(false);
        setEditLpRow(null);
        setLpResumeAddMemberDraft(false);
        setLocalAddedInvestors([]);
        await refreshInvestorsFromApi();
      }}
    />
  );

  if (modalOnly)
    return (
      <>
        {modal}
        {lpInvestorModal}
        <DealInvestorViewModal
          row={viewInvestorRow}
          onClose={() => setViewInvestorRow(null)}
          dealId={dealId}
          investorClasses={investorClasses}
          dealAllClassNamesLine={dealClassNamesLineForView}
          onEdit={handleEditInvestor}
          initialSectionTab="distribution"
        />
      </>
    );

  if (loading)
    return (
      <>
        {modal}
        {lpInvestorModal}
        <div className="deal_inv_populated deal_members_tab">
          <DealInvestorsKpiSkeletonSection />
          <div
            className="um_panel um_members_tab_panel deal_inv_table_panel deal_investors_table_panel_loading"
            aria-busy
          >
            <div
              className="deal_investors_page_loading"
              role="status"
              aria-live="polite"
              aria-label="Loading investors"
            >
              <div className="data_table_loader_spinner" aria-hidden />
              <span className="deal_investors_page_loading_text">
                Loading investors…
              </span>
            </div>
          </div>
        </div>
      </>
    );

  if (!mergedPayload) return null;

  return (
    <>
      {modal}
      {lpInvestorModal}
      <DealInvestorsPopulated
        initialPayload={mergedPayload}
        dealId={dealId}
        dealName={dealName}
        dealDetail={dealDetail}
        investorClasses={investorClasses}
        onEditInvestor={handleEditInvestor}
        onViewInvestor={(row) => setViewInvestorRow(row)}
        onAddInvestor={() => {
          setEditLpRow(null);
          setLpResumeAddMemberDraft(false);
          setAddLpInvestorOpen(true);
        }}
        onContinueDraftEdit={handleContinueDraftInvestor}
        onSendInvitationMail={onSendInvitationMail}
        onSendEsignRequest={
          onSendEsignConfirm
            ? (row) => {
                if (investorEsignIsFullyCompletedForRow(row)) {
                  toast.success(
                    "E-sign completed",
                    "This investor has already completed signing. Use the Signed column for details.",
                  );
                  return;
                }
                setSendEsignModalRow(row);
              }
            : undefined
        }
        sendEsignDisabled={sendEsignDisabled}
        sendEsignDisabledTitle={sendEsignDisabledTitle}
        onCopyOfferingLink={onCopyOfferingLink}
        onDeleteMember={onDeleteMember}
        offeringLinkAvailable={offeringLinkAvailable}
        offeringLinkBlockedBecauseDraft={offeringLinkBlockedBecauseDraft}
        canApproveFund={canApproveFund}
        onRefreshInvestors={refreshInvestorsFromApi}
      />
      <DealInvestorViewModal
        row={viewInvestorRow}
        onClose={() => setViewInvestorRow(null)}
        dealId={dealId}
        investorClasses={investorClasses}
        dealAllClassNamesLine={dealClassNamesLineForView}
        onEdit={handleEditInvestor}
        initialSectionTab="distribution"
      />
      {onSendEsignConfirm ? (
        <SendEsignDocumentsModal
          open={sendEsignModalRow != null}
          dealId={dealId}
          row={sendEsignModalRow}
          onClose={() => setSendEsignModalRow(null)}
          onConfirm={onSendEsignConfirm}
        />
      ) : null}
    </>
  );
});
