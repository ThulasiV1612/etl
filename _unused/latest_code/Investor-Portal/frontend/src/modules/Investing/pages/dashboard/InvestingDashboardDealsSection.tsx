import {
  Activity,
  Briefcase,
  Clock,
  Download,
  LayoutGrid,
  Search,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getSessionUserEmail } from "@/common/auth/sessionUserEmail";
import { filterDealListRowsVisibleToInvestors } from "@/modules/Investing/utils/investingViewerDealScope";
import { isPlatformAdmin, isSponsorWorkspaceInvestingViewer } from "@/common/auth/roleUtils";
import { TabsScrollStrip } from "@/common/components/tabs-scroll-strip/TabsScrollStrip";
import {
  dealListRowToDealRecord,
  mergeDealRecordWithInvestorsAndClasses,
  type DealRecord,
} from "@/modules/Syndication/dealsDashboardUtils";
import {
  fetchDealInvestorClasses,
  fetchDealInvestors,
  fetchDealsList,
} from "@/modules/Syndication/Deals/api/dealsApi";
import { ExportDealsModal } from "@/modules/Syndication/Deals/components/ExportDealsModal";
import { DEALS_LIST_REFETCH_EVENT } from "@/modules/Syndication/Deals/createDealFormDraftStorage";
import type { DealListRow } from "@/modules/Syndication/Deals/types/deals.types";
import {
  SyndicatingDealsSection,
  DealsSortControl,
  DealsViewToggle,
  type DealsSortKey,
} from "@/modules/Syndication/Deals/SyndicatingDealsSection";
import {
  dealHasInvestNowDraftForViewer,
  firstInvestNowDraftRowForViewer,
} from "@/modules/Investing/pages/invest/investNowDraftUtils";
import { investNowDraftProgressFromInvestorRow } from "@/modules/Investing/pages/invest/investNowDraftProgress";
import {
  classifyInvestingDashboardDealBucket,
  classifyInvestingDashboardDealBucketForPlatformAdmin,
  isInvestingDashboardOpportunityDeal,
  type InvestingDashboardDealBucket,
  type InvestingDashboardDealsByBucket,
} from "./investingDashboardDealBucket";
import { loadRecentlyViewedDashboardDeals } from "./loadRecentlyViewedDashboardDeals";
import { mergeOpportunitiesTabDeals } from "./mergeOpportunitiesTabDeals";
import {
  isPortfolioRecentlyViewedEnabled,
  RECENTLY_VIEWED_DEALS_CHANGED_EVENT,
} from "./recentlyViewedDeals";

const INVESTING_DASH_DEALS_TAB_PARAM = "dealsTab";

function parseInvestingDashboardDealsTab(
  value: string | null,
): InvestingDashboardDealBucket {
  if (value === "active") return "active";
  if (value === "in_progress") return "in_progress";
  if (
    value === "coming_soon" ||
    value === "opportunities" ||
    value === "recently_viewed"
  ) {
    return "coming_soon";
  }
  return "all";
}

type DealsTab = InvestingDashboardDealBucket;

const TAB_IDS: Record<DealsTab, string> = {
  all: "investing-dash-deals-all",
  active: "investing-dash-deals-active",
  in_progress: "investing-dash-deals-in-progress",
  coming_soon: "investing-dash-deals-coming-soon",
};

const EMPTY_BY_BUCKET: InvestingDashboardDealsByBucket = {
  active: [],
  in_progress: [],
  coming_soon: [],
};

function mergeInvestingDashboardDealRecord(
  row: DealListRow,
  payload: Awaited<ReturnType<typeof fetchDealInvestors>>,
  classes: Awaited<ReturnType<typeof fetchDealInvestorClasses>>,
  viewerEmailNorm: string,
): DealRecord {
  const record = mergeDealRecordWithInvestorsAndClasses(
    row,
    dealListRowToDealRecord(row),
    payload,
    classes,
  );
  if (dealHasInvestNowDraftForViewer(payload.investors, viewerEmailNorm)) {
    const draftRow = firstInvestNowDraftRowForViewer(
      payload.investors,
      viewerEmailNorm,
    );
    if (draftRow) {
      record.investNowDraftProgress =
        investNowDraftProgressFromInvestorRow(draftRow);
      record.investNowResumeScope = {
        investmentId: String(draftRow.id ?? "").trim() || undefined,
        userInvestorProfileId:
          String(draftRow.userInvestorProfileId ?? "").trim() || undefined,
        profileId: String(draftRow.profileId ?? "").trim() || undefined,
      };
    }
  }
  return record;
}

async function loadDealsByBucket(
  viewerEmailNorm: string,
): Promise<InvestingDashboardDealsByBucket> {
  const platformAdminViewer = isPlatformAdmin();
  const sponsorWorkspaceViewer = isSponsorWorkspaceInvestingViewer();
  let list = await fetchDealsList(
    platformAdminViewer ? undefined : { includeParticipantDeals: true },
  );
  if (!platformAdminViewer && !sponsorWorkspaceViewer) {
    list = filterDealListRowsVisibleToInvestors(list);
  }
  /**
   * Do not drop closed / managing-asset / past rows here. Those offerings are
   * hidden as marketplace opportunities, but an LP who already invested must
   * still reach {@link classifyInvestingDashboardDealBucket} (Active / In progress).
   * Uninvested closed deals return null from classify and stay off the dashboard.
   */
  if (list.length === 0) return { ...EMPTY_BY_BUCKET };

  const bundles = await Promise.all(
    list.map(async (row) => {
      const [payload, classes] = await Promise.all([
        fetchDealInvestors(row.id),
        fetchDealInvestorClasses(row.id),
      ]);
      return { row, payload, classes };
    }),
  );

  if (platformAdminViewer || sponsorWorkspaceViewer) {
    const out: InvestingDashboardDealsByBucket = {
      active: [],
      in_progress: [],
      coming_soon: [],
    };
    for (const { row, payload, classes } of bundles) {
      const bucket = classifyInvestingDashboardDealBucketForPlatformAdmin(row);
      out[bucket].push(
        mergeInvestingDashboardDealRecord(
          row,
          payload,
          classes,
          viewerEmailNorm,
        ),
      );
    }
    return out;
  }

  if (!viewerEmailNorm) return { ...EMPTY_BY_BUCKET };

  const out: InvestingDashboardDealsByBucket = {
    active: [],
    in_progress: [],
    coming_soon: [],
  };

  for (const { row, payload, classes } of bundles) {
    let bucket = classifyInvestingDashboardDealBucket(
      row,
      payload,
      viewerEmailNorm,
    );
    if (!bucket && isInvestingDashboardOpportunityDeal(row)) {
      bucket = "coming_soon";
    }
    if (!bucket) continue;
    out[bucket].push(
      mergeInvestingDashboardDealRecord(
        row,
        payload,
        classes,
        viewerEmailNorm,
      ),
    );
  }

  return out;
}

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

function tabMeta(tab: DealsTab): {
  sectionTitle: string;
  searchPlaceholder: string;
  emptyLabel: string;
} {
  if (tab === "all") {
    return {
      sectionTitle: "All Deals",
      searchPlaceholder: "Search deals…",
      emptyLabel: "No deals in your investing scope yet.",
    };
  }
  if (tab === "active") {
    return {
      sectionTitle: "Active deals",
      searchPlaceholder: "Search active deals…",
      emptyLabel: "No active deals in your portfolio yet.",
    };
  }
  if (tab === "in_progress") {
    return {
      sectionTitle: "In progress deals",
      searchPlaceholder: "Search in progress deals…",
      emptyLabel: "No in-progress deals right now.",
    };
  }
  return {
    sectionTitle: "Opportunities",
    searchPlaceholder: "Search opportunities…",
    emptyLabel:
      "No opportunities right now. Open a shared offering to save it here.",
  };
}

export function InvestingDashboardDealsSection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<DealsTab>(() =>
    parseInvestingDashboardDealsTab(
      searchParams.get(INVESTING_DASH_DEALS_TAB_PARAM),
    ),
  );
  const [dealsByBucket, setDealsByBucket] =
    useState<InvestingDashboardDealsByBucket>(EMPTY_BY_BUCKET);
  const [recentlyViewedDeals, setRecentlyViewedDeals] = useState<DealRecord[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [recentlyViewedLoading, setRecentlyViewedLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [dealsView, setDealsView] = useState<"grid" | "list">("grid");
  const [dealsSortKey, setDealsSortKey] = useState<DealsSortKey>("createdAt");

  useEffect(() => {
    let cancelled = false;

    async function refreshDeals() {
      setLoading(true);
      setRecentlyViewedLoading(true);
      const viewerEmailNorm = getSessionUserEmail().trim().toLowerCase();
      const next = await loadDealsByBucket(viewerEmailNorm);
      if (cancelled) return;
      setDealsByBucket(next);
      setLoading(false);
      if (!isPortfolioRecentlyViewedEnabled()) {
        setRecentlyViewedDeals([]);
        setRecentlyViewedLoading(false);
        return;
      }
      const recent = await loadRecentlyViewedDashboardDeals(next, viewerEmailNorm);
      if (!cancelled) {
        setRecentlyViewedDeals(recent);
        setRecentlyViewedLoading(false);
      }
    }

    void refreshDeals();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onRefetch() {
      void (async () => {
        setLoading(true);
        setRecentlyViewedLoading(true);
        const viewerEmailNorm = getSessionUserEmail().trim().toLowerCase();
        const next = await loadDealsByBucket(viewerEmailNorm);
        setDealsByBucket(next);
        setLoading(false);
        if (!isPortfolioRecentlyViewedEnabled()) {
          setRecentlyViewedDeals([]);
          setRecentlyViewedLoading(false);
          return;
        }
        const recent = await loadRecentlyViewedDashboardDeals(
          next,
          viewerEmailNorm,
        );
        setRecentlyViewedDeals(recent);
        setRecentlyViewedLoading(false);
      })();
    }
    window.addEventListener(DEALS_LIST_REFETCH_EVENT, onRefetch);
    window.addEventListener(RECENTLY_VIEWED_DEALS_CHANGED_EVENT, onRefetch);
    return () => {
      window.removeEventListener(DEALS_LIST_REFETCH_EVENT, onRefetch);
      window.removeEventListener(RECENTLY_VIEWED_DEALS_CHANGED_EVENT, onRefetch);
    };
  }, []);

  useEffect(() => {
    const fromUrl = parseInvestingDashboardDealsTab(
      searchParams.get(INVESTING_DASH_DEALS_TAB_PARAM),
    );
    setActiveTab((prev) => (prev === fromUrl ? prev : fromUrl));
  }, [searchParams]);

  function selectDealsTab(tab: DealsTab) {
    setActiveTab(tab);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tab === "all") next.delete(INVESTING_DASH_DEALS_TAB_PARAM);
        else next.set(INVESTING_DASH_DEALS_TAB_PARAM, tab);
        return next;
      },
      { replace: true },
    );
  }

  useEffect(() => {
    setQuery("");
  }, [activeTab]);

  const activeCount = dealsByBucket.active.length;
  const inProgressCount = dealsByBucket.in_progress.length;
  const opportunityTabDeals = useMemo(
    () =>
      mergeOpportunitiesTabDeals(
        dealsByBucket.coming_soon,
        recentlyViewedDeals,
      ),
    [dealsByBucket.coming_soon, recentlyViewedDeals],
  );
  const comingSoonCount = opportunityTabDeals.length;
  const allCount = activeCount + inProgressCount + comingSoonCount;
  const dealsForTab = useMemo(() => {
    if (activeTab === "all") {
      return [
        ...dealsByBucket.active,
        ...dealsByBucket.in_progress,
        ...opportunityTabDeals,
      ];
    }
    if (activeTab === "coming_soon") return opportunityTabDeals;
    return dealsByBucket[activeTab];
  }, [activeTab, dealsByBucket, opportunityTabDeals]);
  const tabLoading =
    activeTab === "coming_soon"
      ? loading || recentlyViewedLoading
      : loading;
  const { sectionTitle, searchPlaceholder, emptyLabel } = tabMeta(activeTab);
  const exportDeals = useMemo(
    () => dealsForTab.map(dealRecordToDealListRow),
    [dealsForTab],
  );

  return (
    <section
      className="investing_dash_deals_section"
      aria-labelledby="investing-dash-deals-title"
    >
      <header className="investing_dash_deals_header">
        <h2
          id="investing-dash-deals-title"
          className="sponsor_dash_section_title investing_dash_deals_title"
        >
          <Briefcase
            className="investing_dash_deals_title_icon"
            size={22}
            strokeWidth={1.75}
            aria-hidden
          />
          All Investments
        </h2>
      </header>

      <div className="sponsor_dash_deals_block um_panel deals_list_card_surface deal_inv_table_panel">
        <div className="um_members_tabs_outer deals_tabs_outer um_segmented_tabs_outer investing_dash_deals_tabs">
          <TabsScrollStrip scrollClassName="deals_tabs_scroll um_segmented_tabs_scroll">
            <div
              className="um_members_tabs_row deals_tabs_row um_segmented_tabs_row"
              role="tablist"
              aria-label="All deals by status"
            >
              <button
                type="button"
                id={TAB_IDS.all}
                role="tab"
                aria-selected={activeTab === "all"}
                aria-controls="investing-dash-deals-panel"
                className={`um_members_tab deals_tabs_tab um_segmented_tab${
                  activeTab === "all" ? " um_members_tab_active" : ""
                }`}
                onClick={() => selectDealsTab("all")}
              >
                <LayoutGrid
                  className="deals_tabs_icon um_segmented_tab_icon"
                  size={16}
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="deals_tabs_label um_segmented_tab_label">
                  Investments
                </span>
                <span className="deals_tabs_count">({allCount})</span>
              </button>
              <button
                type="button"
                id={TAB_IDS.active}
                role="tab"
                aria-selected={activeTab === "active"}
                aria-controls="investing-dash-deals-panel"
                className={`um_members_tab deals_tabs_tab um_segmented_tab${
                  activeTab === "active" ? " um_members_tab_active" : ""
                }`}
                onClick={() => selectDealsTab("active")}
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
                <span className="deals_tabs_count">({activeCount})</span>
              </button>
              <button
                type="button"
                id={TAB_IDS.in_progress}
                role="tab"
                aria-selected={activeTab === "in_progress"}
                aria-controls="investing-dash-deals-panel"
                className={`um_members_tab deals_tabs_tab um_segmented_tab${
                  activeTab === "in_progress" ? " um_members_tab_active" : ""
                }`}
                onClick={() => selectDealsTab("in_progress")}
              >
                <Clock
                  className="deals_tabs_icon um_segmented_tab_icon"
                  size={16}
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="deals_tabs_label um_segmented_tab_label">
                  In progress
                </span>
                <span className="deals_tabs_count">({inProgressCount})</span>
              </button>
              {/* {comingSoonCount > 0 ? ( */}
                <button
                  type="button"
                  id={TAB_IDS.coming_soon}
                  role="tab"
                  aria-selected={activeTab === "coming_soon"}
                  aria-controls="investing-dash-deals-panel"
                  className={`um_members_tab deals_tabs_tab um_segmented_tab${
                    activeTab === "coming_soon" ? " um_members_tab_active" : ""
                  }`}
                  onClick={() => selectDealsTab("coming_soon")}
                >
                  <Sparkles
                    className="deals_tabs_icon um_segmented_tab_icon"
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                  {/* <span className="deals_tabs_label um_segmented_tab_label">
                  Coming soon
                </span> */}
                  <span className="deals_tabs_label um_segmented_tab_label">
                  Opportunities
                  </span>
                  <span className="deals_tabs_count">({comingSoonCount})</span>
                </button>
              {/* ) : null} */}
            </div>
          </TabsScrollStrip>
        </div>

        <div className="investing_dash_deals_toolbar_row">
          <div className="um_toolbar deal_inv_table_um_toolbar investing_dash_deals_toolbar investing_dash_deals_unified_toolbar sponsor_dash_deals_toolbar">
            <div className="sponsor_dash_deals_toolbar_leading">
              <DealsSortControl
                sortKey={dealsSortKey}
                onSortKeyChange={setDealsSortKey}
              />
              <button
                type="button"
                className="um_toolbar_export_btn investing_dash_deals_export_btn"
                onClick={() => setExportModalOpen(true)}
                disabled={tabLoading || exportDeals.length === 0}
              >
                <Download size={18} strokeWidth={2} aria-hidden />
                <span>Export All</span>
              </button>
            </div>
            <div className="sponsor_dash_deals_toolbar_trailing">
              <DealsViewToggle view={dealsView} onViewChange={setDealsView} />
              <div className="um_search_wrap investing_dash_deals_search_wrap">
                <Search className="um_search_icon" size={18} aria-hidden />
                <input
                  type="search"
                  className="um_search_input"
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={tabLoading}
                  aria-label={searchPlaceholder}
                />
              </div>
            </div>
          </div>
        </div>

        <div
          id="investing-dash-deals-panel"
          role="tabpanel"
          aria-labelledby={TAB_IDS[activeTab]}
          className="investing_dash_deals_panel"
        >
          <SyndicatingDealsSection
            key={activeTab}
            controlledDeals={dealsForTab}
            controlledLoading={tabLoading}
            controlledQuery={query}
            onControlledQueryChange={setQuery}
            hideToolbarSearch
            hideToolbarControls
            controlledView={dealsView}
            onControlledViewChange={setDealsView}
            controlledSortKey={dealsSortKey}
            onControlledSortKeyChange={setDealsSortKey}
            dealsHeadingId="investing-deals-heading"
            hideDealsHeading
            dealsSectionTitle={sectionTitle}
            includeParticipantDeals
            filterOfferingDashboardVisibility
            investorOpportunityCards={activeTab === "coming_soon"}
            searchPlaceholder={searchPlaceholder}
            emptyStateMessage={emptyLabel}
          />
        </div>
      </div>

      <ExportDealsModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        deals={exportDeals}
      />
    </section>
  );
}
