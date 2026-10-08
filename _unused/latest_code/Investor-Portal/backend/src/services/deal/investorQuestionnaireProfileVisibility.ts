import type { InvestorQuestionnaireProfileSectionVisibility } from "./dealInvestorQuestionnaire.service.js";

/** Missing or true means the section is shown for that profile's e-sign template. */
export function isQuestionnaireSectionVisibleForProfile(
  visibility: InvestorQuestionnaireProfileSectionVisibility | undefined,
  profileId: string,
  sectionId: string,
): boolean {
  return visibility?.[profileId]?.[sectionId] !== false;
}
