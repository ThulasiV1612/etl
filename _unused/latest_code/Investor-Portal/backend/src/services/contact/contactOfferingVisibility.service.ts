/**
 * Contact offering visibility — CRM preference applied to investor portal deal lists.
 */
import { inArray, sql } from "drizzle-orm";
import { db } from "../../database/db.js";
import { addDealForm } from "../../schema/deal.schema/add-deal-form.schema.js";
import { contact } from "../../schema/schema.js";

export type ContactOfferingVisibility =
  | "ALL_OFFERINGS"
  | "HIDE_OFFERINGS"
  | "506C_ONLY";

const VISIBILITY_RANK: Record<ContactOfferingVisibility, number> = {
  ALL_OFFERINGS: 0,
  "506C_ONLY": 1,
  HIDE_OFFERINGS: 2,
};

/**
 * Normalize API/DB values. Empty / unknown → `null` (unset).
 * Still accepts legacy aliases (`show` / `hide` / `506c`) from older clients.
 */
export function normalizeContactOfferingVisibility(
  raw: unknown,
): ContactOfferingVisibility | null {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s()-]+/g, "_");
  if (!s) return null;
  if (
    s === "ALL_OFFERINGS" ||
    s === "ALL" ||
    s === "SHOW" ||
    s === "SHOW_OFFERINGS"
  )
    return "ALL_OFFERINGS";
  if (s === "HIDE_OFFERINGS" || s === "HIDE" || s === "HIDDEN")
    return "HIDE_OFFERINGS";
  if (
    s === "506C_ONLY" ||
    s === "506C" ||
    s === "506_C" ||
    s === "506_C_ONLY" ||
    s === "506C_OFFERINGS_ONLY"
  )
    return "506C_ONLY";
  return null;
}

/** Deal `sec_type` values that count as 506(c) offerings. */
export function isDealSecType506c(secType: string | null | undefined): boolean {
  const raw = String(secType ?? "").trim();
  if (!raw) return false;
  const s = raw
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[\s-]+/g, "_");
  if (
    s === "506_c" ||
    s === "506c" ||
    s === "regulation_506_c" ||
    s === "reg_506_c" ||
    s === "reg_d_506_c" ||
    s === "regulation_d_506_c"
  ) {
    return true;
  }
  // Label-like values e.g. "506(c)" / "Reg D 506(c)" after stripping punctuation.
  return /(?:^|_)506_?c(?:_|$)/.test(s) || /506\s*\(?\s*c\s*\)?/i.test(raw);
}

/**
 * Resolve visibility for a portal user email from CRM contact rows.
 * When multiple contacts match, the most restrictive preference wins.
 * Unset / null on all rows → `null` (treat as all offerings).
 */
export async function resolveContactOfferingVisibilityForEmail(
  emailNorm: string,
): Promise<ContactOfferingVisibility | null> {
  const e = String(emailNorm ?? "").trim().toLowerCase();
  if (!e || !e.includes("@")) return null;

  const rows = await db
    .select({
      showOfferingsVisibility: contact.showOfferingsVisibility,
    })
    .from(contact)
    .where(sql`lower(trim(${contact.email})) = ${e}`);

  let best: ContactOfferingVisibility | null = null;
  for (const row of rows) {
    const v = normalizeContactOfferingVisibility(row.showOfferingsVisibility);
    if (!v) continue;
    if (!best || VISIBILITY_RANK[v] > VISIBILITY_RANK[best]) best = v;
  }
  return best;
}

/**
 * Filter deal ids by the contact's offering visibility for this email.
 * `null` / `ALL_OFFERINGS` → unchanged; `HIDE_OFFERINGS` → []; `506C_ONLY` → 506(c) deals only.
 */
export async function filterDealIdsByContactOfferingVisibility(
  emailNorm: string,
  dealIds: string[],
): Promise<string[]> {
  const ids = [
    ...new Set(dealIds.map((id) => String(id ?? "").trim()).filter(Boolean)),
  ];
  if (ids.length === 0) return [];

  const visibility =
    await resolveContactOfferingVisibilityForEmail(emailNorm);
  if (!visibility || visibility === "ALL_OFFERINGS") return ids;
  if (visibility === "HIDE_OFFERINGS") return [];

  const rows = await db
    .select({ id: addDealForm.id, secType: addDealForm.secType })
    .from(addDealForm)
    .where(inArray(addDealForm.id, ids));

  const allowed = new Set<string>();
  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    if (id && isDealSecType506c(row.secType)) allowed.add(id);
  }
  return ids.filter((id) => allowed.has(id));
}

export async function isDealAllowedByContactOfferingVisibility(params: {
  emailNorm: string;
  dealId: string;
  secType?: string | null;
}): Promise<boolean> {
  const emailNorm = String(params.emailNorm ?? "").trim().toLowerCase();
  const dealId = String(params.dealId ?? "").trim();
  if (!emailNorm || !dealId) return true;

  const visibility =
    await resolveContactOfferingVisibilityForEmail(emailNorm);
  if (!visibility || visibility === "ALL_OFFERINGS") return true;
  if (visibility === "HIDE_OFFERINGS") return false;

  let secType = params.secType;
  if (secType == null) {
    const [row] = await db
      .select({ secType: addDealForm.secType })
      .from(addDealForm)
      .where(sql`${addDealForm.id}::text = ${dealId}`)
      .limit(1);
    secType = row?.secType ?? null;
  }
  return isDealSecType506c(secType);
}
