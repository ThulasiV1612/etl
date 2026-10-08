import emailConfig, {
  outgoingMailCcBcc,
  smtpEnvelopeForSendMail,
} from "../../functions/emailconfig.js";
import {
  buildDealPlanUpgradeAlertEmailHtml,
  buildDealPlanUpgradeAlertEmailText,
} from "../../functions/dealPlanUpgradeAlertEmail.template.js";
import { pool } from "../../database/db.js";

const SENDER_DISPLAY_NAME =
  process.env.SENDER_DISPLAY_NAME?.trim() || "SyndicationX";

const DEAL_INVESTMENT_AUTOSAVE_CONTACT = "__portal_investment_autosave__";

const SQL_ROLE_IS_LEAD = `(
  lower(trim(%COL%)) IN ('lead sponsor', 'lead_sponsor')
  OR (
    position('lead' in lower(trim(%COL%))) > 0
    AND position('sponsor' in lower(trim(%COL%))) > 0
    AND position('admin' in lower(trim(%COL%))) = 0
  )
)`;

function sqlRoleIsLead(columnSql: string): string {
  return SQL_ROLE_IS_LEAD.replaceAll("%COL%", columnSql);
}

function frontendOrigin(): string {
  const candidates = [
    process.env.FRONTEND_URL,
    process.env.BASE_URL,
    process.env.APP_URL,
    process.env.CLIENT_URL,
    process.env.PUBLIC_APP_URL,
  ];
  for (const raw of candidates) {
    const t = String(raw ?? "").trim();
    if (t) return t.replace(/\/$/, "");
  }
  return "";
}

function upgradeBillingUrl(dealId: string, dealName: string): string {
  const origin = frontendOrigin();
  const params = new URLSearchParams({ billing: "upgrade", dealId });
  const name = dealName.trim();
  if (name) params.set("dealName", name);
  const path = `/settings?${params.toString()}`;
  return origin ? `${origin}${path}` : path;
}

/** dealId -> last suggested plan we emailed (skip repeats on every class save). */
const lastEmailedSuggestedPlan = new Map<string, string>();

export function clearDealPlanUpgradeAlertDedup(dealId: string): void {
  const id = String(dealId ?? "").trim().toLowerCase();
  if (id) lastEmailedSuggestedPlan.delete(id);
}

async function listLeadSponsorEmailsForDeal(dealId: string): Promise<string[]> {
  const res = await pool.query<{ email: string }>(
    `SELECT DISTINCT lower(trim(email)) AS email FROM (
       SELECT u.email AS email
       FROM deal_member dm
       INNER JOIN users u ON u.id::text = trim(dm.contact_member_id)
       WHERE dm.deal_id = $1::uuid
         AND ${sqlRoleIsLead("dm.deal_member_role")}
         AND u.email IS NOT NULL AND trim(u.email) <> ''
       UNION
       SELECT c.email AS email
       FROM deal_member dm
       INNER JOIN contact c ON c.id::text = trim(dm.contact_member_id)
       WHERE dm.deal_id = $1::uuid
         AND ${sqlRoleIsLead("dm.deal_member_role")}
         AND c.email IS NOT NULL AND trim(c.email) <> ''
       UNION
       SELECT u.email AS email
       FROM deal_investment di
       INNER JOIN users u ON u.id::text = trim(di.contact_id)
       WHERE di.deal_id = $1::uuid
         AND ${sqlRoleIsLead("di.investor_role")}
         AND trim(di.contact_id) <> $2
         AND u.email IS NOT NULL AND trim(u.email) <> ''
       UNION
       SELECT c.email AS email
       FROM deal_investment di
       INNER JOIN contact c ON c.id::text = trim(di.contact_id)
       WHERE di.deal_id = $1::uuid
         AND ${sqlRoleIsLead("di.investor_role")}
         AND trim(di.contact_id) <> $2
         AND c.email IS NOT NULL AND trim(c.email) <> ''
     ) emails
     WHERE email IS NOT NULL AND position('@' in email) > 1`,
    [dealId, DEAL_INVESTMENT_AUTOSAVE_CONTACT],
  );
  return [
    ...new Set(
      res.rows
        .map((r) => String(r.email ?? "").trim().toLowerCase())
        .filter((e) => e.includes("@")),
    ),
  ];
}

async function sendUpgradeEmail(params: {
  to: string;
  dealName: string;
  currentPlanLabel: string;
  nextPlanLabel: string;
  portalBillingUrl: string;
}): Promise<void> {
  const transporter = emailConfig();
  const fromAddress = process.env.SENDER_EMAIL_ID?.trim() || "";
  if (!fromAddress) {
    throw new Error("SENDER_EMAIL_ID is not configured");
  }
  const ccBcc = outgoingMailCcBcc();
  const vars = {
    dealName: params.dealName,
    currentPlanLabel: params.currentPlanLabel,
    nextPlanLabel: params.nextPlanLabel,
    portalBillingUrl: params.portalBillingUrl,
    senderBrand: SENDER_DISPLAY_NAME,
  };
  await transporter.sendMail({
    from: { name: SENDER_DISPLAY_NAME, address: fromAddress },
    to: params.to,
    ...ccBcc,
    envelope: smtpEnvelopeForSendMail({
      fromAddress,
      to: params.to,
      cc: ccBcc.cc,
      bcc: ccBcc.bcc,
    }),
    subject: `Upgrade billing for ${params.dealName}`,
    text: buildDealPlanUpgradeAlertEmailText(vars),
    html: buildDealPlanUpgradeAlertEmailHtml(vars),
  });
}

function planLabel(planId: string): string {
  const id = planId.trim().toLowerCase();
  if (id === "running") return "Running";
  if (id === "growth") return "Growth";
  if (id === "starter") return "Starter";
  return planId.trim() || "the required plan";
}

/**
 * Email unique lead sponsors that this deal's paid plan is below the
 * plan required by current raise size. Dedupes per deal + suggested plan.
 */
export async function notifyLeadSponsorsOfDealPlanUpgrade(params: {
  dealId: string;
  dealName: string;
  currentPlanId: string;
  suggestedPlanId: string;
}): Promise<void> {
  const dealId = String(params.dealId ?? "").trim().toLowerCase();
  const suggested = String(params.suggestedPlanId ?? "").trim().toLowerCase();
  const current = String(params.currentPlanId ?? "").trim().toLowerCase();
  if (!dealId || !suggested || !current) return;
  if (lastEmailedSuggestedPlan.get(dealId) === suggested) return;

  const recipients = await listLeadSponsorEmailsForDeal(dealId);
  if (recipients.length === 0) {
    console.warn(
      "notifyLeadSponsorsOfDealPlanUpgrade: no lead sponsor emails",
      dealId,
    );
    return;
  }

  const dealName = params.dealName.trim() || "this deal";
  const portalBillingUrl = upgradeBillingUrl(dealId, dealName);
  let emailed = 0;
  for (const to of recipients) {
    try {
      await sendUpgradeEmail({
        to,
        dealName,
        currentPlanLabel: planLabel(current),
        nextPlanLabel: planLabel(suggested),
        portalBillingUrl,
      });
      emailed += 1;
    } catch (err) {
      console.warn("notifyLeadSponsorsOfDealPlanUpgrade:", to, err);
    }
  }
  if (emailed > 0) lastEmailedSuggestedPlan.set(dealId, suggested);
}
