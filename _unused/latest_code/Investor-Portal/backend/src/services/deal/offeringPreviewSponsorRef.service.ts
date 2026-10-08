import { eq, sql } from "drizzle-orm";
import { db } from "../../database/db.js";
import { users } from "../../schema/auth.schema/signin.js";
import { contact } from "../../schema/contact.schema.js";
import {
  decryptOfferingPreviewSponsorRef,
  encryptOfferingPreviewSponsorRef,
} from "../../utils/offeringPreviewCrypto.js";
import { isPortalUserSponsorOnDeal } from "./dealMemberScope.service.js";
import { resolveUserDisplayNamesByIds } from "./dealInvestment.service.js";
import { listDealMembersMappedToInvestorApi } from "./dealMember.service.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikeUuid(id: string): boolean {
  return UUID_RE.test(String(id ?? "").trim());
}

/**
 * Maps roster `contact_member_id` to portal `users.id` when the member has a login.
 */
export async function resolvePortalUserIdForContactMemberId(
  contactMemberId: string,
): Promise<string | null> {
  const raw = String(contactMemberId ?? "").trim();
  if (!raw || !looksLikeUuid(raw)) return null;

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

export async function resolveDealMemberPortalUserId(
  dealId: string,
  contactMemberId: string,
): Promise<string | null> {
  const uid = await resolvePortalUserIdForContactMemberId(contactMemberId);
  if (!uid) return null;
  const ok = await isPortalUserSponsorOnDeal(dealId, uid);
  return ok ? uid : null;
}

export async function mintOfferingPreviewSponsorRef(
  dealId: string,
  sponsorUserId: string,
): Promise<string | null> {
  const d = String(dealId ?? "").trim();
  const s = String(sponsorUserId ?? "").trim();
  if (!d || !s) return null;
  if (!(await isPortalUserSponsorOnDeal(d, s))) return null;
  try {
    return encryptOfferingPreviewSponsorRef(d, s);
  } catch {
    return null;
  }
}

function rosterPersonDisplayName(row: {
  displayName?: string;
  userDisplayName?: string;
}): string {
  const display = String(row.displayName ?? "").trim();
  if (display && display !== "—" && display !== "Draft") return display;
  const user = String(row.userDisplayName ?? "").trim();
  if (user && user !== "—") return user;
  return "";
}

/** Resolve sponsor person name for investor-facing surfaces (users table, then deal roster). */
export async function resolveReferringSponsorDisplayNameOnDeal(
  dealId: string,
  sponsorUserId: string,
): Promise<string> {
  const d = String(dealId ?? "").trim();
  const uid = String(sponsorUserId ?? "").trim();
  if (!d || !uid) return "";

  const names = await resolveUserDisplayNamesByIds([uid]);
  const fromDirectory = names.get(uid.toLowerCase())?.trim() ?? "";
  if (fromDirectory && fromDirectory !== "—") return fromDirectory;

  const [userRow] = await db
    .select({
      email: users.email,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(eq(users.id, uid))
    .limit(1);
  const sponsorEmail = String(userRow?.email ?? "").trim().toLowerCase();
  const firstLast = [userRow?.firstName, userRow?.lastName]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  if (firstLast) return firstLast;
  const username = String(userRow?.username ?? "").trim();
  if (username && username !== "—") return username;

  const members = await listDealMembersMappedToInvestorApi(d);
  const uidLower = uid.toLowerCase();
  for (const member of members) {
    const contactId = String(member.contactId ?? "").trim();
    const portalId = contactId
      ? await resolvePortalUserIdForContactMemberId(contactId)
      : null;
    const emailMatch =
      sponsorEmail &&
      String(member.userEmail ?? "").trim().toLowerCase() === sponsorEmail;
    const idMatch =
      contactId.toLowerCase() === uidLower ||
      portalId?.toLowerCase() === uidLower;
    if (!idMatch && !emailMatch) continue;
    const name = rosterPersonDisplayName(member);
    if (name) return name;
  }

  return fromDirectory;
}

export function decodeOfferingPreviewSponsorRefParam(
  raw: string | null | undefined,
): string {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
}

export async function resolveOfferingPreviewSponsorAttribution(
  dealId: string,
  refToken: string | null | undefined,
): Promise<{ sponsorUserId: string; displayName: string } | null> {
  const d = String(dealId ?? "").trim();
  const rawRef = decodeOfferingPreviewSponsorRefParam(refToken);
  if (!d || !rawRef) return null;

  const decoded = decryptOfferingPreviewSponsorRef(rawRef);
  if (!decoded || decoded.dealId.toLowerCase() !== d.toLowerCase()) return null;
  if (!(await isPortalUserSponsorOnDeal(d, decoded.sponsorUserId))) return null;

  const displayName = await resolveReferringSponsorDisplayNameOnDeal(
    d,
    decoded.sponsorUserId,
  );
  if (!displayName || displayName === "—") return null;

  return { sponsorUserId: decoded.sponsorUserId, displayName };
}

export function publicOfferingPreviewUrlWithRef(
  previewToken: string,
  sponsorRef?: string | null,
): string {
  const base = (
    process.env.FRONTEND_URL?.trim() ||
    process.env.BASE_URL?.trim() ||
    ""
  ).replace(/\/$/, "");
  if (!base) {
    throw new Error("FRONTEND_URL or BASE_URL must be set to send preview links.");
  }
  const path =
    process.env.PUBLIC_OFFERING_PREVIEW_PATH?.trim() || "/offering_portfolio";
  const pathNorm = path.startsWith("/") ? path : `/${path}`;
  const params = new URLSearchParams();
  params.set("preview", previewToken);
  const ref = sponsorRef?.trim();
  if (ref) params.set("ref", ref);
  return `${base}${pathNorm}?${params.toString()}`;
}
