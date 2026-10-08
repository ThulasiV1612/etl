/** Single eSign template category — all investor profile fields on one document. */
export const ESIGN_UNIFIED_CATEGORY_ID = "all_profiles" as const;

const PORTAL_PROFILE_IDS = new Set([
  "individual",
  "custodian_ira_401k",
  "joint_tenancy",
  "llc_corp_trust_etc",
  "llc",
]);

/** SignFlow profile type slugs (see SignFlow fieldTypes PROFILE_TYPE_OPTIONS). */
export type SignFlowProfileType =
  | "individual"
  | "custodian_ira_401k"
  | "joint_tenancy"
  | "llc_corp_partnership_trust_solo_checkbook_ira";

/** Every SignFlow profile type a unified template can target. */
export const ALL_SIGNFLOW_PROFILE_TYPES: SignFlowProfileType[] = [
  "individual",
  "custodian_ira_401k",
  "joint_tenancy",
  "llc_corp_partnership_trust_solo_checkbook_ira",
];

export function portalProfileIdToSignFlowProfileType(
  profileId: string | null | undefined,
): SignFlowProfileType | null {
  const p = String(profileId ?? "").trim();
  if (!p || !PORTAL_PROFILE_IDS.has(p)) return null;
  if (p === "llc_corp_trust_etc" || p === "llc") {
    return "llc_corp_partnership_trust_solo_checkbook_ira";
  }
  return p as SignFlowProfileType;
}

export function signFlowFieldAppliesToProfile(
  field: { profileType?: string; profileTypes?: string[] },
  profileType: SignFlowProfileType,
): boolean {
  const types =
    field.profileTypes?.length
      ? field.profileTypes
      : field.profileType
        ? [field.profileType]
        : undefined;
  return !types?.length || types.includes(profileType);
}

/** Legacy per-profile template folder ids (pre-unified workflow). */
export const LEGACY_ESIGN_PROFILE_CATEGORY_IDS = new Set([
  "individual",
  "custodian_ira_401k",
  "joint_tenancy",
  "llc",
]);

/**
 * True when a stored send category matches the investor's commitment profile category.
 * Unified sends use `all_profiles` and match any legacy investor profile category.
 */
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
