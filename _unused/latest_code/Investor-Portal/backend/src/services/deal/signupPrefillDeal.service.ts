import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../database/db.js";
import { contact } from "../../schema/contact.schema.js";
import { users } from "../../schema/auth.schema/signin.js";
import {
  dealInvestment,
  dealLpInvestor,
  dealMember,
} from "../../schema/schema.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}

function normalizePhoneDigits(p: string): string {
  return String(p ?? "").replace(/\D/g, "");
}

export type SignupPrefillFields = {
  firstName: string;
  lastName: string;
  phone: string;
  userName: string;
};

/**
 * Load first/last/phone/username from `users` (by UUID) or `contact` (by UUID).
 * `contact_member_id` on deal rosters is either a portal user id or a contact id.
 */
export async function loadSignupPrefillFromMemberId(
  rawId: string,
): Promise<SignupPrefillFields | null> {
  const id = rawId.trim();
  if (!id || !UUID_RE.test(id)) return null;
  const [u] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      phone: users.phone,
      userName: users.username,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (u) {
    const fn = String(u.firstName ?? "").trim();
    const ln = String(u.lastName ?? "").trim();
    const ph = normalizePhoneDigits(u.phone ?? "");
    const un = String(u.userName ?? "").trim();
    if (fn || ln || ph || un) {
      return { firstName: fn, lastName: ln, phone: ph, userName: un };
    }
  }
  const [c] = await db
    .select({
      firstName: contact.firstName,
      lastName: contact.lastName,
      phone: contact.phone,
    })
    .from(contact)
    .where(eq(contact.id, id))
    .limit(1);
  if (!c) return null;
  const fn = String(c.firstName ?? "").trim();
  const ln = String(c.lastName ?? "").trim();
  const ph = normalizePhoneDigits(c.phone ?? "");
  if (!fn && !ln && !ph) return null;
  return { firstName: fn, lastName: ln, phone: ph, userName: "" };
}

/**
 * When a deal-invite link is used, prefer roster/contact rows for that deal and email
 * so signup matches what sponsors entered on the deal.
 */
export async function findSignupPrefillForDealAndEmail(
  email: string,
  dealId: string,
): Promise<SignupPrefillFields | null> {
  const norm = normalizeEmail(email);
  const did = dealId.trim();
  if (!norm.includes("@") || !UUID_RE.test(did)) return null;

  // 1) LP investor row: denormalized email on row
  const [lpEmail] = await db
    .select({ contactMemberId: dealLpInvestor.contactMemberId })
    .from(dealLpInvestor)
    .where(
      and(
        eq(dealLpInvestor.dealId, did),
        sql`lower(trim(coalesce(${dealLpInvestor.email}, ''))) = ${norm}`,
      ),
    )
    .orderBy(desc(dealLpInvestor.updatedAt))
    .limit(1);
  if (lpEmail?.contactMemberId) {
    const p = await loadSignupPrefillFromMemberId(lpEmail.contactMemberId);
    if (p) return p;
  }

  // 2) LP investor: join contact by id when email on row was empty
  const [lpJoin] = await db
    .select({ contactMemberId: dealLpInvestor.contactMemberId })
    .from(dealLpInvestor)
    .innerJoin(
      contact,
      sql`trim(both from ${dealLpInvestor.contactMemberId}) = ${contact.id}::text`,
    )
    .where(
      and(
        eq(dealLpInvestor.dealId, did),
        sql`lower(trim(${contact.email})) = ${norm}`,
      ),
    )
    .limit(1);
  if (lpJoin?.contactMemberId) {
    const p = await loadSignupPrefillFromMemberId(lpJoin.contactMemberId);
    if (p) return p;
  }

  // 3) deal_member + contact
  const [dm] = await db
    .select({ contactMemberId: dealMember.contactMemberId })
    .from(dealMember)
    .innerJoin(
      contact,
      sql`trim(both from ${dealMember.contactMemberId}) = ${contact.id}::text`,
    )
    .where(
      and(
        eq(dealMember.dealId, did),
        sql`lower(trim(${contact.email})) = ${norm}`,
      ),
    )
    .limit(1);
  if (dm?.contactMemberId) {
    const p = await loadSignupPrefillFromMemberId(dm.contactMemberId);
    if (p) return p;
  }

  // 4) deal_member: portal user as member
  const [dmU] = await db
    .select({ contactMemberId: dealMember.contactMemberId })
    .from(dealMember)
    .innerJoin(
      users,
      sql`trim(both from ${dealMember.contactMemberId}) = ${users.id}::text`,
    )
    .where(
      and(eq(dealMember.dealId, did), sql`lower(trim(${users.email})) = ${norm}`),
    )
    .limit(1);
  if (dmU?.contactMemberId) {
    const p = await loadSignupPrefillFromMemberId(dmU.contactMemberId);
    if (p) return p;
  }

  // 5) deal_investment + contact
  const [inv] = await db
    .select({ contactId: dealInvestment.contactId })
    .from(dealInvestment)
    .innerJoin(
      contact,
      sql`trim(both from ${dealInvestment.contactId}) = ${contact.id}::text`,
    )
    .where(
      and(
        eq(dealInvestment.dealId, did),
        sql`lower(trim(${contact.email})) = ${norm}`,
      ),
    )
    .limit(1);
  if (inv?.contactId) {
    const p = await loadSignupPrefillFromMemberId(inv.contactId);
    if (p) return p;
  }

  // 6) deal_investment: user id as contact_id
  const [invU] = await db
    .select({ contactId: dealInvestment.contactId })
    .from(dealInvestment)
    .innerJoin(
      users,
      sql`trim(both from ${dealInvestment.contactId}) = ${users.id}::text`,
    )
    .where(
      and(
        eq(dealInvestment.dealId, did),
        sql`lower(trim(${users.email})) = ${norm}`,
      ),
    )
    .limit(1);
  if (invU?.contactId) {
    return loadSignupPrefillFromMemberId(invU.contactId);
  }

  return null;
}
