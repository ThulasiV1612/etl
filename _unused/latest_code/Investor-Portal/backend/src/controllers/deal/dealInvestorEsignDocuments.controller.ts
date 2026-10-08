import type { Request, Response } from "express";
import {
  esignBundleHasPending,
  esignBundleIsAllCompleted,
  esignCategoryFromCommitmentProfileId,
  esignProfileSendsCompleteForInvestor,
  esignProfileSendsPendingForInvestor,
  esignSignedColumnLabelFromApi,
  parseEsignStatusBundle,
  parseEsignStatusJson,
  primaryCategoryForSend,
} from "../../constants/deal-investor-esign-status.js";
import { esignSendCategoryMatchesInvestorProfile } from "../../constants/esignProfileTypes.js";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  assertDealIdInViewerScope,
  assertDealIdReadableOrAssignedParticipant,
  resolveDealViewerScope,
} from "../../services/deal/dealAccess.service.js";
import { requestedOrganizationIdFromRequest } from "../../services/org/orgResolution.service.js";
import {
  dealHasSequentialInvestorFirstEsign,
  dealHasInvestorFirstCounterSignEsign,
  evaluateDealSequentialInvestorSignAccess,
  sequentialWorkflowInvestorPortalDocsGateOpen,
} from "../../services/deal/dealSequentialEsignWorkflow.service.js";
import {
  listMyEsignDocumentsForInvestor,
  maybeSyncDealInvestorEsignByTarget,
  syncDealInvestorEsignAfterEmbeddedSign,
  syncDealInvestorEsignByTarget,
  syncDealInvestorEsignSignProgress,
} from "../../services/deal/dealMemberEsignCompletion.service.js";
import {
  findInvestorEsignContextBySignatureRequestId,
  investorEsignTargetHasPositiveCommitment,
  markDealInvestorEsignViewed,
  readInvestorEsignStatusJson,
  resolveInvestorEsignTargetForSignedInInvestor,
  type InvestNowEsignTargetOpts,
} from "../../services/deal/dealMemberEsignStatus.service.js";
import { getDealMyEsignSignSession } from "../../services/deal/dealMemberEsignSignSession.service.js";
import { readOfferingInvestorPreviewJsonAfterEsignSync } from "../../services/deal/dealEsignDocumentsWorkspaceSync.service.js";
import { getDealSponsorEsignSignSession } from "../../services/deal/dealSponsorEsignSignSession.service.js";
import { isPortalUserSponsorOnDeal } from "../../services/deal/dealMemberScope.service.js";
import { scopeOfferingInvestorPreviewJsonForViewer } from "../../services/deal/dealDocumentCoSponsorVisibility.service.js";

function queryString(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v) && v.length > 0) return queryString(v[v.length - 1]);
  return "";
}

function investNowEsignScopeFromRequest(
  req: Request,
  email: string,
  userId: string,
): InvestNowEsignTargetOpts {
  const q = req.query as Record<string, unknown>;
  return {
    email,
    userId,
    investmentId: queryString(q.investment_id ?? q.investmentId),
    userInvestorProfileId: queryString(
      q.user_investor_profile_id ?? q.userInvestorProfileId,
    ),
    profileId: queryString(q.profile_id ?? q.profileId),
  };
}

/**
 * GET /deals/:dealId/my-esign-documents
 * eSign documents for the signed-in investor: template previews while pending,
 * signed PDF after completion.
 */
export async function getDealMyEsignDocuments(
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

  const email = String(user.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) {
    res.status(400).json({ message: "Your account has no email on file" });
    return;
  }

  try {
    const viewerScope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdReadableOrAssignedParticipant(dealId, viewerScope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }

    const esignScope = investNowEsignScopeFromRequest(req, email, user.id);
    const target = await resolveInvestorEsignTargetForSignedInInvestor(
      dealId,
      esignScope,
    );
    if (!target) {
      res.status(200).json({
        documents: [],
        esignCompleted: false,
        esignPending: false,
      });
      return;
    }

    if (!(await investorEsignTargetHasPositiveCommitment(dealId, target))) {
      res.status(200).json({
        documents: [],
        esignCompleted: false,
        esignPending: false,
      });
      return;
    }

    await maybeSyncDealInvestorEsignByTarget(dealId, target);

    const raw = await readInvestorEsignStatusJson(dealId, target);
    const bundle = parseEsignStatusBundle(raw);
    const preferredCategoryId = esignCategoryFromCommitmentProfileId(
      esignScope.profileId,
    );
    let documents = await listMyEsignDocumentsForInvestor(dealId, raw, target);
    if (preferredCategoryId) {
      documents = documents.filter((d) => {
        const docCat = d.categoryId?.trim();
        if (!docCat) return true;
        return esignSendCategoryMatchesInvestorProfile(
          docCat,
          preferredCategoryId,
        );
      });
    }
    const esignStatus = parseEsignStatusJson(raw, preferredCategoryId);
    const profileSends =
      bundle && preferredCategoryId
        ? bundle.sends.filter((s) =>
            esignSendCategoryMatchesInvestorProfile(
              primaryCategoryForSend(s),
              preferredCategoryId,
            ),
          )
        : bundle?.sends ?? [];
    const workflowLabel = esignSignedColumnLabelFromApi(esignStatus) ?? "Sent";
    const investorPortalDocumentsGateOpen =
      await sequentialWorkflowInvestorPortalDocsGateOpen(dealId);
    const isSequentialInvestorFirst =
      await dealHasSequentialInvestorFirstEsign(dealId);
    const isInvestorFirstCounterSign =
      await dealHasInvestorFirstCounterSignEsign(dealId);
    const esignCompleted =
      profileSends.length > 0
        ? esignProfileSendsCompleteForInvestor(profileSends)
        : bundle
          ? esignBundleIsAllCompleted(bundle)
          : false;
    const signTurnOpen = target
      ? (await evaluateDealSequentialInvestorSignAccess(dealId, target)).allowed
      : true;
    const awaitingSequentialSignTurn =
      isSequentialInvestorFirst && !signTurnOpen && !esignCompleted;
    const awaitingSponsorCounterSign =
      isInvestorFirstCounterSign &&
      investorPortalDocumentsGateOpen &&
      esignCompleted &&
      documents.every((d) => !d.url?.trim());
    const hasUnsignedSends =
      profileSends.length > 0
        ? esignProfileSendsPendingForInvestor(profileSends)
        : bundle
          ? esignBundleHasPending(bundle)
          : false;

    res.status(200).json({
      documents,
      investorPortalDocumentsGateOpen,
      sequentialSignTurnOpen: signTurnOpen,
      awaitingSequentialSignTurn,
      awaitingSponsorCounterSign,
      esignCompleted,
      esignPending: hasUnsignedSends && signTurnOpen,
      esignStatus,
      workflowLabel,
      completedAt: esignStatus?.completedAt ?? null,
      sentAt: esignStatus?.sentAt ?? null,
    });
  } catch (err) {
    console.error("getDealMyEsignDocuments:", err);
    res.status(500).json({ message: "Could not load eSign documents" });
  }
}

/**
 * GET /deals/:dealId/my-esign-sign-session
 * Fresh embedded sign URL + public client id for hellosign-embedded (investor portal).
 */
export async function getDealMyEsignSignSessionHandler(
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

  const email = String(user.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) {
    res.status(400).json({ message: "Your account has no email on file" });
    return;
  }

  try {
    const viewerScope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdReadableOrAssignedParticipant(dealId, viewerScope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }

    const signatureRequestId =
      typeof req.query.signatureRequestId === "string"
        ? req.query.signatureRequestId
        : typeof req.query.signature_request_id === "string"
          ? req.query.signature_request_id
          : undefined;

    const esignScope = investNowEsignScopeFromRequest(req, email, user.id);
    const result = await getDealMyEsignSignSession({
      dealId,
      email,
      userId: user.id,
      signatureRequestId,
      userInvestorProfileId: esignScope.userInvestorProfileId,
      investmentId: esignScope.investmentId,
      profileId: esignScope.profileId,
    });
    if (!result.ok) {
      const status =
        result.code === "not_configured"
          ? 503
          : result.code === "not_found"
            ? 404
            : result.code === "waiting_for_prior_signer"
              ? 409
              : 400;
      res.status(status).json({
        message: result.message,
        ...(result.code ? { code: result.code } : {}),
        ...(result.waitingFor ? { waitingFor: result.waitingFor } : {}),
      });
      return;
    }

    res.status(200).json({
      alreadyCompleted: result.alreadyCompleted,
      provider: result.provider,
      signUrl: result.signUrl,
      clientId: result.clientId,
      testMode: result.testMode,
      configured: result.configured,
      signatureRequestId: result.signatureRequestId ?? null,
      embedApiKey: result.embedApiKey ?? null,
      appBaseUrl: result.appBaseUrl ?? null,
      documentId: result.documentId ?? null,
    });
  } catch (err) {
    console.error("getDealMyEsignSignSessionHandler:", err);
    res.status(500).json({ message: "Could not load eSign signing session" });
  }
}

/**
 * POST /deals/:dealId/my-esign-sync
 * Pull latest Dropbox Sign state after embedded signing (Invest Now / portal).
 */
export async function postDealMyEsignSync(
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

  const email = String(user.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) {
    res.status(400).json({ message: "Your account has no email on file" });
    return;
  }

  const body = req.body as Record<string, unknown> | undefined;
    const signatureRequestId = String(
      body?.signatureRequestId ??
        body?.signature_request_id ??
        "",
    ).trim();
    const phase = String(body?.phase ?? body?.event ?? "finish")
      .trim()
      .toLowerCase();

    try {
    const viewerScope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdReadableOrAssignedParticipant(dealId, viewerScope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }

    const esignScope = investNowEsignScopeFromRequest(req, email, user.id);
    if (body) {
      const fromBody = queryString(
        body.investment_id ?? body.investmentId,
      );
      const fromBodyUip = queryString(
        body.user_investor_profile_id ?? body.userInvestorProfileId,
      );
      const fromBodyProfile = queryString(body.profile_id ?? body.profileId);
      if (fromBody) esignScope.investmentId = fromBody;
      if (fromBodyUip) esignScope.userInvestorProfileId = fromBodyUip;
      if (fromBodyProfile) esignScope.profileId = fromBodyProfile;
    }
    const target = await resolveInvestorEsignTargetForSignedInInvestor(
      dealId,
      esignScope,
    );
    if (!target) {
      res.status(200).json({
        esignStatus: null,
        esignCompleted: false,
        esignPending: false,
      });
      return;
    }

    if (!(await investorEsignTargetHasPositiveCommitment(dealId, target))) {
      res.status(200).json({
        esignStatus: null,
        esignCompleted: false,
        esignPending: false,
      });
      return;
    }

    if (phase === "sign") {
      await syncDealInvestorEsignSignProgress(
        dealId,
        target,
        signatureRequestId || undefined,
      );
    } else {
      await syncDealInvestorEsignAfterEmbeddedSign(
        dealId,
        target,
        signatureRequestId || undefined,
      );
    }

    const raw = await readInvestorEsignStatusJson(dealId, target);
    const bundle = parseEsignStatusBundle(raw);
    const preferredCategoryId = esignCategoryFromCommitmentProfileId(
      esignScope.profileId,
    );
    const profileSends =
      bundle && preferredCategoryId
        ? bundle.sends.filter((s) =>
            esignSendCategoryMatchesInvestorProfile(
              primaryCategoryForSend(s),
              preferredCategoryId,
            ),
          )
        : bundle?.sends ?? [];
    const esignStatus = parseEsignStatusJson(raw, preferredCategoryId);

    res.status(200).json({
      esignStatus,
      workflowLabel: esignSignedColumnLabelFromApi(esignStatus) ?? "Sent",
      esignCompleted:
        profileSends.length > 0
          ? esignProfileSendsCompleteForInvestor(profileSends)
          : bundle
            ? esignBundleIsAllCompleted(bundle)
            : false,
      esignPending:
        profileSends.length > 0
          ? esignProfileSendsPendingForInvestor(profileSends)
          : bundle
            ? esignBundleHasPending(bundle)
            : false,
    });
  } catch (err) {
    console.error("postDealMyEsignSync:", err);
    res.status(500).json({ message: "Could not sync eSign status" });
  }
}

function investNowEsignScopeFromBody(
  body: Record<string, unknown> | undefined,
): Pick<
  InvestNowEsignTargetOpts,
  "userInvestorProfileId" | "investmentId" | "profileId"
> {
  return {
    investmentId: queryString(body?.investmentId ?? body?.investment_id),
    userInvestorProfileId: queryString(
      body?.userInvestorProfileId ?? body?.user_investor_profile_id,
    ),
    profileId: queryString(body?.profileId ?? body?.profile_id),
  };
}

async function resolveMyEsignTargetForUser(
  dealId: string,
  userId: string,
  email: string,
  scope?: Pick<
    InvestNowEsignTargetOpts,
    "userInvestorProfileId" | "investmentId" | "profileId"
  >,
) {
  return resolveInvestorEsignTargetForSignedInInvestor(dealId, {
    email,
    userId,
    ...scope,
  });
}

/**
 * POST /deals/:dealId/my-esign-mark-viewed
 * Invest Now: investor opened preview or signing UI (Dropbox Document History → Viewed).
 */
export async function postDealMyEsignMarkViewed(
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

  const email = String(user.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) {
    res.status(400).json({ message: "Your account has no email on file" });
    return;
  }

  const body = req.body as Record<string, unknown> | undefined;
  const signatureRequestId = String(
    body?.signatureRequestId ?? body?.signature_request_id ?? "",
  ).trim();

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdReadableOrAssignedParticipant(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }

    const esignScope = investNowEsignScopeFromRequest(req, email, user.id);
    const bodyScope = investNowEsignScopeFromBody(body);
    const target = await resolveMyEsignTargetForUser(dealId, user.id, email, {
      userInvestorProfileId:
        bodyScope.userInvestorProfileId || esignScope.userInvestorProfileId,
      investmentId: bodyScope.investmentId || esignScope.investmentId,
      profileId: bodyScope.profileId || esignScope.profileId,
    });
    if (!target || !signatureRequestId) {
      res.status(200).json({ ok: false });
      return;
    }

    await markDealInvestorEsignViewed(dealId, target, signatureRequestId);

    const raw = await readInvestorEsignStatusJson(dealId, target);
    const preferredCategoryId = esignCategoryFromCommitmentProfileId(
      bodyScope.profileId || esignScope.profileId,
    );
    const esignStatus = parseEsignStatusJson(raw, preferredCategoryId);

    res.status(200).json({
      ok: true,
      workflowLabel: esignSignedColumnLabelFromApi(esignStatus) ?? "Sent",
      esignStatus,
    });
  } catch (err) {
    console.error("postDealMyEsignMarkViewed:", err);
    res.status(500).json({ message: "Could not record viewed status" });
  }
}

/**
 * POST /deals/:dealId/documents/sync-esign-completed
 * Mirror investor-signed eSign PDFs into the Documents tab (Investor e signatures section).
 */
export async function postSyncCompletedEsignDocuments(
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

  try {
    const viewerScope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdInViewerScope(dealId, viewerScope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }

    const offeringInvestorPreviewJson =
      await scopeOfferingInvestorPreviewJsonForViewer({
        dealId,
        viewerUserId: user.id,
        viewerRole: user.userRole,
        json: await readOfferingInvestorPreviewJsonAfterEsignSync(dealId),
      });
    res.status(200).json({ offeringInvestorPreviewJson });
  } catch (err) {
    console.error("postSyncCompletedEsignDocuments:", err);
    res.status(500).json({ message: "Could not sync eSign documents" });
  }
}

/**
 * GET /deals/:dealId/sponsor-esign-sign-session
 * Sponsor counter-sign embedded session for an investor-signed eSign document.
 */
export async function getDealSponsorEsignSignSessionHandler(
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

  const email = String(user.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) {
    res.status(400).json({ message: "Your account has no email on file" });
    return;
  }

  const q = req.query as Record<string, unknown>;
  const signatureRequestId = queryString(
    q.signatureRequestId ?? q.signature_request_id,
  );
  const assigneeMemberRowId = queryString(
    q.assigneeMemberRowId ?? q.assignee_member_row_id,
  );

  if (!signatureRequestId) {
    res.status(400).json({ message: "signatureRequestId is required" });
    return;
  }

  try {
    const viewerScope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdInViewerScope(dealId, viewerScope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }

    const result = await getDealSponsorEsignSignSession({
      dealId,
      sponsorUserId: user.id,
      sponsorEmail: email,
      signatureRequestId,
      assigneeMemberRowId: assigneeMemberRowId || undefined,
    });

    if (!result.ok) {
      const status =
        result.code === "not_configured"
          ? 503
          : result.code === "forbidden"
            ? 403
            : result.code === "waiting_for_prior_signer"
              ? 409
              : result.code === "not_ready"
                ? 409
                : 404;
      res.status(status).json({
        message: result.message,
        ...(result.code ? { code: result.code } : {}),
        ...(result.waitingFor ? { waitingFor: result.waitingFor } : {}),
      });
      return;
    }

    res.status(200).json({
      alreadyCompleted: result.alreadyCompleted,
      needsSignerSelection: result.needsSignerSelection ?? false,
      provider: result.provider,
      signUrl: result.signUrl,
      clientId: result.clientId,
      testMode: result.testMode,
      configured: result.configured,
      signatureRequestId: result.signatureRequestId,
      embedApiKey: result.embedApiKey ?? null,
      appBaseUrl: result.appBaseUrl ?? null,
      documentId: result.documentId ?? null,
      canAssignSigner: result.canAssignSigner,
      signerOptions: result.signerOptions,
      assignedSignerEmail: result.assignedSignerEmail,
      assignedSignerName: result.assignedSignerName,
    });
  } catch (err) {
    console.error("getDealSponsorEsignSignSessionHandler:", err);
    res.status(500).json({ message: "Could not load sponsor signing session" });
  }
}

/**
 * POST /deals/:dealId/sponsor-esign-sync
 * Pull latest eSign state after sponsor embedded signing and refresh Documents tab.
 */
export async function postDealSponsorEsignSync(
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

  const body = req.body as Record<string, unknown> | undefined;
  const signatureRequestId = String(
    body?.signatureRequestId ?? body?.signature_request_id ?? "",
  ).trim();

  try {
    const viewerScope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdInViewerScope(dealId, viewerScope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }

    if (!(await isPortalUserSponsorOnDeal(dealId, user.id))) {
      res.status(403).json({ message: "Only deal sponsors can sync sponsor eSign" });
      return;
    }

    if (signatureRequestId) {
      const context =
        await findInvestorEsignContextBySignatureRequestId(signatureRequestId);
      if (context?.dealId === dealId) {
        await syncDealInvestorEsignByTarget(dealId, context.target);
      }
    }

    const offeringInvestorPreviewJson =
      await scopeOfferingInvestorPreviewJsonForViewer({
        dealId,
        viewerUserId: user.id,
        viewerRole: user.userRole,
        json: await readOfferingInvestorPreviewJsonAfterEsignSync(dealId),
      });

    res.status(200).json({
      ok: true,
      offeringInvestorPreviewJson,
    });
  } catch (err) {
    console.error("postDealSponsorEsignSync:", err);
    res.status(500).json({ message: "Could not sync sponsor eSign" });
  }
}
