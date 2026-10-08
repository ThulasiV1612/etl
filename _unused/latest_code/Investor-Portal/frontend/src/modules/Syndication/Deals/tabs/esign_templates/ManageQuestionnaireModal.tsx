import { Settings2, Sparkles, X } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { createPortal } from "react-dom"
import {
  ModalCancelButton,
  ModalFooterTrailing,
  ModalResetButton,
  ModalSaveButton,
} from "@/common/components/modal/ModalFooterButtons"
import { TableHScrollShell } from "@/common/components/data-table/TableHScrollShell"
import {
  ESIGN_ENTITY_CATEGORIES,
  ESIGN_ENTITY_CATEGORY_COLUMN_LABELS,
} from "./esignEntityCategories"
import {
  cloneProfileSectionVisibility,
  DEFAULT_INVESTOR_QUESTIONNAIRE_PROFILE_SECTION_VISIBILITY,
  isQuestionnaireSectionVisibleForProfile,
  isRecommendedQuestionnaireSectionForProfile,
  setQuestionnaireSectionVisibleForProfile,
} from "./investorQuestionnaireProfileVisibility"
import type {
  InvestorQuestionnaireProfileSectionVisibility,
  InvestorQuestionnaireSection,
} from "./investorQuestionnaire.types"
import { QuestionnaireToggle } from "./QuestionnaireToggle"

export interface ManageQuestionnaireModalProps {
  open: boolean
  sections: InvestorQuestionnaireSection[]
  visibility: InvestorQuestionnaireProfileSectionVisibility | undefined
  canEdit: boolean
  saving: boolean
  onClose: () => void
  onSave: (
    visibility: InvestorQuestionnaireProfileSectionVisibility | undefined,
  ) => void
}

export function ManageQuestionnaireModal({
  open,
  sections,
  visibility,
  canEdit,
  saving,
  onClose,
  onSave,
}: ManageQuestionnaireModalProps) {
  const titleId = useId()
  const [draftVisibility, setDraftVisibility] = useState<
    InvestorQuestionnaireProfileSectionVisibility | undefined
  >(visibility)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, saving, onClose])

  useEffect(() => {
    if (!open) return
    setDraftVisibility(visibility)
  }, [open, visibility])

  if (!open || typeof document === "undefined") return null

  const disabled = !canEdit || saving

  function handleSave() {
    const hasRules = draftVisibility && Object.keys(draftVisibility).length > 0
    onSave(hasRules ? draftVisibility : undefined)
    onClose()
  }

  function handleReset() {
    setDraftVisibility(
      cloneProfileSectionVisibility(
        DEFAULT_INVESTOR_QUESTIONNAIRE_PROFILE_SECTION_VISIBILITY,
      ),
    )
  }

  return createPortal(
    <div
      className="um_modal_overlay deals_add_inv_modal_overlay portal_modal_z_boost deal_esign_manage_q_overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <div
        className="um_modal um_modal_view deals_add_inv_modal_panel add_contact_panel deal_esign_manage_q_modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="um_modal_head add_contact_modal_head">
          <h3 id={titleId} className="um_modal_title add_contact_modal_title">
            <Settings2
              size={18}
              strokeWidth={2}
              aria-hidden
              className="deal_esign_manage_q_title_icon"
            />
            Manage Questionnaire
          </h3>
          <button
            type="button"
            className="um_modal_close"
            onClick={() => !saving && onClose()}
            disabled={saving}
            aria-label="Close"
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>
        {/* <p className="deal_esign_manage_q_desc">
          Choose which questionnaire sections appear on each investor profile&apos;s
          e-sign template. Cells marked{" "}
          <span className="deal_esign_manage_q_recommended_badge deal_esign_manage_q_recommended_badge_inline">
            Recommended
          </span>{" "}
          are turned on by default for that profile type.
        </p> */}
        <div className="deals_add_inv_modal_scroll deal_esign_manage_q_scroll">
          <TableHScrollShell ariaLabel="Questionnaire columns">
          <table className="deal_esign_manage_q_table">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  scope="col"
                  className="deal_esign_manage_q_th_section"
                >
                  Section
                </th>
                <th
                  scope="col"
                  colSpan={ESIGN_ENTITY_CATEGORIES.length}
                  className="deal_esign_manage_q_th_profiles_group"
                >
                  Profiles
                </th>
              </tr>
              <tr>
                {ESIGN_ENTITY_CATEGORIES.map((profile) => (
                  <th
                    key={profile.id}
                    scope="col"
                    className="deal_esign_manage_q_th_profile"
                    title={profile.label}
                  >
                    {ESIGN_ENTITY_CATEGORY_COLUMN_LABELS[profile.id] ??
                      profile.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <tr key={section.id}>
                  <th
                    scope="row"
                    className="deal_esign_manage_q_row_label"
                    title={section.label}
                  >
                    {section.label}
                  </th>
                  {ESIGN_ENTITY_CATEGORIES.map((profile) => {
                    const checked = isQuestionnaireSectionVisibleForProfile(
                      draftVisibility,
                      profile.id,
                      section.id,
                    )
                    const recommended =
                      isRecommendedQuestionnaireSectionForProfile(
                        profile.id,
                        section.id,
                      )
                    const toggleId = `manage-q-${section.id}-${profile.id}`
                    return (
                      <td key={profile.id} className="deal_esign_manage_q_cell">
                        <div className="deal_esign_manage_q_cell_control">
                          <QuestionnaireToggle
                            id={toggleId}
                            checked={checked}
                            disabled={disabled}
                            compact
                            ariaLabel={`${checked ? "Hide" : "Show"} ${section.label} for ${profile.label}${
                              recommended ? " (recommended on by default)" : ""
                            }`}
                            onChange={(next) => {
                              const updated =
                                setQuestionnaireSectionVisibleForProfile(
                                  draftVisibility,
                                  profile.id,
                                  section.id,
                                  next,
                                )
                              setDraftVisibility(
                                Object.keys(updated).length > 0
                                  ? updated
                                  : undefined,
                              )
                            }}
                          />
                          <span
                            className="deal_esign_manage_q_recommended_slot"
                            title={
                              recommended
                                ? `Recommended for ${profile.label}`
                                : undefined
                            }
                            aria-hidden={!recommended}
                          >
                            {recommended ? (
                              <span
                                className="deal_esign_manage_q_recommended_icon"
                                aria-label="Recommended for this profile"
                              >
                                <Sparkles size={8} strokeWidth={2} aria-hidden />
                              </span>
                            ) : null}
                          </span>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </TableHScrollShell>
          <p className="deal_esign_manage_q_note" role="note">
            <span className="deal_esign_manage_q_recommended_icon_note" aria-hidden>
              <Sparkles size={8} strokeWidth={2} />
            </span>
            <span>
              The icon marks sections we recommend turning on by default for that
              investor profile type.
            </span>
          </p>
        </div>
        <div className="um_modal_actions add_contact_modal_actions">
          <ModalCancelButton
            className="um_btn_secondary add_contact_modal_actions_leading"
            onClick={onClose}
            disabled={saving}
          />
          <ModalFooterTrailing>
            <ModalResetButton
              onClick={handleReset}
              disabled={disabled}
              title="Restore recommended defaults for all investor profiles"
            />
            <ModalSaveButton onClick={handleSave} disabled={disabled} busy={saving} />
          </ModalFooterTrailing>
        </div>
      </div>
    </div>,
    document.body,
  )
}
