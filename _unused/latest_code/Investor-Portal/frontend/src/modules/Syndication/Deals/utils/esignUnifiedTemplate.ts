/** Single eSign template for all investor profiles (SignFlow profile-scoped fields). */
export const ESIGN_UNIFIED_CATEGORY_ID = "all_profiles" as const;

export const ESIGN_UNIFIED_CATEGORY = {
  id: ESIGN_UNIFIED_CATEGORY_ID,
  label: "All investor profiles",
} as const;

export function dealUsesUnifiedEsignTemplate(
  filesByCategory: Record<string, unknown[]>,
): boolean {
  return (filesByCategory[ESIGN_UNIFIED_CATEGORY_ID]?.length ?? 0) > 0;
}

export function dealUsesLegacyProfileTemplates(
  filesByCategory: Record<string, unknown[]>,
): boolean {
  const legacyIds = [
    "individual",
    "custodian_ira_401k",
    "joint_tenancy",
    "llc",
  ] as const;
  return legacyIds.some((id) => (filesByCategory[id]?.length ?? 0) > 0);
}

const LEGACY_ESIGN_PROFILE_CATEGORY_IDS = new Set([
  "individual",
  "custodian_ira_401k",
  "joint_tenancy",
  "llc",
]);

/** Unified sends (`all_profiles`) match any investor commitment profile category. */
export function esignSendCategoryMatchesInvestorProfile(
  sendCategoryId: string | null | undefined,
  investorLegacyCategoryId: string | null | undefined,
): boolean {
  const sendCat = String(sendCategoryId ?? "").trim();
  const invCat = String(investorLegacyCategoryId ?? "").trim();
  if (!sendCat || !invCat) return true;
  if (sendCat === invCat) return true;
  if (
    sendCat === ESIGN_UNIFIED_CATEGORY_ID &&
    LEGACY_ESIGN_PROFILE_CATEGORY_IDS.has(invCat)
  ) {
    return true;
  }
  return false;
}
