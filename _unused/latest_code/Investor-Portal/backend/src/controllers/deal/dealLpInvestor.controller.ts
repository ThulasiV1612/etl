import type { Request, Response } from "express";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  assertDealIdInViewerScope,
  assertDealIdReadableOrAssignedParticipant,
  resolveDealViewerScope,
} from "../../services/deal/dealAccess.service.js";
import { requestedOrganizationIdFromRequest } from "../../services/org/orgResolution.service.js";
import { db } from "../../database/db.js";
import { users } from "../../schema/schema.js";
import { eq } from "drizzle-orm";
import {
  isGeneralPartnerStoredRole,
  isLpInvestorRole,
  resolveInvestorClassForDealInvestment,
} from "../../services/deal/dealInvestment.service.js";
import { reconcileAssigningDealUsersForDeal } from "../../services/deal/assigningDealUser.service.js";
import { sendDealMemberInviteForInvestmentIfRequested } from "../../services/deal/dealMemberInvitationEmail.service.js";
import {
  findDealLpInvestorByDealAndContact,
  findMergedInvestorForLpRosterRow,
  getLpInvestorsTabPayload,
  LP_INVESTOR_ALREADY_ON_DEAL_MESSAGE,
  mapDealLpInvestorRowToEditApi,
  resolveDealLpInvestorForEdit,
  updateDealLpInvestorById,
  updateMyCommittedAmountForLpDeal,
  upsertDealLpInvestor,
} from "../../services/deal/dealLpInvestor.service.js";
import {
  assertEligibleForNewDealRosterAdd,
  isDealRosterEligibilityError,
} from "../../services/user/portalUserRosterGuard.service.js";

function bodyString(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    if (v.length === 0) return "";
    return bodyString(v[v.length - 1]);
  }
  if (v != null) return String(v);
  return "";
}

/** Debounced client saves send `autosave` — do not send invitation email on those requests. */
function isAutosaveJson(b: Record<string, unknown>): boolean {
  const raw = b.autosave;
  if (raw === true) return true;
  const v = bodyString(raw);
  return v === "true" || v === "1" || v.toLowerCase() === "yes";
}

/**
 * GET /deals/:dealId/lp-investors/:lpInvestorId
 * Optional `?contactId=` — when the list row is a `deal_investment` id, resolve via contact.
 */
export async function getDealLpInvestor(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId =
    typeof req.params.dealId === "string"
      ? req.params.dealId
      : req.params.dealId?.[0];
  const lpInvestorId =
    typeof req.params.lpInvestorId === "string"
      ? req.params.lpInvestorId
      : req.params.lpInvestorId?.[0];
  if (!dealId?.trim() || !lpInvestorId?.trim()) {
    res.status(400).json({ message: "Missing deal id or LP investor id" });
    return;
  }

  const contactIdRaw = req.query.contactId ?? req.query.contact_id;
  const contactId =
    typeof contactIdRaw === "string"
      ? contactIdRaw.trim()
      : Array.isArray(contactIdRaw)
        ? String(contactIdRaw[0] ?? "").trim()
        : "";

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdInViewerScope(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }

    const row = await resolveDealLpInvestorForEdit(dealId.trim(), {
      lpInvestorId: lpInvestorId.trim(),
      contactId: contactId || undefined,
    });
    if (!row) {
      res.status(404).json({ message: "LP investor row not found" });
      return;
    }

    const investor = await mapDealLpInvestorRowToEditApi(row);
    res.status(200).json({ investor });
  } catch (err) {
    console.error("getDealLpInvestor:", err);
    res.status(500).json({ message: "Could not load LP investor" });
  }
}

/**
 * POST /deals/:dealId/lp-investors — JSON body (LP investor only; no `deal_investment` row).
 */
export async function postDealLpInvestor(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId =
    typeof req.params.dealId === "string"
      ? req.params.dealId
      : req.params.dealId?.[0];
  if (!dealId?.trim()) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const autosave = isAutosaveJson(b);
  const contactId = bodyString(b.contact_id ?? b.contactId);
  const contactDisplayName = bodyString(
    b.contact_display_name ?? b.contactDisplayName,
  );
  const investorClass = bodyString(b.investor_class ?? b.investorClass);
  const profileId = bodyString(b.profile_id ?? b.profileId);
  const sendInvitationMailRaw = bodyString(
    b.send_invitation_mail ?? b.sendInvitationMail,
  );
  /** Autosave updates draft rows only; invitation mail is persisted/sent on explicit Save. */
  const sendInvitationMail = autosave ? "no" : sendInvitationMailRaw;
  const contactEmail = bodyString(
    b.contact_email ?? b.contactEmail ?? b.email,
  );
  const investorRole = bodyString(
    b.investor_role ?? b.investorRole ?? b.role,
  );
  const percentOfClassOwnership = bodyString(
    b.percent_of_class_ownership ?? b.percentOfClassOwnership,
  );
  const percentOfClassDistributions = bodyString(
    b.percent_of_class_distributions ?? b.percentOfClassDistributions,
  );
  const entityOwnershipPercent = bodyString(
    b.entity_ownership_percent ?? b.entityOwnershipPercent,
  );
  const distributionAllocationPercent = bodyString(
    b.distribution_allocation_percent ?? b.distributionAllocationPercent,
  );

  if (!contactId.trim()) {
    res.status(400).json({ message: "Member (contact) is required" });
    return;
  }

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdInViewerScope(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }

    const classResolution = await resolveInvestorClassForDealInvestment(
      dealId,
      investorClass,
      {
        excludeGp: !isGeneralPartnerStoredRole(investorRole),
      },
    );
    if (!classResolution.ok) {
      res.status(400).json({ message: classResolution.message });
      return;
    }

    if (!autosave) {
      const duplicate = await findDealLpInvestorByDealAndContact(
        dealId,
        contactId,
      );
      if (duplicate) {
        res.status(409).json({ message: LP_INVESTOR_ALREADY_ON_DEAL_MESSAGE });
        return;
      }
    }

    const existingForContact = await findDealLpInvestorByDealAndContact(
      dealId,
      contactId,
    );
    if (!existingForContact) {
      await assertEligibleForNewDealRosterAdd(contactId.trim());
    }

    const row = await upsertDealLpInvestor(dealId, {
      contactMemberId: contactId.trim(),
      contactDisplayName: contactDisplayName.trim(),
      profileId,
      investorClass: classResolution.storedInvestorClass,
      sendInvitationMail,
      addedByUserId: user.id,
      emailFromClient: contactEmail.trim() || null,
      roleFromClient: investorRole.trim() || null,
      percentOfClassOwnership,
      percentOfClassDistributions,
      entityOwnershipPercent,
      distributionAllocationPercent,
    });

    await reconcileAssigningDealUsersForDeal(dealId, user.id);
    if (!autosave) {
      await sendDealMemberInviteForInvestmentIfRequested({
        dealId,
        contactId: contactId.trim(),
        contactDisplayName: contactDisplayName.trim(),
        sendInvitationMail,
        contactEmail: contactEmail.trim() || null,
        invitationSource: "investor",
      });
    }

    const { investors } = await getLpInvestorsTabPayload(dealId, user.id);
    const inv = await findMergedInvestorForLpRosterRow(investors, row);

    res.status(201).json({
      message: "LP investor saved",
      investor: inv ?? null,
    });
  } catch (err) {
    if (isDealRosterEligibilityError(err)) {
      res.status(400).json({ message: err.message });
      return;
    }
    console.error("postDealLpInvestor:", err);
    res.status(500).json({ message: "Could not save LP investor" });
  }
}

/**
 * PUT /deals/:dealId/lp-investors/:lpInvestorId — JSON body.
 */
export async function putDealLpInvestor(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId =
    typeof req.params.dealId === "string"
      ? req.params.dealId
      : req.params.dealId?.[0];
  const lpInvestorId =
    typeof req.params.lpInvestorId === "string"
      ? req.params.lpInvestorId
      : req.params.lpInvestorId?.[0];
  if (!dealId?.trim() || !lpInvestorId?.trim()) {
    res.status(400).json({ message: "Missing deal id or LP investor id" });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const autosave = isAutosaveJson(b);
  const contactId = bodyString(b.contact_id ?? b.contactId);
  const contactDisplayName = bodyString(
    b.contact_display_name ?? b.contactDisplayName,
  );
  const investorClass = bodyString(b.investor_class ?? b.investorClass);
  const profileId = bodyString(b.profile_id ?? b.profileId);
  const sendInvitationMailRaw = bodyString(
    b.send_invitation_mail ?? b.sendInvitationMail,
  );
  /** Autosave updates draft rows only; invitation mail is persisted/sent on explicit Save. */
  const sendInvitationMail = autosave ? "no" : sendInvitationMailRaw;
  const contactEmail = bodyString(
    b.contact_email ?? b.contactEmail ?? b.email,
  );
  const investorRole = bodyString(
    b.investor_role ?? b.investorRole ?? b.role,
  );
  const percentOfClassOwnership = bodyString(
    b.percent_of_class_ownership ?? b.percentOfClassOwnership,
  );
  const percentOfClassDistributions = bodyString(
    b.percent_of_class_distributions ?? b.percentOfClassDistributions,
  );
  const entityOwnershipPercent = bodyString(
    b.entity_ownership_percent ?? b.entityOwnershipPercent,
  );
  const distributionAllocationPercent = bodyString(
    b.distribution_allocation_percent ?? b.distributionAllocationPercent,
  );

  if (!contactId.trim()) {
    res.status(400).json({ message: "Member (contact) is required" });
    return;
  }

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdInViewerScope(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }

    const existing = await resolveDealLpInvestorForEdit(dealId, {
      lpInvestorId,
      contactId: contactId.trim() || undefined,
    });
    if (!existing) {
      res.status(404).json({ message: "LP investor row not found" });
      return;
    }

    const classResolution = await resolveInvestorClassForDealInvestment(
      dealId,
      investorClass,
      {
        excludeGp: !isGeneralPartnerStoredRole(investorRole),
      },
    );
    if (!classResolution.ok) {
      res.status(400).json({ message: classResolution.message });
      return;
    }

    if (!autosave) {
      const duplicate = await findDealLpInvestorByDealAndContact(
        dealId,
        contactId,
      );
      if (
        duplicate &&
        String(duplicate.id).toLowerCase() !==
          String(existing.id).trim().toLowerCase()
      ) {
        res.status(409).json({ message: LP_INVESTOR_ALREADY_ON_DEAL_MESSAGE });
        return;
      }
    }

    const row = await updateDealLpInvestorById(dealId, existing.id, {
      contactMemberId: contactId.trim(),
      contactDisplayName: contactDisplayName.trim(),
      profileId,
      investorClass: classResolution.storedInvestorClass,
      sendInvitationMail,
      addedByUserId: user.id,
      emailFromClient: contactEmail.trim() || null,
      roleFromClient: investorRole.trim() || null,
      percentOfClassOwnership,
      percentOfClassDistributions,
      entityOwnershipPercent,
      distributionAllocationPercent,
    });
    if (!row) {
      res.status(404).json({ message: "Could not update LP investor" });
      return;
    }

    await reconcileAssigningDealUsersForDeal(dealId, user.id);
    if (!autosave) {
      await sendDealMemberInviteForInvestmentIfRequested({
        dealId,
        contactId: contactId.trim(),
        contactDisplayName: contactDisplayName.trim(),
        sendInvitationMail,
          contactEmail: contactEmail.trim() || null,
        invitationSource: "investor",
      });
    }

    const { investors } = await getLpInvestorsTabPayload(dealId, user.id);
    const inv = await findMergedInvestorForLpRosterRow(investors, row);

    res.status(200).json({
      message: "LP investor updated",
      investor: inv ?? null,
    });
  } catch (err) {
    if (isDealRosterEligibilityError(err)) {
      res.status(400).json({ message: err.message });
      return;
    }
    console.error("putDealLpInvestor:", err);
    res.status(500).json({ message: "Could not update LP investor" });
  }
}

/**
 * PATCH /deals/:dealId/lp-investors/my-commitment — LP adds the body amount to their cumulative
 * `deal_investment.commitment_amount` (locked update); optional `profile_id`; creates
 * `deal_investment` when missing (profile required for insert; body amount is the initial total).
 */
export async function patchDealLpInvestorMyCommitment(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId =
    typeof req.params.dealId === "string"
      ? req.params.dealId
      : req.params.dealId?.[0];
  if (!dealId?.trim()) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }

  const b = req.body as Record<string, unknown>;

  console.log("b =>",b);

  const raw =
    bodyString(b.committed_amount ?? b.committedAmount).trim() ||
    bodyString(b.amount).trim();
    
  console.log("raw amount data=>" ,raw);

  const n = Number(String(raw).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) {
    res.status(400).json({
      message: "Additional commitment amount must be a number greater than 0",
    });
    return;
  }

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (
      !(await assertDealIdReadableOrAssignedParticipant(dealId.trim(), scope))
    ) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }

    const [uRow] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const emailNorm = String(uRow?.email ?? "")
      .trim()
      .toLowerCase();
    if (!emailNorm.includes("@")) {
      res.status(400).json({ message: "Missing investor email on account" });
      return;
    }

    const profileRaw = bodyString(b.profile_id ?? b.profileId);
    const result = await updateMyCommittedAmountForLpDeal({
      dealId: dealId.trim(),
      viewerEmailNorm: emailNorm,
      viewerUserId: user.id,
      committedAmount: raw,
      profileId: profileRaw,
    });
    if (!result.ok) {
      res.status(400).json({ message: result.message });
      return;
    }

    await reconcileAssigningDealUsersForDeal(dealId.trim(), user.id);

    const payload = await getLpInvestorsTabPayload(dealId.trim(), user.id);
    res.status(200).json({
      message: "Committed amount saved",
      investorsPayload: payload,
    });


    // console.log("payload  =>", payload);
  } catch (err) {
    console.error("patchDealLpInvestorMyCommitment:", err);
    res.status(500).json({ message: "Could not save committed amount" });
  }
}
