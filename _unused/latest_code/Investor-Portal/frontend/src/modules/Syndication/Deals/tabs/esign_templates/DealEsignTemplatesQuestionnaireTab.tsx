import { Loader2, Lock, Pencil, Plus, Save, Settings2, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { TabsScrollStrip } from "@/common/components/tabs-scroll-strip/TabsScrollStrip"
import { toast } from "@/common/components/Toast"
import {
  fetchDealInvestorQuestionnaire,
  putDealInvestorQuestionnaire,
  type InvestorQuestionnaireConfig,
  type InvestorQuestionnaireQuestion,
  type InvestorQuestionnaireSection,
} from "@/modules/Syndication/Deals/api/dealsApi"
import {
  getDefaultInvestorQuestionnaireConfig,
  mergeQuestionnaireWithDefaults,
  questionsForSection,
  sortSections,
} from "./investorQuestionnaire.types"
import { ManageQuestionnaireModal } from "./ManageQuestionnaireModal"
import { QuestionnaireQuestionCard } from "./QuestionnaireQuestionCard"

interface DealEsignTemplatesQuestionnaireTabProps {
  dealId: string
  canEdit?: boolean
}

function sectionTabId(sectionId: string): string {
  return `deal-esign-q-section-${sectionId}`
}

export function DealEsignTemplatesQuestionnaireTab({
  dealId,
  canEdit = true,
}: DealEsignTemplatesQuestionnaireTabProps) {
  const [config, setConfig] = useState<InvestorQuestionnaireConfig>(() =>
    getDefaultInvestorQuestionnaireConfig(),
  )
  const [activeSectionId, setActiveSectionId] = useState("personal")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [sectionLabelDraft, setSectionLabelDraft] = useState("")
  const seededRef = useRef(false)
  const [expandQuestionId, setExpandQuestionId] = useState<string | null>(null)
  const [manageModalOpen, setManageModalOpen] = useState(false)
  /** Unsaved custom section — persisted only after Save section. */
  const [pendingSectionId, setPendingSectionId] = useState<string | null>(null)
  /** Custom fields in a pending section that are still being edited (not yet saved). */
  const [editingPendingQuestionIds, setEditingPendingQuestionIds] = useState<
    Set<string>
  >(() => new Set())

  const createCustomQuestion = useCallback(
    (sectionId: string, sortOrder: number): InvestorQuestionnaireQuestion => ({
      id: `question_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sectionId,
      label: "",
      sortOrder,
      required: false,
      fieldType: "text",
    }),
    [],
  )

  const saveGenerationRef = useRef(0)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const persist = useCallback(
    async (next: InvestorQuestionnaireConfig) => {
      if (!canEdit) return true
      const generation = ++saveGenerationRef.current
      setSaving(true)
      try {
        const result = await putDealInvestorQuestionnaire(dealId, next)
        if (generation !== saveGenerationRef.current) return true
        if (result.ok) {
          setConfig(mergeQuestionnaireWithDefaults(result.config).config)
          return true
        }
        toast.error("Could not save questionnaire", result.message)
        return false
      } finally {
        if (generation === saveGenerationRef.current) {
          setSaving(false)
        }
      }
    },
    [canEdit, dealId],
  )

  const schedulePersist = useCallback(
    (next: InvestorQuestionnaireConfig) => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current)
      }
      persistTimerRef.current = setTimeout(() => {
        persistTimerRef.current = null
        void persist(next)
      }, 450)
    },
    [persist],
  )

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current)
      }
    }
  }, [])

  const updateConfig = useCallback(
    (
      updater: (prev: InvestorQuestionnaireConfig) => InvestorQuestionnaireConfig,
      options?: {
        persist?: boolean
        persistImmediate?: boolean
        /** Save even while a new section is still pending. */
        forcePersist?: boolean
      },
    ) => {
      setConfig((prev) => {
        const next = updater(prev)
        const shouldPersist =
          options?.persist !== false &&
          canEdit &&
          (!pendingSectionId || options?.forcePersist)
        if (shouldPersist) {
          if (persistTimerRef.current) {
            clearTimeout(persistTimerRef.current)
            persistTimerRef.current = null
          }
          if (options?.persistImmediate || options?.forcePersist) {
            void persist(next)
          } else {
            schedulePersist(next)
          }
        }
        return next
      })
    },
    [canEdit, pendingSectionId, persist, schedulePersist],
  )

  useEffect(() => {
    let cancelled = false
    seededRef.current = false
    void (async () => {
      setLoading(true)
      const result = await fetchDealInvestorQuestionnaire(dealId)
      if (cancelled) return
      if (result.ok) {
        const isEmpty = result.config.sections.length === 0
        const merged = isEmpty
          ? {
              config: getDefaultInvestorQuestionnaireConfig(),
              needsUpdate: true,
            }
          : mergeQuestionnaireWithDefaults(result.config)
        const next = merged.config
        setConfig(next)
        const sections = sortSections(next.sections)
        if (sections.length > 0) {
          setActiveSectionId(sections[0]!.id)
        }
        const needsSeed = merged.needsUpdate
        if (canEdit && needsSeed && !seededRef.current) {
          seededRef.current = true
          const saveResult = await putDealInvestorQuestionnaire(dealId, next)
          if (!cancelled && saveResult.ok) {
            setConfig(
              mergeQuestionnaireWithDefaults(saveResult.config).config,
            )
          }
        }
      } else {
        toast.error("Could not load questionnaire", result.message)
        const fallback = getDefaultInvestorQuestionnaireConfig()
        setConfig(fallback)
        setActiveSectionId("personal")
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [canEdit, dealId])

  const sections = sortSections(config.sections)
  const activeSection =
    sections.find((s) => s.id === activeSectionId) ?? sections[0]
  const activeQuestions = activeSection
    ? questionsForSection(config.questions, activeSection.id)
    : []

  const questionInPendingSection = useCallback(
    (questionId: string) => {
      if (!pendingSectionId) return false
      return config.questions.some(
        (q) => q.id === questionId && q.sectionId === pendingSectionId,
      )
    },
    [config.questions, pendingSectionId],
  )

  const onToggleRequired = useCallback(
    (questionId: string, required: boolean) => {
      updateConfig(
        (prev) => ({
          ...prev,
          questions: prev.questions.map((q) =>
            q.id === questionId && !q.isDefault ? { ...q, required } : q,
          ),
        }),
        questionInPendingSection(questionId) ? { persist: false } : undefined,
      )
    },
    [questionInPendingSection, updateConfig],
  )

  const onUpdateQuestion = useCallback(
    (
      questionId: string,
      patch: Partial<
        Pick<
          InvestorQuestionnaireQuestion,
          | "label"
          | "fieldType"
          | "subtext"
          | "required"
          | "options"
          | "investorProfileFieldKey"
        >
      >,
    ) => {
      updateConfig(
        (prev) => ({
          ...prev,
          questions: prev.questions.map((q) => {
            if (q.id !== questionId) return q
            const safePatch = q.isDefault
              ? {
                  ...(patch.subtext !== undefined ? { subtext: patch.subtext } : {}),
                  ...(patch.options !== undefined ? { options: patch.options } : {}),
                }
              : patch
            const next = { ...q, ...safePatch }
            const subtext = next.subtext?.trim()
            if (!subtext) delete next.subtext
            else next.subtext = subtext
            const profileKey = next.investorProfileFieldKey?.trim()
            if (profileKey) next.investorProfileFieldKey = profileKey
            else delete next.investorProfileFieldKey
            if (next.fieldType === "radio" || next.fieldType === "checkboxes") {
              const opts = (next.options ?? [])
                .map((o) => o.trim())
                .filter(Boolean)
              if (opts.length > 0) next.options = opts
              else delete next.options
            } else {
              delete next.options
            }
            return next
          }),
        }),
        questionInPendingSection(questionId) ? { persist: false } : undefined,
      )
    },
    [questionInPendingSection, updateConfig],
  )

  const onDeleteQuestion = useCallback(
    (question: InvestorQuestionnaireQuestion) => {
      if (question.isDefault) return
      setEditingPendingQuestionIds((prev) => {
        const next = new Set(prev)
        next.delete(question.id)
        return next
      })
      updateConfig(
        (prev) => ({
          ...prev,
          questions: prev.questions.filter((q) => q.id !== question.id),
        }),
        question.sectionId === pendingSectionId
          ? { persist: false }
          : { persistImmediate: true },
      )
    },
    [pendingSectionId, updateConfig],
  )

  const markQuestionEditing = useCallback((questionId: string) => {
    setEditingPendingQuestionIds((prev) => {
      const next = new Set(prev)
      next.add(questionId)
      return next
    })
  }, [])

  const markQuestionSaved = useCallback((questionId: string) => {
    setEditingPendingQuestionIds((prev) => {
      const next = new Set(prev)
      next.delete(questionId)
      return next
    })
    setExpandQuestionId(null)
  }, [])

  const onSavePendingQuestionField = useCallback(
    (questionId: string) => {
      markQuestionSaved(questionId)
      toast.success("Field saved")
    },
    [markQuestionSaved],
  )

  const onEditPendingQuestionField = useCallback(
    (questionId: string) => {
      markQuestionEditing(questionId)
      setExpandQuestionId(questionId)
    },
    [markQuestionEditing],
  )

  const onAddField = useCallback(() => {
    if (!activeSection || activeSection.isDefault) return
    const question = createCustomQuestion(
      activeSection.id,
      activeQuestions.length,
    )
    setExpandQuestionId(question.id)
    if (activeSection.id === pendingSectionId) {
      markQuestionEditing(question.id)
    }
    updateConfig(
      (prev) => ({
        ...prev,
        questions: [...prev.questions, question],
      }),
      activeSection.id === pendingSectionId
        ? { persist: false }
        : { persistImmediate: true },
    )
  }, [
    activeSection,
    activeQuestions.length,
    createCustomQuestion,
    markQuestionEditing,
    pendingSectionId,
    updateConfig,
  ])

  const onAddSection = useCallback(() => {
    if (pendingSectionId) return
    const id = `section_${Date.now()}`
    const firstQuestion = createCustomQuestion(id, 0)
    updateConfig(
      (prev) => {
        const maxOrder = prev.sections.reduce(
          (m, s) => Math.max(m, s.sortOrder),
          -1,
        )
        const nextSection: InvestorQuestionnaireSection = {
          id,
          label: "New section",
          sortOrder: maxOrder + 1,
        }
        return {
          ...prev,
          sections: [...prev.sections, nextSection],
          questions: [...prev.questions, firstQuestion],
        }
      },
      { persist: false },
    )
    setPendingSectionId(id)
    setActiveSectionId(id)
    setEditingSectionId(id)
    setSectionLabelDraft("New section")
    setExpandQuestionId(firstQuestion.id)
    setEditingPendingQuestionIds(new Set([firstQuestion.id]))
  }, [createCustomQuestion, pendingSectionId, updateConfig])

  const onSavePendingSection = useCallback(() => {
    if (!pendingSectionId) return
    if (editingPendingQuestionIds.size > 0) {
      toast.error(
        "Unsaved fields",
        "Save each field in this section before saving the section.",
      )
      return
    }
    void (async () => {
      const label = sectionLabelDraft.trim() || "New section"
      const pendingId = pendingSectionId
      const next: InvestorQuestionnaireConfig = {
        ...config,
        sections: config.sections.map((s) =>
          s.id === pendingId ? { ...s, label } : s,
        ),
      }
      setConfig(next)
      const ok = await persist(next)
      if (!ok) return
      setPendingSectionId(null)
      setEditingSectionId(null)
      setEditingPendingQuestionIds(new Set())
      toast.success("Section saved")
    })()
  }, [config, editingPendingQuestionIds, pendingSectionId, persist, sectionLabelDraft])

  const onDiscardPendingSection = useCallback(() => {
    if (!pendingSectionId) return
    const discardId = pendingSectionId
    setConfig((prev) => {
      const remaining = sortSections(
        prev.sections.filter((s) => s.id !== discardId),
      )
      setActiveSectionId(remaining[0]?.id ?? "personal")
      return {
        ...prev,
        sections: remaining,
        questions: prev.questions.filter((q) => q.sectionId !== discardId),
      }
    })
    setPendingSectionId(null)
    setEditingSectionId(null)
    setExpandQuestionId(null)
    setEditingPendingQuestionIds(new Set())
  }, [pendingSectionId])

  const onRemoveSection = useCallback(
    (sectionId: string) => {
      const section = config.sections.find((s) => s.id === sectionId)
      if (!section || section.isDefault) return
      updateConfig(
        (prev) => ({
          ...prev,
          sections: prev.sections.filter((s) => s.id !== sectionId),
          questions: prev.questions.filter((q) => q.sectionId !== sectionId),
        }),
        { persistImmediate: true },
      )
      if (activeSectionId === sectionId) {
        const remaining = sortSections(
          config.sections.filter((s) => s.id !== sectionId),
        )
        setActiveSectionId(remaining[0]?.id ?? "personal")
      }
    },
    [activeSectionId, config.sections, updateConfig],
  )

  const commitSectionLabel = useCallback(
    (sectionId: string) => {
      const label = sectionLabelDraft.trim() || "New section"
      updateConfig(
        (prev) => ({
          ...prev,
          sections: prev.sections.map((s) =>
            s.id === sectionId ? { ...s, label } : s,
          ),
        }),
        sectionId === pendingSectionId ? { persist: false } : undefined,
      )
      if (sectionId !== pendingSectionId) {
        setEditingSectionId(null)
      }
    },
    [pendingSectionId, sectionLabelDraft, updateConfig],
  )

  return (
    <div
      className={`deal_esign_questionnaire_root${loading ? " deal_esign_questionnaire_root_loading" : ""}`}
      aria-busy={loading || saving}
    >
      {!canEdit ? (
        <p className="deal_esign_readonly_banner" role="note">
          You can view the investor questionnaire. Editing is restricted to the
          lead or admin sponsor.
        </p>
      ) : null}

      <div className="deal_esign_questionnaire_toolbar">
        <button
          type="button"
          className="um_btn_primary"
          disabled={loading || saving || Boolean(pendingSectionId)}
          onClick={() => setManageModalOpen(true)}
        >
          <Settings2 size={16} strokeWidth={2} aria-hidden />
          Manage Questionnaire
        </button>
      </div>

      <ManageQuestionnaireModal
        open={manageModalOpen}
        sections={sections}
        visibility={config.profileSectionVisibility}
        canEdit={canEdit}
        saving={saving}
        onClose={() => setManageModalOpen(false)}
        onSave={(profileSectionVisibility) => {
          updateConfig((prev) => ({
            ...prev,
            profileSectionVisibility,
          }), { persistImmediate: true })
        }}
      />

      <div className="deal_esign_questionnaire_sections_outer">
        <TabsScrollStrip scrollClassName="deal_esign_questionnaire_sections_scroll">
          <div
            className="deal_esign_questionnaire_sections_row"
            role="tablist"
            aria-label="Questionnaire sections"
          >
            {sections.map((section) => {
              const isActive = section.id === activeSectionId
              const isEditing = editingSectionId === section.id
              const isPending = section.id === pendingSectionId
              const tabId = sectionTabId(section.id)
              return (
                <div
                  key={section.id}
                  className={`deal_esign_questionnaire_section_tab${section.isDefault ? " deal_esign_questionnaire_section_tab_default" : ""}${isActive ? " deal_esign_questionnaire_section_tab_active" : ""}${isPending ? " deal_esign_questionnaire_section_tab_pending" : ""}`}
                >
                  <button
                    type="button"
                    id={tabId}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls="deal-esign-questionnaire-panel"
                    className="deal_esign_questionnaire_section_tab_btn"
                    onClick={() => {
                      setActiveSectionId(section.id)
                      setEditingSectionId(null)
                    }}
                  >
                    {isEditing ? (
                      <input
                        type="text"
                        className="deal_esign_questionnaire_section_edit_input"
                        value={sectionLabelDraft}
                        aria-label="Section name"
                        autoFocus
                        onChange={(e) => setSectionLabelDraft(e.target.value)}
                        onBlur={() => commitSectionLabel(section.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            commitSectionLabel(section.id)
                          }
                          if (e.key === "Escape") {
                            setEditingSectionId(null)
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span>{section.label}</span>
                    )}
                  </button>
                  {canEdit ? (
                    <>
                      {section.isDefault ? (
                        <span
                          className="deal_esign_questionnaire_section_default_mark"
                          title="Built-in section"
                          aria-label="Built-in section"
                        >
                          <Lock size={13} strokeWidth={2.25} aria-hidden />
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="deal_esign_questionnaire_section_icon_btn"
                          aria-label={`Rename ${section.label}`}
                          onClick={() => {
                            setActiveSectionId(section.id)
                            setEditingSectionId(section.id)
                            setSectionLabelDraft(section.label)
                          }}
                        >
                          <Pencil size={14} strokeWidth={2} aria-hidden />
                        </button>
                      )}
                      {!section.isDefault && !isPending ? (
                        <button
                          type="button"
                          className="deal_esign_questionnaire_section_icon_btn deal_esign_questionnaire_section_icon_btn_danger"
                          aria-label={`Remove ${section.label}`}
                          onClick={() => onRemoveSection(section.id)}
                        >
                          <X size={14} strokeWidth={2} aria-hidden />
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              )
            })}
            {canEdit ? (
              <button
                type="button"
                className="deal_esign_questionnaire_add_section_btn"
                aria-label="Add section"
                disabled={Boolean(pendingSectionId) || saving}
                title={
                  pendingSectionId
                    ? "Save or discard the new section first"
                    : undefined
                }
                onClick={onAddSection}
              >
                <Plus size={18} strokeWidth={2} aria-hidden />
              </button>
            ) : null}
          </div>
        </TabsScrollStrip>
      </div>

      <div
        id="deal-esign-questionnaire-panel"
        role="tabpanel"
        aria-labelledby={
          activeSection ? sectionTabId(activeSection.id) : undefined
        }
        className="deal_esign_questionnaire_panel"
      >
        {pendingSectionId && activeSectionId === pendingSectionId ? (
          <div
            className="deal_esign_questionnaire_section_draft_bar"
            role="region"
            aria-label="New section actions"
          >
            <p className="deal_esign_questionnaire_section_draft_text">
              Save this section to add it to the questionnaire, or discard to cancel.
            </p>
            <div className="deal_esign_questionnaire_section_draft_actions">
              <button
                type="button"
                className="um_btn_secondary deal_esign_questionnaire_section_draft_btn"
                disabled={saving}
                onClick={onDiscardPendingSection}
              >
                <X size={16} strokeWidth={2} aria-hidden />
                Discard
              </button>
              <button
                type="button"
                className="um_btn_primary deal_esign_questionnaire_section_draft_btn"
                disabled={saving}
                onClick={onSavePendingSection}
              >
                {saving ? (
                  <Loader2 size={16} strokeWidth={2} aria-hidden />
                ) : (
                  <Save size={16} strokeWidth={2} aria-hidden />
                )}
                {saving ? "Saving…" : "Save section"}
              </button>
            </div>
          </div>
        ) : null}
        {activeSection ? (
          <ul
            className="deal_esign_questionnaire_questions"
            aria-label={`Questions in ${activeSection.label}`}
          >
            {activeQuestions.map((question, index) => {
              const inPendingSection = question.sectionId === pendingSectionId
              const fieldEditing =
                inPendingSection && editingPendingQuestionIds.has(question.id)
              return (
                <QuestionnaireQuestionCard
                  key={question.id}
                  question={question}
                  index={index}
                  canEdit={canEdit}
                  saving={saving}
                  defaultExpanded={question.id === expandQuestionId}
                  pendingFieldWorkflow={inPendingSection}
                  fieldEditing={fieldEditing}
                  onToggleRequired={onToggleRequired}
                  onUpdateQuestion={onUpdateQuestion}
                  onDeleteQuestion={onDeleteQuestion}
                  onSaveField={onSavePendingQuestionField}
                  onEditField={onEditPendingQuestionField}
                />
              )
            })}
          </ul>
        ) : null}
        {activeSection && canEdit && !activeSection.isDefault ? (
          <div className="deal_esign_questionnaire_add_field_wrap">
            <div className="deal_esign_questionnaire_add_field_rule" aria-hidden />
            <button
              type="button"
              className="deal_esign_questionnaire_add_field_btn"
              disabled={saving}
              onClick={onAddField}
            >
              <Plus size={16} strokeWidth={2} aria-hidden />
              Add field
            </button>
            <div className="deal_esign_questionnaire_add_field_rule" aria-hidden />
          </div>
        ) : null}
        {!activeSection ? (
          <p className="deal_esign_questionnaire_empty" role="status">
            No sections configured.
          </p>
        ) : null}
      </div>
    </div>
  )
}
