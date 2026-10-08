import {
  cloneProfileSectionVisibility,
  DEFAULT_INVESTOR_QUESTIONNAIRE_PROFILE_SECTION_VISIBILITY,
  pruneProfileSectionVisibility,
} from "./investorQuestionnaireProfileVisibility"

export type InvestorQuestionnaireFieldType =
  | "text"
  | "phone"
  | "address"
  | "date"
  | "ssn"
  | "ein"
  | "boolean"
  | "textarea"
  | "paragraph"
  | "radio"
  | "checkboxes"

export type InvestorQuestionnaireSection = {
  id: string
  label: string
  sortOrder: number
  isDefault?: boolean
}

export type InvestorQuestionnaireQuestion = {
  id: string
  sectionId: string
  label: string
  sortOrder: number
  required: boolean
  fieldType: InvestorQuestionnaireFieldType
  /** Helper text shown below the field for investors. */
  subtext?: string
  /** Choices when fieldType is radio. */
  options?: string[]
  isDefault?: boolean
  /**
   * Links this questionnaire field to an investor profile detail field for
   * prefill. The same key may be used on multiple questions.
   */
  investorProfileFieldKey?: string
}

/** Per e-sign profile: sectionId → false hides that section on that profile's template. */
export type InvestorQuestionnaireProfileSectionVisibility = Record<
  string,
  Record<string, boolean>
>

export type InvestorQuestionnaireConfig = {
  v: 1
  sections: InvestorQuestionnaireSection[]
  questions: InvestorQuestionnaireQuestion[]
  profileSectionVisibility?: InvestorQuestionnaireProfileSectionVisibility
}

export const DEFAULT_INVESTOR_QUESTIONNAIRE_SECTIONS: InvestorQuestionnaireSection[] =
  [
    { id: "personal", label: "Personal", sortOrder: 0, isDefault: true },
    { id: "entity", label: "Entity", sortOrder: 1, isDefault: true },
    { id: "ira_entity", label: "IRA Entity", sortOrder: 2, isDefault: true },
    {
      id: "relationship",
      label: "Relationship",
      sortOrder: 3,
      isDefault: true,
    },
    {
      id: "accreditation",
      label: "Accreditation",
      sortOrder: 4,
      isDefault: true,
    },
    { id: "ira", label: "IRA", sortOrder: 5, isDefault: true },
    { id: "entity_type", label: "Entity type", sortOrder: 6, isDefault: true },
  ]

export const DEFAULT_INVESTOR_QUESTIONNAIRE_QUESTIONS: InvestorQuestionnaireQuestion[] =
  [
    {
      id: "first_name",
      sectionId: "personal",
      label: "First name",
      sortOrder: 0,
      required: true,
      fieldType: "text",
      isDefault: true,
      investorProfileFieldKey: "firstName",
    },
    {
      id: "last_name",
      sectionId: "personal",
      label: "Last name",
      sortOrder: 1,
      required: true,
      fieldType: "text",
      isDefault: true,
      investorProfileFieldKey: "lastName",
    },
    {
      id: "telephone",
      sectionId: "personal",
      label: "Telephone",
      sortOrder: 2,
      required: true,
      fieldType: "phone",
      isDefault: true,
      investorProfileFieldKey: "phone2",
    },
    {
      id: "address",
      sectionId: "personal",
      label: "Address",
      sortOrder: 3,
      required: true,
      fieldType: "address",
      isDefault: true,
      investorProfileFieldKey: "taxAddress",
    },
    {
      id: "state_residency_duration",
      sectionId: "personal",
      label:
        "How long have you been a resident of your state of residence? (years)",
      sortOrder: 4,
      required: true,
      fieldType: "text",
      isDefault: true,
    },
    {
      id: "birth_date",
      sectionId: "personal",
      label: "Birth date",
      sortOrder: 5,
      required: false,
      fieldType: "date",
      isDefault: true,
    },
    {
      id: "us_tax_resident",
      sectionId: "personal",
      label:
        "Are you a U.S resident and/or citizen for tax purposes?",
      sortOrder: 6,
      required: true,
      fieldType: "boolean",
      isDefault: true,
    },
    {
      id: "social_security_number",
      sectionId: "personal",
      label: "Social Security Number",
      sortOrder: 7,
      required: true,
      fieldType: "ssn",
      isDefault: true,
      investorProfileFieldKey: "ssn",
    },
    {
      id: "entity_full_legal_name",
      sectionId: "entity",
      label: "Full legal name of entity",
      sortOrder: 0,
      required: true,
      fieldType: "text",
      isDefault: true,
      investorProfileFieldKey: "entityLegalName",
    },
    {
      id: "entity_office_address",
      sectionId: "entity",
      label: "Office address",
      sortOrder: 1,
      required: true,
      fieldType: "address",
      isDefault: true,
      investorProfileFieldKey: "taxAddress",
    },
    {
      id: "entity_business_phone",
      sectionId: "entity",
      label: "Business phone number",
      sortOrder: 2,
      required: true,
      fieldType: "phone",
      isDefault: true,
      investorProfileFieldKey: "phone2",
    },
    {
      id: "entity_formation_date",
      sectionId: "entity",
      label: "Formation date",
      sortOrder: 3,
      required: false,
      fieldType: "date",
      isDefault: true,
      investorProfileFieldKey: "entityDateFormed",
    },
    {
      id: "entity_jurisdiction_country",
      sectionId: "entity",
      label: "Jurisdiction country",
      sortOrder: 4,
      required: true,
      fieldType: "text",
      isDefault: true,
    },
    {
      id: "entity_jurisdiction_state",
      sectionId: "entity",
      label: "Jurisdiction state",
      sortOrder: 5,
      required: true,
      fieldType: "text",
      isDefault: true,
    },
    {
      id: "entity_tax_id",
      sectionId: "entity",
      label: "Tax identification number",
      sortOrder: 6,
      required: true,
      fieldType: "text",
      isDefault: true,
      investorProfileFieldKey: "entityEin",
    },
    {
      id: "entity_authorized_name",
      sectionId: "entity",
      label: "Authorized individual name",
      sortOrder: 7,
      required: true,
      fieldType: "text",
      isDefault: true,
      investorProfileFieldKey: "fullName",
    },
    {
      id: "entity_authorized_title",
      sectionId: "entity",
      label: "Authorized individual title",
      sortOrder: 8,
      required: true,
      fieldType: "text",
      isDefault: true,
    },
    {
      id: "entity_beneficial_owners",
      sectionId: "entity",
      label: "Name of record and beneficial owners",
      sortOrder: 9,
      required: false,
      fieldType: "paragraph",
      isDefault: true,
    },
    {
      id: "ira_entity_name",
      sectionId: "ira_entity",
      label: "IRA entity name",
      sortOrder: 0,
      required: true,
      fieldType: "text",
      isDefault: true,
      investorProfileFieldKey: "legalIraName",
    },
    {
      id: "ira_entity_office_address",
      sectionId: "ira_entity",
      label: "Office address",
      sortOrder: 1,
      required: true,
      fieldType: "address",
      isDefault: true,
      investorProfileFieldKey: "taxAddress",
    },
    {
      id: "ira_entity_business_phone",
      sectionId: "ira_entity",
      label: "Business phone number",
      sortOrder: 2,
      required: true,
      fieldType: "phone",
      isDefault: true,
      investorProfileFieldKey: "phone2",
    },
    {
      id: "ira_entity_incorporation_country",
      sectionId: "ira_entity",
      label: "Incorporation country",
      sortOrder: 3,
      required: true,
      fieldType: "text",
      isDefault: true,
    },
    {
      id: "ira_entity_incorporation_state",
      sectionId: "ira_entity",
      label: "Incorporation state",
      sortOrder: 4,
      required: true,
      fieldType: "text",
      isDefault: true,
    },
    {
      id: "ira_entity_custodian_ein",
      sectionId: "ira_entity",
      label: "IRA custodian EIN",
      sortOrder: 5,
      required: true,
      fieldType: "ein",
      isDefault: true,
      investorProfileFieldKey: "iraCustodianEin",
    },
    {
      id: "ira_entity_partner_ein",
      sectionId: "ira_entity",
      label: "IRA partner EIN",
      sortOrder: 6,
      required: false,
      fieldType: "ein",
      isDefault: true,
      investorProfileFieldKey: "iraPartnerEin",
    },
    {
      id: "ira_entity_account_holder_name",
      sectionId: "ira_entity",
      label: "IRA account holder's name",
      sortOrder: 7,
      required: true,
      fieldType: "text",
      isDefault: true,
      investorProfileFieldKey: "fullName",
    },
    {
      id: "ira_entity_account_holder_title",
      sectionId: "ira_entity",
      label: "IRA account holder's title",
      sortOrder: 8,
      required: true,
      fieldType: "text",
      isDefault: true,
    },
    {
      id: "relationship_sponsor_description",
      sectionId: "relationship",
      label:
        "Please print the name of your sponsor(s) and describe the nature of your prior personal or business relationship with the sponsor(s), entity, or any of their principals, officers, directors or Affiliates",
      sortOrder: 0,
      required: true,
      fieldType: "paragraph",
      isDefault: true,
    },
    {
      id: "relationship_public_officer_director",
      sectionId: "relationship",
      label:
        "Is the undersigned an officer or director of a publicly-held company",
      sortOrder: 1,
      required: false,
      fieldType: "boolean",
      isDefault: true,
    },
    {
      id: "relationship_company_role",
      sectionId: "relationship",
      label:
        "Specify the company and the undersigned's role within the company",
      sortOrder: 2,
      required: false,
      fieldType: "textarea",
      isDefault: true,
    },
    {
      id: "relationship_beneficiary_voting_securities",
      sectionId: "relationship",
      label:
        "Does the undersigned beneficiary own 4% or more of the voting securities of a publicly held company",
      sortOrder: 3,
      required: false,
      fieldType: "boolean",
      isDefault: true,
    },
    {
      id: "relationship_purchaser_representative",
      sectionId: "relationship",
      label:
        "The undersigned intends to have an attorney, accountant, investment advisor, or other consultant act as the undersigned's Purchaser Representative in connection with this investment.",
      sortOrder: 4,
      required: true,
      fieldType: "boolean",
      isDefault: true,
    },
    {
      id: "relationship_consultant_name",
      sectionId: "relationship",
      label: "Consultant name",
      sortOrder: 5,
      required: true,
      fieldType: "text",
      isDefault: true,
    },
    {
      id: "relationship_consultant_phone",
      sectionId: "relationship",
      label: "Consultant phone",
      sortOrder: 6,
      required: true,
      fieldType: "phone",
      isDefault: true,
    },
    {
      id: "relationship_consultant_firm",
      sectionId: "relationship",
      label: "Consultant firm",
      sortOrder: 7,
      required: true,
      fieldType: "text",
      isDefault: true,
    },
    {
      id: "relationship_address",
      sectionId: "relationship",
      label: "Address",
      sortOrder: 8,
      required: true,
      fieldType: "address",
      isDefault: true,
      investorProfileFieldKey: "mailingAddress",
    },
    {
      id: "accreditation_categories",
      sectionId: "accreditation",
      label: "Accredited investor categories (Check all that apply)",
      sortOrder: 0,
      required: true,
      fieldType: "checkboxes",
      options: [
        "A. Person with net worth",
        "B. Person with income",
        "C. Bank etc",
        "D. Private business development",
        "E. Entity with sophisticated person",
        "F. Entity with accredited owners",
        "G. Family office",
        "H. Investment adviser",
        "I. Not accredited",
      ],
      isDefault: true,
    },
    {
      id: "accreditation_private_placement_experience",
      sectionId: "accreditation",
      label:
        "I have personally invested in investments sold by means of private placement (i.e. syndications) within the past 5 years",
      sortOrder: 1,
      required: true,
      fieldType: "boolean",
      isDefault: true,
    },
    {
      id: "accreditation_sophisticated_investor",
      sectionId: "accreditation",
      label:
        "I consider myself to be an experienced and sophisticated investor",
      sortOrder: 2,
      required: true,
      fieldType: "boolean",
      isDefault: true,
    },
    {
      id: "accreditation_experienced_investor_basis",
      sectionId: "accreditation",
      label: "Experienced investor basis",
      sortOrder: 3,
      required: false,
      fieldType: "textarea",
      isDefault: true,
    },
    {
      id: "accreditation_knowledge_acknowledgment",
      sectionId: "accreditation",
      label:
        "I, the undersigned individual or person authorized to execute this Questionnaire, consider myself to have such knowledge of the Company and its business and such experience in financial and business matters to enable me to evaluate the merits and risks of an investment in the Company, should I be given the opportunity to invest.",
      sortOrder: 4,
      required: true,
      fieldType: "boolean",
      isDefault: true,
    },
    {
      id: "ira_voluntary_establishment",
      sectionId: "ira",
      label:
        "Was the establishment and is the maintenance of the IRA completely voluntary on the part of its owner and beneficiary?",
      sortOrder: 0,
      required: true,
      fieldType: "boolean",
      isDefault: true,
    },
    {
      id: "ira_employer_contributions",
      sectionId: "ira",
      label:
        "Does an employer, in its capacity as such, or in an 'employee association' within the meaning of the Employee Retirement Income Security Act of 1974, as amended 'ERISA' make contributions to the IRA?",
      sortOrder: 1,
      required: true,
      fieldType: "boolean",
      isDefault: true,
    },
    {
      id: "ira_employer_involvement",
      sectionId: "ira",
      label:
        "Has any employer or employee organization (as defined above) had any involvement with the establishment, maintenance, or funding of the IRA?",
      sortOrder: 2,
      required: true,
      fieldType: "boolean",
      isDefault: true,
    },
    {
      id: "ira_employer_consideration",
      sectionId: "ira",
      label:
        "Has any employer or employee organization (as defined above) received any consideration in the form of cash or otherwise, for services rendered in connection with the IRA?",
      sortOrder: 3,
      required: true,
      fieldType: "boolean",
      isDefault: true,
    },
    {
      id: "ira_sep_history",
      sectionId: "ira",
      label:
        "Has the IRA ever been a part of a 'simplified employee pension' or 'SEP'?",
      sortOrder: 4,
      required: true,
      fieldType: "boolean",
      isDefault: true,
    },
    {
      id: "entity_type_ownership",
      sectionId: "entity_type",
      label: "Entity ownership",
      sortOrder: 0,
      required: true,
      fieldType: "radio",
      options: ["Trust", "LLC", "Corporation", "Partnership", "Other"],
      isDefault: true,
    },
    {
      id: "entity_type_ownership_other",
      sectionId: "entity_type",
      label: "Other entity ownership?",
      sortOrder: 1,
      required: true,
      fieldType: "text",
      isDefault: true,
    },
    {
      id: "entity_type_trust_revocable",
      sectionId: "entity_type",
      label: "Is the Trust revocable?",
      sortOrder: 2,
      required: true,
      fieldType: "radio",
      options: ["Revocable", "Irrevocable"],
      isDefault: true,
    },
    {
      id: "entity_type_revocable_grantors_accredited",
      sectionId: "entity_type",
      label:
        "If it is revocable, do all Grantors of the Trust meet the definition of an Accredited Investor? If relying upon this category alone, each Grantor must complete a separate copy of this Questionnaire.",
      sortOrder: 3,
      required: true,
      fieldType: "boolean",
      isDefault: true,
    },
    {
      id: "entity_type_owners_accredited",
      sectionId: "entity_type",
      label:
        "Do all owners of the Entity meet the definition of an Accredited Investor?",
      sortOrder: 4,
      required: true,
      fieldType: "boolean",
      isDefault: true,
    },
  ]

export function getDefaultInvestorQuestionnaireConfig(): InvestorQuestionnaireConfig {
  return {
    v: 1,
    sections: DEFAULT_INVESTOR_QUESTIONNAIRE_SECTIONS.map((s) => ({ ...s })),
    questions: DEFAULT_INVESTOR_QUESTIONNAIRE_QUESTIONS.map((q) => ({ ...q })),
    profileSectionVisibility: cloneProfileSectionVisibility(
      DEFAULT_INVESTOR_QUESTIONNAIRE_PROFILE_SECTION_VISIBILITY,
    ),
  }
}

export function sortSections(
  sections: InvestorQuestionnaireSection[],
): InvestorQuestionnaireSection[] {
  return [...sections].sort((a, b) => a.sortOrder - b.sortOrder)
}

export function questionsForSection(
  questions: InvestorQuestionnaireQuestion[],
  sectionId: string,
): InvestorQuestionnaireQuestion[] {
  return [...questions]
    .filter((q) => q.sectionId === sectionId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export const PURCHASER_REPRESENTATIVE_QUESTION_ID =
  "relationship_purchaser_representative"

/** Shown only when Purchaser Representative is Yes. */
export const PURCHASER_REPRESENTATIVE_DETAIL_QUESTION_IDS = [
  "relationship_consultant_name",
  "relationship_consultant_phone",
  "relationship_consultant_firm",
  "relationship_address",
] as const

export function isPurchaserRepresentativeDetailQuestion(
  questionId: string,
): boolean {
  return (
    PURCHASER_REPRESENTATIVE_DETAIL_QUESTION_IDS as readonly string[]
  ).includes(questionId)
}

export function purchaserRepresentativeSelected(
  answers: Record<string, string>,
): boolean {
  return (
    answers[PURCHASER_REPRESENTATIVE_QUESTION_ID]?.trim().toLowerCase() ===
    "yes"
  )
}

/** Investor onboarding: consultant fields depend on Purchaser Representative answer. */
export function isInvestorQuestionnaireQuestionVisible(
  question: Pick<InvestorQuestionnaireQuestion, "id">,
  answers: Record<string, string>,
): boolean {
  if (!isPurchaserRepresentativeDetailQuestion(question.id)) return true
  return purchaserRepresentativeSelected(answers)
}

export function pruneHiddenInvestorQuestionnaireAnswers(
  answers: Record<string, string>,
): Record<string, string> {
  if (purchaserRepresentativeSelected(answers)) return answers
  const next = { ...answers }
  for (const id of PURCHASER_REPRESENTATIVE_DETAIL_QUESTION_IDS) {
    delete next[id]
  }
  return next
}

const DEFAULT_QUESTION_BY_ID = new Map(
  DEFAULT_INVESTOR_QUESTIONNAIRE_QUESTIONS.map((q) => [q.id, q]),
)

function syncStoredDefaultQuestion(
  stored: InvestorQuestionnaireQuestion,
  catalog: InvestorQuestionnaireQuestion,
): { question: InvestorQuestionnaireQuestion; changed: boolean } {
  let changed = false
  const next: InvestorQuestionnaireQuestion = { ...stored, isDefault: true }

  if (next.label !== catalog.label) {
    next.label = catalog.label
    changed = true
  }
  if (next.required !== catalog.required) {
    next.required = catalog.required
    changed = true
  }
  if (next.fieldType !== catalog.fieldType) {
    next.fieldType = catalog.fieldType
    changed = true
  }

  const catalogOpts = catalog.options ?? []
  const storedOpts = next.options ?? []
  if (catalogOpts.length > 0) {
    if (
      next.fieldType !== catalog.fieldType ||
      storedOpts.join("\u0000") !== catalogOpts.join("\u0000")
    ) {
      next.options = [...catalogOpts]
      changed = true
    }
  } else if (next.options?.length) {
    delete next.options
    changed = true
  }

  const subtext = stored.subtext?.trim()
  if (subtext) next.subtext = subtext
  else delete next.subtext

  const catalogProfileKey = catalog.investorProfileFieldKey?.trim()
  const storedProfileKey = stored.investorProfileFieldKey?.trim()
  if (catalogProfileKey) {
    if (storedProfileKey !== catalogProfileKey) {
      next.investorProfileFieldKey = catalogProfileKey
      changed = true
    }
  } else if (storedProfileKey) {
    delete next.investorProfileFieldKey
    changed = true
  }

  return { question: next, changed }
}

/** Ensures default catalog fields (label, type, options) display correctly. */
export function resolveQuestionForDisplay(
  question: InvestorQuestionnaireQuestion,
): InvestorQuestionnaireQuestion {
  const catalog = DEFAULT_QUESTION_BY_ID.get(question.id)
  if (!catalog?.isDefault) return question

  const { question: synced } = syncStoredDefaultQuestion(question, catalog)
  return synced
}

/** Adds any missing default sections/questions (e.g. after defaults are extended). */
export function mergeQuestionnaireWithDefaults(
  stored: InvestorQuestionnaireConfig,
): { config: InvestorQuestionnaireConfig; needsUpdate: boolean } {
  const defaults = getDefaultInvestorQuestionnaireConfig()
  const storedSectionIds = new Set(stored.sections.map((s) => s.id))
  const storedQuestionIds = new Set(stored.questions.map((q) => q.id))
  let needsUpdate = false

  const sections = [...stored.sections]
  for (const section of defaults.sections) {
    if (!storedSectionIds.has(section.id)) {
      sections.push({ ...section })
      needsUpdate = true
    }
  }

  const questions = [...stored.questions]
  for (const question of defaults.questions) {
    if (!storedQuestionIds.has(question.id)) {
      questions.push({ ...question })
      needsUpdate = true
      continue
    }
    const idx = questions.findIndex((q) => q.id === question.id)
    const storedQ = questions[idx]
    if (!storedQ) continue

    if (question.isDefault) {
      const { question: synced, changed } = syncStoredDefaultQuestion(
        storedQ,
        question,
      )
      if (changed) {
        questions[idx] = synced
        needsUpdate = true
      }
    } else if (question.options?.length) {
      if (!storedQ.options || storedQ.options.length === 0) {
        questions[idx] = { ...storedQ, options: [...question.options] }
        needsUpdate = true
      }
    }
  }

  const sectionIds = new Set(sections.map((s) => s.id))
  let visibilitySource = stored.profileSectionVisibility
  if (visibilitySource === undefined) {
    visibilitySource = DEFAULT_INVESTOR_QUESTIONNAIRE_PROFILE_SECTION_VISIBILITY
    needsUpdate = true
  }
  const profileSectionVisibility = pruneProfileSectionVisibility(
    visibilitySource,
    sectionIds,
  )

  return {
    config: {
      v: 1,
      sections: sortSections(sections),
      questions,
      ...(profileSectionVisibility
        ? { profileSectionVisibility }
        : {}),
    },
    needsUpdate,
  }
}
