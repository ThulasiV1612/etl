import {
  ArrowUpDown,
  Download,
  LayoutGrid,
  LayoutList,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  applyDealsSearchToParams,
  readDealsSearchQuery,
} from "@/common/deals/dealsSearchQuery";
import {
  DataTable,
  type DataTableColumn,
} from "../../../common/components/data-table/DataTable";
import { DealAvatarIconRing } from "../../../common/components/entity-avatar/EntityAvatarNameCell";
import { DealCard } from "../../../common/components/deal-card/DealCard";
import { InvestorDealStatusBadge } from "@/modules/Investing/components/InvestorDealStatusBadge";
import {
  dealListRowToDealRecord,
  dealRecordToCardMetrics,
  dealRecordToInvestingCardMetrics,
  dealStageLabel,
  mergeDealRecordWithInvestorsAndClasses,
  type DealRecord,
} from "../dealsDashboardUtils";
import {
  fetchDealInvestorClasses,
  fetchDealInvestors,
  fetchDealReviewSummary,
  fetchDealsList,
} from "./api/dealsApi";
import { fetchDistributionSetup } from "./distribution-setup/api/distributionSetupApi";
import { sumPriorDistributionsAmount } from "./dealsDashboardMoney";
import { DEALS_LIST_REFETCH_EVENT } from "./createDealFormDraftStorage";
import { dateSortValue, formatDealListDateDisplay } from "./dealsListDisplay";
import { filterDealListRowsVisibleToInvestors, filterDealListToViewerInvested } from "@/modules/Investing/utils/investingViewerDealScope";
import {
  getDealStatusRules,
  getInvestorDealCardPresentation,
} from "./constants/deal-lifecycle";
import { parseMoneyDigits } from "./utils/offeringMoneyFormat";
import { dealStageChipCompactClassName } from "./utils/dealStageChip";
import { ExportDealsModal } from "./components/ExportDealsModal";
import type { DealListRow } from "./types/deals.types";
import "./deals-list.css";
import "./deal-investors-tab.css";
import "../Dashboard/sponsor-dashboard.css";

export type DealsSortKey = "createdAt" | "title" | "target";

type DealsViewMode = "grid" | "list";

function dealRecordToDealListRow(record: DealRecord): DealListRow {
  return {
    id: record.id,
    dealName: record.title,
    dealType: record.dealType ?? "",
    dealStage: record.dealStage,
    totalInProgress: record.totalInProgress ?? "—",
    totalAccepted: record.totalAccepted,
    raiseTarget: record.targetAmount,
    distributions: record.totalDistributions,
    investors: record.investorCount,
    closeDateDisplay: record.closeDateDisplay ?? record.closeDate,
    createdDateDisplay: record.createdDateDisplay ?? "—",
    createdAt: record.createdAt,
    locationDisplay: record.location,
    offeringStatus: record.offeringStatus,
  };
}

export function DealsViewToggle({
  view,
  onViewChange,
  className,
}: {
  view: DealsViewMode;
  onViewChange: (view: DealsViewMode) => void;
  className?: string;
}) {
  return (
    <div
      className={`sponsor_dash_view_toggle${className ? ` ${className}` : ""}`}
      role="group"
      aria-label="View layout"
    >
      <button
        type="button"
        className={`sponsor_dash_view_btn${view === "list" ? " sponsor_dash_view_btn_active" : ""}`}
        onClick={() => onViewChange("list")}
        aria-pressed={view === "list"}
        aria-label="List view"
      >
        <LayoutList size={18} strokeWidth={2} />
      </button>
      <button
        type="button"
        className={`sponsor_dash_view_btn${view === "grid" ? " sponsor_dash_view_btn_active" : ""}`}
        onClick={() => onViewChange("grid")}
        aria-pressed={view === "grid"}
        aria-label="Grid view"
      >
        <LayoutGrid size={18} strokeWidth={2} />
      </button>
    </div>
  );
}

export function DealsSortControl({
  sortKey,
  onSortKeyChange,
  className,
}: {
  sortKey: DealsSortKey;
  onSortKeyChange: (sortKey: DealsSortKey) => void;
  className?: string;
}) {
  return (
    <div
      className={`sponsor_dash_sort_wrap${className ? ` ${className}` : ""}`}
    >
      <ArrowUpDown
        size={18}
        strokeWidth={2}
        className="sponsor_dash_sort_icon"
        aria-hidden
      />
      <select
        className="sponsor_dash_sort_select"
        value={sortKey}
        onChange={(e) => onSortKeyChange(e.target.value as DealsSortKey)}
        aria-label="Sort deals by"
      >
        <option value="createdAt">Created at</option>
        <option value="title">Title</option>
        <option value="target">Target amount</option>
      </select>
    </div>
  );
}

export function DealsViewSortControls({
  view,
  onViewChange,
  sortKey,
  onSortKeyChange,
  className,
  betweenViewAndSort,
}: {
  view: DealsViewMode;
  onViewChange: (view: DealsViewMode) => void;
  sortKey: DealsSortKey;
  onSortKeyChange: (sortKey: DealsSortKey) => void;
  className?: string;
  /** Renders between grid/list toggle and sort select (e.g. Export All on dashboard). */
  betweenViewAndSort?: ReactNode;
}) {
  return (
    <div
      className={`sponsor_dash_deals_controls_right${className ? ` ${className}` : ""}`}
    >
      <DealsViewToggle view={view} onViewChange={onViewChange} />
      {betweenViewAndSort}
      <DealsSortControl sortKey={sortKey} onSortKeyChange={onSortKeyChange} />
    </div>
  );
}

interface SyndicatingDealsSectionProps {
  /** `aria-labelledby` on the section when `hideDealsHeading` is true */
  ariaLabelledBy?: string;
  /** Hide the in-section “Deals” h2 (e.g. when the page already has an h1) */
  hideDealsHeading?: boolean;
  /** id for the visible “Deals” h2 when `hideDealsHeading` is false */
  dealsHeadingId?: string;
  /**
   * When true, uses `GET /deals?includeParticipantDeals=1` — same list as the investing
   * “Deals” page (org deals plus roster-linked participant deals).
   */
  includeParticipantDeals?: boolean;
  /**
   * When true (e.g. investor home), the list is limited to deals where the signed-in
   * user has a positive committed amount, matching `/investing/deals` scope.
   */
  onlyDealsWithViewerCommitment?: boolean;
  /** Visible section title for the deals block (default: “All Deals”). */
  dealsSectionTitle?: string;
  /**
   * When true, hides deals whose offering status disallows dashboard visibility
   * (e.g. draft hidden, closed, past) — for investor opportunity browsing.
   */
  filterOfferingDashboardVisibility?: boolean;
  /** When set, skips internal fetch and renders this list (investor dashboard tabs). */
  controlledDeals?: DealRecord[];
  controlledLoading?: boolean;
  searchPlaceholder?: string;
  emptyStateMessage?: string;
  /** Local search state (e.g. investing dashboard) — skips URL query sync. */
  controlledQuery?: string;
  onControlledQueryChange?: (value: string) => void;
  /** Hide in-section search when the parent renders export/search toolbar. */
  hideToolbarSearch?: boolean;
  /** Hide view/sort controls when the parent renders them in a shared toolbar. */
  hideToolbarControls?: boolean;
  controlledView?: DealsViewMode;
  onControlledViewChange?: (view: DealsViewMode) => void;
  controlledSortKey?: DealsSortKey;
  onControlledSortKeyChange?: (sortKey: DealsSortKey) => void;
  /**
   * Investor dashboard Opportunities tab — open offering preview and return to
   * the Opportunities tab on back navigation.
   */
  investorOpportunityCards?: boolean;
}

const INVESTOR_OPPORTUNITIES_RETURN_TO = "/dashboard?dealsTab=coming_soon";

function investorDashboardDealCardLink(
  dealId: string,
  options: {
    investorOpportunityCards?: boolean;
    includeParticipantDeals?: boolean;
  },
): { to: string; state?: { returnTo: string } } {
  if (options.investorOpportunityCards) {
    return {
      to: `/deals/${encodeURIComponent(dealId)}/offering-portfolio`,
      state: { returnTo: INVESTOR_OPPORTUNITIES_RETURN_TO },
    };
  }
  if (options.includeParticipantDeals) {
    return {
      to: `/deals/${encodeURIComponent(dealId)}`,
      state: { returnTo: "/dashboard" },
    };
  }
  return { to: `/deals/${encodeURIComponent(dealId)}` };
}

export function SyndicatingDealsSection({
  ariaLabelledBy,
  hideDealsHeading = false,
  dealsHeadingId = "sponsor-deals-heading",
  includeParticipantDeals = false,
  onlyDealsWithViewerCommitment = false,
  dealsSectionTitle = "All Deals",
  filterOfferingDashboardVisibility = false,
  controlledDeals,
  controlledLoading = false,
  searchPlaceholder = "Search deals…",
  emptyStateMessage,
  controlledQuery,
  onControlledQueryChange,
  hideToolbarSearch = false,
  hideToolbarControls = false,
  controlledView,
  onControlledViewChange,
  controlledSortKey,
  onControlledSortKeyChange,
  investorOpportunityCards = false,
}: SyndicatingDealsSectionProps) {
  const isControlled = controlledDeals !== undefined;
  const usesLocalQuery =
    controlledQuery !== undefined && onControlledQueryChange !== undefined;
  const [searchParams, setSearchParams] = useSearchParams();
  const urlDealsQuery = readDealsSearchQuery(searchParams);
  const [urlSyncedQuery, setUrlSyncedQuery] = useState(urlDealsQuery);
  const query = usesLocalQuery ? controlledQuery : urlSyncedQuery;

  useEffect(() => {
    if (usesLocalQuery) return;
    setUrlSyncedQuery(urlDealsQuery);
  }, [urlDealsQuery, usesLocalQuery]);

  function handleDealsQueryChange(value: string) {
    if (usesLocalQuery) {
      onControlledQueryChange?.(value);
      return;
    }
    setUrlSyncedQuery(value);
    setSearchParams(applyDealsSearchToParams(searchParams, value), {
      replace: true,
    });
  }
  const usesControlledView =
    controlledView !== undefined && onControlledViewChange !== undefined;
  const usesControlledSort =
    controlledSortKey !== undefined && onControlledSortKeyChange !== undefined;
  const [internalView, setInternalView] = useState<DealsViewMode>("grid");
  const [internalSortKey, setInternalSortKey] =
    useState<DealsSortKey>("createdAt");
  const view = usesControlledView ? controlledView : internalView;
  const setView = usesControlledView ? onControlledViewChange : setInternalView;
  const sortKey = usesControlledSort ? controlledSortKey : internalSortKey;
  const setSortKey = usesControlledSort
    ? onControlledSortKeyChange
    : setInternalSortKey;
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewByDealId, setReviewByDealId] = useState<
    Record<string, { reviewRating: number; reviewCount: number }>
  >({});
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  useEffect(() => {
    if (isControlled) {
      setDeals(controlledDeals);
      setLoading(controlledLoading);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      let list = await fetchDealsList(
        includeParticipantDeals ? { includeParticipantDeals: true } : undefined,
      );
      if (includeParticipantDeals) {
        list = filterDealListRowsVisibleToInvestors(list);
      }
      if (onlyDealsWithViewerCommitment && list.length > 0)
        list = await filterDealListToViewerInvested(list);
      if (filterOfferingDashboardVisibility) {
        list = list.filter((row) => {
          const rules = getDealStatusRules(row.offeringStatus);
          if (includeParticipantDeals) {
            return rules.status !== "closed" && rules.status !== "past";
          }
          return rules.allowDashboardVisibility;
        });
      }
      if (cancelled) return;
      if (list.length === 0) {
        setDeals([]);
        setLoading(false);
        return;
      }
      const bundles = await Promise.all(
        list.map(async (row) => {
          const [payload, classes, distSetup] = await Promise.all([
            fetchDealInvestors(row.id, { lpInvestorsOnly: true }),
            fetchDealInvestorClasses(row.id),
            fetchDistributionSetup(row.id).catch(() => null),
          ]);
          return {
            row,
            payload,
            classes,
            totalDistributed: sumPriorDistributionsAmount(
              distSetup?.priorDistributions,
            ),
          };
        }),
      );
      if (cancelled) return;
      setDeals(
        bundles.map(({ row, payload, classes, totalDistributed }) =>
          mergeDealRecordWithInvestorsAndClasses(
            row,
            dealListRowToDealRecord(row),
            payload,
            classes,
            { totalDistributed },
          ),
        ),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isControlled,
    controlledDeals,
    controlledLoading,
    includeParticipantDeals,
    onlyDealsWithViewerCommitment,
    filterOfferingDashboardVisibility,
  ]);

  useEffect(() => {
    if (isControlled) return;
    function onDealsListRefetch() {
      void (async () => {
        setLoading(true);
        let list = await fetchDealsList(
          includeParticipantDeals
            ? { includeParticipantDeals: true }
            : undefined,
        );
        if (includeParticipantDeals) {
          list = filterDealListRowsVisibleToInvestors(list);
        }
        if (onlyDealsWithViewerCommitment && list.length > 0)
          list = await filterDealListToViewerInvested(list);
        if (filterOfferingDashboardVisibility) {
          list = list.filter((row) => {
            const rules = getDealStatusRules(row.offeringStatus);
            if (includeParticipantDeals) {
              return rules.status !== "closed" && rules.status !== "past";
            }
            return rules.allowDashboardVisibility;
          });
        }
        if (list.length === 0) {
          setDeals([]);
          setLoading(false);
          return;
        }
        const bundles = await Promise.all(
          list.map(async (row) => {
            const [payload, classes, distSetup] = await Promise.all([
              fetchDealInvestors(row.id, { lpInvestorsOnly: true }),
              fetchDealInvestorClasses(row.id),
              fetchDistributionSetup(row.id).catch(() => null),
            ]);
            return {
              row,
              payload,
              classes,
              totalDistributed: sumPriorDistributionsAmount(
                distSetup?.priorDistributions,
              ),
            };
          }),
        );
        setDeals(
          bundles.map(({ row, payload, classes, totalDistributed }) =>
            mergeDealRecordWithInvestorsAndClasses(
              row,
              dealListRowToDealRecord(row),
              payload,
              classes,
              { totalDistributed },
            ),
          ),
        );
        setLoading(false);
      })();
    }
    window.addEventListener(DEALS_LIST_REFETCH_EVENT, onDealsListRefetch);
    return () =>
      window.removeEventListener(DEALS_LIST_REFETCH_EVENT, onDealsListRefetch);
  }, [
    isControlled,
    includeParticipantDeals,
    onlyDealsWithViewerCommitment,
    filterOfferingDashboardVisibility,
  ]);

  useEffect(() => {
    if (deals.length === 0) {
      setReviewByDealId({});
      setReviewsLoading(false);
      return;
    }
    let cancelled = false;
    setReviewsLoading(true);
    void (async () => {
      const out: Record<string, { reviewRating: number; reviewCount: number }> =
        {};
      const results = await Promise.all(
        deals.map((d) =>
          fetchDealReviewSummary(d.id).then((s) => [d.id, s] as const),
        ),
      );
      if (cancelled) return;
      for (const [id, s] of results) {
        if (s) {
          out[id] = {
            reviewRating: s.reviewRating,
            reviewCount: s.reviewCount,
          };
        }
      }
      setReviewByDealId(out);
      setReviewsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [deals]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...deals];
    return deals.filter(
      (d) =>
        (d.title ?? "").toLowerCase().includes(q) ||
        (d.location && d.location.toLowerCase().includes(q)),
    );
  }, [query, deals]);

  const sortedDeals = useMemo(() => {
    const rows = [...filtered];
    if (sortKey === "title")
      rows.sort((a, b) => a.title.localeCompare(b.title));
    if (sortKey === "target")
      rows.sort((a, b) => {
        const na = parseMoneyDigits(a.targetAmount);
        const nb = parseMoneyDigits(b.targetAmount);
        const da = Number.isFinite(na) ? na : 0;
        const db = Number.isFinite(nb) ? nb : 0;
        return db - da;
      });
    if (sortKey === "createdAt")
      rows.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    return rows;
  }, [filtered, sortKey]);

  const exportDeals = useMemo(
    () => deals.map(dealRecordToDealListRow),
    [deals],
  );

  const columns: DataTableColumn<DealRecord>[] = useMemo(
    () => [
      {
        id: "deal",
        header: "Deal",
        colWidth: "15rem",
        thClassName: "deals_col_deal_name",
        tdClassName: "um_td_user deals_col_deal_name",
        sortValue: (row) => (row.title ?? "").toLowerCase(),
        cell: (row) => {
          const link = investorDashboardDealCardLink(row.id, {
            investorOpportunityCards,
            includeParticipantDeals,
          });
          return (
            <div className="deals_list_name_cell">
              <DealAvatarIconRing />
              <div className="deals_list_name_text">
                <Link
                  className="deals_table_name_link"
                  to={link.to}
                  state={link.state}
                >
                  {row.title || "—"}
                </Link>
              </div>
            </div>
          );
        },
      },
      {
        id: "location",
        header: "Location",
        colWidth: "11rem",
        sortValue: (row) => row.location ?? "",
        cell: (row) => (
          <span className="um_status_muted">{row.location ?? "—"}</span>
        ),
      },
      {
        id: "target",
        header: "Target amount",
        colWidth: "10.75rem",
        align: "right",
        thClassName: "deals_th_align_right",
        tdClassName: "um_td_numeric deals_td_align_right",
        sortValue: (row) => {
          const n = parseMoneyDigits(row.targetAmount);
          return Number.isFinite(n) ? n : 0;
        },
        cell: (row) => row.targetAmount,
      },
      {
        id: "funded",
        header: "Total funded",
        colWidth: "10.75rem",
        align: "right",
        thClassName: "deals_th_align_right",
        tdClassName: "um_td_numeric deals_td_align_right",
        sortValue: (row) => {
          const n = parseMoneyDigits(row.totalFunded);
          return Number.isFinite(n) ? n : 0;
        },
        cell: (row) => row.totalFunded,
      },
      {
        id: "investors",
        header: "# investors",
        colWidth: "8.5rem",
        align: "right",
        thClassName: "deals_th_align_right",
        tdClassName: "um_td_numeric deals_td_align_right",
        sortValue: (row) => {
          const n = parseInt(String(row.investorCount).replace(/\D/g, ""), 10);
          return Number.isFinite(n) ? n : row.investorCount;
        },
        cell: (row) => row.investorCount,
      },
      {
        id: "close",
        header: "Close date",
        colWidth: "8.25rem",
        align: "center",
        thClassName: "deals_th_align_center",
        tdClassName: "deals_td_align_center",
        sortValue: (row) => dateSortValue(row.closeDate),
        cell: (row) => formatDealListDateDisplay(row.closeDate),
      },
      {
        id: "status",
        header: includeParticipantDeals ? "Status" : "Deal stage",
        colWidth: "9.5rem",
        thClassName: "deals_col_deal_stage",
        tdClassName: "deals_col_deal_stage",
        sortValue: (row) => dealStageLabel(row.dealStage ?? "").toLowerCase(),
        cell: (row) => {
          const presentation = filterOfferingDashboardVisibility
            ? getInvestorDealCardPresentation(
                row.offeringStatus,
                row.dealStage,
                (row.statusLabel ?? "").trim() || "—",
              )
            : null;
          const label =
            presentation?.statusLabel ??
            ((row.statusLabel ?? "").trim() || "—");
          const badgeClass =
            presentation?.statusBadgeClassName ??
            dealStageChipCompactClassName(row.dealStage);
          return (
            <InvestorDealStatusBadge
              statusLabel={label}
              badgeClassName={badgeClass}
              hideStatusIcon={presentation?.hideStatusIcon}
              statusBadgeVariant={presentation?.statusBadgeVariant}
              statusInfo={presentation?.previewNotice}
            />
          );
        },
      },
    ],
    [
      filterOfferingDashboardVisibility,
      includeParticipantDeals,
      investorOpportunityCards,
    ],
  );

  return (
    <section
      className="sponsor_dash_deals_section"
      aria-labelledby={hideDealsHeading ? ariaLabelledBy : dealsHeadingId}
    >
      {!hideToolbarSearch || !hideToolbarControls || !hideDealsHeading ? (
        <div className="sponsor_dash_deals_controls">
          <div className="sponsor_dash_deals_header_row">
            {hideDealsHeading ? null : (
              <h2 id={dealsHeadingId} className="sponsor_dash_section_title">
                {dealsSectionTitle}
              </h2>
            )}
            {!hideToolbarSearch || !hideToolbarControls ? (
              <div className="sponsor_dash_deals_tools sponsor_dash_deals_toolbar">
                {!hideToolbarControls ? (
                  <div className="sponsor_dash_deals_toolbar_leading">
                    <DealsSortControl
                      sortKey={sortKey}
                      onSortKeyChange={setSortKey}
                    />
                    <button
                      type="button"
                      className="um_toolbar_export_btn investing_dash_deals_export_btn"
                      onClick={() => setExportModalOpen(true)}
                      disabled={loading || exportDeals.length === 0}
                    >
                      <Download size={18} strokeWidth={2} aria-hidden />
                      <span>Export All</span>
                    </button>
                  </div>
                ) : null}
                {!hideToolbarSearch || !hideToolbarControls ? (
                  <div className="sponsor_dash_deals_toolbar_trailing">
                    {!hideToolbarControls ? (
                      <DealsViewToggle view={view} onViewChange={setView} />
                    ) : null}
                    {!hideToolbarSearch ? (
                      <div className="sponsor_dash_search_row">
                        <div className="sponsor_dash_search_wrap sponsor_dash_search_wrap_full">
                          <Search
                            className="sponsor_dash_search_icon"
                            size={18}
                            strokeWidth={2}
                            aria-hidden
                          />
                          <input
                            type="search"
                            className="sponsor_dash_search_input"
                            placeholder={searchPlaceholder}
                            value={query}
                            onChange={(e) =>
                              handleDealsQueryChange(e.target.value)
                            }
                            aria-label="Search deals"
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {view === "grid" ? (
        loading && deals.length === 0 ? (
          <div
            className="sponsor_dash_deals_state"
            role="status"
            aria-label="Loading deals"
          >
            <div className="sponsor_dash_deals_state_inner">
              <div className="sponsor_dash_loader_spinner" aria-hidden />
              <p className="sponsor_dash_deals_state_text">Loading deals…</p>
            </div>
          </div>
        ) : sortedDeals.length === 0 ? (
          <div className="sponsor_dash_deals_state" role="status">
            <div className="sponsor_dash_deals_state_inner">
              <p className="sponsor_dash_deals_state_text">
                {query.trim()
                  ? "No deals match your search."
                  : (emptyStateMessage ?? "No deal to display.")}
              </p>
            </div>
          </div>
        ) : (
          <div className="sponsor_dash_deals_grid">
            {sortedDeals.map((deal) => {
              const mergedReviewRating =
                reviewByDealId[deal.id]?.reviewRating ?? deal.reviewRating;
              const mergedReviewCount =
                reviewByDealId[deal.id]?.reviewCount ?? deal.reviewCount;
              const hasSeededReview =
                (typeof mergedReviewRating === "number" &&
                  Number.isFinite(mergedReviewRating)) ||
                (typeof mergedReviewCount === "number" &&
                  mergedReviewCount > 0);
              const cardPresentation = filterOfferingDashboardVisibility
                ? getInvestorDealCardPresentation(
                    deal.offeringStatus,
                    deal.dealStage,
                    deal.statusLabel,
                  )
                : null;
              const cardLink = investorDashboardDealCardLink(deal.id, {
                investorOpportunityCards,
                includeParticipantDeals,
              });
              const isInvestNowOpportunityCard =
                cardPresentation?.statusBadgeVariant === "invest_now";
              const opportunityManageCtaLabel =
                investorOpportunityCards && isInvestNowOpportunityCard
                  ? "Manage Investment"
                  : isInvestNowOpportunityCard
                    ? "Invest Now"
                    : includeParticipantDeals
                      ? "Manage Investment"
                      : undefined;
              return (
                <Link
                  key={deal.id}
                  className="deal_card_link"
                  to={cardLink.to}
                  state={cardLink.state}
                >
                  <DealCard
                    prestigeLayout
                    dealId={deal.id}
                    investNowReturnTo={
                      investorOpportunityCards
                        ? INVESTOR_OPPORTUNITIES_RETURN_TO
                        : includeParticipantDeals
                          ? "/dashboard"
                          : undefined
                    }
                    title={deal.title}
                    reviewPlaceholderSeed={deal.id}
                    location={deal.location}
                    statusLabel={
                      cardPresentation?.statusLabel ?? deal.statusLabel
                    }
                    dealStage={deal.dealStage}
                    statusBadgeClassName={
                      cardPresentation?.statusBadgeClassName
                    }
                    hideStatusIcon={cardPresentation?.hideStatusIcon}
                    statusBadgeVariant={cardPresentation?.statusBadgeVariant}
                    previewNotice={cardPresentation?.previewNotice}
                    metrics={
                      includeParticipantDeals
                        ? dealRecordToInvestingCardMetrics(deal)
                        : dealRecordToCardMetrics(deal)
                    }
                    coverImageUrl={deal.coverImageUrl}
                    coverImageUrls={deal.coverImageUrls}
                    reviewRating={mergedReviewRating}
                    reviewCount={mergedReviewCount}
                    reviewLoading={reviewsLoading && !hasSeededReview}
                    investNowDraftProgress={deal.investNowDraftProgress}
                    investNowResumeScope={deal.investNowResumeScope}
                    manageCtaLabel={opportunityManageCtaLabel}
                  />
                </Link>
              );
            })}
          </div>
        )
      ) : loading && deals.length === 0 ? (
        <div
          className="sponsor_dash_deals_state"
          role="status"
          aria-label="Loading deals"
        >
          <div className="sponsor_dash_deals_state_inner">
            <div className="sponsor_dash_loader_spinner" aria-hidden />
            <p className="sponsor_dash_deals_state_text">Loading deals…</p>
          </div>
        </div>
      ) : (
        <div
          className={`deals_list_table_panel sponsor_dash_deals_list_table_wrap${
            loading ? " deals_list_table_panel_loading" : ""
          }`}
        >
          <DataTable
            visualVariant="members"
            membersTableClassName="um_table_members deal_inv_table"
            columns={columns}
            rows={sortedDeals}
            getRowKey={(row, rowIndex) => row.id || `sponsor-deal-${rowIndex}`}
            isLoading={loading && sortedDeals.length === 0}
            emptyLabel={
              query.trim()
                ? "No deals match your search."
                : (emptyStateMessage ?? "No deal to display.")
            }
            emptyStateRole={loading ? "status" : undefined}
          />
        </div>
      )}

      <ExportDealsModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        deals={exportDeals}
      />
    </section>
  );
}
