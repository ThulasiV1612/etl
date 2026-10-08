import {
  investorProfileIdFromLabel,
  investorProfileLabel,
} from "../constants/investor-profile"
import type {
  DealInvestorEsignDocumentRef,
  DealInvestorRow,
} from "../types/deal-investors.types"
import type { DealEsignTemplateFileRecord } from "../api/dealsApi"
import {
  dealUsesUnifiedEsignTemplate,
  ESIGN_UNIFIED_CATEGORY,
  ESIGN_UNIFIED_CATEGORY_ID,
} from "./esignUnifiedTemplate"
export { ESIGN_UNIFIED_CATEGORY_ID, ESIGN_UNIFIED_CATEGORY } from "./esignUnifiedTemplate"

/** eSign Templates tab categories (must match backend upload paths). */
export const ESIGN_TEMPLATE_CATEGORIES = [
  {
    id: ESIGN_UNIFIED_CATEGORY_ID,
    label: ESIGN_UNIFIED_CATEGORY.label,
  },
  { id: "individual", label: "Individual" },
  {
    id: "custodian_ira_401k",
    label: "Custodian IRA or custodian based 401(k)",
  },
  { id: "joint_tenancy", label: "Joint tenancy" },
  {
    id: "llc",
    label: "LLC, corp, partnership, trust, solo 401(k), or checkbook IRA",
  },
] as const

export type EsignTemplateCategoryId =
  (typeof ESIGN_TEMPLATE_CATEGORIES)[number]["id"]

/** Maps deal investment `profileId` to eSign template folder category. */
export function esignCategoryIdFromInvestorProfile(
  profileId: string,
): EsignTemplateCategoryId | null {
  const p = profileId.trim()
  if (!p) return null
  if (p === "llc_corp_trust_etc") return "llc"
  if (
    p === "individual" ||
    p === "custodian_ira_401k" ||
    p === "joint_tenancy" ||
    p === "llc"
  ) {
    return p
  }
  return null
}

export function resolveInvestorEsignCategoryId(
  row: DealInvestorRow,
): EsignTemplateCategoryId | null {
  const fromProfile = row.profileId?.trim()
  if (fromProfile) {
    const id = esignCategoryIdFromInvestorProfile(fromProfile)
    if (id) return id
  }
  const label = row.entitySubtitle?.trim()
  if (label && label !== "—") {
    return esignCategoryIdFromInvestorProfile(
      investorProfileIdFromLabel(label),
    )
  }
  return null
}

export function esignCategoryLabel(categoryId: string): string {
  const row = ESIGN_TEMPLATE_CATEGORIES.find((c) => c.id === categoryId)
  return row?.label ?? categoryId
}

export function investorProfileLabelForRow(row: DealInvestorRow): string {
  const pid = row.profileId?.trim()
  if (pid) return investorProfileLabel(pid)
  const sub = row.entitySubtitle?.trim()
  return sub && sub !== "—" ? sub : "—"
}

/** Categories on this deal that have at least one uploaded template file. */
export function esignCategoriesWithDocuments(
  filesByCategory: Record<string, DealEsignTemplateFileRecord[]>,
): EsignTemplateCategoryId[] {
  return ESIGN_TEMPLATE_CATEGORIES.filter(
    (c) => (filesByCategory[c.id]?.length ?? 0) > 0,
  ).map((c) => c.id)
}

/** Files the sponsor may offer for this investor (matching profile category only). */
export interface EsignProfileStatusTab {
  categoryId: string
  label: string
  documents: DealInvestorEsignDocumentRef[]
  isInvestorProfile: boolean
}

/** Profile tabs for eSign status popup — only categories with sent documents. */
export function buildEsignProfileStatusTabs(
  documents: DealInvestorEsignDocumentRef[],
  investorCategoryId: EsignTemplateCategoryId | null,
  options?: { usesUnifiedTemplate?: boolean },
): EsignProfileStatusTab[] {
  const usesUnified = options?.usesUnifiedTemplate ?? false
  const byCategory = new Map<string, DealInvestorEsignDocumentRef[]>()
  const uncategorized: DealInvestorEsignDocumentRef[] = []

  for (const d of documents) {
    const cid = d.categoryId?.trim()
    if (cid) {
      const list = byCategory.get(cid) ?? []
      list.push(d)
      byCategory.set(cid, list)
    } else uncategorized.push(d)
  }

  const tabs: EsignProfileStatusTab[] = []
  for (const cat of ESIGN_TEMPLATE_CATEGORIES) {
    const docs = byCategory.get(cat.id)
    if (!docs?.length) continue
    const isUnifiedTab =
      cat.id === ESIGN_UNIFIED_CATEGORY_ID && usesUnified
    tabs.push({
      categoryId: cat.id,
      label: cat.label,
      documents: docs,
      isInvestorProfile:
        isUnifiedTab || investorCategoryId === cat.id,
    })
  }
  if (uncategorized.length > 0) {
    tabs.push({
      categoryId: "_other",
      label: "Other",
      documents: uncategorized,
      isInvestorProfile: false,
    })
  }
  return tabs
}

/**
 * Template file for an investor profile — unified `all_profiles` doc first,
 * else legacy per-profile PDF.
 */
export function resolveEsignTemplateForInvestorProfile(
  filesByCategory: Record<string, DealEsignTemplateFileRecord[]>,
  commitmentProfileId: string,
): DealEsignTemplateFileRecord | undefined {
  if (dealUsesUnifiedEsignTemplate(filesByCategory)) {
    return (filesByCategory[ESIGN_UNIFIED_CATEGORY_ID] ?? [])[0]
  }
  const categoryId = esignCategoryIdFromInvestorProfile(commitmentProfileId)
  if (!categoryId) return undefined
  return (filesByCategory[categoryId] ?? [])[0]
}

export function esignSelectableFilesForInvestor(
  row: DealInvestorRow,
  filesByCategory: Record<string, DealEsignTemplateFileRecord[]>,
): {
  categoryId: EsignTemplateCategoryId | typeof ESIGN_UNIFIED_CATEGORY_ID | null
  categoryLabel: string
  files: DealEsignTemplateFileRecord[]
  profileLabel: string
} {
  const profileLabel = investorProfileLabelForRow(row)
  if (dealUsesUnifiedEsignTemplate(filesByCategory)) {
    return {
      categoryId: ESIGN_UNIFIED_CATEGORY_ID,
      categoryLabel: ESIGN_UNIFIED_CATEGORY.label,
      files: filesByCategory[ESIGN_UNIFIED_CATEGORY_ID] ?? [],
      profileLabel,
    }
  }
  const categoryId = resolveInvestorEsignCategoryId(row)
  if (!categoryId) {
    return { categoryId: null, categoryLabel: "—", files: [], profileLabel }
  }
  return {
    categoryId,
    categoryLabel: esignCategoryLabel(categoryId),
    files: filesByCategory[categoryId] ?? [],
    profileLabel,
  }
}
