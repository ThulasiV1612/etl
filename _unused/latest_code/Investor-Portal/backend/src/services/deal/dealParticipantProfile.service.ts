import { DEAL_PARTICIPANT } from "../../constants/roles.js";
import { pool } from "../../database/db.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Distinct `deal_member.deal_member_role` values for this portal user (matches roster by
 * `contact_member_id` = user id or contact id resolved via email), ordered for stable display.
 */
export async function listDistinctDealMemberRolesForPortalUser(
  userId: string,
): Promise<string[]> {
  const uid = String(userId ?? "").trim().toLowerCase();
  if (!UUID_RE.test(uid)) return [];
  const res = await pool.query<{ deal_member_role: string }>(
    `SELECT DISTINCT trim(dm.deal_member_role) AS deal_member_role
     FROM deal_member dm
     WHERE trim(dm.deal_member_role) <> ''
       AND (
         EXISTS (
           SELECT 1 FROM users u
           WHERE u.id = $1::uuid AND u.id::text = trim(both from dm.contact_member_id)
         )
         OR EXISTS (
           SELECT 1 FROM contact c
           INNER JOIN users u ON u.id = $1::uuid AND lower(trim(c.email)) = lower(trim(u.email))
           WHERE c.id::text = trim(both from dm.contact_member_id)
         )
       )
     ORDER BY 1`,
    [uid],
  );
  return res.rows
    .map((r) => String(r.deal_member_role ?? "").trim())
    .filter(Boolean);
}

/**
 * Human-readable label for a single `deal_member.deal_member_role` value (no portal role names).
 */
export function formatDealMemberRoleForDisplay(raw: string): string {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  const lower = t.toLowerCase();
  if (
    lower === "lp_investors" ||
    lower === "lp_investor" ||
    lower === "lp investors" ||
    lower === "lp investor"
  ) {
    return "LP Investor";
  }
  return t
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Comma-separated deal-level roles for UI; empty when no `deal_member` rows with a role. */
export function buildDealParticipantRoleDisplay(dealMemberRoles: string[]): string {
  if (dealMemberRoles.length === 0) return "";
  const parts = dealMemberRoles
    .map((r) => formatDealMemberRoleForDisplay(r))
    .filter(Boolean);
  return [...new Set(parts)].join(", ");
}

/** Matches `deal_member.deal_member_role` values used for LP-only investor rows. */
export function dealMemberRoleLabelIsLpInvestor(label: string): boolean {
  const t = String(label ?? "").trim().toLowerCase();
  if (!t) return false;
  return (
    t === "lp_investors" ||
    t === "lp investors" ||
    t === "lp investor"
  );
}

/** Sponsor roles on `deal_member` — same deal/contact should not also surface as LP from `deal_lp_investor`. */
const DEAL_MEMBER_SPONSOR_ROLES_SQL = `('lead sponsor', 'admin sponsor', 'co-sponsor', 'co sponsor')`;

/** Adds `dealMemberRoleLabels` + `roleDisplay` when `role` is `deal_participant`. */
export async function enrichUserRecordForDealParticipant(
  user: Record<string, unknown>,
  userId: string,
): Promise<Record<string, unknown>> {
  const role = String(user.role ?? "").trim().toLowerCase();
  if (role !== DEAL_PARTICIPANT) {
    return {
      ...user,
      is_deal_participant: false,
      is_lp_investor: false,
    };
  }
  const labels = await listDistinctDealMemberRolesForPortalUser(userId);
  /* `is_lp_investor` / investing shell: only mergeLpInvestorFlagsIntoUserPayload (deal_lp_investor). */
  return {
    ...user,
    dealMemberRoleLabels: labels,
    roleDisplay: buildDealParticipantRoleDisplay(labels),
    is_deal_participant: true,
  };
}

/**
 * Distinct display labels from `deal_lp_investor` for portal users (contact_member_id → user
 * or contact email match). Used on Members page so LP investors show as “LP Investor”.
 *
 * Rows are skipped when the same user is already a sponsor on that deal in `deal_member`, so
 * Lead Sponsors are not labeled “LP Investor” from a duplicate or stray `deal_lp_investor` row.
 */
export async function mapLpInvestorRoleDisplayForUserIds(
  userIds: string[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      userIds
        .map((id) => String(id ?? "").trim().toLowerCase())
        .filter((id) => UUID_RE.test(id)),
    ),
  ];
  const out = new Map<string, string>();
  if (ids.length === 0) return out;

  const res = await pool.query<{ user_id: string; role: string | null }>(
    `SELECT lower(u.id::text) AS user_id,
            COALESCE(NULLIF(trim(lp.role), ''), 'LP Investor') AS role
     FROM users u
     INNER JOIN deal_lp_investor lp ON (
       trim(lp.contact_member_id) = u.id::text
       OR EXISTS (
         SELECT 1 FROM contact c
         WHERE c.id::text = trim(both from lp.contact_member_id)
           AND lower(trim(c.email)) = lower(trim(u.email))
       )
     )
     WHERE u.id = ANY($1::uuid[])
       AND NOT EXISTS (
         SELECT 1 FROM deal_member dm
         WHERE dm.deal_id = lp.deal_id
           AND (
             u.id::text = trim(both from dm.contact_member_id)
             OR EXISTS (
               SELECT 1 FROM contact c2
               WHERE c2.id::text = trim(both from dm.contact_member_id)
                 AND lower(trim(c2.email)) = lower(trim(u.email))
             )
           )
           AND lower(trim(dm.deal_member_role)) IN ${DEAL_MEMBER_SPONSOR_ROLES_SQL}
       )`,
    [ids],
  );

  const byUser = new Map<string, Set<string>>();
  for (const row of res.rows) {
    const uid = String(row.user_id ?? "").trim().toLowerCase();
    const label = formatDealMemberRoleForDisplay(String(row.role ?? ""));
    if (!uid || !label) continue;
    const set = byUser.get(uid) ?? new Set<string>();
    set.add(label);
    byUser.set(uid, set);
  }

  for (const [uid, set] of byUser) {
    out.set(uid, [...set].join(", "));
  }
  return out;
}

/** Batch: distinct `deal_member_role` values per user id (for admin member lists). */
export async function mapDealMemberRolesForUserIds(
  userIds: string[],
): Promise<
  Map<string, { dealMemberRoleLabels: string[]; roleDisplay: string }>
> {
  const ids = [
    ...new Set(
      userIds
        .map((id) => String(id ?? "").trim().toLowerCase())
        .filter((id) => UUID_RE.test(id)),
    ),
  ];
  const out = new Map<
    string,
    { dealMemberRoleLabels: string[]; roleDisplay: string }
  >();
  if (ids.length === 0) return out;

  const res = await pool.query<{ user_id: string; deal_member_role: string }>(
    `SELECT u.id::text AS user_id, trim(dm.deal_member_role) AS deal_member_role
     FROM users u
     INNER JOIN deal_member dm ON (
       u.id::text = trim(both from dm.contact_member_id)
       OR EXISTS (
         SELECT 1 FROM contact c
         WHERE c.id::text = trim(both from dm.contact_member_id)
         AND lower(trim(c.email)) = lower(trim(u.email))
       )
     )
     WHERE u.id = ANY($1::uuid[])
       AND trim(dm.deal_member_role) <> ''
     ORDER BY u.id, deal_member_role`,
    [ids],
  );

  const byUser = new Map<string, string[]>();
  for (const row of res.rows) {
    const uid = String(row.user_id ?? "").trim().toLowerCase();
    const dr = String(row.deal_member_role ?? "").trim();
    if (!uid || !dr) continue;
    const list = byUser.get(uid) ?? [];
    if (!list.includes(dr)) list.push(dr);
    byUser.set(uid, list);
  }

  for (const id of ids) {
    const labels = byUser.get(id) ?? [];
    out.set(id, {
      dealMemberRoleLabels: labels,
      roleDisplay: buildDealParticipantRoleDisplay(labels),
    });
  }
  return out;
}

/** Attach `roleDisplay` + `dealMemberRoleLabels` for rows with `deal_participant`, and LP investor labels for any user on `deal_lp_investor`. */
export async function enrichSerializedUsersWithDealParticipantRoles(
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const allIds = rows
    .map((u) => String(u.id ?? "").trim())
    .filter((id) => UUID_RE.test(id.toLowerCase()));
  const lpDisplayByUser =
    allIds.length > 0
      ? await mapLpInvestorRoleDisplayForUserIds(allIds)
      : new Map<string, string>();

  const participantIds = rows
    .filter(
      (u) =>
        String(u.role ?? "").trim().toLowerCase() === DEAL_PARTICIPANT,
    )
    .map((u) => String(u.id ?? "").trim())
    .filter((id) => UUID_RE.test(id.toLowerCase()));
  const roleMap =
    participantIds.length > 0
      ? await mapDealMemberRolesForUserIds(participantIds)
      : new Map<
          string,
          { dealMemberRoleLabels: string[]; roleDisplay: string }
        >();

  return rows.map((u) => {
    const id = String(u.id ?? "").trim().toLowerCase();
    const lpDisp = lpDisplayByUser.get(id);

    if (String(u.role ?? "").trim().toLowerCase() !== DEAL_PARTICIPANT) {
      if (!lpDisp) return u;
      return {
        ...u,
        lp_investor_role_display: lpDisp,
        lpInvestorRoleDisplay: lpDisp,
        is_lp_investor: true,
      };
    }

    const extra = roleMap.get(id);
    if (!extra) {
      const rd = lpDisp ?? buildDealParticipantRoleDisplay([]);
      return {
        ...u,
        dealMemberRoleLabels: [],
        roleDisplay: rd,
        is_deal_participant: true,
        is_lp_investor: Boolean(lpDisp),
        ...(lpDisp
          ? {
              lp_investor_role_display: lpDisp,
              lpInvestorRoleDisplay: lpDisp,
            }
          : {}),
      };
    }
    const isLp =
      extra.dealMemberRoleLabels.some((l) =>
        dealMemberRoleLabelIsLpInvestor(l),
      ) || Boolean(lpDisp);
    return {
      ...u,
      ...extra,
      is_deal_participant: true,
      is_lp_investor: isLp,
      ...(lpDisp
        ? {
            lp_investor_role_display: lpDisp,
            lpInvestorRoleDisplay: lpDisp,
          }
        : {}),
    };
  });
}
