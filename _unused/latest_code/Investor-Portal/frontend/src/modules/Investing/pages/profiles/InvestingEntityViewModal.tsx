import { useEffect } from "react"
import type { LucideIcon } from "lucide-react"
import {
  Calendar,
  CircleCheck,
  FileText,
  Hash,
  Mail,
  MapPin,
  Pencil,
  Phone,
  IdCard,
  User,
  X,
} from "lucide-react"
import { createPortal } from "react-dom"
import { ViewReadonlyField } from "@/common/components/ViewReadonlyField"
import "@/modules/Syndication/Deals/tabs/investors/add-investment-modal.css"
import "@/modules/Syndication/contacts/contacts.css"
import "@/modules/Syndication/usermanagement/user_management.css"
import "./add-investor-profile-modal.css"
import "./investing-profiles-form-modals.css"
import "./investing-profiles.css"

type DetailRow = { label: string; value: string }

export type InvestingEntityViewSection = {
  heading: string
  rows: DetailRow[]
}

type InvestingEntityViewModalProps = {
  open: boolean
  onClose: () => void
  title: string
  /** Screen reader / subtitle under title */
  description?: string
  /** Flat field list (beneficiary / address view). Ignored when `sections` is set. */
  rows?: DetailRow[]
  /** Grouped fields (full investor profile view). */
  sections?: InvestingEntityViewSection[]
  /** Shown beside Close — typically navigates to the edit flow. */
  onEdit?: () => void
  editLabel?: string
}

const PROFILE_RECORD_SECTION_HEADING = "Profile record"
const PROFILE_TYPE_SECTION_HEADING = "Profile type"

function slugFromLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function viewFieldIconForLabel(label: string): LucideIcon {
  const t = label.toLowerCase()
  if (t.includes("email")) return Mail
  if (t.includes("phone")) return Phone
  if (
    t.includes("country") ||
    t.includes("city") ||
    t.includes("state") ||
    t.includes("region") ||
    t.includes("zip") ||
    t.includes("street") ||
    t === "address" ||
    t.includes("name / company") ||
    t.includes("mailing")
  ) {
    return MapPin
  }
  if (t.includes("profile name") || (t.includes("type") && t.includes("profile")))
    return IdCard
  if (t.includes("relationship") || t.includes("name")) return User
  if (t.includes("date")) return Calendar
  if (t.includes("status") || t.includes("investment") || t.includes("added by"))
    return CircleCheck
  if (
    t.includes("tax id") ||
    t.includes("ssn") ||
    t.includes("ein") ||
    t.includes("routing") ||
    t.includes("account number")
  )
    return Hash
  if (t.includes("memo") || t.includes("note") || t.includes("distribution"))
    return FileText
  return FileText
}

function isFullWidthViewLabel(label: string): boolean {
  const t = label.toLowerCase()
  return (
    t.includes("address") ||
    t.includes("memo") ||
    t.includes("note") ||
    t.includes("street") ||
    t.includes("mailing") ||
    t.includes("beneficiary") ||
    t.includes("bank address") ||
    t.includes("distribution")
  )
}

function isMonoViewLabel(label: string): boolean {
  const t = label.toLowerCase()
  return (
    t.includes("account number") ||
    t.includes("routing") ||
    t.includes("ssn") ||
    t.includes("itin") ||
    t.includes("ein") ||
    t.includes("tax id")
  )
}

function ViewFieldGrid({
  rows,
  gridClassName,
}: {
  rows: DetailRow[]
  gridClassName?: string
}) {
  return (
    <div
      className={["um_view_grid contacts_view_modal_grid", gridClassName]
        .filter(Boolean)
        .join(" ")}
    >
      {rows.map((r, i) => {
        const v = r.value.trim() || "—"
        const Icon = viewFieldIconForLabel(r.label)
        return (
          <ViewReadonlyField
            key={`${slugFromLabel(r.label)}-${i}`}
            Icon={Icon}
            label={r.label}
            value={v}
            fieldClassName={[
              isFullWidthViewLabel(r.label) ? "um_view_field_span_full" : "",
              isMonoViewLabel(r.label) ? "um_view_field_mono" : "",
            ]
              .filter(Boolean)
              .join(" ") || undefined}
          />
        )
      })}
    </div>
  )
}

function ProfileSummaryStrip({
  profileTypeLabel,
  metaRows,
}: {
  profileTypeLabel?: string
  metaRows: DetailRow[]
}) {
  if (!profileTypeLabel && metaRows.length === 0) return null

  return (
    <div className="investing_profile_view_summary" role="group" aria-label="Profile summary">
      {profileTypeLabel ? (
        <span className="investing_profile_view_type_badge">{profileTypeLabel}</span>
      ) : null}
      {metaRows.map((row, i) => {
        const value = row.value.trim() || "—"
        return (
          <div key={`${slugFromLabel(row.label)}-${i}`} className="investing_profile_view_summary_item">
            <span className="investing_profile_view_summary_label">{row.label}</span>
            <span className="investing_profile_view_summary_value">{value}</span>
          </div>
        )
      })}
    </div>
  )
}

function ProfileDocumentViewBody({
  profileTitle,
  sections,
  description,
  onClose,
  onEdit,
  editLabel,
}: {
  profileTitle: string
  sections: InvestingEntityViewSection[]
  description?: string
  onClose: () => void
  onEdit?: () => void
  editLabel: string
}) {
  const profileTypeSection = sections.find(
    (s) => s.heading === PROFILE_TYPE_SECTION_HEADING,
  )
  const profileTypeLabel = profileTypeSection?.rows[0]?.value?.trim()

  const metaSection = sections.find(
    (s) => s.heading === PROFILE_RECORD_SECTION_HEADING,
  )
  const metaRows =
    metaSection?.rows.filter((r) => r.label.trim().toLowerCase() !== "profile name") ??
    []

  const contentSections = sections.filter(
    (s) =>
      s.heading &&
      s.heading !== PROFILE_RECORD_SECTION_HEADING &&
      s.heading !== PROFILE_TYPE_SECTION_HEADING,
  )

  return (
    <>
      <div className="um_modal_head add_contact_modal_head investing_profile_view_head">
        <div className="add_contact_modal_head_main">
          <h2
            id="investing-view-modal-title"
            className="um_modal_title add_contact_modal_title"
          >
            {profileTitle}
          </h2>
          {description ? (
            <p
              id="investing-view-modal-desc"
              className="investing_profile_view_desc"
            >
              {description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="um_modal_close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={20} strokeWidth={2} aria-hidden />
        </button>
      </div>

      <div className="deals_add_inv_modal_scroll investing_profile_view_scroll">
        <ProfileSummaryStrip
          profileTypeLabel={profileTypeLabel || undefined}
          metaRows={metaRows}
        />
        <div className="investing_profile_view_cards">
          {contentSections.map((section, idx) => (
            <section
              key={section.heading || `section-${idx}`}
              className="investing_profile_view_card"
              aria-label={section.heading}
            >
              <h3 className="investing_profile_view_card_title">{section.heading}</h3>
              <ViewFieldGrid
                rows={section.rows}
                gridClassName="investing_profile_view_grid"
              />
            </section>
          ))}
        </div>
      </div>

      <div className="um_modal_actions add_contact_modal_actions investing_profile_view_footer">
        <button
          type="button"
          className="um_btn_secondary investing_profile_view_close_btn"
          onClick={onClose}
        >
          <X size={16} strokeWidth={2} aria-hidden />
          Close
        </button>
        {onEdit ? (
          <button type="button" className="um_btn_primary" onClick={onEdit}>
            <Pencil size={16} strokeWidth={2} aria-hidden />
            {editLabel}
          </button>
        ) : null}
      </div>
    </>
  )
}

export function InvestingEntityViewModal({
  open,
  onClose,
  title,
  description,
  rows = [],
  sections,
  onEdit,
  editLabel = "Edit",
}: InvestingEntityViewModalProps) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const isProfileWizard =
    sections && sections.length > 0 && sections.some((s) => s.heading)

  const sectionList =
    sections && sections.length > 0
      ? sections
      : rows.length > 0
        ? [{ heading: "", rows }]
        : []

  return createPortal(
    <div
      className={`um_modal_overlay portal_modal_z_boost deals_add_inv_modal_overlay investing_ben_modal_overlay contacts_view_modal_overlay${
        isProfileWizard ? " investing_profile_view_overlay" : ""
      }`}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={
          isProfileWizard
            ? "um_modal um_modal_view deals_add_inv_modal_panel add_contact_panel investing_add_profile_form_panel investing_entity_view_modal investing_entity_view_modal--profile investing_entity_view_modal--wizard"
            : "um_modal um_modal_view deals_add_inv_modal_panel contacts_view_modal investing_entity_view_modal"
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="investing-view-modal-title"
        aria-describedby={description ? "investing-view-modal-desc" : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {isProfileWizard ? (
          <ProfileDocumentViewBody
            profileTitle={title}
            sections={sectionList}
            description={description}
            onClose={onClose}
            onEdit={onEdit}
            editLabel={editLabel}
          />
        ) : (
          <>
            <div className="um_modal_head add_contact_modal_head investing_entity_view_head">
              <div className="add_contact_modal_head_main">
                <h2
                  id="investing-view-modal-title"
                  className="um_modal_title add_contact_modal_title"
                >
                  {title}
                </h2>
                {description ? (
                  <p
                    id="investing-view-modal-desc"
                    className="investing_entity_view_lead"
                  >
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="um_modal_close"
                onClick={onClose}
                aria-label="Close"
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </div>
            <div className="deals_add_inv_modal_scroll investing_entity_view_scroll">
              {sectionList.map((section, idx) => (
                <section
                  key={section.heading || `section-${idx}`}
                  className="investing_entity_view_section"
                  aria-label={section.heading || undefined}
                >
                  {section.heading ? (
                    <h3 className="investing_entity_view_section_title">
                      {section.heading}
                    </h3>
                  ) : null}
                  <ViewFieldGrid rows={section.rows} />
                </section>
              ))}
            </div>
            <div className="um_modal_actions um_modal_actions_view contacts_view_modal_footer investing_entity_view_footer">
              <button
                type="button"
                className="um_btn_secondary contacts_view_modal_close_btn"
                onClick={onClose}
              >
                <X size={16} strokeWidth={2} aria-hidden />
                Close
              </button>
              {onEdit ? (
                <button type="button" className="um_btn_primary" onClick={onEdit}>
                  <Pencil size={16} strokeWidth={2} aria-hidden />
                  {editLabel}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
