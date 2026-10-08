import { pool } from "../../database/db.js";
import { formatDealMemberRoleForDisplay } from "../deal/dealParticipantProfile.service.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UserMembershipPair {
  company: string;
  role: string;
}

function isMissingMembershipTableError(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 4; i += 1) {
    if (!cur || typeof cur !== "object") break;
    const e = cur as { code?: string; message?: string; cause?: unknown };
    if (e.code === "42P01") return true;
    const msg = String(e.message ?? "").toLowerCase();
    if (msg.includes('relation "user_company_membership" does not exist')) {
      return true;
    }
    cur = e.cause;
  }
  return false;
}

function pairKey(a: UserMembershipPair): string {
  return `${a.company.trim().toLowerCase()}|${a.role.trim().toLowerCase()}`;
}

/** Aligns with frontend `memberRoleDisplayName` for portal `users.role`. */
function displayPortalRole(role: string): string {
  const r = String(role ?? "").trim().toLowerCase();
  if (!r) return "—";
  const byCode: Record<string, string> = {
    platform_admin: "Platform Admin",
    platform_user: "Platform user",
    user: "Platform user",
    company_admin: "Company Admin",
    company_user: "Company Member",
    deal_participant: "Deal Participant",
  };
  if (byCode[r]) return byCode[r];
  const raw = String(role ?? "").trim();
  return (
    raw
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ") || "—"
  );
}

function companyLabelFromRow(row: Record<string, unknown>): string {
  const raw = row.companyName ?? row.company_name;
  const s = String(raw ?? "").trim();
  return s || "—";
}

async function fetchDealCompanyRolePairsForUserIds(
  userIds: string[],
): Promise<Map<string, UserMembershipPair[]>> {
  const map = new Map<string, UserMembershipPair[]>();
  if (userIds.length === 0) return map;

  const res = await pool.query<{
    user_id: string;
    company_name: string | null;
    deal_member_role: string | null;
  }>(
    `SELECT DISTINCT
       lower(u.id::text) AS user_id,
       COALESCE(NULLIF(trim(c.name), ''), '—') AS company_name,
       trim(dm.deal_member_role) AS deal_member_role
     FROM users u
     INNER JOIN deal_member dm ON (
       u.id::text = trim(both from dm.contact_member_id)
       OR EXISTS (
         SELECT 1 FROM contact c2
         WHERE c2.id::text = trim(both from dm.contact_member_id)
           AND lower(trim(c2.email)) = lower(trim(u.email))
       )
     )
     INNER JOIN add_deal_form adf ON adf.id = dm.deal_id
     LEFT JOIN companies c ON c.id = adf.organization_id
     WHERE u.id = ANY($1::uuid[])
       AND trim(dm.deal_member_role) <> ''`,
    [userIds],
  );

  for (const row of res.rows) {
    const uid = String(row.user_id ?? "").trim().toLowerCase();
    const company = String(row.company_name ?? "").trim() || "—";
    const rawRole = String(row.deal_member_role ?? "").trim();
    if (!uid || !rawRole) continue;
    const role = formatDealMemberRoleForDisplay(rawRole);
    if (!role) continue;
    const pair: UserMembershipPair = { company, role };
    const list = map.get(uid) ?? [];
    if (!list.some((x) => pairKey(x) === pairKey(pair))) list.push(pair);
    map.set(uid, list);
  }

  for (const [uid, list] of map) {
    list.sort((a, b) => {
      const c = a.company.localeCompare(b.company, undefined, {
        sensitivity: "base",
      });
      if (c !== 0) return c;
      return a.role.localeCompare(b.role, undefined, { sensitivity: "base" });
    });
    map.set(uid, list);
  }

  return map;
}

async function fetchCompanyMembershipPairsForUserIds(
  userIds: string[],
): Promise<Map<string, UserMembershipPair[]>> {
  const map = new Map<string, UserMembershipPair[]>();
  if (userIds.length === 0) return map;

  let res;
  try {
    res = await pool.query<{
      user_id: string;
      company_name: string | null;
      role: string | null;
    }>(
      `SELECT
         lower(ucm.user_id::text) AS user_id,
         COALESCE(NULLIF(trim(c.name), ''), '—') AS company_name,
         trim(ucm.role) AS role
       FROM user_company_membership ucm
       INNER JOIN companies c ON c.id = ucm.company_id
       WHERE ucm.user_id = ANY($1::uuid[])`,
      [userIds],
    );
  } catch (err) {
    if (isMissingMembershipTableError(err)) {
      // Old DB without migration 0051: keep legacy behavior instead of failing request.
      return map;
    }
    throw err;
  }

  for (const row of res.rows) {
    const uid = String(row.user_id ?? "").trim().toLowerCase();
    const company = String(row.company_name ?? "").trim() || "—";
    const rawRole = String(row.role ?? "").trim();
    if (!uid || !rawRole) continue;
    const role = displayPortalRole(rawRole);
    const pair: UserMembershipPair = { company, role };
    const list = map.get(uid) ?? [];
    if (!list.some((x) => pairKey(x) === pairKey(pair))) list.push(pair);
    map.set(uid, list);
  }

  return map;
}

/**
 * Adds `memberships: { company, role }[]` to each user row: portal org role plus distinct
 * deal-level roles per company from `deal_member` (when applicable).
 */
export async function enrichUserRowsWithMemberships(
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const ids = [
    ...new Set(
      rows
        .map((r) => String(r.id ?? "").trim().toLowerCase())
        .filter((id) => UUID_RE.test(id)),
    ),
  ];
  const dealPairsByUser =
    ids.length > 0 ? await fetchDealCompanyRolePairsForUserIds(ids) : new Map();
  const companyPairsByUser =
    ids.length > 0 ? await fetchCompanyMembershipPairsForUserIds(ids) : new Map();

  return rows.map((row) => {
    const id = String(row.id ?? "").trim().toLowerCase();
    const portalCompany = companyLabelFromRow(row);
    const portalRole = displayPortalRole(String(row.role ?? ""));
    const list: UserMembershipPair[] = [];
    const seen = new Set<string>();

    const explicitCompanyMemberships = companyPairsByUser.get(id) ?? [];
    for (const p of explicitCompanyMemberships) {
      const k = pairKey(p);
      if (seen.has(k)) continue;
      seen.add(k);
      list.push(p);
    }

    if (explicitCompanyMemberships.length === 0 && portalRole && portalRole !== "—") {
      const p: UserMembershipPair = { company: portalCompany, role: portalRole };
      list.push(p);
      seen.add(pairKey(p));
    }

    for (const p of dealPairsByUser.get(id) ?? []) {
      const k = pairKey(p);
      if (seen.has(k)) continue;
      seen.add(k);
      list.push(p);
    }

    list.sort((a, b) => {
      const c = a.company.localeCompare(b.company, undefined, {
        sensitivity: "base",
      });
      if (c !== 0) return c;
      return a.role.localeCompare(b.role, undefined, { sensitivity: "base" });
    });

    return { ...row, memberships: list };
  });
}

function membershipCompanyLabel(item: Record<string, unknown>): string {
  return (
    String(
      item.company ?? item.companyName ?? item.company_name ?? "",
    ).trim() || "—"
  );
}

/**
 * Company-scoped member lists (Settings → Org Members): keep only memberships for
 * the active organization so admins do not see every company a user belongs to.
 */
export function narrowUserRowsToCompanyScope(
  rows: Record<string, unknown>[],
  companyId: string,
  companyName: string,
): Record<string, unknown>[] {
  const scopeName = String(companyName ?? "").trim() || "—";
  const scopeNameKey = scopeName.toLowerCase();

  return rows.map((row) => {
    const raw = row.memberships;
    const list = Array.isArray(raw) ? raw : [];
    const filtered = list.filter((item) => {
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        return false;
      }
      const rec = item as Record<string, unknown>;
      const companyKey = membershipCompanyLabel(rec).toLowerCase();
      return companyKey === scopeNameKey;
    });

    const portalRole = displayPortalRole(String(row.role ?? ""));
    const scopedMemberships =
      filtered.length > 0
        ? filtered
        : portalRole && portalRole !== "—"
          ? [{ company: scopeName, role: portalRole }]
          : [];

    return {
      ...row,
      companyName: scopeName,
      organization_id: companyId,
      memberships: scopedMemberships,
    };
  });
}
