import { Loader2, Plus, X } from "lucide-react"
import "../../usermanagement/user_management.css"
import { useCallback, useEffect, useId, useState } from "react"
import {
  fetchOfferingShareRecipients,
  type OfferingShareRecipientDirectoryPayload,
  type OfferingShareRecipientOption,
} from "../api/offeringShareRecipientsApi"

const EMAIL_TAG_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i

export type OfferingShareEmailTag = {
  email: string
  label: string
}

type Props = {
  dealId: string
  /**
   * When set (e.g. from GET /deals/:id?includeShareDirectory=1), skip the separate
   * `/offering-share-recipients` request so directory works behind strict proxies.
   */
  prefetchedShareDirectory?: OfferingShareRecipientDirectoryPayload | null
  disabled?: boolean
  tags: OfferingShareEmailTag[]
  onChangeTags: (next: OfferingShareEmailTag[]) => void
}

export function OfferingPreviewShareEmailRecipientsAddon({
  dealId,
  prefetchedShareDirectory = null,
  disabled,
  tags,
  onChangeTags,
}: Props) {
  const [contacts, setContacts] = useState<OfferingShareRecipientOption[]>([])
  const [members, setMembers] = useState<OfferingShareRecipientOption[]>([])
  const [directoryLoading, setDirectoryLoading] = useState(true)
  const [directoryError, setDirectoryError] = useState<string | null>(null)
  const [directoryWarning, setDirectoryWarning] = useState<string | null>(null)
  const [manualDraft, setManualDraft] = useState("")
  const contactSectionId = useId()
  const contactSelectId = useId()
  const memberSelectId = useId()
  const manualSectionId = useId()
  const manualInputId = useId()
  const manualAddId = useId()
  const recipientsSectionId = useId()

  useEffect(() => {
    let cancelled = false
    if (prefetchedShareDirectory) {
      setDirectoryLoading(false)
      setDirectoryError(null)
      setDirectoryWarning(null)
      setContacts(prefetchedShareDirectory.contacts)
      setMembers(prefetchedShareDirectory.members)
      return undefined
    }
    setDirectoryLoading(true)
    setDirectoryError(null)
    setDirectoryWarning(null)
    void (async () => {
      try {
        const { contacts: c, members: m, directoryWarning: w } =
          await fetchOfferingShareRecipients(dealId.trim())
        if (!cancelled) {
          setContacts(c)
          setMembers(m)
          setDirectoryWarning(w?.trim() ? w.trim() : null)
        }
      } catch (e) {
        if (!cancelled) {
          setContacts([])
          setMembers([])
          setDirectoryWarning(null)
          setDirectoryError(
            e instanceof Error ? e.message : "Could not load directory.",
          )
        }
      } finally {
        if (!cancelled) setDirectoryLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dealId, prefetchedShareDirectory])

  const emailTaken = useCallback(
    (emailNorm: string) =>
      tags.some((t) => t.email.toLowerCase() === emailNorm.toLowerCase()),
    [tags],
  )

  const addTag = useCallback(
    (emailRaw: string, labelOverride?: string) => {
      const email = emailRaw.trim().toLowerCase()
      if (!EMAIL_TAG_RE.test(email)) return false
      if (emailTaken(email)) return true
      const fromDir = [...contacts, ...members].find((o) => o.email === email)
      const label =
        (labelOverride?.trim() ||
          fromDir?.label?.trim() ||
          emailRaw.trim()) ||
        email
      onChangeTags([...tags, { email, label }])
      return true
    },
    [contacts, members, emailTaken, onChangeTags, tags],
  )

  const removeTag = useCallback(
    (emailNorm: string) => {
      onChangeTags(
        tags.filter((t) => t.email.toLowerCase() !== emailNorm.toLowerCase()),
      )
    },
    [onChangeTags, tags],
  )

  const handleManualAdd = useCallback(() => {
    const raw = manualDraft.trim()
    if (!raw) return
    if (addTag(raw, raw)) setManualDraft("")
  }, [manualDraft, addTag])

  const dirEmpty =
    !directoryLoading &&
    !directoryError &&
    !directoryWarning &&
    contacts.length === 0 &&
    members.length === 0

  return (
    <div className="deal_offer_pf_share_recipients">
      <section
        className="deal_offer_pf_share_recipient_section"
        aria-labelledby={contactSectionId}
      >
        <h3
          id={contactSectionId}
          className="deal_offer_pf_share_recipient_section_title"
        >
          From your organization
        </h3>
        <div className="deal_offer_pf_share_recipient_fields">
          <div className="um_field deal_offer_pf_share_recipient_field">
            <label htmlFor={contactSelectId}>Contacts</label>
            <select
              id={contactSelectId}
              className="um_field_select deal_offer_pf_share_recipient_select"
              value=""
              disabled={disabled || directoryLoading || contacts.length === 0}
              aria-busy={directoryLoading}
              onChange={(e) => {
                const id = e.target.value
                e.target.value = ""
                if (!id) return
                const opt = contacts.find((c) => c.id === id)
                if (opt) addTag(opt.email, opt.label)
              }}
            >
              <option value="">
                {directoryLoading
                  ? "Loading contacts…"
                  : contacts.length === 0
                    ? "No contacts available"
                    : "Select a contact…"}
              </option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="um_field deal_offer_pf_share_recipient_field">
            <label htmlFor={memberSelectId}>Company members</label>
            <select
              id={memberSelectId}
              className="um_field_select deal_offer_pf_share_recipient_select"
              value=""
              disabled={disabled || directoryLoading || members.length === 0}
              onChange={(e) => {
                const id = e.target.value
                e.target.value = ""
                if (!id) return
                const opt = members.find((m) => m.id === id)
                if (opt) addTag(opt.email, opt.label)
              }}
            >
              <option value="">
                {directoryLoading
                  ? "Loading members…"
                  : members.length === 0
                    ? "No members available"
                    : "Select a member…"}
              </option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {directoryLoading ? (
          <p className="deal_offer_pf_share_recipient_dir_status" role="status">
            <Loader2
              size={14}
              strokeWidth={2}
              className="deal_offer_pf_share_loading_icon"
              aria-hidden
            />
            Loading organization directory…
          </p>
        ) : null}
        {directoryWarning ? (
          <p
            className="deal_offer_pf_share_modal_feedback deal_offer_pf_share_modal_feedback_warn"
            role="status"
          >
            {directoryWarning}
          </p>
        ) : null}
        {directoryError ? (
          <p
            className="deal_offer_pf_share_modal_feedback deal_offer_pf_share_modal_feedback_warn"
            role="alert"
          >
            {directoryError} You can still add email addresses manually below.
          </p>
        ) : null}
        {dirEmpty ? (
          <p className="deal_offer_pf_share_recipient_dir_empty" role="status">
            No contacts or company members are linked to this deal’s organization
            yet. Add recipient emails below.
          </p>
        ) : null}
      </section>

      <section
        className="deal_offer_pf_share_recipient_section"
        aria-labelledby={manualSectionId}
      >
        <h3 id={manualSectionId} className="deal_offer_pf_share_recipient_section_title">
          Add by email
        </h3>
        <div className="deal_offer_pf_share_recipient_manual_row">
          <input
            id={manualInputId}
            type="email"
            className="deal_offer_pf_share_recipient_manual_input"
            value={manualDraft}
            onChange={(e) => setManualDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleManualAdd()
              }
            }}
            placeholder="name@company.com"
            disabled={disabled}
            autoComplete="off"
            aria-label="Email address"
          />
          <button
            id={manualAddId}
            type="button"
            className="um_btn_secondary deal_offer_pf_share_recipient_manual_btn"
            disabled={disabled || !manualDraft.trim()}
            onClick={handleManualAdd}
          >
            <Plus size={16} strokeWidth={2} aria-hidden />
            Add
          </button>
        </div>
      </section>

      <section
        className="deal_offer_pf_share_recipient_section deal_offer_pf_share_recipient_section_tags"
        aria-labelledby={recipientsSectionId}
      >
        <div className="deal_offer_pf_share_recipient_tags_head">
          <h3
            id={recipientsSectionId}
            className="deal_offer_pf_share_recipient_tags_title"
          >
            Recipients
          </h3>
          <span className="deal_offer_pf_share_recipient_tags_count">
            {tags.length}
          </span>
        </div>
        <div className="deal_offer_pf_share_recipient_tags_panel">
          {tags.length === 0 ? (
            <p className="deal_offer_pf_share_recipient_tags_empty" role="status">
              Add at least one recipient to send the preview link.
            </p>
          ) : (
            <ul
              className="deal_offer_pf_share_recipient_tags"
              aria-label="Selected recipients"
            >
              {tags.map((t) => (
                <li key={t.email} className="deal_offer_pf_share_recipient_tag">
                  <span
                    className="deal_offer_pf_share_recipient_tag_text"
                    title={t.email}
                  >
                    {t.label}
                  </span>
                  <button
                    type="button"
                    className="deal_offer_pf_share_recipient_tag_remove"
                    disabled={disabled}
                    aria-label={`Remove ${t.email}`}
                    onClick={() => removeTag(t.email)}
                  >
                    <X size={14} strokeWidth={2} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
