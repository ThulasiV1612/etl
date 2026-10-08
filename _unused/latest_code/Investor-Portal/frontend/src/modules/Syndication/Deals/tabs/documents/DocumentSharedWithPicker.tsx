import { Loader2, Mail, X } from "lucide-react"
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import { toast } from "../../../../../common/components/Toast"
import {
  displayEmail,
  isDisplayableEmail,
} from "../../../../../common/utils/displayEmail"
import { postDealDocumentSharedNotification } from "../../api/dealsApi"
import type { DealInvestorClass } from "../../types/deal-investor-class.types"
import type { DealInvestorRow } from "../../types/deal-investors.types"
import {
  lpInvestorsAddedBySponsorUserId,
  lpInvestorsIncludedWhenSharingWithSponsorUser,
  sponsorUserShareInterceptHoldsAtCoSponsor,
  SPONSOR_USER_INVESTORS_MENU_LABEL,
  type SponsorPickerOption,
} from "../../utils/offeringPreviewDocumentAudience"
import { isUsableInvestorEmail } from "../../utils/dealDetailTabVisibility"

export function toggleIdInList(list: string[], id: string, on: boolean): string[] {
  if (on) return list.includes(id) ? list : [...list, id]
  return list.filter((x) => x !== id)
}

function formatDocumentSharedWithSummary(args: {
  classIds: string[]
  investorIds: string[]
  sponsorUserIds: string[]
  allInvestors: boolean
  classes: DealInvestorClass[]
  investors: DealInvestorRow[]
  sponsorUserOptions: SponsorPickerOption[]
}): string {
  const {
    classIds,
    investorIds,
    sponsorUserIds,
    allInvestors,
    classes,
    investors,
    sponsorUserOptions,
  } = args
  const bits: string[] = []
  for (const id of classIds) {
    const c = classes.find((x) => x.id === id)
    bits.push(c?.name?.trim() || id)
  }
  for (const uid of sponsorUserIds) {
    const o = sponsorUserOptions.find((x) => x.id === uid)
    const holds = sponsorUserShareInterceptHoldsAtCoSponsor(uid, investors)
    const included = lpInvestorsIncludedWhenSharingWithSponsorUser(
      uid,
      investors,
    ).length
    const label = o?.label ?? uid
    bits.push(
      holds
        ? `${SPONSOR_USER_INVESTORS_MENU_LABEL}: ${label} (you only)`
        : included > 0
          ? `${SPONSOR_USER_INVESTORS_MENU_LABEL}: ${label} (+ investors)`
          : `${SPONSOR_USER_INVESTORS_MENU_LABEL}: ${label}`,
    )
  }
  if (allInvestors) bits.push("All Investors")
  else {
    for (const id of investorIds) {
      const r = investors.find((x) => x.id === id)
      const email =
        r?.userEmail && isUsableInvestorEmail(r.userEmail)
          ? r.userEmail.trim()
          : ""
      const name = r?.displayName?.trim() || id
      bits.push(email ? `${name} (${email})` : name)
    }
  }
  if (bits.length === 0) return "Hidden by default"
  const joined = bits.join(", ")
  if (joined.length > 72) return `${bits.length} selected`
  return joined
}

function investorRowMatchesDealClass(
  row: DealInvestorRow,
  classId: string,
  dealClasses: DealInvestorClass[],
): boolean {
  const rowClass = row.investorClass?.trim()
  if (!rowClass || rowClass === "—") return false
  if (rowClass === classId) return true
  const cls = dealClasses.find((c) => c.id === classId)
  const className = cls?.name?.trim()
  return Boolean(className && rowClass === className)
}

type SharedNotifyPerson = {
  key: string
  name: string
  email?: string
}

function resolveSharedWithPeople(args: {
  allInvestors: boolean
  investorIds: string[]
  sponsorUserIds: string[]
  classIds: string[]
  investors: DealInvestorRow[]
  dealClasses: DealInvestorClass[]
  sponsorUserOptions: SponsorPickerOption[]
}): SharedNotifyPerson[] {
  const {
    allInvestors,
    investorIds,
    sponsorUserIds,
    classIds,
    investors,
    dealClasses,
    sponsorUserOptions,
  } = args
  const byKey = new Map<string, SharedNotifyPerson>()

  function addPerson(key: string, name: string, emailRaw?: string) {
    const k = key.trim().toLowerCase()
    if (!k || byKey.has(k)) return
    const email = emailRaw?.trim()
    byKey.set(k, {
      key: k,
      name: name.trim() || k,
      email: email && isUsableInvestorEmail(email) ? email : undefined,
    })
  }

  function addRow(row: DealInvestorRow) {
    const name = row.displayName?.trim() || row.id
    addPerson(row.id || name, name, row.userEmail)
    if (row.addedByIsCoSponsorOnDeal === true) {
      const uid = row.addedByUserId?.trim()
      const sponsorName = row.addedByDisplayName?.trim() || "Co-sponsor"
      addPerson(
        uid ? `sponsor:${uid}` : `sponsor:${sponsorName}`,
        sponsorName,
        row.addedByEmail,
      )
    }
  }

  if (allInvestors) {
    for (const row of investors) addRow(row)
  } else {
    for (const id of investorIds) {
      const row = investors.find((x) => x.id === id)
      if (row) addRow(row)
    }
    for (const classId of classIds) {
      for (const row of investors) {
        if (investorRowMatchesDealClass(row, classId, dealClasses)) addRow(row)
      }
    }
    for (const sponsorUid of sponsorUserIds) {
      const opt = sponsorUserOptions.find((x) => x.id === sponsorUid)
      const sponsorLabel = opt?.label?.trim() || sponsorUid
      addPerson(`sponsor:${sponsorUid}`, sponsorLabel)
      for (const row of lpInvestorsIncludedWhenSharingWithSponsorUser(
        sponsorUid,
        investors,
      )) {
        addRow(row)
      }
    }
  }

  return [...byKey.values()]
}

export function sharedAudienceSearchBlob(
  sharedDealClassIds: string[],
  sharedInvestorIds: string[],
  sharedWithAllInvestors: boolean,
  classes: DealInvestorClass[],
  investors: DealInvestorRow[],
): string {
  const parts: string[] = []
  for (const id of sharedDealClassIds) {
    const c = classes.find((x) => x.id === id)
    if (c?.name) parts.push(c.name)
  }
  if (sharedWithAllInvestors) {
    parts.push("All Investors", "investors")
  } else {
    for (const id of sharedInvestorIds) {
      const r = investors.find((x) => x.id === id)
      if (r) {
        parts.push(r.displayName, r.userEmail)
      }
    }
  }
  return parts.join(" ")
}

export function DocumentSharedWithPicker(args: {
  dealId: string
  idPrefix: string
  classIds: string[]
  investorIds: string[]
  sponsorUserIds: string[]
  allInvestors: boolean
  dealClasses: DealInvestorClass[]
  /** Investors on this deal (Investors tab / LP rows only). */
  investors: DealInvestorRow[]
  /** Sponsor users (deal roster); selecting one shares with all LPs they added. */
  sponsorUserOptions: SponsorPickerOption[]
  docName: string
  onClassChange: (classId: string, checked: boolean) => void
  onAllInvestorsChange: (checked: boolean) => void
  onInvestorChange: (investorRowId: string, checked: boolean) => void
  onSponsorUserChange: (sponsorUserId: string, checked: boolean) => void
}) {
  const {
    dealId,
    idPrefix,
    classIds,
    investorIds,
    sponsorUserIds,
    allInvestors,
    dealClasses,
    investors,
    sponsorUserOptions,
    docName,
    onClassChange,
    onAllInvestorsChange,
    onInvestorChange,
    onSponsorUserChange,
  } = args
  const triggerId = useId()
  const confirmModalTitleId = useId()
  const menuId = `${idPrefix}-shared-menu`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sendBusy, setSendBusy] = useState(false)
  const [audienceSearch, setAudienceSearch] = useState("")
  const [menuBox, setMenuBox] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
  } | null>(null)

  const summary = formatDocumentSharedWithSummary({
    classIds,
    investorIds,
    sponsorUserIds,
    allInvestors,
    classes: dealClasses,
    investors,
    sponsorUserOptions,
  })

  const audienceSearchNorm = audienceSearch.trim().toLowerCase()

  function matchesAudienceSearch(...parts: Array<string | null | undefined>) {
    if (!audienceSearchNorm) return true
    return parts.some((p) =>
      String(p ?? "")
        .toLowerCase()
        .includes(audienceSearchNorm),
    )
  }

  const filteredDealClasses = useMemo(
    () =>
      dealClasses.filter(
        (c) =>
          c.id.trim() &&
          matchesAudienceSearch(c.name, c.id),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matchesAudienceSearch closes over audienceSearchNorm
    [dealClasses, audienceSearchNorm],
  )

  const filteredSponsorOptions = useMemo(
    () =>
      sponsorUserOptions.filter((s) =>
        matchesAudienceSearch(s.label, s.id),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sponsorUserOptions, audienceSearchNorm],
  )

  const filteredInvestors = useMemo(
    () =>
      investors.filter(
        (r) =>
          r.id.trim() &&
          matchesAudienceSearch(r.displayName, r.userEmail, r.id),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [investors, audienceSearchNorm],
  )

  const hasAudienceSelection =
    allInvestors ||
    investorIds.length > 0 ||
    classIds.length > 0 ||
    sponsorUserIds.length > 0

  const notifyPeople = useMemo(
    () =>
      resolveSharedWithPeople({
        allInvestors,
        investorIds,
        sponsorUserIds,
        classIds,
        investors,
        dealClasses,
        sponsorUserOptions,
      }),
    [
      allInvestors,
      investorIds,
      sponsorUserIds,
      classIds,
      investors,
      dealClasses,
      sponsorUserOptions,
    ],
  )

  const openNotifyConfirm = useCallback(() => {
    if (!hasAudienceSelection) {
      toast.error(
        "No one selected",
        "Select at least one deal class, sponsor user investors, or investor in Shared With first.",
      )
      return
    }
    if (notifyPeople.length === 0) {
      toast.error(
        "No recipients",
        "Selected investors could not be resolved for this document share.",
      )
      return
    }
    setIsOpen(false)
    setConfirmOpen(true)
  }, [hasAudienceSelection, notifyPeople.length])

  const handleConfirmSendNotification = useCallback(() => {
    const idTrim = dealId?.trim() ?? ""
    if (!idTrim) {
      toast.error("Save the deal", "Save the deal before sending notifications.")
      return
    }
    void (async () => {
      setSendBusy(true)
      try {
        const result = await postDealDocumentSharedNotification(idTrim, {
          audience: {
            all_investors: allInvestors,
            investor_ids: investorIds,
            sponsor_user_ids: sponsorUserIds,
            class_ids: classIds,
          },
          document_names: [docName.trim() || "Document"],
        })
        if (!result.ok) {
          toast.error("Could not send email", result.message)
          return
        }
        if (result.failures.length > 0) {
          toast.success(
            "Email partially sent",
            `Sent ${result.sent} of ${notifyPeople.length}. Some addresses failed.`,
          )
        } else {
          toast.success(
            "Email sent",
            `Notified ${result.sent} recipient${result.sent === 1 ? "" : "s"} that this document was shared.`,
          )
        }
        setConfirmOpen(false)
      } finally {
        setSendBusy(false)
      }
    })()
  }, [
    dealId,
    docName,
    allInvestors,
    investorIds,
    sponsorUserIds,
    classIds,
    notifyPeople.length,
  ])

  const updateMenuBox = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const margin = 10
    const vw = window.innerWidth
    const vh = window.innerHeight
    const minW = Math.min(20 * 16, vw - 2 * margin)
    const maxW = Math.min(26 * 16, vw - 2 * margin)
    const width = Math.min(maxW, Math.max(minW, Math.max(r.width, minW)))
    let left = r.left
    if (left + width > vw - margin) left = vw - margin - width
    if (left < margin) left = margin

    const gap = 4
    const spaceBelow = vh - r.bottom - margin
    const spaceAbove = r.top - margin
    const maxPanel = 20 * 16
    const openDown = spaceBelow >= Math.min(220, spaceAbove)

    let next: { top: number; left: number; width: number; maxHeight: number }
    if (openDown) {
      const maxHeight = Math.max(180, Math.min(maxPanel, spaceBelow - gap))
      next = { top: r.bottom + gap, left, width, maxHeight }
    } else {
      const maxHeight = Math.max(180, Math.min(maxPanel, spaceAbove - gap))
      const top = Math.max(margin, r.top - maxHeight - gap)
      next = { top, left, width, maxHeight }
    }

    setMenuBox((prev) => {
      if (
        prev &&
        prev.top === next.top &&
        prev.left === next.left &&
        prev.width === next.width &&
        prev.maxHeight === next.maxHeight
      )
        return prev
      return next
    })
  }, [])

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuBox(null)
      setAudienceSearch("")
      return
    }
    updateMenuBox()
    function onResize() {
      updateMenuBox()
    }
    function onScroll(e: Event) {
      const t = e.target
      if (t instanceof Node && menuRef.current?.contains(t)) return
      updateMenuBox()
    }
    window.addEventListener("resize", onResize)
    document.addEventListener("scroll", onScroll, true)
    return () => {
      window.removeEventListener("resize", onResize)
      document.removeEventListener("scroll", onScroll, true)
    }
  }, [isOpen, updateMenuBox])

  useLayoutEffect(() => {
    if (!isOpen || confirmOpen || !menuBox) return
    searchInputRef.current?.focus()
  }, [isOpen, confirmOpen, menuBox])

  useEffect(() => {
    if (!isOpen || confirmOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false)
    }
    function eventPathContainsMenuOrTrigger(e: Event): boolean {
      const path =
        typeof e.composedPath === "function" ? e.composedPath() : []
      for (const node of path) {
        if (node === triggerRef.current || node === menuRef.current) return true
      }
      const t = e.target
      if (!(t instanceof Node)) return false
      if (triggerRef.current?.contains(t)) return true
      if (menuRef.current?.contains(t)) return true
      return false
    }
    function onPointerDown(e: PointerEvent) {
      if (eventPathContainsMenuOrTrigger(e)) return
      setIsOpen(false)
    }
    // Defer so the opening click cannot immediately close the menu.
    const timer = window.setTimeout(() => {
      document.addEventListener("keydown", onKeyDown)
      document.addEventListener("pointerdown", onPointerDown, true)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("pointerdown", onPointerDown, true)
    }
  }, [isOpen, confirmOpen])

  useEffect(() => {
    if (!confirmOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !sendBusy) setConfirmOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [confirmOpen, sendBusy])

  const menuBody = (
    <>
      <div className="deal_docs_shared_with_menu_search_wrap">
        <input
          ref={searchInputRef}
          type="search"
          className="deal_docs_shared_with_menu_search"
          value={audienceSearch}
          onChange={(e) => setAudienceSearch(e.target.value)}
          placeholder="Search classes, sponsors, investors…"
          aria-label="Search shared with audience"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>
      <div className="deal_docs_shared_with_menu_scroll">
        <div className="deal_docs_shared_with_menu_section">
          <p className="deal_docs_shared_with_menu_heading">Deal classes</p>
          {dealClasses.length === 0 ? (
            <p className="deal_docs_shared_with_menu_empty">No deal classes yet.</p>
          ) : filteredDealClasses.length === 0 ? (
            <p className="deal_docs_shared_with_menu_empty">
              No classes match your search.
            </p>
          ) : (
            <ul className="deal_docs_shared_with_menu_list">
              {filteredDealClasses.map((c) => {
                const cid = c.id.trim()
                const checked = classIds.includes(cid)
                const oid = `${idPrefix}-class-${cid}`
                return (
                  <li key={cid}>
                    <label className="deal_docs_shared_with_menu_row" htmlFor={oid}>
                      <input
                        id={oid}
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => onClassChange(cid, e.target.checked)}
                      />
                      <span>{c.name.trim() || cid}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="deal_docs_shared_with_menu_section">
          <p className="deal_docs_shared_with_menu_heading">
            {SPONSOR_USER_INVESTORS_MENU_LABEL}
          </p>
          <p className="deal_docs_shared_with_menu_sub">
            Co-sponsor investors are included only when that co-sponsor chose No
            intercept. Yes intercept keeps the file with the co-sponsor.
          </p>
          {sponsorUserOptions.length === 0 ? (
            <p className="deal_docs_shared_with_menu_empty">
              No sponsor users on this deal yet.
            </p>
          ) : filteredSponsorOptions.length === 0 ? (
            <p className="deal_docs_shared_with_menu_empty">
              No sponsors match your search.
            </p>
          ) : (
            <ul className="deal_docs_shared_with_menu_list">
              {filteredSponsorOptions.map((s) => {
                const sid = s.id.trim()
                const checked = sponsorUserIds.includes(sid)
                const oid = `${idPrefix}-sponsor-user-${sid}`
                const lpCount = lpInvestorsAddedBySponsorUserId(sid, investors)
                  .length
                const includedCount =
                  lpInvestorsIncludedWhenSharingWithSponsorUser(
                    sid,
                    investors,
                  ).length
                const holds =
                  sponsorUserShareInterceptHoldsAtCoSponsor(sid, investors)
                return (
                  <li key={sid}>
                    <label className="deal_docs_shared_with_menu_row" htmlFor={oid}>
                      <input
                        id={oid}
                        type="checkbox"
                        checked={checked}
                        disabled={allInvestors}
                        onChange={(e) => onSponsorUserChange(sid, e.target.checked)}
                      />
                      <span className="deal_docs_shared_with_menu_inv_label">
                        <span className="deal_docs_shared_with_menu_inv_name">
                          {s.label}
                        </span>
                        {holds ? (
                          <span className="deal_docs_shared_with_menu_inv_email">
                            You only (Yes intercept) — {lpCount} investor
                            {lpCount === 1 ? "" : "s"} not included
                          </span>
                        ) : includedCount > 0 ? (
                          <span className="deal_docs_shared_with_menu_inv_email">
                            You and {includedCount} investor
                            {includedCount === 1 ? "" : "s"} (No intercept)
                          </span>
                        ) : lpCount > 0 ? (
                          <span className="deal_docs_shared_with_menu_inv_email">
                            {lpCount} investor{lpCount === 1 ? "" : "s"} on this deal
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="deal_docs_shared_with_menu_section">
          <p className="deal_docs_shared_with_menu_heading">Investors</p>
          <p className="deal_docs_shared_with_menu_sub">
            Individual LPs on this deal (Investors tab only).
          </p>
          <ul className="deal_docs_shared_with_menu_list">
            {(!audienceSearchNorm ||
              matchesAudienceSearch("all investors", "all")) && (
              <li key={`${idPrefix}-all-investors`}>
                <label
                  className="deal_docs_shared_with_menu_row"
                  htmlFor={`${idPrefix}-all-investors-cb`}
                >
                  <input
                    id={`${idPrefix}-all-investors-cb`}
                    type="checkbox"
                    checked={allInvestors}
                    onChange={(e) => onAllInvestorsChange(e.target.checked)}
                  />
                  <span>All Investors</span>
                </label>
              </li>
            )}
            {investors.length === 0 ? (
              <li className="deal_docs_shared_with_menu_empty_li">
                <p className="deal_docs_shared_with_menu_empty">
                  No investor rows on this deal yet.
                </p>
              </li>
            ) : filteredInvestors.length === 0 ? (
              <li className="deal_docs_shared_with_menu_empty_li">
                <p className="deal_docs_shared_with_menu_empty">
                  No investors match your search.
                </p>
              </li>
            ) : (
              filteredInvestors.map((r) => {
                const iid = r.id.trim()
                const checked = !allInvestors && investorIds.includes(iid)
                const oid = `${idPrefix}-inv-${iid}`
                const emailShown = displayEmail(r.userEmail)
                const nm = r.displayName.trim() || "—"
                return (
                  <li key={iid}>
                    <label className="deal_docs_shared_with_menu_row" htmlFor={oid}>
                      <input
                        id={oid}
                        type="checkbox"
                        checked={checked}
                        disabled={allInvestors}
                        onChange={(e) => onInvestorChange(iid, e.target.checked)}
                      />
                      <span className="deal_docs_shared_with_menu_inv_label">
                        <span className="deal_docs_shared_with_menu_inv_name">
                          {nm}
                        </span>
                        <span
                          className={`deal_docs_shared_with_menu_inv_email${
                            isDisplayableEmail(r.userEmail)
                              ? ""
                              : " um_status_muted"
                          }`}
                        >
                          {emailShown}
                        </span>
                      </span>
                    </label>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      </div>
    </>
  )

  return (
    <div
      className={`deal_docs_shared_with_root${isOpen && !confirmOpen ? " deal_docs_shared_with_root_open" : ""}`}
    >
      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        className="deal_docs_shared_with_summary"
        title={summary}
        aria-expanded={isOpen && !confirmOpen}
        aria-haspopup="dialog"
        aria-controls={menuId}
        aria-label={`Shared with for ${docName}. ${summary}. ${isOpen ? "Close" : "Open"} to change.`}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsOpen((o) => !o)
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="deal_docs_shared_with_summary_text">{summary}</span>
      </button>
      {isOpen && !confirmOpen && menuBox
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="deal_docs_shared_with_menu deal_docs_shared_with_menu_portal"
              role="dialog"
              aria-label={`Choose deal classes or investors for ${docName}`}
              aria-labelledby={triggerId}
              style={{
                position: "fixed",
                top: menuBox.top,
                left: menuBox.left,
                width: menuBox.width,
                maxHeight: menuBox.maxHeight,
                zIndex: 13000,
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <div className="deal_docs_shared_with_menu_top">
                <span className="deal_docs_shared_with_menu_top_label">Shared with</span>
                {hasAudienceSelection ? (
                  <button
                    type="button"
                    className="deal_docs_shared_with_mail_btn"
                    title="Send email notification"
                    aria-label={`Send email that ${docName} was shared`}
                    disabled={sendBusy}
                    onClick={(e) => {
                      e.stopPropagation()
                      openNotifyConfirm()
                    }}
                  >
                    <Mail size={15} strokeWidth={2} aria-hidden />
                    <span className="deal_docs_shared_with_mail_btn_label">
                      Send
                    </span>
                  </button>
                ) : null}
              </div>
              {menuBody}
            </div>,
            document.body,
          )
        : null}
      {confirmOpen
        ? createPortal(
            <div
              className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost deal_docs_shared_notify_overlay"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget && !sendBusy) setConfirmOpen(false)
              }}
            >
              <div
                className="um_modal deals_add_inv_modal_panel add_contact_panel deal_docs_shared_notify_modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={confirmModalTitleId}
              >
                <div className="um_modal_head add_contact_modal_head">
                  <h3
                    id={confirmModalTitleId}
                    className="um_modal_title add_contact_modal_title"
                  >
                    Send shared document email?
                  </h3>
                  <button
                    type="button"
                    className="um_modal_close"
                    aria-label="Close"
                    disabled={sendBusy}
                    onClick={() => setConfirmOpen(false)}
                  >
                    <X size={20} strokeWidth={2} aria-hidden />
                  </button>
                </div>
                <div className="deals_add_inv_modal_scroll">
                  <p className="deal_offering_muted">
                    The following {notifyPeople.length === 1 ? "person" : "people"}{" "}
                    will receive an email that{" "}
                    <strong>{docName}</strong> was shared with them on this deal:
                  </p>
                  <ul className="deal_docs_shared_notify_recipient_list">
                    {notifyPeople.map((r) => (
                      <li key={r.key}>
                        <strong>{r.name}</strong>
                        {r.email ? (
                          <span className="deal_docs_shared_notify_recipient_email">
                            {" "}
                            ({r.email})
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="um_modal_actions add_contact_modal_actions">
                  <button
                    type="button"
                    className="um_btn_secondary"
                    disabled={sendBusy}
                    onClick={() => setConfirmOpen(false)}
                  >
                    <X size={16} strokeWidth={2} aria-hidden />
                    No
                  </button>
                  <button
                    type="button"
                    className="um_btn_primary"
                    disabled={sendBusy}
                    onClick={handleConfirmSendNotification}
                  >
                    {sendBusy ? (
                      <>
                        <Loader2
                          size={16}
                          strokeWidth={2}
                          className="deals_deal_view_spinner"
                          aria-hidden
                        />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Mail size={16} strokeWidth={2} aria-hidden />
                        Yes, send email
                      </>
                    )}
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
