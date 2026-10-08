import { asc, eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { users } from "../../schema/auth.schema/signin.js";
import {
  organizationContactList,
  organizationContactTag,
} from "../../schema/company.schema/organizationContactLabels.schema.js";

function normalizeLabelNames(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const name = String(raw ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export async function getOrganizationIdForUser(
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ organizationId: users.organizationId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const id = row?.organizationId;
  return id && String(id).trim() ? String(id) : null;
}

/**
 * Persists tag/list names for the organization when contacts carry those labels.
 * No-op when the user has no `organization_id` (e.g. some platform admins).
 */
/** Distinct tag names for CRM autocomplete / Tags tab (per company). */
export async function listOrganizationContactTagNames(
  organizationId: string,
): Promise<string[]> {
  const orgId = organizationId.trim();
  if (!orgId) return [];
  const rows = await db
    .select({ name: organizationContactTag.name })
    .from(organizationContactTag)
    .where(eq(organizationContactTag.organizationId, orgId))
    .orderBy(asc(organizationContactTag.name));
  return rows.map((r) => String(r.name ?? "").trim()).filter(Boolean);
}

/** Distinct list names for CRM autocomplete / Lists tab (per company). */
export async function listOrganizationContactListNames(
  organizationId: string,
): Promise<string[]> {
  const orgId = organizationId.trim();
  if (!orgId) return [];
  const rows = await db
    .select({ name: organizationContactList.name })
    .from(organizationContactList)
    .where(eq(organizationContactList.organizationId, orgId))
    .orderBy(asc(organizationContactList.name));
  return rows.map((r) => String(r.name ?? "").trim()).filter(Boolean);
}

export async function syncOrganizationContactLabels(params: {
  organizationId: string | null;
  tags: string[];
  lists: string[];
}): Promise<void> {
  const orgId = params.organizationId?.trim() ?? "";
  if (!orgId) return;

  const tagNames = normalizeLabelNames(params.tags);
  const listNames = normalizeLabelNames(params.lists);

  if (tagNames.length > 0) {
    await db
      .insert(organizationContactTag)
      .values(
        tagNames.map((name) => ({
          organizationId: orgId,
          name,
        })),
      )
      .onConflictDoNothing({
        target: [
          organizationContactTag.organizationId,
          organizationContactTag.name,
        ],
      });
  }

  if (listNames.length > 0) {
    await db
      .insert(organizationContactList)
      .values(
        listNames.map((name) => ({
          organizationId: orgId,
          name,
        })),
      )
      .onConflictDoNothing({
        target: [
          organizationContactList.organizationId,
          organizationContactList.name,
        ],
      });
  }
}
