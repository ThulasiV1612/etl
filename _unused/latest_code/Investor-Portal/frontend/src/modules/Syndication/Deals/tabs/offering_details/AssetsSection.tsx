import { Download, Plus, Search, X } from "lucide-react"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react"
import { createPortal } from "react-dom"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { toast } from "../../../../../common/components/Toast"
import {
  DataTable,
  type DataTableColumn,
} from "../../../../../common/components/data-table/DataTable"
import {
  FormTooltip,
  type FormTooltipPanelAlign,
} from "../../../../../common/components/form-tooltip/FormTooltip"
import type { DealDetailApi } from "../../api/dealsApi"
import { OFFERING_DETAILS_ASSETS_RETURN } from "../../utils/offeringDetailsSectionNav"
import {
  computeDealAssetRowsFromClientStorage,
  getDealAssetPersisted,
  persistDealAssetRowArchiveState,
  type DealAssetRow,
} from "../../types/deal-asset.types"
import {
  persistDealAssetArchiveToServer,
  syncDealAssetsFromServer,
} from "../../utils/dealAssetsServerSync"
import { AssetRowActions } from "../../components/AssetRowActions"
import { ExportSelectableRowsModal } from "../../components/ExportSelectableRowsModal"
import { downloadDealAssetsExportCsv } from "../../utils/offeringDetailsSectionExportCsv"
import "../deal_members/add-investment/add_deal_modal.css"
import "../../deal-investors-tab.css"
import "../../../usermanagement/user_management.css"
import "../../deals-list.css"

function mergeArchivedFromPrevious(
  fresh: DealAssetRow[],
  prev: DealAssetRow[],
): DealAssetRow[] {
  const archivedIds = new Set(
    prev.filter((r) => r.archived).map((r) => r.id),
  )
  return fresh.map((r) =>
    archivedIds.has(r.id) ? { ...r, archived: true } : r,
  )
}

function AssetTableColumnHeader({
  label,
  hint,
  headerAlign = "left",
  tooltipPlacement = "bottom",
  tooltipPanelAlign,
}: {
  label: string
  hint: string
  headerAlign?: "left" | "center" | "right"
  tooltipPlacement?: "top" | "bottom"
  tooltipPanelAlign?: FormTooltipPanelAlign
}) {
  const headerAlignClass =
    headerAlign === "right"
      ? " deals_table_col_header_end"
      : headerAlign === "center"
        ? " deals_table_col_header_center"
        : ""
  const panelAlign: FormTooltipPanelAlign =
    tooltipPanelAlign ??
    (headerAlign === "right"
      ? "end"
      : headerAlign === "center"
        ? "center"
        : "start")
  return (
    <span className={`deals_table_col_header${headerAlignClass}`}>
      <span>{label}</span>
      <span
        className="deals_table_header_tooltip_anchor"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <FormTooltip
          label={`More information: ${label}`}
          content={<p className="deals_table_header_tooltip_p">{hint}</p>}
          placement={tooltipPlacement}
          panelAlign={panelAlign}
          nativeButtonTrigger={false}
        />
      </span>
    </span>
  )
}

interface AssetsSectionProps {
  detail: DealDetailApi
}

export function AssetsSection({ detail }: AssetsSectionProps) {
  const viewModalTitleId = useId()
  const location = useLocation()
  const navigate = useNavigate()
  const [rows, setRows] = useState<DealAssetRow[]>(() =>
    computeDealAssetRowsFromClientStorage(detail),
  )
  const [viewRow, setViewRow] = useState<DealAssetRow | null>(null)
  const [viewTab, setViewTab] = useState<"details" | "additional">("details")
  const [query, setQuery] = useState("")
  const [exportModalOpen, setExportModalOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await syncDealAssetsFromServer(detail.id)
      if (cancelled) return
      setRows((prev) =>
        mergeArchivedFromPrevious(
          computeDealAssetRowsFromClientStorage(detail),
          prev,
        ),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [detail.id, detail.assetImagePath, detail.propertyName, location.pathname])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const blob = `${r.name} ${r.address} ${r.assetType}`.toLowerCase()
      return blob.includes(q)
    })
  }, [rows, query])

  useEffect(() => {
    if (!viewRow) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setViewRow(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [viewRow])

  useEffect(() => {
    if (viewRow) setViewTab("details")
  }, [viewRow?.id])

  const openViewRow = useCallback(
    (row: DealAssetRow) => {
      setViewTab("details")
      const persisted = getDealAssetPersisted(detail.id, row.id)
      const additionalInfo =
        persisted?.row.additionalInfo ??
        row.additionalInfo ??
        []
      setViewRow({
        ...row,
        ...(persisted?.row.assetType
          ? { assetType: persisted.row.assetType }
          : {}),
        additionalInfo,
      })
    },
    [detail.id],
  )

  const closeViewRow = useCallback(() => {
    setViewRow(null)
    setViewTab("details")
  }, [])

  const viewAdditionalInfo = viewRow?.additionalInfo ?? []
  const hasAdditionalInfo = viewAdditionalInfo.length > 0

  const archiveAsset = useCallback(
    (id: string) => {
      setRows((prev) => {
        const next = prev.map((r) =>
          r.id === id ? { ...r, archived: true } : r,
        )
        const updated = next.find((r) => r.id === id)
        if (updated) {
          persistDealAssetRowArchiveState(detail.id, updated)
          void persistDealAssetArchiveToServer({
            dealId: detail.id,
            row: updated,
          }).then((res) => {
            if (!res.ok)
              toast.error(res.message || "Could not archive asset on server.")
          })
        }
        return next
      })
    },
    [detail.id],
  )

  const activateAsset = useCallback(
    (id: string) => {
      setRows((prev) => {
        const next = prev.map((r) =>
          r.id === id ? { ...r, archived: false } : r,
        )
        const updated = next.find((r) => r.id === id)
        if (updated) {
          persistDealAssetRowArchiveState(detail.id, updated)
          void persistDealAssetArchiveToServer({
            dealId: detail.id,
            row: updated,
          }).then((res) => {
            if (!res.ok)
              toast.error(res.message || "Could not activate asset on server.")
          })
        }
        return next
      })
    },
    [detail.id],
  )

  const addAssetHref = `/deals/${encodeURIComponent(detail.id)}/assets/new`

  const canExportAssets = rows.length > 0

  const exportModalRows = useMemo(
    () =>
      rows.map((row) => ({
        key: row.id,
        label: row.name?.trim() || "—",
        meta: row.assetType?.trim() || row.address?.trim() || undefined,
        searchText: `${row.name} ${row.address} ${row.assetType}`.toLowerCase(),
      })),
    [rows],
  )

  const handleExportAssets = useCallback(
    (selectedKeys: string[]) => {
      const keySet = new Set(selectedKeys)
      const chosen = rows.filter((row) => keySet.has(row.id))
      if (chosen.length === 0) return
      const filename = downloadDealAssetsExportCsv(
        detail.dealName?.trim() || detail.id,
        chosen,
      )
      toast.success("Assets exported", `Saved as ${filename}`)
    },
    [detail.id, rows],
  )

  const columns: DataTableColumn<DealAssetRow>[] = useMemo(
    () => [
      {
        id: "name",
        header: (
          <AssetTableColumnHeader
            label="Name"
            hint="Property or asset name shown in the offering."
          />
        ),
        colWidth: "14rem",
        thClassName: "deal_assets_col_name",
        tdClassName: "um_td_user deal_assets_col_name",
        sortValue: (row) => row.name.toLowerCase(),
        cell: (row) => (
          <button
            type="button"
            className="deals_table_name_link deal_assets_name_btn"
            onClick={() => openViewRow(row)}
          >
            {row.name || "—"}
          </button>
        ),
      },
      {
        id: "address",
        header: (
          <AssetTableColumnHeader
            label="Address"
            hint="Location summary built from the asset address fields."
          />
        ),
        sortValue: (row) => row.address.toLowerCase(),
        cell: (row) => row.address || "—",
      },
      {
        id: "assetType",
        header: (
          <AssetTableColumnHeader
            label="Asset type"
            hint="Type from additional information, or em dash if unset."
          />
        ),
        sortValue: (row) => row.assetType.toLowerCase(),
        cell: (row) => row.assetType || "—",
      },
      {
        id: "images",
        header: (
          <AssetTableColumnHeader
            label="Images"
            hint="Count of images attached on the asset step."
            headerAlign="right"
            tooltipPanelAlign="end"
          />
        ),
        align: "right",
        thClassName: "deals_th_align_right deal_assets_th_images",
        tdClassName: "deal_assets_td_images",
        sortValue: (row) => row.imageCount,
        cell: (row) => (
          <span className="deal_assets_images_cell">
            {row.imageCount}{" "}
            {row.imageCount === 1 ? "image" : "images"}
          </span>
        ),
      },
      {
        id: "actions",
        header: (
          <AssetTableColumnHeader
            label="Actions"
            hint="View details, edit, archive, or activate an archived asset."
            headerAlign="right"
            tooltipPanelAlign="end"
          />
        ),
        align: "right",
        thClassName: "um_th_actions deals_th_actions_head deal_assets_th_actions",
        tdClassName: "um_td_actions deal_assets_td_actions",
        cell: (row) => (
          <AssetRowActions
            rowName={row.name}
            archived={Boolean(row.archived)}
            onView={() => openViewRow(row)}
            onEdit={
              row.archived
                ? undefined
                : () =>
                    navigate(
                      `/deals/${encodeURIComponent(detail.id)}/assets/${encodeURIComponent(row.id)}/edit`,
                      { state: OFFERING_DETAILS_ASSETS_RETURN },
                    )
            }
            onArchive={() => archiveAsset(row.id)}
            onActivate={() => activateAsset(row.id)}
          />
        ),
      },
    ],
    [activateAsset, archiveAsset, detail.id, navigate, openViewRow],
  )

  const emptyLabel =
    rows.length === 0
      ? "No assets yet. Add an asset to see it here."
      : query.trim()
        ? "No assets match your search."
        : "No assets to display."

  return (
    <div className="deal_assets">
      <ExportSelectableRowsModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        title="Export assets"
        hint="Search and select assets, then export to Excel (CSV format)."
        searchPlaceholder="Search assets…"
        searchAriaLabel="Search assets in export list"
        listAriaLabel="Assets to export"
        rows={exportModalRows}
        onExportExcel={handleExportAssets}
      />
      <div className="um_panel um_members_tab_panel deals_list_table_panel deals_list_card_surface deal_inv_table_panel deal_assets_datatable_panel">
        <div className="um_toolbar um_toolbar_export_then_search deal_offering_section_toolbar">
          <div className="um_search_wrap">
            <Search className="um_search_icon" size={18} aria-hidden />
            <input
              type="search"
              className="um_search_input"
              placeholder="Search assets…"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              aria-label="Search assets"
              autoComplete="off"
            />
          </div>
          <div className="um_toolbar_actions">
            <button
              type="button"
              className="um_toolbar_export_btn"
              disabled={!canExportAssets}
              onClick={() => setExportModalOpen(true)}
              aria-label="Export all assets"
              title={canExportAssets ? undefined : "No assets to export"}
            >
              <Download size={18} strokeWidth={2} aria-hidden />
              <span>Export All</span>
            </button>
            <Link
              to={addAssetHref}
              state={OFFERING_DETAILS_ASSETS_RETURN}
              className="um_btn_primary deals_list_add_link"
            >
              <Plus size={18} aria-hidden />
              Add asset
            </Link>
          </div>
        </div>

        <DataTable
          visualVariant="members"
          membersTableClassName="um_table_members deal_inv_table"
          columns={columns}
          rows={filteredRows}
          getRowKey={(row) => row.id}
          getRowClassName={(row) =>
            row.archived ? "deal_assets_row_archived" : undefined
          }
          emptyLabel={emptyLabel}
          initialSort={{ columnId: "name", direction: "asc" }}
        />
      </div>

      {viewRow
        ? createPortal(
            <div
              className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost"
              role="presentation"
            >
              <div
                className="um_modal um_modal_view deals_add_inv_modal_panel add_contact_panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby={viewModalTitleId}
              >
                <div className="um_modal_head add_contact_modal_head">
                  <h3
                    id={viewModalTitleId}
                    className="um_modal_title add_contact_modal_title"
                  >
                    Asset details
                  </h3>
                  <button
                    type="button"
                    className="um_modal_close"
                    onClick={closeViewRow}
                    aria-label="Close"
                  >
                    <X size={20} strokeWidth={2} aria-hidden />
                  </button>
                </div>
                <div className="deals_add_inv_modal_scroll deal_assets_view_body">
                  <div
                    className="um_members_tabs_outer deals_tabs_outer um_segmented_tabs_outer deal_assets_view_tabs_outer"
                    role="presentation"
                  >
                    <div
                      className="um_members_tabs_row deals_tabs_row um_segmented_tabs_row deal_assets_view_tabs_row"
                      role="tablist"
                      aria-label="Asset details sections"
                    >
                      <button
                        type="button"
                        role="tab"
                        id="deal-asset-view-tab-details"
                        className={`um_members_tab deals_tabs_tab um_segmented_tab${
                          viewTab === "details" ? " um_members_tab_active" : ""
                        }`}
                        aria-selected={viewTab === "details"}
                        aria-controls="deal-asset-view-panel-details"
                        onClick={() => setViewTab("details")}
                      >
                        <span className="deals_tabs_label um_segmented_tab_label">
                          Details
                        </span>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        id="deal-asset-view-tab-additional"
                        className={`um_members_tab deals_tabs_tab um_segmented_tab${
                          viewTab === "additional"
                            ? " um_members_tab_active"
                            : ""
                        }`}
                        aria-selected={viewTab === "additional"}
                        aria-controls="deal-asset-view-panel-additional"
                        onClick={() => setViewTab("additional")}
                      >
                        <span className="deals_tabs_label um_segmented_tab_label">
                          Additional information
                        </span>
                      </button>
                    </div>
                  </div>

                  {viewTab === "details" ? (
                    <div
                      id="deal-asset-view-panel-details"
                      role="tabpanel"
                      aria-labelledby="deal-asset-view-tab-details"
                    >
                      <dl className="deal_offering_dl">
                        <div className="deal_offering_dl_row">
                          <dt>Name</dt>
                          <dd>{viewRow.name}</dd>
                        </div>
                        <div className="deal_offering_dl_row">
                          <dt>Address</dt>
                          <dd>{viewRow.address}</dd>
                        </div>
                        <div className="deal_offering_dl_row">
                          <dt>Asset type</dt>
                          <dd>{viewRow.assetType}</dd>
                        </div>
                        <div className="deal_offering_dl_row">
                          <dt>Images</dt>
                          <dd>
                            {viewRow.imageCount}{" "}
                            {viewRow.imageCount === 1 ? "image" : "images"}
                          </dd>
                        </div>
                        {viewRow.archived ? (
                          <div className="deal_offering_dl_row">
                            <dt>Status</dt>
                            <dd>Archived</dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                  ) : (
                    <div
                      id="deal-asset-view-panel-additional"
                      role="tabpanel"
                      aria-labelledby="deal-asset-view-tab-additional"
                    >
                      {hasAdditionalInfo ? (
                        <dl className="deal_offering_dl">
                          {viewAdditionalInfo.map((pair, i) => (
                            <div
                              key={`${pair.label}-${i}`}
                              className="deal_offering_dl_row"
                            >
                              <dt>{pair.label}</dt>
                              <dd>{pair.value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="deal_assets_view_empty">
                          No additional information for this asset.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="um_modal_actions">
                  <button
                    type="button"
                    className="um_btn_primary"
                    onClick={closeViewRow}
                  >
                    <X size={16} strokeWidth={2} aria-hidden />
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
