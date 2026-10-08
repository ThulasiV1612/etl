import { esignCategoryFromCommitmentProfileId } from "../../constants/deal-investor-esign-status.js";
import {
  portalProfileIdToSignFlowProfileType,
  signFlowFieldAppliesToProfile,
  ESIGN_UNIFIED_CATEGORY_ID,
  type SignFlowProfileType,
} from "../../constants/esignProfileTypes.js";
import { isEsignProviderUnreachableError } from "../esign/esignProviderErrors.js";
import {
  findSignFlowTemplateRecipient,
  getSignFlowDocument,
  type SignFlowDocument,
} from "../esign/signflow.service.js";
import {
  isEsignTemplateReady,
  type EsignTemplateFileRecord,
} from "./dealEsignTemplates.service.js";

/** True when the SignFlow template has ≥1 investor field visible for this profile. */
export function signFlowDocumentHasInvestorFieldsForProfile(
  doc: SignFlowDocument,
  profileType: SignFlowProfileType,
): boolean {
  const investorRecipient = findSignFlowTemplateRecipient(doc, [
    "rec_investor",
    "rec_1",
    "buyer",
    "investor",
    "client",
    "recipient_a",
  ]);
  const sourceRecipientId = investorRecipient?.id?.trim() ?? "";
  const sponsorRecipient = findSignFlowTemplateRecipient(doc, [
    "seller",
    "sponsor",
    "rec_sponsor",
    "rec_2",
    "recipient_b",
  ]);
  const sponsorRecipientId = sponsorRecipient?.id?.trim() ?? "";

  return (doc.fields ?? []).some((field) => {
    const rid = String(field.recipientId ?? "").trim();
    if (sponsorRecipientId && rid === sponsorRecipientId) return false;
    if (sourceRecipientId && rid && rid !== sourceRecipientId) return false;
    return signFlowFieldAppliesToProfile(field, profileType);
  });
}

/** Unified template applies only when ready and scoped investor fields exist for the profile. */
export async function esignTemplateAppliesToInvestorProfile(
  file: EsignTemplateFileRecord,
  profileId: string | null | undefined,
): Promise<boolean> {
  if (!isEsignTemplateReady(file)) return false;

  const pid = String(profileId ?? "").trim();
  const categoryId = esignCategoryFromCommitmentProfileId(pid);

  if (file.categoryId === ESIGN_UNIFIED_CATEGORY_ID) {
    const profileType = portalProfileIdToSignFlowProfileType(pid);
    if (!profileType) return false;
    // Ready unified template serves all LP commitment profiles; field scope is enforced at sign time.
    return isEsignTemplateReady(file);
  }

  if (!categoryId) return false;
  return file.categoryId.trim() === categoryId;
}

/** Templates an investor may sign during onboarding for their commitment profile. */
export async function filterEsignTemplateFilesForInvestorProfile(
  files: EsignTemplateFileRecord[],
  profileId: string | null | undefined,
): Promise<EsignTemplateFileRecord[]> {
  const pid = String(profileId ?? "").trim();
  if (!pid) return files.filter((f) => isEsignTemplateReady(f));

  const out: EsignTemplateFileRecord[] = [];
  for (const file of files) {
    if (await esignTemplateAppliesToInvestorProfile(file, pid)) {
      out.push(file);
    }
  }
  return out;
}

export async function esignTemplateAllowedForInvestorProfile(
  file: EsignTemplateFileRecord,
  profileId: string,
): Promise<boolean> {
  const pid = profileId.trim();
  if (!pid) return isEsignTemplateReady(file);
  if (
    file.categoryId === ESIGN_UNIFIED_CATEGORY_ID &&
    isEsignTemplateReady(file) &&
    portalProfileIdToSignFlowProfileType(pid)
  ) {
    return true;
  }
  const allowed = await filterEsignTemplateFilesForInvestorProfile([file], pid);
  return allowed.length > 0;
}

/** PDF preview — unified templates are viewable per profile before SignFlow "ready". */
export async function esignTemplateViewableForInvestorProfile(
  file: EsignTemplateFileRecord,
  profileId: string,
): Promise<boolean> {
  if (!file.relativePath?.trim()) return false;
  const pid = profileId.trim();
  if (!pid) return true;
  if (
    file.categoryId === ESIGN_UNIFIED_CATEGORY_ID &&
    portalProfileIdToSignFlowProfileType(pid)
  ) {
    return true;
  }
  const categoryId = esignCategoryFromCommitmentProfileId(pid);
  if (!categoryId) return false;
  return file.categoryId.trim() === categoryId;
}

export async function resolveEsignFilesForInvestorProfile(
  files: EsignTemplateFileRecord[],
  profileId: string | null | undefined,
): Promise<EsignTemplateFileRecord[]> {
  const pid = String(profileId ?? "").trim();
  const unifiedReady = files.find(
    (f) =>
      f.categoryId === ESIGN_UNIFIED_CATEGORY_ID && isEsignTemplateReady(f),
  );
  if (unifiedReady) {
    if (!pid) return [unifiedReady];
    if (portalProfileIdToSignFlowProfileType(pid)) return [unifiedReady];
    return [];
  }
  return filterEsignTemplateFilesForInvestorProfile(files, profileId);
}
