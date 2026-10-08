import type { OfferingDetailsSectionId } from "./offeringPreviewInvestorVisibility"

/** Section help shown via (i) beside accordion headings on Offering details. */
export const OFFERING_DETAILS_SECTION_INFO: Partial<
  Record<OfferingDetailsSectionId, string>
> = {
  make_announcement:
    "Publish an update at the top of this deal for everyone who can open this deal (any tab). Leave title or message empty to hide the banner after you clear or save empty fields.",
  overview:
    "Set how this offering appears to investors. Deal structure, linked assets, and class economics can be edited here; full class setup stays under Classes. Property location and entity details remain on the main deal profile.",
  offering_information:
    "Manage investor classes, ownership, and economics for this offering. Open a class to edit capitalization and terms in Class Setup.",
}
