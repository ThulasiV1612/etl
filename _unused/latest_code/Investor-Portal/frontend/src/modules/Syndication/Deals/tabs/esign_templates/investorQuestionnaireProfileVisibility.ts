import { ESIGN_ENTITY_PROFILE_IDS } from "./esignEntityCategories"
import type { InvestorQuestionnaireProfileSectionVisibility } from "./investorQuestionnaire.types"

const DEFAULT_QUESTIONNAIRE_SECTION_IDS = [
  "personal",
  "entity",
  "ira_entity",
  "relationship",
  "accreditation",
  "ira",
  "entity_type",
] as const

function profileVisibilityHidingAllExcept(
  enabledSectionIds: readonly string[],
): Record<string, boolean> {
  const enabled = new Set(enabledSectionIds)
  const hidden: Record<string, boolean> = {}
  for (const sectionId of DEFAULT_QUESTIONNAIRE_SECTION_IDS) {
    if (!enabled.has(sectionId)) {
      hidden[sectionId] = false
    }
  }
  return hidden
}

/** Initial Manage Questionnaire toggles per e-sign profile (off = hidden). */
export const DEFAULT_INVESTOR_QUESTIONNAIRE_PROFILE_SECTION_VISIBILITY: InvestorQuestionnaireProfileSectionVisibility =
  {
    individual: profileVisibilityHidingAllExcept([
      "personal",
      "relationship",
      "accreditation",
    ]),
    joint_tenancy: profileVisibilityHidingAllExcept([
      "personal",
      "relationship",
      "accreditation",
    ]),
    llc: profileVisibilityHidingAllExcept([
      "personal",
      "entity",
      "relationship",
      "accreditation",
      "entity_type",
    ]),
    custodian_ira_401k: profileVisibilityHidingAllExcept([
      "personal",
      "ira_entity",
      "relationship",
      "accreditation",
      "ira",
    ]),
  }

export function cloneProfileSectionVisibility(
  visibility: InvestorQuestionnaireProfileSectionVisibility,
): InvestorQuestionnaireProfileSectionVisibility {
  const next: InvestorQuestionnaireProfileSectionVisibility = {}
  for (const [profileId, sectionMap] of Object.entries(visibility)) {
    next[profileId] = { ...sectionMap }
  }
  return next
}

/** True when this profile × section is on in the default (recommended) matrix. */
export function isRecommendedQuestionnaireSectionForProfile(
  profileId: string,
  sectionId: string,
): boolean {
  return isQuestionnaireSectionVisibleForProfile(
    DEFAULT_INVESTOR_QUESTIONNAIRE_PROFILE_SECTION_VISIBILITY,
    profileId,
    sectionId,
  )
}

/** Missing or true means the section is shown for that profile's e-sign template. */
export function isQuestionnaireSectionVisibleForProfile(
  visibility: InvestorQuestionnaireProfileSectionVisibility | undefined,
  profileId: string,
  sectionId: string,
): boolean {
  return visibility?.[profileId]?.[sectionId] !== false
}

export function setQuestionnaireSectionVisibleForProfile(
  visibility: InvestorQuestionnaireProfileSectionVisibility | undefined,
  profileId: string,
  sectionId: string,
  visible: boolean,
): InvestorQuestionnaireProfileSectionVisibility {
  const root: InvestorQuestionnaireProfileSectionVisibility = {
    ...(visibility ?? {}),
  }
  const profileMap = { ...(root[profileId] ?? {}) }

  if (visible) {
    delete profileMap[sectionId]
  } else {
    profileMap[sectionId] = false
  }

  if (Object.keys(profileMap).length === 0) {
    delete root[profileId]
  } else {
    root[profileId] = profileMap
  }

  return root
}

export function pruneProfileSectionVisibility(
  visibility: InvestorQuestionnaireProfileSectionVisibility | undefined,
  validSectionIds: Set<string>,
): InvestorQuestionnaireProfileSectionVisibility | undefined {
  if (!visibility) return undefined

  const next: InvestorQuestionnaireProfileSectionVisibility = {}
  let hasAny = false

  for (const profileId of ESIGN_ENTITY_PROFILE_IDS) {
    const profileMap = visibility[profileId]
    if (!profileMap || typeof profileMap !== "object") continue

    const pruned: Record<string, boolean> = {}
    for (const [sectionId, value] of Object.entries(profileMap)) {
      if (!validSectionIds.has(sectionId) || value !== false) continue
      pruned[sectionId] = false
    }
    if (Object.keys(pruned).length > 0) {
      next[profileId] = pruned
      hasAny = true
    }
  }

  return hasAny ? next : undefined
}
