import { pool } from "../../database/db.js";
import {
  normalizeEsignSignflowWorkflowType,
  resolveEsignSignflowSigningOrder,
  resolveEsignSignflowWorkflowType,
  resolveSignFlowRecipientOrders,
  type EsignSignflowSigningOrder,
  type EsignSignflowWorkflowType,
} from "../../constants/esignSigningWorkflow.js";
import {
  getSignFlowDocument,
  patchSignFlowDocument,
} from "../esign/signflow.service.js";
import type { EsignTemplateFileRecord } from "./dealEsignTemplates.service.js";

export type DealSponsorSigner = {
  email: string;
  name: string;
};

function formatSignerName(row: {
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  contact_name: string | null;
  email: string;
}): string {
  const fromUser = [row.first_name, row.last_name]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  if (fromUser) return fromUser;
  const contactName = row.contact_name?.trim();
  if (contactName) return contactName;
  const username = row.username?.trim();
  if (username) return username;
  return row.email;
}

/** Resolves the lead sponsor (or admin sponsor fallback) email for eSign sends. */
export async function resolveDealLeadSponsorSigner(
  dealId: string,
): Promise<DealSponsorSigner | null> {
  const d = String(dealId ?? "").trim();
  if (!d) return null;

  const res = await pool.query<{
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    contact_name: string | null;
  }>(
    `SELECT
       email,
       first_name,
       last_name,
       username,
       contact_name
     FROM (
       SELECT
         COALESCE(
           NULLIF(trim(u.email), ''),
           NULLIF(trim(c.email), ''),
           CASE
             WHEN trim(dm.contact_member_id) LIKE '%@%' THEN lower(trim(dm.contact_member_id))
           END
         ) AS email,
         u.first_name,
         u.last_name,
         u.username,
         trim(concat_ws(' ', c.first_name, c.last_name)) AS contact_name,
         CASE lower(trim(dm.deal_member_role))
           WHEN 'lead sponsor' THEN 0
           WHEN 'admin sponsor' THEN 1
           ELSE 2
         END AS role_rank
       FROM deal_member dm
       LEFT JOIN users u ON trim(dm.contact_member_id) = u.id::text
       LEFT JOIN contact c ON c.id::text = trim(both from dm.contact_member_id)
       WHERE dm.deal_id = $1::uuid
         AND lower(trim(dm.deal_member_role)) IN ('lead sponsor', 'admin sponsor')

       UNION ALL

       SELECT
         COALESCE(
           NULLIF(trim(u.email), ''),
           NULLIF(trim(c.email), ''),
           CASE
             WHEN trim(di.contact_id) LIKE '%@%' THEN lower(trim(di.contact_id))
           END
         ) AS email,
         u.first_name,
         u.last_name,
         u.username,
         trim(concat_ws(' ', c.first_name, c.last_name)) AS contact_name,
         CASE lower(trim(di.investor_role))
           WHEN 'lead sponsor' THEN 0
           WHEN 'admin sponsor' THEN 1
           ELSE 2
         END AS role_rank
       FROM deal_investment di
       LEFT JOIN users u ON trim(di.contact_id) = u.id::text
       LEFT JOIN contact c ON c.id::text = trim(both from di.contact_id)
       WHERE di.deal_id = $1::uuid
         AND trim(di.contact_id) <> '__portal_investment_autosave__'
         AND lower(trim(di.investor_role)) IN ('lead sponsor', 'admin sponsor')
     ) sponsors
     WHERE email IS NOT NULL AND trim(email) <> ''
     ORDER BY role_rank
     LIMIT 1`,
    [d],
  );

  const row = res.rows[0];
  const email = row?.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) return null;

  return {
    email,
    name: formatSignerName({ ...row, email }),
  };
}

function findTemplateRecipientByRole(
  recipients: NonNullable<Awaited<ReturnType<typeof getSignFlowDocument>>["recipients"]>,
  roleKeys: string[],
): { id?: string; name?: string; email?: string; role?: string; color?: string; order?: number; profileType?: string } | undefined {
  const keys = new Set(roleKeys.map((k) => k.toLowerCase()));
  return recipients.find((r) => {
    const role = String(r.role ?? "").trim().toLowerCase();
    const id = String(r.id ?? "").trim().toLowerCase();
    return keys.has(role) || keys.has(id);
  });
}

export async function syncSignflowTemplateSigningWorkflow(
  documentId: string,
  workflowType: EsignSignflowWorkflowType,
  signingOrder: EsignSignflowSigningOrder,
): Promise<void> {
  const doc = await getSignFlowDocument(documentId);
  const existing = [...(doc.recipients ?? [])];
  if (existing.length === 0) {
    await patchSignFlowDocument(documentId, { workflowType });
    return;
  }

  const investorRecipient = findTemplateRecipientByRole(existing, [
    "buyer",
    "investor",
    "rec_investor",
    "rec_1",
    "recipient_a",
  ]);
  const sponsorRecipient = findTemplateRecipientByRole(existing, [
    "seller",
    "sponsor",
    "rec_sponsor",
    "rec_2",
    "recipient_b",
  ]);

  const { investorOrder, sponsorOrder } = resolveSignFlowRecipientOrders(
    workflowType,
    signingOrder,
  );

  const recipients = existing.map((r) => {
    const id = String(r.id ?? "").trim();
    const role = String(r.role ?? "").trim().toLowerCase();
    const isInvestor =
      r === investorRecipient ||
      role.includes("investor") ||
      role.includes("buyer") ||
      id === "rec_investor" ||
      id === "rec_1";
    const isSponsor =
      r === sponsorRecipient ||
      role.includes("sponsor") ||
      role.includes("seller") ||
      id === "rec_sponsor" ||
      id === "rec_2";
    if (isInvestor) {
      return { ...r, order: investorOrder };
    }
    if (isSponsor) {
      return { ...r, order: sponsorOrder };
    }
    return r;
  });

  await patchSignFlowDocument(documentId, {
    workflowType,
    recipients,
  });
}

export function resolveSigningWorkflowFromTemplateFile(
  file: EsignTemplateFileRecord,
): {
  workflowType: EsignSignflowWorkflowType;
  signingOrder: EsignSignflowSigningOrder;
} {
  return {
    workflowType: resolveEsignSignflowWorkflowType(file),
    signingOrder: resolveEsignSignflowSigningOrder(file),
  };
}

export function inferSigningWorkflowFromSignFlowDocument(doc: {
  workflowType?: string | null;
  recipients?: Array<{ role?: string; order?: number; id?: string }> | null;
}): {
  workflowType?: EsignSignflowWorkflowType;
  signingOrder?: EsignSignflowSigningOrder;
} {
  const workflowType = normalizeEsignSignflowWorkflowType(doc.workflowType);
  const recipients = doc.recipients ?? [];
  const investor = findTemplateRecipientByRole(recipients, [
    "buyer",
    "investor",
    "rec_investor",
  ]);
  const sponsor = findTemplateRecipientByRole(recipients, [
    "seller",
    "sponsor",
    "rec_sponsor",
  ]);
  const investorOrder = Number(investor?.order) || 1;
  const sponsorOrder = Number(sponsor?.order) || 2;
  const signingOrder: EsignSignflowSigningOrder =
    sponsorOrder < investorOrder ? "sponsor_first" : "investor_first";

  return {
    workflowType: workflowType ?? undefined,
    signingOrder:
      investor && sponsor && workflowType === "sequential"
        ? signingOrder
        : undefined,
  };
}

export type DealMemberSignerOption = {
  rowId: string;
  name: string;
  email: string;
  role: string;
};

const SPONSOR_MEMBER_ROLES_SQL =
  "('lead sponsor', 'admin sponsor', 'co-sponsor', 'co sponsor')";

/** Deal members eligible to counter-sign as sponsor on eSign documents. */
export async function listDealSponsorSignerOptions(
  dealId: string,
): Promise<DealMemberSignerOption[]> {
  const d = String(dealId ?? "").trim();
  if (!d) return [];

  const res = await pool.query<{
    row_id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    contact_name: string | null;
    role: string | null;
  }>(
    `SELECT
       row_id,
       email,
       first_name,
       last_name,
       username,
       contact_name,
       role
     FROM (
       SELECT
         dm.id::text AS row_id,
         COALESCE(
           NULLIF(trim(u.email), ''),
           NULLIF(trim(c.email), ''),
           CASE
             WHEN trim(dm.contact_member_id) LIKE '%@%' THEN lower(trim(dm.contact_member_id))
           END
         ) AS email,
         u.first_name,
         u.last_name,
         u.username,
         trim(concat_ws(' ', c.first_name, c.last_name)) AS contact_name,
         trim(dm.deal_member_role) AS role
       FROM deal_member dm
       LEFT JOIN users u ON trim(dm.contact_member_id) = u.id::text
       LEFT JOIN contact c ON c.id::text = trim(both from dm.contact_member_id)
       WHERE dm.deal_id = $1::uuid
         AND lower(trim(dm.deal_member_role)) IN ${SPONSOR_MEMBER_ROLES_SQL}

       UNION ALL

       SELECT
         di.id::text AS row_id,
         COALESCE(
           NULLIF(trim(u.email), ''),
           NULLIF(trim(c.email), ''),
           CASE
             WHEN trim(di.contact_id) LIKE '%@%' THEN lower(trim(di.contact_id))
           END
         ) AS email,
         u.first_name,
         u.last_name,
         u.username,
         trim(concat_ws(' ', c.first_name, c.last_name)) AS contact_name,
         trim(di.investor_role) AS role
       FROM deal_investment di
       LEFT JOIN users u ON trim(di.contact_id) = u.id::text
       LEFT JOIN contact c ON c.id::text = trim(di.contact_id)
       WHERE di.deal_id = $1::uuid
         AND trim(di.contact_id) <> '__portal_investment_autosave__'
         AND lower(trim(di.investor_role)) IN ${SPONSOR_MEMBER_ROLES_SQL}
     ) sponsors
     WHERE email IS NOT NULL AND trim(email) <> ''
     ORDER BY role, email`,
    [d],
  );

  const seen = new Set<string>();
  const out: DealMemberSignerOption[] = [];
  for (const row of res.rows) {
    const email = row.email?.trim().toLowerCase() ?? "";
    if (!email.includes("@")) continue;
    const dedupe = `${row.row_id}::${email}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      rowId: row.row_id,
      name: formatSignerName({ ...row, email }),
      email,
      role: row.role?.trim() || "Sponsor",
    });
  }
  return out;
}

export async function resolveDealMemberSignerByRowId(
  dealId: string,
  rowId: string,
): Promise<DealSponsorSigner | null> {
  const d = String(dealId ?? "").trim();
  const rid = String(rowId ?? "").trim();
  if (!d || !rid) return null;

  const res = await pool.query<{
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    contact_name: string | null;
  }>(
    `SELECT email, first_name, last_name, username, contact_name
     FROM (
       SELECT
         COALESCE(
           NULLIF(trim(u.email), ''),
           NULLIF(trim(c.email), ''),
           CASE
             WHEN trim(dm.contact_member_id) LIKE '%@%' THEN lower(trim(dm.contact_member_id))
           END
         ) AS email,
         u.first_name,
         u.last_name,
         u.username,
         trim(concat_ws(' ', c.first_name, c.last_name)) AS contact_name
       FROM deal_member dm
       LEFT JOIN users u ON trim(dm.contact_member_id) = u.id::text
       LEFT JOIN contact c ON c.id::text = trim(both from dm.contact_member_id)
       WHERE dm.deal_id = $1::uuid
         AND dm.id::text = $2
         AND lower(trim(dm.deal_member_role)) IN ${SPONSOR_MEMBER_ROLES_SQL}

       UNION ALL

       SELECT
         COALESCE(
           NULLIF(trim(u.email), ''),
           NULLIF(trim(c.email), ''),
           CASE
             WHEN trim(di.contact_id) LIKE '%@%' THEN lower(trim(di.contact_id))
           END
         ) AS email,
         u.first_name,
         u.last_name,
         u.username,
         trim(concat_ws(' ', c.first_name, c.last_name)) AS contact_name
       FROM deal_investment di
       LEFT JOIN users u ON trim(di.contact_id) = u.id::text
       LEFT JOIN contact c ON c.id::text = trim(di.contact_id)
       WHERE di.deal_id = $1::uuid
         AND di.id::text = $2
         AND trim(di.contact_id) <> '__portal_investment_autosave__'
         AND lower(trim(di.investor_role)) IN ${SPONSOR_MEMBER_ROLES_SQL}
     ) sponsors
     LIMIT 1`,
    [d, rid],
  );

  const row = res.rows[0];
  const email = row?.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  return {
    email,
    name: formatSignerName({ ...row, email }),
  };
}

export async function assignSignFlowDocumentSponsorSigner(
  documentId: string,
  signer: DealSponsorSigner,
): Promise<boolean> {
  const sigId = documentId.trim();
  if (!sigId) return false;
  const doc = await getSignFlowDocument(sigId);
  const recipients = [...(doc.recipients ?? [])];
  if (recipients.length === 0) return false;

  const sponsorRecipient = findTemplateRecipientByRole(recipients, [
    "seller",
    "sponsor",
    "rec_sponsor",
    "rec_2",
    "recipient_b",
  ]);
  if (!sponsorRecipient) return false;

  const email = signer.email.trim().toLowerCase();
  const name = signer.name.trim() || email;
  const currentEmail = String(sponsorRecipient.email ?? "").trim().toLowerCase();
  const currentName = String(sponsorRecipient.name ?? "").trim();
  if (currentEmail === email && currentName === name) {
    return true;
  }

  const nextRecipients = recipients.map((r) => {
    if (r === sponsorRecipient) {
      return { ...r, email, name };
    }
    return r;
  });

  await patchSignFlowDocument(sigId, { recipients: nextRecipients });
  return true;
}
