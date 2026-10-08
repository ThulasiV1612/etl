import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../../database/db.js";
import { contact } from "../../schema/contact.schema.js";
import { dealMember } from "../../schema/deal.schema/deal-member.schema.js";
import { users } from "../../schema/auth.schema/signin.js";
import {
  isPortalUserCoSponsorOnDeal,
  listEquivalentPortalUserIdsForUser,
} from "./dealMemberScope.service.js";

export type CoSponsorEmailIntercept = "yes" | "no";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolvePortalUserIdForContactMemberId(
  contactMemberId: string,
): Promise<string | null> {
  const raw = String(contactMemberId ?? "").trim();
  if (!raw || !UUID_RE.test(raw)) return null;

  const [direct] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.id}::text = ${raw}`)
    .limit(1);
  if (direct?.id) return String(direct.id).trim();

  const [cRow] = await db
    .select({ email: contact.email })
    .from(contact)
    .where(sql`${contact.id}::text = ${raw}`)
    .limit(1);
  const em = String(cRow?.email ?? "").trim().toLowerCase();
  if (!em.includes("@")) return null;

  const [byEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(trim(${users.email})) = ${em}`)
    .limit(1);
  return byEmail?.id ? String(byEmail.id).trim() : null;
}

export function normalizeCoSponsorEmailIntercept(
  raw: unknown,
): CoSponsorEmailIntercept {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
  if (
    t === "no" ||
    t === "no intercept" ||
    t === "false" ||
    t === "0" ||
    t === "direct"
  ) {
    return "no";
  }
  return "yes";
}

async function matchKeysForUser(userId: string): Promise<string[]> {
  const uid = String(userId ?? "").trim();
  if (!uid) return [];
  const equiv = await listEquivalentPortalUserIdsForUser(uid);
  const ids = [...new Set([uid, ...equiv].map((id) => String(id).trim()).filter(Boolean))];
  const keys = new Set(ids.map((id) => id.toLowerCase()));

  const emailRows = await db
    .select({ email: users.email })
    .from(users)
    .where(
      or(
        ...ids.map((id) => sql`${users.id}::text = ${id}`),
      )!,
    );
  const emails = [
    ...new Set(
      emailRows
        .map((r) => String(r.email ?? "").trim().toLowerCase())
        .filter((e) => e.includes("@")),
    ),
  ];
  if (emails.length > 0) {
    const contactRows = await db
      .select({ id: contact.id })
      .from(contact)
      .where(
        or(
          ...emails.map(
            (em) => sql`lower(trim(${contact.email})) = ${em}`,
          ),
        )!,
      );
    for (const row of contactRows) {
      const cid = String(row.id ?? "").trim().toLowerCase();
      if (cid) keys.add(cid);
    }
  }
  return [...keys];
}

async function findViewerCoSponsorMemberId(
  dealId: string,
  userId: string,
): Promise<string | null> {
  const did = String(dealId ?? "").trim();
  const uid = String(userId ?? "").trim();
  if (!did || !uid) return null;

  const keys = await matchKeysForUser(uid);
  if (keys.length === 0) return null;

  const [row] = await db
    .select({ id: dealMember.id })
    .from(dealMember)
    .where(
      and(
        eq(dealMember.dealId, did),
        sql`lower(trim(${dealMember.dealMemberRole})) in ('co-sponsor', 'co sponsor')`,
        or(
          ...keys.map(
            (k) => sql`lower(trim(${dealMember.contactMemberId})) = ${k}`,
          ),
        )!,
      ),
    )
    .limit(1);
  return row?.id ? String(row.id).trim() : null;
}

export async function getViewerCoSponsorEmailIntercept(
  dealId: string,
  userId: string,
): Promise<CoSponsorEmailIntercept | null> {
  if (!(await isPortalUserCoSponsorOnDeal(dealId, userId))) return null;
  const memberId = await findViewerCoSponsorMemberId(dealId, userId);
  if (!memberId) return "no";
  const [row] = await db
    .select({ intercept: dealMember.leadSponsorEmailIntercept })
    .from(dealMember)
    .where(eq(dealMember.id, memberId))
    .limit(1);
  return normalizeCoSponsorEmailIntercept(row?.intercept);
}

export async function updateViewerCoSponsorEmailIntercept(
  dealId: string,
  userId: string,
  intercept: CoSponsorEmailIntercept,
): Promise<CoSponsorEmailIntercept | null> {
  const did = String(dealId ?? "").trim();
  const uid = String(userId ?? "").trim();
  if (!did || !uid) return null;
  if (!(await isPortalUserCoSponsorOnDeal(did, uid))) return null;
  const value = normalizeCoSponsorEmailIntercept(intercept);
  const now = new Date();
  const memberId = await findViewerCoSponsorMemberId(did, uid);
  if (memberId) {
    await db
      .update(dealMember)
      .set({ leadSponsorEmailIntercept: value, updatedAt: now })
      .where(eq(dealMember.id, memberId));
    return value;
  }
  await db
    .insert(dealMember)
    .values({
      dealId: did,
      addedBy: uid,
      contactMemberId: uid,
      dealMemberRole: "Co-sponsor",
      sendInvitationMail: "no",
      leadSponsorEmailIntercept: value,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [dealMember.dealId, dealMember.contactMemberId],
      set: {
        leadSponsorEmailIntercept: value,
        updatedAt: now,
      },
    });
  return value;
}

/**
 * Portal user ids (lowercased, including equivalent accounts) → yes/no intercept
 * for every Co-sponsor roster row on this deal.
 */
export async function loadCoSponsorEmailInterceptByUserLower(
  dealId: string,
): Promise<Map<string, CoSponsorEmailIntercept>> {
  const did = String(dealId ?? "").trim();
  const out = new Map<string, CoSponsorEmailIntercept>();
  if (!did) return out;

  const rows = await db
    .select({
      contactMemberId: dealMember.contactMemberId,
      intercept: dealMember.leadSponsorEmailIntercept,
    })
    .from(dealMember)
    .where(
      and(
        eq(dealMember.dealId, did),
        sql`lower(trim(${dealMember.dealMemberRole})) in ('co-sponsor', 'co sponsor')`,
      ),
    );

  for (const row of rows) {
    const uid = await resolvePortalUserIdForContactMemberId(
      String(row.contactMemberId ?? ""),
    );
    const intercept = normalizeCoSponsorEmailIntercept(row.intercept);
    const contactKey = String(row.contactMemberId ?? "").trim().toLowerCase();
    if (contactKey) out.set(contactKey, intercept);
    if (!uid) continue;
    const equiv = await listEquivalentPortalUserIdsForUser(uid);
    for (const id of [uid, ...equiv]) {
      const low = String(id ?? "").trim().toLowerCase();
      if (low) out.set(low, intercept);
    }
  }
  return out;
}
