import { useEffect, useMemo, useState } from "react";
import { fetchWorkspaceTabSettings } from "./companyWorkspaceSettingsApi";
import { useDebouncedWorkspaceTabPersist } from "./useWorkspaceTabPersistence";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CircleHelp,
  Search,
} from "lucide-react";
import { DataTablePagination } from "../../../common/components/DataTablePagination/DataTablePagination";
import { TableHScrollShell } from "../../../common/components/data-table/TableHScrollShell";

type Props = {
  companyName: string;
  readOnly?: boolean;
  workspaceCompanyId?: string;
};

function parseAttributeRows(raw: unknown): AttributeRow[] {
  if (!Array.isArray(raw)) return [];
  const out: AttributeRow[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    if (!id) continue;
    out.push({
      id,
      label: typeof o.label === "string" ? o.label : "",
      type: typeof o.type === "string" ? o.type : "",
      createdBy: typeof o.createdBy === "string" ? o.createdBy : "",
      description: typeof o.description === "string" ? o.description : "",
      fillRate: typeof o.fillRate === "string" ? o.fillRate : "",
    });
  }
  return out;
}

type AttributeRow = {
  id: string;
  label: string;
  type: string;
  createdBy: string;
  description: string;
  fillRate: string;
};

type SortKey = "label" | "type" | "createdBy" | "description" | "fillRate";

function HelpTip({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="cp_email_help_btn"
      aria-label={label}
      title={label}
    >
      <CircleHelp size={14} strokeWidth={2} aria-hidden />
    </button>
  );
}

export function CompanyContactAttributesTab(props: Props) {
  const { readOnly = false, workspaceCompanyId } = props;
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("label");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [contactPage, setContactPage] = useState(1);
  const [contactPageSize, setContactPageSize] = useState(10);

  const [rows, setRows] = useState<AttributeRow[]>([]);
  const [contactHydrated, setContactHydrated] = useState(!workspaceCompanyId);

  useEffect(() => {
    if (!workspaceCompanyId) {
      setContactHydrated(true);
      return;
    }
    let cancelled = false;
    setContactHydrated(false);
    void (async () => {
      const { ok, payload: p } = await fetchWorkspaceTabSettings(
        workspaceCompanyId,
        "contact",
      );
      if (cancelled) return;
      if (ok) {
        const parsed = parseAttributeRows(p.attributes);
        setRows(parsed);
      } else {
        setRows([]);
      }
      setContactHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceCompanyId]);

  const contactPayload = useMemo(
    () => ({ attributes: rows }),
    [rows],
  );

  useDebouncedWorkspaceTabPersist(
    workspaceCompanyId,
    "contact",
    readOnly,
    contactHydrated,
    contactPayload,
  );

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        r.createdBy.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.fillRate.toLowerCase().includes(q),
    );
  }, [rows, searchQuery]);

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    copy.sort((a, b) => {
      const va = String(a[sortKey] ?? "").toLowerCase();
      const vb = String(b[sortKey] ?? "").toLowerCase();
      const cmp = va.localeCompare(vb, undefined, { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filteredRows, sortKey, sortDir]);

  useEffect(() => {
    setContactPage(1);
  }, [searchQuery, sortKey, sortDir]);

  const contactTableTotalPages = Math.max(
    1,
    Math.ceil(sortedRows.length / contactPageSize),
  );

  useEffect(() => {
    if (contactPage > contactTableTotalPages) {
      setContactPage(contactTableTotalPages);
    }
  }, [contactPage, contactTableTotalPages]);

  const contactPageSafe = Math.min(contactPage, contactTableTotalPages);

  const contactPaginatedRows = useMemo(() => {
    const start = (contactPageSafe - 1) * contactPageSize;
    return sortedRows.slice(start, start + contactPageSize);
  }, [sortedRows, contactPageSafe, contactPageSize]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortColumns: { key: SortKey; label: string }[] = [
    { key: "label", label: "Label" },
    { key: "type", label: "Type" },
    { key: "createdBy", label: "Created by" },
    { key: "description", label: "Description" },
    { key: "fillRate", label: "Fill rate" },
  ];

  return (
    <div className="cp_contact_root">
      <p className="cp_contact_intro">
        Create new attributes for contacts. Once created, the new fields will be available
        in contact details under Custom attributes.
      </p>

      <div className="cp_contact_toolbar">
        <div className="cp_contact_search_pill">
          <Search className="cp_contact_search_icon" size={18} strokeWidth={2} aria-hidden />
          <input
            type="search"
            className="cp_contact_search_input"
            placeholder="Search attributes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search attributes"
          />
        </div>
        <button
          type="button"
          className="cp_contact_create_btn"
          disabled={readOnly}
        >
          Create attribute
        </button>
      </div>

      <div className="um_table_wrap cp_contact_table_wrap">
        <TableHScrollShell ariaLabel="Contact attributes columns">
        <table className="um_table um_table_sortable cp_contact_table">
          <thead>
            <tr>
              {sortColumns.map(({ key, label }) => {
                const active = sortKey === key;
                const ariaSort = active
                  ? sortDir === "asc"
                    ? "ascending"
                    : "descending"
                  : "none";
                return (
                  <th key={key} scope="col" aria-sort={ariaSort}>
                    <div className="cp_contact_th_inner">
                      <button
                        type="button"
                        className="um_sort_header_ctl cp_contact_sort_btn"
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
                            <ArrowUp size={14} className="um_sort_header_icon" aria-hidden />
                          ) : (
                            <ArrowDown size={14} className="um_sort_header_icon" aria-hidden />
                          )
                        ) : (
                          <ArrowUpDown
                            size={14}
                            className="um_sort_header_icon um_sort_header_icon_idle"
                            aria-hidden
                          />
                        )}
                      </button>
                      {key === "fillRate" ? (
                        <HelpTip label="Help: fill rate shows how often this attribute is populated on contacts." />
                      ) : null}
                    </div>
                  </th>
                );
              })}
              <th scope="col" className="um_th_actions cp_contact_th_actions">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="cp_contact_empty_cell">
                  No attributes
                </td>
              </tr>
            ) : (
              contactPaginatedRows.map((row, i) => (
                <tr
                  key={row.id}
                  className={
                    i % 2 === 0 ? "data_table_row_odd" : "data_table_row_even"
                  }
                >
                  <td>{row.label}</td>
                  <td>{row.type}</td>
                  <td>{row.createdBy}</td>
                  <td>{row.description}</td>
                  <td>{row.fillRate}</td>
                  <td className="um_td_actions" />
                </tr>
              ))
            )}
          </tbody>
        </table>
        </TableHScrollShell>
      </div>
      {sortedRows.length > 0 ? (
        <DataTablePagination
          page={contactPageSafe}
          pageSize={contactPageSize}
          totalItems={sortedRows.length}
          onPageChange={setContactPage}
          onPageSizeChange={setContactPageSize}
          ariaLabel="Contact attributes pagination"
        />
      ) : null}
    </div>
  );
}
