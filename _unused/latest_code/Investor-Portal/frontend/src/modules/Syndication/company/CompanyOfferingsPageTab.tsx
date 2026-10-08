import { useEffect, useMemo, useState } from "react";
import { Code2, Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { formatDateDdMmmYyyy } from "../../../common/utils/formatDateDisplay";
import { DataTablePagination } from "../../../common/components/DataTablePagination/DataTablePagination";
import { TableHScrollShell } from "../../../common/components/data-table/TableHScrollShell";
import { toast } from "../../../common/components/Toast";
import { fetchWorkspaceTabSettings } from "./companyWorkspaceSettingsApi";
import { useDebouncedWorkspaceTabPersist } from "./useWorkspaceTabPersistence";

type Props = {
  companyName: string;
  readOnly?: boolean;
  workspaceCompanyId?: string;
};

type OfferingRow = {
  id: string;
  name: string;
  internalName: string;
  status: string;
  closeDate: string;
  warnRow?: boolean;
};

/** Page link shown on Offerings tab (dev / demo) */
const PUBLIC_OFFERINGS_PAGE_URL = "http://localhost:5173";

/** Placeholder rows for UI only — replace with API data when wired */
const MOCK_OFFERINGS: OfferingRow[] = [
  {
    id: "demo-1",
    name: "Sample offering (draft)",
    internalName: "DEMO-DRAFT-001",
    status: "Draft",
    closeDate: "6/30/2026",
    warnRow: true,
  },
  {
    id: "demo-2",
    name: "Sample offering (active)",
    internalName: "DEMO-ACTIVE-001",
    status: "Active",
    closeDate: "12/15/2026",
  },
  {
    id: "demo-3",
    name: "Sample offering (closed)",
    internalName: "DEMO-CLOSED-001",
    status: "Closed",
    closeDate: "3/1/2025",
  },
];

function parseOfferingRows(raw: unknown): OfferingRow[] {
  if (!Array.isArray(raw)) return [];
  const out: OfferingRow[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    if (!id) continue;
    out.push({
      id,
      name: typeof o.name === "string" ? o.name : "",
      internalName: typeof o.internalName === "string" ? o.internalName : "",
      status: typeof o.status === "string" ? o.status : "",
      closeDate: typeof o.closeDate === "string" ? o.closeDate : "",
      warnRow: o.warnRow === true,
    });
  }
  return out;
}

export function CompanyOfferingsPageTab(props: Props) {
  const { readOnly = false, workspaceCompanyId } = props;
  const pageUrl = PUBLIC_OFFERINGS_PAGE_URL;
  const [visibility, setVisibility] = useState<"hidden" | "visible">("hidden");
  const [disclaimer, setDisclaimer] = useState("");
  const [offerings, setOfferings] = useState<OfferingRow[]>(() => [
    ...MOCK_OFFERINGS,
  ]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [offeringsHydrated, setOfferingsHydrated] = useState(!workspaceCompanyId);

  useEffect(() => {
    if (!workspaceCompanyId) {
      setOfferingsHydrated(true);
      return;
    }
    let cancelled = false;
    setOfferingsHydrated(false);
    void (async () => {
      const { ok, payload: p } = await fetchWorkspaceTabSettings(
        workspaceCompanyId,
        "offerings",
      );
      if (cancelled) return;
      if (ok) {
        if (p.visibility === "hidden" || p.visibility === "visible") {
          setVisibility(p.visibility);
        }
        if (typeof p.disclaimer === "string") {
          setDisclaimer(p.disclaimer);
        }
        if (Array.isArray(p.offerings)) {
          const parsed = parseOfferingRows(p.offerings);
          setOfferings(parsed.length > 0 ? parsed : [...MOCK_OFFERINGS]);
        }
      }
      setOfferingsHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceCompanyId]);

  const offeringsPayload = useMemo(
    () => ({
      visibility,
      disclaimer,
      offerings,
    }),
    [visibility, disclaimer, offerings],
  );

  useDebouncedWorkspaceTabPersist(
    workspaceCompanyId,
    "offerings",
    readOnly,
    offeringsHydrated,
    offeringsPayload,
  );

  const draftOrPastCount = useMemo(
    () =>
      offerings.filter(
        (o) => o.status === "Draft" || o.status === "Past",
      ).length,
    [offerings],
  );

  const offeringsTotalPages = Math.max(
    1,
    Math.ceil(offerings.length / pageSize),
  );

  useEffect(() => {
    if (page > offeringsTotalPages) {
      setPage(offeringsTotalPages);
    }
  }, [page, offeringsTotalPages]);

  const offeringsPageSafe = Math.min(page, offeringsTotalPages);

  const pageRows = useMemo(() => {
    const start = (offeringsPageSafe - 1) * pageSize;
    return offerings.slice(start, start + pageSize);
  }, [offerings, offeringsPageSafe, pageSize]);

  async function copyPageLink() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      toast.success("Copied", "Link copied to clipboard.");
    } catch {
      toast.error("Copy failed", "Could not copy to clipboard.");
    }
  }

  function embedPage() {
    toast.success("Coming soon", "Embed snippet will be available in a future update.");
  }

  return (
    <div className="cp_offerings_root">
      <section
        className="cp_offerings_section"
        aria-labelledby="cp-offerings-public-settings"
      >
        <h3 id="cp-offerings-public-settings" className="cp_offerings_section_title">
          Public page settings
        </h3>

        <div className="cp_offerings_field_row">
          <div className="cp_offerings_field_label">Page link</div>
          <div className="cp_offerings_field_control">
            <div className="cp_offerings_link_block">
              <div className="cp_offerings_url_box">{pageUrl}</div>
              <div className="cp_offerings_link_actions">
                <button
                  type="button"
                  className="cp_offerings_btn_outline"
                  onClick={() => void copyPageLink()}
                >
                  <Copy size={16} strokeWidth={2} aria-hidden />
                  Copy to clipboard
                </button>
                <button
                  type="button"
                  className="cp_offerings_btn_outline"
                  disabled={readOnly}
                  onClick={embedPage}
                >
                  <Code2 size={16} strokeWidth={2} aria-hidden />
                  Embed
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="cp_offerings_field_row">
          <div className="cp_offerings_field_label">Page visibility</div>
          <div className="cp_offerings_field_control">
            <div
              className="cp_offerings_visibility"
              role="radiogroup"
              aria-label="Page visibility"
            >
              <label
                className={`cp_offerings_radio_option${
                  visibility === "hidden" ? " cp_offerings_radio_option_selected" : ""
                }`}
              >
                <input
                  type="radio"
                  className="cp_offerings_radio_input"
                  name="cp-offerings-visibility"
                  checked={visibility === "hidden"}
                  disabled={readOnly}
                  onChange={() => setVisibility("hidden")}
                />
                <span className="cp_offerings_radio_face" aria-hidden />
                <span className="cp_offerings_radio_text">Hidden</span>
              </label>
              <label
                className={`cp_offerings_radio_option${
                  visibility === "visible" ? " cp_offerings_radio_option_selected" : ""
                }`}
              >
                <input
                  type="radio"
                  className="cp_offerings_radio_input"
                  name="cp-offerings-visibility"
                  checked={visibility === "visible"}
                  disabled={readOnly}
                  onChange={() => setVisibility("visible")}
                />
                <span className="cp_offerings_radio_face" aria-hidden />
                <span className="cp_offerings_radio_text">Visible with link</span>
              </label>
            </div>
          </div>
        </div>

        <div className="cp_offerings_field_row cp_offerings_field_row_disclaimer">
          <div className="cp_offerings_field_label">Disclaimer</div>
          <div className="cp_offerings_field_control">
            <textarea
              className="cp_offerings_disclaimer"
              rows={5}
              placeholder="Optionally enter a disclaimer to be shown at the bottom of the page."
              value={disclaimer}
              disabled={readOnly}
              onChange={(e) => setDisclaimer(e.target.value)}
              aria-label="Disclaimer"
            />
          </div>
        </div>
      </section>

      <section
        className="cp_offerings_section"
        aria-labelledby="cp-offerings-public-list"
      >
        <div className="cp_offerings_table_section_head">
          <h3 id="cp-offerings-public-list" className="cp_offerings_section_title">
            Public page offerings
          </h3>
          <button
            type="button"
            className="cp_offerings_btn_outline"
            disabled={readOnly}
          >
            <Plus size={16} strokeWidth={2} aria-hidden />
            Add offering
          </button>
        </div>

        {draftOrPastCount > 0 ? (
          <div className="cp_offerings_alert" role="status">
            {draftOrPastCount} of your offerings are set to &apos;Draft&apos; or &apos;Past&apos;
            status, which prevents {draftOrPastCount === 1 ? "it" : "them"} from being displayed.
          </div>
        ) : null}

        <div className="um_table_wrap cp_offerings_table_wrap">
          <TableHScrollShell ariaLabel="Offerings columns">
          <table className="um_table cp_offerings_table">
            <thead>
              <tr>
                <th scope="col" className="cp_offerings_th_drag" aria-label="Reorder" />
                <th scope="col">Offering name</th>
                <th scope="col">Offering internal name</th>
                <th scope="col">Offering status</th>
                <th scope="col">Close date</th>
                <th scope="col" className="um_th_actions">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, i) => (
                <tr
                  key={row.id}
                  className={[
                    row.warnRow ? "cp_offerings_row_warn" : undefined,
                    i % 2 === 0 ? "data_table_row_odd" : "data_table_row_even",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <td className="cp_offerings_td_drag">
                    <span className="cp_offerings_drag" aria-hidden>
                      <GripVertical size={18} strokeWidth={2} />
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="cp_offerings_name_link"
                      disabled={readOnly}
                    >
                      {row.name}
                    </button>
                  </td>
                  <td>{row.internalName}</td>
                  <td>{row.status}</td>
                  <td>{formatDateDdMmmYyyy(row.closeDate)}</td>
                  <td className="um_td_actions">
                    <button
                      type="button"
                      className="cp_offerings_icon_btn"
                      disabled={readOnly}
                      aria-label={`Remove ${row.name} from public page`}
                    >
                      <Trash2 size={18} strokeWidth={2} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableHScrollShell>
        </div>

        <DataTablePagination
          page={offeringsPageSafe}
          pageSize={pageSize}
          totalItems={offerings.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[10, 25, 50]}
          ariaLabel="Public offerings table pagination"
        />
      </section>
    </div>
  );
}
