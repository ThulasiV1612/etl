import type { DealEsignTemplateFileRecord } from "@/modules/Syndication/Deals/api/dealsApi"
import type { DealInvestorRow } from "@/modules/Syndication/Deals/types/deal-investors.types"
import {
  investorRowCommittedNumeric,
} from "@/modules/Syndication/Deals/utils/investorEsignStatus"
import { resolveEsignTemplateForInvestorProfile } from "@/modules/Syndication/Deals/utils/esignTemplateCategories"
import { ESIGN_UNIFIED_CATEGORY_ID } from "@/modules/Syndication/Deals/utils/esignUnifiedTemplate"
import type { InvestorQuestionnaireConfig } from "@/modules/Syndication/Deals/tabs/esign_templates/investorQuestionnaire.types"
import { sortSections } from "@/modules/Syndication/Deals/tabs/esign_templates/investorQuestionnaire.types"
import { isQuestionnaireSectionVisibleForProfile } from "@/modules/Syndication/Deals/tabs/esign_templates/investorQuestionnaireProfileVisibility"

/** `deal_investment.id` for this saved profile commitment (multi-profile Invest Now). */
export function investNowCommitmentRowIdForScope(
  investors: DealInvestorRow[],
  opts: {
    email: string
    profileId: string
    userInvestorProfileId: string
  },
): string | null {
  const em = opts.email.trim().toLowerCase()
  const uip = opts.userInvestorProfileId.trim().toLowerCase()
  const profileId = opts.profileId.trim()
  const rows = investors.filter((r) => {
    if (r.investorKind === "lp_roster") return false
    if (em && String(r.userEmail ?? "").trim().toLowerCase() !== em) return false
    if (
      uip &&
      String(r.userInvestorProfileId ?? "").trim().toLowerCase() !== uip
    ) {
      return false
    }
    if (profileId && String(r.profileId ?? "").trim() !== profileId) return false
    if (uip || profileId) return true
    return investorRowCommittedNumeric(r) > 0
  })
  if (rows.length === 0) return null
  const portal = rows.filter((r) => r.investorKind !== "lp_roster")
  const pick = (portal.length > 0 ? portal : rows)[0]
  return pick?.id?.trim() || null
}

/** Maps commitment `profile_id` to eSign template `categoryId`. */
export function esignCategoryIdFromCommitmentProfile(
  commitmentProfileId: string,
): string {
  const id = commitmentProfileId.trim()
  if (id === "llc_corp_trust_etc") return "llc"
  if (id === "custodian_ira_401k") return "custodian_ira_401k"
  if (id === "joint_tenancy") return "joint_tenancy"
  return "individual"
}

/** @deprecated Prefer {@link resolveEsignTemplateForInvestorProfile} with commitment profile id. */
export function esignTemplateForCategory(
  filesByCategory: Record<string, DealEsignTemplateFileRecord[]>,
  categoryId: string,
  commitmentProfileId?: string,
): DealEsignTemplateFileRecord | undefined {
  if (commitmentProfileId?.trim()) {
    return resolveEsignTemplateForInvestorProfile(
      filesByCategory,
      commitmentProfileId,
    )
  }
  const unified = filesByCategory[ESIGN_UNIFIED_CATEGORY_ID]?.[0]
  if (unified) return unified
  return (filesByCategory[categoryId] ?? [])[0]
}

/** Keep only documents for the investor's selected profile category (lead sponsor templates). */
export function filterMyEsignDocumentsForCategory<
  T extends { categoryId?: string },
>(documents: T[], categoryId: string): T[] {
  const cat = categoryId.trim()
  if (!cat) return documents
  return documents.filter((d) => {
    const docCat = d.categoryId?.trim()
    if (!docCat) return true
    if (docCat === cat) return true
    if (docCat === ESIGN_UNIFIED_CATEGORY_ID) return true
    return false
  })
}

export function sponsorIncludedQuestionnaireOnTemplate(
  file: DealEsignTemplateFileRecord | undefined,
): boolean {
  return Boolean(file?.includeQuestionnaire)
}

export type VisibleQuestionnaireSection = {
  id: string
  label: string
}

/** Sections the sponsor left enabled for this profile on Manage Questionnaire. */
export function visibleQuestionnaireSectionsForProfile(
  config: InvestorQuestionnaireConfig | null | undefined,
  esignCategoryId: string,
): VisibleQuestionnaireSection[] {
  if (!config?.sections?.length) return []
  const visibility = config.profileSectionVisibility
  return sortSections(config.sections)
    .filter((section) =>
      isQuestionnaireSectionVisibleForProfile(
        visibility,
        esignCategoryId,
        section.id,
      ),
    )
    .map((section) => ({ id: section.id, label: section.label }))
}

/** Workflow label for the current profile's e-sign documents only (not other profiles). */
export function investNowWorkflowLabelForProfileDocs(
  documents: { status: string }[],
): string | null {
  if (documents.length === 0) return null
  if (documents.every((d) => d.status === "signed")) return "Completed"
  if (documents.some((d) => d.status !== "signed")) return "Sent"
  return null
}

/** True when the investor should see questionnaire steps (template + profile sections). */
export function questionnaireIncludedInInvestNowFlow(params: {
  template: DealEsignTemplateFileRecord | undefined
  config: InvestorQuestionnaireConfig | null | undefined
  esignCategoryId: string
}): boolean {
  if (!sponsorIncludedQuestionnaireOnTemplate(params.template)) return false
  return (
    visibleQuestionnaireSectionsForProfile(
      params.config,
      params.esignCategoryId,
    ).length > 0
  )
}
