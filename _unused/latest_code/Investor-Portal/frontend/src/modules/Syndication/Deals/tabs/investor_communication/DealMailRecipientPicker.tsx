import {
  ArrowDown,
  ChevronDown,
  Info,
  ListChecks,
  ListX,
  Search,
} from "lucide-react"
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react"
import { EMAIL_UNAVAILABLE_LABEL } from "../../../../../common/utils/displayEmail"
import {
  groupDealMailRecipients,
  type DealMailRecipient,
} from "./dealMailRecipients"

type RecipientTab = "all" | "lp" | "gp"

const LIST_NEAR_BOTTOM_PX = 24

function isListAwayFromBottom(el: HTMLElement): boolean {
  const overflow = el.scrollHeight - el.clientHeight
  if (overflow <= 8) return false
  return overflow - el.scrollTop > LIST_NEAR_BOTTOM_PX
}

interface DealMailRecipientPickerProps {
  recipients: DealMailRecipient[]
  selectedIds: Set<string>
  onChangeSelectedIds: (next: Set<string>) => void
  viewerIsCosponsor?: boolean
}

function TriCheckbox({
  checked,
  indeterminate,
  onChange,
  ariaLabel,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  ariaLabel: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (el) el.indeterminate = Boolean(indeterminate) && !checked
  }, [checked, indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      className="deal_inv_comm_recipient_cb"
      checked={checked}
      onChange={onChange}
      aria-label={ariaLabel}
    />
  )
}

function selectionState(ids: string[], selected: Set<string>) {
  const n = ids.length
  const count = ids.filter((id) => selected.has(id)).length
  return {
    all: n > 0 && count === n,
    some: count > 0 && count < n,
    count,
    n,
  }
}

function toggleIds(
  prev: Set<string>,
  ids: string[],
  selectAll: boolean,
): Set<string> {
  const next = new Set(prev)
  if (selectAll) {
    for (const id of ids) next.add(id)
    return next
  }
  for (const id of ids) next.delete(id)
  return next
}

function emailLine(recipient: DealMailRecipient): string {
  if (recipient.email.includes("@")) return recipient.email
  return EMAIL_UNAVAILABLE_LABEL
}

function filterRecipientsByQuery(
  rows: DealMailRecipient[],
  query: string,
): DealMailRecipient[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((recipient) => {
    const haystack = [
      recipient.displayName,
      recipient.email,
      recipient.className,
      recipient.roleLabel,
      recipient.sponsorName,
      recipient.sponsorEmail,
    ]
      .join(" ")
      .toLowerCase()
    return haystack.includes(q)
  })
}

function InvestorRow({
  recipient,
  checked,
  onToggle,
}: {
  recipient: DealMailRecipient
  checked: boolean
  onToggle: () => void
}) {
  const email = emailLine(recipient)
  const hasEmail = recipient.email.includes("@")
  return (
    <li className="deal_inv_comm_recipient_item">
      <label className="deal_inv_comm_recipient_row">
        <input
          type="checkbox"
          className="deal_inv_comm_recipient_cb"
          checked={checked}
          onChange={onToggle}
          aria-label={`Select ${recipient.displayName}`}
        />
        <span className="deal_inv_comm_recipient_content">
          <span className="deal_inv_comm_recipient_line">
            <span
              className="deal_inv_comm_recipient_name"
              title={recipient.displayName}
            >
              {recipient.displayName}
            </span>
            {recipient.requiresCosponsorRelease ? (
              <span className="deal_inv_comm_recipient_badge deal_inv_comm_recipient_badge_release">
                Release
              </span>
            ) : null}
          </span>
          <span className="deal_inv_comm_recipient_subline">
            <span
              className={`deal_inv_comm_recipient_email${
                hasEmail ? "" : " deal_inv_comm_recipient_email_muted"
              }`}
              title={email}
            >
              {email}
            </span>
            {recipient.className ? (
              <span className="deal_inv_comm_recipient_role">
                {recipient.className}
              </span>
            ) : recipient.roleLabel !== "—" ? (
              <span className="deal_inv_comm_recipient_role">
                {recipient.roleLabel}
              </span>
            ) : null}
          </span>
        </span>
      </label>
    </li>
  )
}

function GroupBlock({
  title,
  countLabel,
  ids,
  selectedIds,
  onChangeSelectedIds,
  hint,
  children,
}: {
  title: string
  countLabel: string
  ids: string[]
  selectedIds: Set<string>
  onChangeSelectedIds: (next: Set<string>) => void
  hint?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)
  const state = selectionState(ids, selectedIds)
  return (
    <div className="deal_inv_comm_recip_group">
      <div className="deal_inv_comm_recip_group_head">
        <TriCheckbox
          checked={state.all}
          indeterminate={state.some}
          onChange={() =>
            onChangeSelectedIds(toggleIds(selectedIds, ids, !state.all))
          }
          ariaLabel={`Select all ${title}`}
        />
        <button
          type="button"
          className="deal_inv_comm_recip_group_toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown
            size={16}
            strokeWidth={2}
            aria-hidden
            className={`deal_inv_comm_recip_group_chevron${
              open ? " deal_inv_comm_recip_group_chevron_open" : ""
            }`}
          />
          <span className="deal_inv_comm_recip_group_title">{title}</span>
          <span className="deal_inv_comm_recip_group_count">{countLabel}</span>
        </button>
      </div>
      {open && hint ? (
        <p className="deal_inv_comm_recip_group_hint" role="note">
          {hint}
        </p>
      ) : null}
      {open ? (
        <ul className="deal_inv_comm_recipient_list deal_inv_comm_recip_group_list">
          {children}
        </ul>
      ) : null}
    </div>
  )
}

function FlatRecipientList({
  rows,
  selectedIds,
  onChangeSelectedIds,
}: {
  rows: DealMailRecipient[]
  selectedIds: Set<string>
  onChangeSelectedIds: (next: Set<string>) => void
}) {
  return (
    <ul className="deal_inv_comm_recipient_list deal_inv_comm_recip_flat_list">
      {rows.map((r) => (
        <InvestorRow
          key={r.id}
          recipient={r}
          checked={selectedIds.has(r.id)}
          onToggle={() =>
            onChangeSelectedIds(
              toggleIds(selectedIds, [r.id], !selectedIds.has(r.id)),
            )
          }
        />
      ))}
    </ul>
  )
}

function TabButton({
  id,
  label,
  count,
  active,
  onSelect,
}: {
  id: RecipientTab
  label: string
  count: number
  active: boolean
  onSelect: (id: RecipientTab) => void
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`deal-inv-comm-tab-${id}`}
      aria-selected={active}
      aria-controls="deal-inv-comm-tab-panel"
      className={`deal_inv_comm_recip_tab${active ? " deal_inv_comm_recip_tab_active" : ""}`}
      onClick={() => onSelect(id)}
    >
      <span className="deal_inv_comm_recip_tab_label">{label}</span>
      <span className="deal_inv_comm_recip_tab_count">{count}</span>
    </button>
  )
}

export function DealMailRecipientPicker({
  recipients,
  selectedIds,
  onChangeSelectedIds,
  viewerIsCosponsor = false,
}: DealMailRecipientPickerProps) {
  const [tab, setTab] = useState<RecipientTab>("all")
  const [query, setQuery] = useState("")
  const listScrollRef = useRef<HTMLDivElement>(null)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const tree = useMemo(() => groupDealMailRecipients(recipients), [recipients])
  const filteredLps = useMemo(
    () => filterRecipientsByQuery(tree.lps, query),
    [tree.lps, query],
  )
  const filteredGps = useMemo(
    () => filterRecipientsByQuery(tree.gps, query),
    [tree.gps, query],
  )
  const visibleIds = useMemo(() => {
    if (tab === "lp") return filteredLps.map((r) => r.id)
    if (tab === "gp") return filteredGps.map((r) => r.id)
    return [...filteredLps, ...filteredGps].map((r) => r.id)
  }, [tab, filteredLps, filteredGps])
  const visibleState = selectionState(visibleIds, selectedIds)
  const selectedCount = recipients.filter((r) => selectedIds.has(r.id)).length
  const releaseCount = recipients.filter(
    (r) => selectedIds.has(r.id) && r.requiresCosponsorRelease,
  ).length
  const otherCosponsorLpCount = tree.lpGroups
    .filter((g) => g.requiresRelease)
    .reduce((n, g) => n + g.recipients.length, 0)
  const ownLpCount = tree.lps.filter((r) => !r.requiresCosponsorRelease).length

  const syncScrollToBottomButton = useCallback(() => {
    const el = listScrollRef.current
    setShowScrollToBottom(el ? isListAwayFromBottom(el) : false)
  }, [])

  useLayoutEffect(() => {
    const el = listScrollRef.current
    if (!el) return
    syncScrollToBottomButton()
    el.addEventListener("scroll", syncScrollToBottomButton, { passive: true })
    const observer = new ResizeObserver(syncScrollToBottomButton)
    observer.observe(el)
    for (const child of el.children) observer.observe(child)
    return () => {
      el.removeEventListener("scroll", syncScrollToBottomButton)
      observer.disconnect()
    }
  }, [
    syncScrollToBottomButton,
    tab,
    query,
    recipients.length,
    filteredLps.length,
    filteredGps.length,
  ])

  function scrollListToBottom() {
    const el = listScrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }

  if (recipients.length === 0) {
    return (
      <p className="deal_inv_comm_recipient_empty" role="status">
        No investors on this deal.
      </p>
    )
  }

  return (
    <div className="deal_inv_comm_recipient_panel">
      <div className="deal_inv_comm_recip_tabs" role="tablist" aria-label="Investor type">
        <TabButton
          id="all"
          label="All"
          count={filteredLps.length + filteredGps.length}
          active={tab === "all"}
          onSelect={setTab}
        />
        <TabButton
          id="lp"
          label="Limited Partners"
          count={filteredLps.length}
          active={tab === "lp"}
          onSelect={setTab}
        />
        <TabButton
          id="gp"
          label="General Partners"
          count={filteredGps.length}
          active={tab === "gp"}
          onSelect={setTab}
        />
      </div>

      <div className="deal_inv_comm_recip_toolbar">
        <div className="deal_inv_comm_recip_search">
          <Search className="um_search_icon" size={16} aria-hidden />
          <input
            type="search"
            className="um_search_input deal_inv_comm_recip_search_input"
            placeholder="Search LP or GP…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search limited partners or general partners"
          />
        </div>
        <div className="deal_inv_comm_recip_bulk">
          <button
            type="button"
            className="deal_inv_comm_recip_bulk_btn"
            onClick={() =>
              onChangeSelectedIds(toggleIds(selectedIds, visibleIds, true))
            }
            disabled={visibleIds.length === 0 || visibleState.all}
          >
            <ListChecks size={14} strokeWidth={2} aria-hidden />
            Select all
          </button>
          <button
            type="button"
            className="deal_inv_comm_recip_bulk_btn"
            onClick={() =>
              onChangeSelectedIds(toggleIds(selectedIds, visibleIds, false))
            }
            disabled={visibleState.count === 0}
          >
            <ListX size={14} strokeWidth={2} aria-hidden />
            Deselect all
          </button>
        </div>
      </div>

      {viewerIsCosponsor && ownLpCount > 0 && (tab === "all" || tab === "lp") ? (
        <p className="deal_inv_comm_recip_release_banner" role="note">
          <Info size={16} strokeWidth={2} aria-hidden />
          <span>
            Sending as a cosponsor releases this email to your selected
            investors.
          </span>
        </p>
      ) : null}

      {!viewerIsCosponsor && otherCosponsorLpCount > 0 && (tab === "all" || tab === "lp") ? (
        <p className="deal_inv_comm_recip_release_banner" role="note">
          <Info size={16} strokeWidth={2} aria-hidden />
          <span>
            Other cosponsor LPs will not receive this email directly. Their
            cosponsor should add or release their emails.
          </span>
        </p>
      ) : null}

      <div className="deal_inv_comm_recip_list_shell">
        <div
          ref={listScrollRef}
          id="deal-inv-comm-tab-panel"
          className="deal_inv_comm_recip_groups"
          role="tabpanel"
        >
          {tab !== "gp" && filteredLps.length > 0 ? (
            <div className={tab === "all" ? "deal_inv_comm_recip_section" : undefined}>
              {tab === "all" ? (
                <p className="deal_inv_comm_recip_section_label">Limited Partners</p>
              ) : null}
              <FlatRecipientList
                rows={filteredLps}
                selectedIds={selectedIds}
                onChangeSelectedIds={onChangeSelectedIds}
              />
            </div>
          ) : null}

          {tab !== "lp" && filteredGps.length > 0 ? (
            <div className={tab === "all" ? "deal_inv_comm_recip_section" : undefined}>
              {tab === "all" ? (
                <p className="deal_inv_comm_recip_section_label">General Partners</p>
              ) : null}
              <GroupBlock
                title="General Partners"
                countLabel={`${filteredGps.length}`}
                ids={filteredGps.map((r) => r.id)}
                selectedIds={selectedIds}
                onChangeSelectedIds={onChangeSelectedIds}
              >
                {filteredGps.map((r) => (
                  <InvestorRow
                    key={r.id}
                    recipient={r}
                    checked={selectedIds.has(r.id)}
                    onToggle={() =>
                      onChangeSelectedIds(
                        toggleIds(selectedIds, [r.id], !selectedIds.has(r.id)),
                      )
                    }
                  />
                ))}
              </GroupBlock>
            </div>
          ) : null}

          {tab === "all" &&
          filteredLps.length === 0 &&
          filteredGps.length === 0 ? (
            <p className="deal_inv_comm_recipient_empty deal_inv_comm_recipient_empty_inset">
              No investors match your search.
            </p>
          ) : null}
          {tab === "lp" && filteredLps.length === 0 ? (
            <p className="deal_inv_comm_recipient_empty deal_inv_comm_recipient_empty_inset">
              {query.trim()
                ? "No limited partners match your search."
                : "No limited partners on this deal."}
            </p>
          ) : null}
          {tab === "gp" && filteredGps.length === 0 ? (
            <p className="deal_inv_comm_recipient_empty deal_inv_comm_recipient_empty_inset">
              {query.trim()
                ? "No general partners match your search."
                : "No general partners on this deal."}
            </p>
          ) : null}
        </div>
        {showScrollToBottom ? (
          <button
            type="button"
            className="deal_inv_comm_recip_scroll_bottom"
            aria-label="Scroll to bottom"
            title="Scroll to bottom"
            onClick={scrollListToBottom}
          >
            <ArrowDown size={18} strokeWidth={2.25} aria-hidden />
          </button>
        ) : null}
      </div>

      <p className="deal_inv_comm_recip_summary" role="status">
        <strong>{selectedCount} selected</strong>
        {releaseCount > 0
          ? ` · ${releaseCount} require cosponsor release.`
          : "."}
      </p>
    </div>
  )
}
