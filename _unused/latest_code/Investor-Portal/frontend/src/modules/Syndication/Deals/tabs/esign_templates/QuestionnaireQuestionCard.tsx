import { ChevronDown, ChevronRight, Lock, Pencil, Plus, Save, Trash2 } from "lucide-react"
import { useCallback, useEffect, useId, useState } from "react"
import {
  resolveQuestionForDisplay,
  type InvestorQuestionnaireQuestion,
} from "./investorQuestionnaire.types"
import {
  QUESTIONNAIRE_TYPE_OPTIONS,
  fieldTypeDisplayLabel,
  fieldTypeUsesOptions,
} from "./investorQuestionnaireFieldTypes"
import type { InvestorQuestionnaireFieldType } from "./investorQuestionnaire.types"
import { QuestionnaireToggle } from "./QuestionnaireToggle"
import { DealsCreateDropdownSelect } from "../../components/DealsCreateDropdownSelect"

type QuestionDraft = {
  label: string
  fieldType: InvestorQuestionnaireFieldType
  subtext: string
  required: boolean
  options: string[]
}

function questionToDraft(question: InvestorQuestionnaireQuestion): QuestionDraft {
  return {
    label: question.label,
    fieldType: question.fieldType,
    subtext: question.subtext ?? "",
    required: question.required,
    options: question.options ?? [],
  }
}

type QuestionnaireQuestionCardProps = {
  question: InvestorQuestionnaireQuestion
  index: number
  canEdit: boolean
  saving: boolean
  defaultExpanded?: boolean
  /** Field is in a new section that is not saved yet — use Save / Edit per field. */
  pendingFieldWorkflow?: boolean
  fieldEditing?: boolean
  onToggleRequired: (questionId: string, required: boolean) => void
  onUpdateQuestion: (
    questionId: string,
    patch: Partial<
      Pick<
        InvestorQuestionnaireQuestion,
        "label" | "fieldType" | "subtext" | "required" | "options"
      >
    >,
  ) => void
  onDeleteQuestion: (question: InvestorQuestionnaireQuestion) => void
  onSaveField?: (questionId: string) => void
  onEditField?: (questionId: string) => void
}

export function QuestionnaireQuestionCard({
  question,
  index,
  canEdit,
  saving,
  onToggleRequired,
  onUpdateQuestion,
  onDeleteQuestion,
  defaultExpanded = false,
  pendingFieldWorkflow = false,
  fieldEditing = false,
  onSaveField,
  onEditField,
}: QuestionnaireQuestionCardProps) {
  const q = resolveQuestionForDisplay(question)
  const [expanded, setExpanded] = useState(
    defaultExpanded || (pendingFieldWorkflow && fieldEditing),
  )
  const [draft, setDraft] = useState<QuestionDraft>(() => questionToDraft(question))

  useEffect(() => {
    if (defaultExpanded) setExpanded(true)
  }, [defaultExpanded])

  useEffect(() => {
    if (pendingFieldWorkflow && fieldEditing) {
      setDraft(questionToDraft(question))
      setExpanded(true)
    }
  }, [pendingFieldWorkflow, fieldEditing, question])

  const baseId = useId()
  const labelFieldId = `${baseId}-label`
  const typeFieldId = `${baseId}-type`
  const subtextFieldId = `${baseId}-subtext`
  const requiredId = `${baseId}-required`
  const requiredLabelId = `${baseId}-required-label`
  const panelId = `${baseId}-panel`

  const disabled = !canEdit
  const actionsDisabled = !canEdit || saving
  const defaultLocked = Boolean(q.isDefault)
  const coreDisabled = disabled || defaultLocked
  const optionsLocked = defaultLocked
  const showOptions = fieldTypeUsesOptions(
    pendingFieldWorkflow && fieldEditing ? draft.fieldType : q.fieldType,
  )
  const options =
    pendingFieldWorkflow && fieldEditing ? draft.options : (q.options ?? [])

  const applyDraft = useCallback(() => {
    const patch: Partial<
      Pick<
        InvestorQuestionnaireQuestion,
        "label" | "fieldType" | "subtext" | "required" | "options"
      >
    > = {
      label: draft.label,
      fieldType: draft.fieldType,
      subtext: draft.subtext,
      required: draft.required,
    }
    if (fieldTypeUsesOptions(draft.fieldType)) {
      patch.options = draft.options.map((o) => o.trim()).filter(Boolean)
    } else {
      patch.options = []
    }
    onUpdateQuestion(question.id, patch)
  }, [draft, onUpdateQuestion, question.id])

  const handleSaveField = useCallback(() => {
    if (!draft.label.trim()) return
    if (
      fieldTypeUsesOptions(draft.fieldType) &&
      draft.options.map((o) => o.trim()).filter(Boolean).length === 0
    ) {
      return
    }
    applyDraft()
    onSaveField?.(question.id)
    setExpanded(false)
  }, [applyDraft, draft, onSaveField, question.id])

  const viewMode = pendingFieldWorkflow && !fieldEditing
  const editMode = pendingFieldWorkflow && fieldEditing

  return (
    <li
      className={`deal_esign_questionnaire_question_card${defaultLocked ? " deal_esign_questionnaire_question_card_default" : ""}${expanded ? " deal_esign_questionnaire_question_card_expanded" : ""}${viewMode ? " deal_esign_questionnaire_question_card_saved" : ""}`}
    >
      <div className="deal_esign_questionnaire_question_body">
        <div className="deal_esign_questionnaire_question_summary">
          <button
            type="button"
            className="deal_esign_questionnaire_question_summary_btn"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((v) => !v)}
          >
            <div className="deal_esign_questionnaire_question_summary_text">
              <span className="deal_esign_questionnaire_question_index">
                Question {index + 1}
              </span>
              <span className="deal_esign_questionnaire_question_title">
                {q.label.trim() || "Untitled question"}
              </span>
            </div>
            <div className="deal_esign_questionnaire_question_head_end">
              {q.isDefault ? (
                <span className="deal_esign_questionnaire_default_badge" title="Built-in field">
                  <Lock size={11} strokeWidth={2.25} aria-hidden />
                  Default
                </span>
              ) : null}
              {canEdit && viewMode ? (
                <button
                  type="button"
                  className="deal_esign_questionnaire_field_edit_btn"
                  disabled={actionsDisabled}
                  aria-label={`Edit ${q.label || "question"}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onEditField?.(question.id)
                  }}
                >
                  <Pencil size={14} strokeWidth={2} aria-hidden />
                  Edit
                </button>
              ) : null}
              {expanded ? (
                <ChevronDown
                  size={18}
                  strokeWidth={2}
                  className="deal_esign_questionnaire_question_chevron"
                  aria-hidden
                />
              ) : (
                <ChevronRight
                  size={18}
                  strokeWidth={2}
                  className="deal_esign_questionnaire_question_chevron"
                  aria-hidden
                />
              )}
            </div>
          </button>
        </div>

        {expanded && viewMode ? (
          <div
            id={panelId}
            className="deal_esign_questionnaire_question_panel deal_esign_questionnaire_question_panel_view"
            role="region"
            aria-label={`Saved settings for ${q.label}`}
          >
            <dl className="deal_esign_questionnaire_field_view_list">
              <div className="deal_esign_questionnaire_field_view_row">
                <dt>Label</dt>
                <dd>{q.label.trim() || "—"}</dd>
              </div>
              <div className="deal_esign_questionnaire_field_view_row">
                <dt>Type</dt>
                <dd>{fieldTypeDisplayLabel(q.fieldType)}</dd>
              </div>
              {fieldTypeUsesOptions(q.fieldType) && (q.options?.length ?? 0) > 0 ? (
                <div className="deal_esign_questionnaire_field_view_row">
                  <dt>Options</dt>
                  <dd>{q.options!.join(", ")}</dd>
                </div>
              ) : null}
              <div className="deal_esign_questionnaire_field_view_row">
                <dt>Subtext</dt>
                <dd>{q.subtext?.trim() || "—"}</dd>
              </div>
              <div className="deal_esign_questionnaire_field_view_row">
                <dt>Required</dt>
                <dd>{q.required ? "Yes" : "No"}</dd>
              </div>
            </dl>
          </div>
        ) : null}

        {expanded && !viewMode ? (
          <div
            id={panelId}
            className="deal_esign_questionnaire_question_panel"
            role="region"
            aria-label={`Settings for ${q.label}`}
          >
            {defaultLocked ? (
              <p className="deal_esign_questionnaire_default_hint" role="note">
                Built-in field — label, type, and options are fixed. You can adjust
                subtext and whether the field is required.
              </p>
            ) : null}
            <div className="deal_esign_questionnaire_field">
              <label htmlFor={labelFieldId} className="deal_esign_questionnaire_field_label">
                Label
                <span className="deal_esign_questionnaire_field_required" aria-hidden>
                  *
                </span>
              </label>
              <input
                id={labelFieldId}
                type="text"
                className={`deal_esign_questionnaire_field_input${defaultLocked ? " deal_esign_questionnaire_field_input_locked" : ""}`}
                value={editMode ? draft.label : q.label}
                placeholder="Enter question label"
                disabled={coreDisabled}
                readOnly={defaultLocked}
                aria-readonly={defaultLocked}
                onChange={(e) => {
                  if (editMode) {
                    setDraft((d) => ({ ...d, label: e.target.value }))
                  } else {
                    onUpdateQuestion(question.id, { label: e.target.value })
                  }
                }}
              />
            </div>

            <div className="deal_esign_questionnaire_field">
              <label htmlFor={typeFieldId} className="deal_esign_questionnaire_field_label">
                Type
                <span className="deal_esign_questionnaire_field_required" aria-hidden>
                  *
                </span>
              </label>
              <DealsCreateDropdownSelect
                id={typeFieldId}
                options={QUESTIONNAIRE_TYPE_OPTIONS.map((opt) => ({
                  value: opt.value,
                  label: opt.label,
                }))}
                value={editMode ? draft.fieldType : q.fieldType}
                disabled={coreDisabled}
                onChange={(next) => {
                  const fieldType = next as InvestorQuestionnaireFieldType
                  if (editMode) {
                    setDraft((d) => ({
                      ...d,
                      fieldType,
                      options: fieldTypeUsesOptions(fieldType)
                        ? d.options.length
                          ? d.options
                          : [""]
                        : [],
                    }))
                  } else if (fieldTypeUsesOptions(fieldType)) {
                    onUpdateQuestion(question.id, {
                      fieldType,
                      options:
                        question.options?.length ? question.options : [""],
                    })
                  } else {
                    onUpdateQuestion(question.id, { fieldType, options: [] })
                  }
                }}
                ariaLabel="Field type"
                className={
                  defaultLocked
                    ? "deal_esign_questionnaire_field_input_locked"
                    : undefined
                }
              />
            </div>

            {showOptions ? (
              <div className="deal_esign_questionnaire_field">
                <span className="deal_esign_questionnaire_field_label">
                  Options
                  <span className="deal_esign_questionnaire_field_required" aria-hidden>
                    *
                  </span>
                </span>
                <ol className="deal_esign_questionnaire_options_list">
                  {options.map((option, optionIndex) => (
                    <li
                      key={`${q.id}-opt-${optionIndex}`}
                      className="deal_esign_questionnaire_option_row"
                    >
                      <label
                        className="deal_esign_questionnaire_option_label"
                        htmlFor={`${q.id}-opt-input-${optionIndex}`}
                      >
                        Option {optionIndex + 1}
                        <span className="deal_esign_questionnaire_field_required" aria-hidden>
                          *
                        </span>
                      </label>
                      <div className="deal_esign_questionnaire_option_input_row">
                        {optionsLocked ? (
                          <span className="deal_esign_questionnaire_option_readonly">
                            {option}
                          </span>
                        ) : (
                          <input
                            id={`${q.id}-opt-input-${optionIndex}`}
                            type="text"
                            className="deal_esign_questionnaire_field_input deal_esign_questionnaire_option_input"
                            value={option}
                            placeholder={`Option ${optionIndex + 1}`}
                            disabled={coreDisabled}
                            aria-label={`Option ${optionIndex + 1}`}
                            onChange={(e) => {
                              const next = [...options]
                              next[optionIndex] = e.target.value
                              if (editMode) {
                                setDraft((d) => ({ ...d, options: next }))
                              } else {
                                onUpdateQuestion(question.id, { options: next })
                              }
                            }}
                          />
                        )}
                        {canEdit && !optionsLocked && options.length > 1 ? (
                          <button
                            type="button"
                            className="deal_esign_questionnaire_option_remove"
                            disabled={actionsDisabled}
                            aria-label={`Remove option ${optionIndex + 1}`}
                            onClick={() => {
                              const next = options.filter((_, i) => i !== optionIndex)
                              if (editMode) {
                                setDraft((d) => ({ ...d, options: next }))
                              } else {
                                onUpdateQuestion(question.id, { options: next })
                              }
                            }}
                          >
                            <Trash2 size={14} strokeWidth={2} aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
                {canEdit && !optionsLocked ? (
                  <button
                    type="button"
                    className="deal_esign_questionnaire_option_add"
                    disabled={actionsDisabled}
                    onClick={() => {
                      const next = [...options, ""]
                      if (editMode) {
                        setDraft((d) => ({ ...d, options: next }))
                      } else {
                        onUpdateQuestion(question.id, { options: next })
                      }
                    }}
                  >
                    <Plus size={16} strokeWidth={2} aria-hidden />
                    Add option
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="deal_esign_questionnaire_field">
              <label htmlFor={subtextFieldId} className="deal_esign_questionnaire_field_label">
                Subtext
              </label>
              <input
                id={subtextFieldId}
                type="text"
                className="deal_esign_questionnaire_field_input"
                value={editMode ? draft.subtext : (q.subtext ?? "")}
                placeholder="Enter subtext"
                disabled={disabled}
                onChange={(e) => {
                  if (editMode) {
                    setDraft((d) => ({ ...d, subtext: e.target.value }))
                  } else {
                    onUpdateQuestion(question.id, { subtext: e.target.value })
                  }
                }}
              />
            </div>

            <div className="deal_esign_questionnaire_question_foot">
              <div className="deal_esign_questionnaire_required_row">
                <span
                  id={requiredLabelId}
                  className="deal_esign_questionnaire_required_label"
                >
                  Required
                </span>
                <QuestionnaireToggle
                  id={requiredId}
                  labelId={requiredLabelId}
                  checked={editMode ? draft.required : q.required}
                  disabled={coreDisabled}
                  compact
                  onChange={(required) => {
                    if (editMode) {
                      setDraft((d) => ({ ...d, required }))
                    } else {
                      onToggleRequired(question.id, required)
                    }
                  }}
                />
              </div>
              <div className="deal_esign_questionnaire_question_foot_actions">
                {editMode ? (
                  <button
                    type="button"
                    className="um_btn_primary deal_esign_questionnaire_field_save_btn"
                    disabled={
                      actionsDisabled ||
                      !draft.label.trim() ||
                      (fieldTypeUsesOptions(draft.fieldType) &&
                        draft.options.map((o) => o.trim()).filter(Boolean).length ===
                          0)
                    }
                    onClick={handleSaveField}
                  >
                    <Save size={14} strokeWidth={2} aria-hidden />
                    Save
                  </button>
                ) : null}
                {canEdit && !q.isDefault && !editMode ? (
                  <button
                    type="button"
                    className="deal_esign_questionnaire_delete_btn"
                    disabled={actionsDisabled}
                    onClick={() => onDeleteQuestion(question)}
                  >
                    <Trash2 size={14} strokeWidth={2} aria-hidden />
                    Delete
                  </button>
                ) : null}
                {canEdit && editMode && !q.isDefault ? (
                  <button
                    type="button"
                    className="deal_esign_questionnaire_delete_btn"
                    disabled={actionsDisabled}
                    onClick={() => onDeleteQuestion(question)}
                  >
                    <Trash2 size={14} strokeWidth={2} aria-hidden />
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {!expanded && !pendingFieldWorkflow ? (
          <div className="deal_esign_questionnaire_question_collapsed_foot">
            <div className="deal_esign_questionnaire_required_row">
              <span
                id={requiredLabelId}
                className="deal_esign_questionnaire_required_label"
              >
                Required
              </span>
              <QuestionnaireToggle
                id={requiredId}
                labelId={requiredLabelId}
                checked={q.required}
                disabled={coreDisabled}
                compact
                onChange={(required) => onToggleRequired(question.id, required)}
              />
            </div>
          </div>
        ) : null}
      </div>
    </li>
  )
}
