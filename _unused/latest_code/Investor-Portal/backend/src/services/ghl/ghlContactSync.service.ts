import { getGhlConfig } from "../../config/ghl.config.js";
import type { ContactRow } from "../../schema/contact.schema.js";
import { upsertGhlContact } from "./ghl.service.js";
import { resolveGhlLocationIdForOrganization } from "./ghlLocation.service.js";

const SYNDICATIONX_TAG = "SyndicationX";
const PORTAL_USER_TAG = "Portal User";

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = String(raw ?? "").trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

function roleToGhlTag(role: string): string | null {
  const normalized = String(role ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "investor") return "Investor";
  if (normalized === "company_admin") return "Company Admin";
  if (normalized === "company_user") return "Company User";
  if (normalized === "deal_participant") return "Deal Participant";
  if (normalized === "platform_user") return "Platform User";
  if (normalized === "platform_admin") return "Platform Admin";
  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export type GhlSignupSyncInput = {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role?: string;
  companyName?: string | null;
  organizationId?: string | null;
  signupKind?: "investor" | "company";
};

function logGhlSyncWarning(context: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.warn(`[ghl-sync] ${context}:`, message);
}

async function resolveSyncLocationId(
  organizationId: string | null | undefined,
): Promise<string | null> {
  if (!getGhlConfig()) return null;
  return resolveGhlLocationIdForOrganization(organizationId);
}

/** Fire-and-forget GHL upsert after portal signup. */
export function queueGhlSignupSync(input: GhlSignupSyncInput): void {
  void syncSignupUserToGhl(input).catch((err) =>
    logGhlSyncWarning("signup sync failed", err),
  );
}

export async function syncSignupUserToGhl(
  input: GhlSignupSyncInput,
): Promise<void> {
  const locationId = await resolveSyncLocationId(input.organizationId);
  if (!locationId) return;

  const tags = dedupeTags([
    SYNDICATIONX_TAG,
    PORTAL_USER_TAG,
    input.signupKind === "investor" ? "Self-Serve Investor" : "Self-Serve Company",
    roleToGhlTag(input.role ?? "") ?? "",
    input.companyName?.trim() ? `Company: ${input.companyName.trim()}` : "",
  ]);

  await upsertGhlContact({
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    tags,
    source: "SyndicationX Portal Signup",
    locationId,
  });
}

/** Fire-and-forget GHL upsert after CRM contact create/update. */
export function queueGhlContactRowSync(row: ContactRow): void {
  void syncContactRowToGhl(row).catch((err) =>
    logGhlSyncWarning(`contact ${row.id} sync failed`, err),
  );
}

export async function syncContactRowToGhl(row: ContactRow): Promise<void> {
  const locationId = await resolveSyncLocationId(row.organizationId);
  if (!locationId) return;

  const tags = dedupeTags([
    SYNDICATIONX_TAG,
    ...(Array.isArray(row.tags) ? row.tags : []),
    row.isPortalUser ? PORTAL_USER_TAG : "",
    row.platformAdminOnly ? "Platform Admin Only" : "",
    row.status === "suspended" ? "Suspended" : "",
  ]);

  await upsertGhlContact({
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    tags,
    source: "SyndicationX CRM",
    locationId,
  });
}
