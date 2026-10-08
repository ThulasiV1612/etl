import emailConfig, {
  outgoingMailCcBcc,
  smtpEnvelopeForSendMail,
} from "../../functions/emailconfig.js";
import {
  buildDealEsignStageNotificationEmailHtml,
  buildDealEsignStageNotificationEmailText,
  dealEsignStageNotificationSubject,
} from "../../functions/dealEsignStageNotification.template.js";
import {
  findEsignSendBySignatureRequestId,
  esignSendInvestorActionPending,
  parseEsignStatusBundle,
  type StoredDealInvestorEsignSend,
} from "../../constants/deal-investor-esign-status.js";
import { getAddDealFormById } from "./dealForm.service.js";
import { buildDealMemberInviteLandingUrl } from "./dealMemberInviteToken.service.js";
import {
  listDealSponsorSignerOptions,
  resolveDealLeadSponsorSigner,
} from "./dealEsignSigningWorkflow.service.js";
import {
  listDealEsignInvestorQueue,
  evaluateDealSequentialInvestorSignAccess,
  dealHasSequentialInvestorFirstEsign,
  resolveInvestorDocumentAudienceIds,
  findQueueEntryForEsignTarget,
} from "./dealSequentialEsignWorkflow.service.js";
import {
  readInvestorEsignStatusJson,
  resolveEsignTargetForInvestorRowId,
  updateDealInvestorEsignSend,
  type InvestorEsignRowTarget,
} from "./dealMemberEsignStatus.service.js";
import { resolveEmailForContactMemberId } from "./dealMemberInvitationEmail.service.js";

const SENDER_DISPLAY_NAME =
  process.env.SENDER_DISPLAY_NAME?.trim() || "SyndicationX";

async function sendStageEmail(params: {
  toEmail: string;
  recipientDisplayName: string;
  dealName: string;
  documentNames: string[];
  investorDisplayName?: string;
  portalDealUrl?: string;
  stage: "investor_signed" | "sponsor_signed" | "investor_turn_to_sign";
}): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const to = params.toEmail.trim().toLowerCase();
  if (!to.includes("@")) {
    return { ok: false, error: new Error("Invalid recipient email") };
  }

  try {
    const transporter = emailConfig();
    const fromAddress = process.env.SENDER_EMAIL_ID?.trim() || "";
    if (!fromAddress) {
      return {
        ok: false,
        error: new Error("SENDER_EMAIL_ID is not configured"),
      };
    }

    const templateVars = {
      dealName: params.dealName,
      recipientDisplayName: params.recipientDisplayName,
      recipientEmail: to,
      documentNames: params.documentNames,
      investorDisplayName: params.investorDisplayName,
      senderBrand: SENDER_DISPLAY_NAME,
      portalDealUrl: params.portalDealUrl,
      stage: params.stage,
    };
    const ccBcc = outgoingMailCcBcc();
    await transporter.sendMail({
      from: { name: SENDER_DISPLAY_NAME, address: fromAddress },
      to,
      ...ccBcc,
      envelope: smtpEnvelopeForSendMail({
        fromAddress,
        to,
        cc: ccBcc.cc,
        bcc: ccBcc.bcc,
      }),
      subject: dealEsignStageNotificationSubject(templateVars),
      text: buildDealEsignStageNotificationEmailText(templateVars),
      html: buildDealEsignStageNotificationEmailHtml(templateVars),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

function documentNamesFromSend(send: StoredDealInvestorEsignSend): string[] {
  return (send.documents ?? [])
    .map((d) => d.name.trim())
    .filter(Boolean);
}

async function resolveInvestorEmailForTarget(
  dealId: string,
  target: InvestorEsignRowTarget,
): Promise<{ email: string; displayName: string } | null> {
  const queue = await listDealEsignInvestorQueue(dealId);
  const entry = await findQueueEntryForEsignTarget(dealId, queue, target);
  if (entry?.email?.includes("@")) {
    return { email: entry.email.trim().toLowerCase(), displayName: entry.displayName };
  }

  const ids = await resolveInvestorDocumentAudienceIds(dealId, target);
  for (const id of ids) {
    const resolved = await resolveEmailForContactMemberId(id);
    const email = resolved?.trim().toLowerCase();
    if (email?.includes("@")) {
      return { email, displayName: entry?.displayName ?? email };
    }
  }
  return null;
}

/** Notify lead/admin sponsors when an investor completes their signature. */
export async function notifySponsorsOfInvestorEsignSigned(params: {
  dealId: string;
  target: InvestorEsignRowTarget;
  signatureRequestId: string;
}): Promise<void> {
  const dealId = params.dealId.trim();
  const sigId = params.signatureRequestId.trim();
  if (!dealId || !sigId) return;

  const raw = await readInvestorEsignStatusJson(dealId, params.target);
  const bundle = parseEsignStatusBundle(raw);
  const send = bundle
    ? findEsignSendBySignatureRequestId(bundle, sigId)
    : null;
  if (!send?.signedAt?.trim()) return;
  if (send.sponsorNotifiedAtInvestorSigned?.trim()) return;

  const deal = await getAddDealFormById(dealId);
  const dealName = deal?.dealName?.trim() || "Deal";
  const queue = await listDealEsignInvestorQueue(dealId);
  const entry = queue.find(
    (e) =>
      e.target.table === params.target.table &&
      e.target.id === params.target.id,
  );
  const investorName = entry?.displayName?.trim() || "Investor";
  const docNames = documentNamesFromSend(send);

  const sponsorEmails = new Set<string>();
  const lead = await resolveDealLeadSponsorSigner(dealId);
  if (lead?.email?.includes("@")) sponsorEmails.add(lead.email.trim().toLowerCase());
  const options = await listDealSponsorSignerOptions(dealId);
  for (const opt of options) {
    if (opt.email?.includes("@")) sponsorEmails.add(opt.email.trim().toLowerCase());
  }

  let sentAny = false;
  for (const email of sponsorEmails) {
    const opt = options.find((o) => o.email === email);
    const result = await sendStageEmail({
      toEmail: email,
      recipientDisplayName: opt?.name?.trim() || email,
      dealName,
      documentNames: docNames,
      investorDisplayName: investorName,
      stage: "investor_signed",
    });
    if (result.ok) sentAny = true;
    else console.warn("notifySponsorsOfInvestorEsignSigned:", result.error);
  }

  if (sentAny) {
    await updateDealInvestorEsignSend(dealId, params.target, sigId, (current) => ({
      ...current,
      sponsorNotifiedAtInvestorSigned: new Date().toISOString(),
    }));
  }
}

/** Notify investor when sponsor counter-signs their document. */
export async function notifyInvestorOfSponsorEsignSigned(params: {
  dealId: string;
  target: InvestorEsignRowTarget;
  signatureRequestId: string;
}): Promise<void> {
  const dealId = params.dealId.trim();
  const sigId = params.signatureRequestId.trim();
  if (!dealId || !sigId) return;

  const raw = await readInvestorEsignStatusJson(dealId, params.target);
  const bundle = parseEsignStatusBundle(raw);
  const send = bundle
    ? findEsignSendBySignatureRequestId(bundle, sigId)
    : null;
  if (!send?.completedAt?.trim()) return;
  if (send.investorNotifiedAtSponsorSigned?.trim()) return;

  const investor = await resolveInvestorEmailForTarget(dealId, params.target);
  if (!investor?.email) return;

  const deal = await getAddDealFormById(dealId);
  const dealName = deal?.dealName?.trim() || "Deal";
  const portalUrl =
    (await buildDealMemberInviteLandingUrl(dealId, investor.email)) || "";
  const docNames = documentNamesFromSend(send);

  const result = await sendStageEmail({
    toEmail: investor.email,
    recipientDisplayName: investor.displayName,
    dealName,
    documentNames: docNames,
    portalDealUrl: portalUrl,
    stage: "sponsor_signed",
  });

  if (result.ok) {
    await updateDealInvestorEsignSend(dealId, params.target, sigId, (current) => ({
      ...current,
      investorNotifiedAtSponsorSigned: new Date().toISOString(),
    }));
  } else {
    console.warn("notifyInvestorOfSponsorEsignSigned:", result.error);
  }
}

/** Notify investors whose sequential signing turn just opened (after prior signers finish). */
export async function notifySequentialInvestorsSignTurnAvailable(
  dealId: string,
): Promise<void> {
  const id = dealId.trim();
  if (!id) return;
  if (!(await dealHasSequentialInvestorFirstEsign(id))) return;

  const queue = await listDealEsignInvestorQueue(id);
  const deal = await getAddDealFormById(id);
  const dealName = deal?.dealName?.trim() || "Deal";

  for (const entry of queue) {
    const access = await evaluateDealSequentialInvestorSignAccess(
      id,
      entry.target,
    );
    if (!access.allowed) continue;

    const raw = await readInvestorEsignStatusJson(id, entry.target);
    const bundle = parseEsignStatusBundle(raw);
    if (!bundle?.sends.length) continue;

    const investor = await resolveInvestorEmailForTarget(id, entry.target);
    if (!investor?.email) continue;

    const portalUrl =
      (await buildDealMemberInviteLandingUrl(id, investor.email)) || "";

    for (const send of bundle.sends) {
      const sigId = send.signatureRequestId?.trim();
      if (!sigId || !send.sentAt?.trim()) continue;
      if (!esignSendInvestorActionPending(send)) continue;
      if (send.investorNotifiedAtSignTurnAvailable?.trim()) continue;

      const docNames = documentNamesFromSend(send);
      const result = await sendStageEmail({
        toEmail: investor.email,
        recipientDisplayName: investor.displayName,
        dealName,
        documentNames: docNames,
        portalDealUrl: portalUrl,
        stage: "investor_turn_to_sign",
      });

      if (result.ok) {
        await updateDealInvestorEsignSend(id, entry.target, sigId, (current) => ({
          ...current,
          investorNotifiedAtSignTurnAvailable: new Date().toISOString(),
        }));
      } else {
        console.warn("notifySequentialInvestorsSignTurnAvailable:", result.error);
      }
    }
  }
}

/** Run stage notifications after esign sync for one target. */
export async function runEsignStageNotificationsForTarget(
  dealId: string,
  target: InvestorEsignRowTarget,
): Promise<void> {
  const raw = await readInvestorEsignStatusJson(dealId, target);
  const bundle = parseEsignStatusBundle(raw);
  if (!bundle?.sends.length) return;

  for (const send of bundle.sends) {
    const sigId = send.signatureRequestId?.trim();
    if (!sigId) continue;
    if (send.signedAt?.trim() && !send.sponsorNotifiedAtInvestorSigned?.trim()) {
      await notifySponsorsOfInvestorEsignSigned({
        dealId,
        target,
        signatureRequestId: sigId,
      });
    }
    if (
      send.completedAt?.trim() &&
      !send.investorNotifiedAtSponsorSigned?.trim()
    ) {
      await notifyInvestorOfSponsorEsignSigned({
        dealId,
        target,
        signatureRequestId: sigId,
      });
    }
  }

  await notifySequentialInvestorsSignTurnAvailable(dealId);
}

export async function resolveEsignTargetFromInvestorRowId(
  dealId: string,
  investorRowId: string,
): Promise<InvestorEsignRowTarget | null> {
  return resolveEsignTargetForInvestorRowId(dealId, investorRowId);
}
