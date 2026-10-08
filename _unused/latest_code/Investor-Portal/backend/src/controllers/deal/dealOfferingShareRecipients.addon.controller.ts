import type { Request, Response } from "express";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  getAddDealFormForViewerOrAssignedParticipant,
  resolveDealViewerScope,
} from "../../services/deal/dealAccess.service.js";
import { requestedOrganizationIdFromRequest } from "../../services/org/orgResolution.service.js";
import { loadOfferingShareRecipientDirectory } from "../../services/deal/offeringShareRecipientDirectory.service.js";

/**
 * Authenticated: contacts and company members for the deal’s organization (for share-by-email UI).
 * Registered on `/api/v1` in `dealForm.routes.ts` (before `GET /deals/:dealId`).
 */
export async function getDealOfferingShareRecipients(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const rawId = req.params.dealId;
  const dealId =
    typeof rawId === "string" ? rawId : rawId?.[0];
  if (!dealId?.trim()) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    const row = await getAddDealFormForViewerOrAssignedParticipant(
      dealId.trim(),
      scope,
    );
    if (!row) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    const orgId = row.organizationId ? String(row.organizationId).trim() : "";
    const { contacts, members } =
      await loadOfferingShareRecipientDirectory(orgId);
    res.status(200).json({ contacts, members });
  } catch (err) {
    console.error("getDealOfferingShareRecipients:", err);
    res.status(500).json({ message: "Could not load recipients." });
  }
}
