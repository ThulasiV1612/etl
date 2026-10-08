import { Loader2, Send, Trash2 } from "lucide-react"
import { useCallback, useEffect, useId, useState } from "react"
import { toast } from "../../../../../common/components/Toast"
import { patchDealAnnouncement, type DealDetailApi } from "../../api/dealsApi"

type OfferingAnnouncementSectionProps = {
  dealId: string
  initialTitle?: string | null
  initialMessage?: string | null
  onSaved?: (deal: DealDetailApi) => void
}

export function OfferingAnnouncementSection({
  dealId,
  initialTitle,
  initialMessage,
  onSaved,
}: OfferingAnnouncementSectionProps) {
  const baseId = useId()
  const [title, setTitle] = useState(() => initialTitle?.trim() ?? "")
  const [message, setMessage] = useState(() => initialMessage?.trim() ?? "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setTitle(initialTitle?.trim() ?? "")
    setMessage(initialMessage?.trim() ?? "")
  }, [dealId, initialTitle, initialMessage])

  const storedTitle = (initialTitle ?? "").trim()
  const storedMessage = (initialMessage ?? "").trim()
  const isDirty =
    title.trim() !== storedTitle || message.trim() !== storedMessage

  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      const result = await patchDealAnnouncement(
        dealId,
        title.trim(),
        message.trim(),
      )
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      onSaved?.(result.deal)
      const t = result.deal.dealAnnouncementTitle?.trim() ?? ""
      const m = result.deal.dealAnnouncementMessage?.trim() ?? ""
      setTitle(t)
      setMessage(m)
      toast.success("Announcement published on the deal page.")
    } finally {
      setSaving(false)
    }
  }, [dealId, message, onSaved, saving, title])

  const handleClear = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      const result = await patchDealAnnouncement(dealId, "", "")
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      onSaved?.(result.deal)
      setTitle("")
      setMessage("")
      toast.success("Announcement removed from the deal page.")
    } finally {
      setSaving(false)
    }
  }, [dealId, onSaved, saving])

  const hasPublished = Boolean(storedTitle || storedMessage)

  return (
    <div className="deal_offering_announcement">
      <div className="deal_offering_announcement_fields">
        <div className="deal_offering_announcement_field">
          <label
            className="deal_offering_announcement_label"
            htmlFor={`${baseId}-title`}
          >
            Announcement title
          </label>
          <input
            id={`${baseId}-title`}
            type="text"
            className="deal_offering_announcement_input"
            placeholder="e.g. Q1 distribution scheduled"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="deal_offering_announcement_field">
          <label
            className="deal_offering_announcement_label"
            htmlFor={`${baseId}-body`}
          >
            Message
          </label>
          <textarea
            id={`${baseId}-body`}
            className="deal_offering_announcement_textarea"
            rows={5}
            placeholder="Write the announcement your team should see when they open this deal…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
      </div>
      <div className="deal_offering_announcement_actions um_modal_actions add_contact_modal_actions">
        <button
          type="button"
          className="um_btn_secondary add_contact_modal_actions_leading"
          disabled={saving || !hasPublished}
          onClick={() => void handleClear()}
          title={
            hasPublished
              ? "Remove announcement from the deal page"
              : "Nothing published yet"
          }
        >
          <Trash2 size={16} strokeWidth={2} aria-hidden />
          Clear published
        </button>
        <div className="add_contact_modal_actions_trailing">
          <button
            type="button"
            className="um_btn_primary"
            disabled={saving || !isDirty}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <>
                <Loader2
                  size={16}
                  strokeWidth={2}
                  className="deal_offering_btn_spin"
                  aria-hidden
                />
                Saving…
              </>
            ) : (
              <>
                <Send size={16} strokeWidth={2} aria-hidden />
                Publish to deal page
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
