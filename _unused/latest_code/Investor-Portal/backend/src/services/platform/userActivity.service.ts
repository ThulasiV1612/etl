import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../database/db.js";
import {
  companies,
  userPageNavigations,
  userPortalSessions,
  users,
} from "../../schema/schema.js";

export type UserActivityPageCount = {
  pagePath: string;
  pageLabel: string;
  count: number;
};

export type UserActivityRow = {
  userId: string;
  sessionId: string | null;
  userName: string;
  email: string;
  role: string;
  userStatus: string;
  companyName: string | null;
  loginAt: string;
  logoutAt: string | null;
  isActive: boolean;
  pageNavigations: UserActivityPageCount[];
};

/** Close every still-open portal session for this user. */
export async function endOpenPortalSessionsForUser(
  userId: string,
): Promise<void> {
  await db
    .update(userPortalSessions)
    .set({ logoutAt: sql`now()` })
    .where(
      and(
        eq(userPortalSessions.userId, userId),
        isNull(userPortalSessions.logoutAt),
      ),
    );
}

/** Start a new portal session on successful sign-in. */
export async function startUserPortalSession(userId: string): Promise<string> {
  await endOpenPortalSessionsForUser(userId);
  const [row] = await db
    .insert(userPortalSessions)
    .values({ userId })
    .returning({ id: userPortalSessions.id });
  return row.id;
}

/** Close the open session for this user (if any). */
export async function endUserPortalSession(
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .update(userPortalSessions)
    .set({ logoutAt: sql`now()` })
    .where(
      and(
        eq(userPortalSessions.id, sessionId),
        eq(userPortalSessions.userId, userId),
        isNull(userPortalSessions.logoutAt),
      ),
    )
    .returning({ id: userPortalSessions.id });
  return Boolean(row);
}

/**
 * Resume tracking after refresh: reuse open session or start a new one.
 */
export async function ensureUserPortalSession(
  userId: string,
  sessionId?: string | null,
): Promise<string> {
  if (sessionId) {
    const [open] = await db
      .select({ id: userPortalSessions.id })
      .from(userPortalSessions)
      .where(
        and(
          eq(userPortalSessions.id, sessionId),
          eq(userPortalSessions.userId, userId),
          isNull(userPortalSessions.logoutAt),
        ),
      )
      .limit(1);
    if (open) return open.id;
  }

  const [latestOpen] = await db
    .select({ id: userPortalSessions.id })
    .from(userPortalSessions)
    .where(
      and(
        eq(userPortalSessions.userId, userId),
        isNull(userPortalSessions.logoutAt),
      ),
    )
    .orderBy(desc(userPortalSessions.loginAt))
    .limit(1);
  if (latestOpen) return latestOpen.id;

  return startUserPortalSession(userId);
}

export async function recordUserPageNavigation(params: {
  userId: string;
  sessionId: string;
  pagePath: string;
  pageLabel: string;
}): Promise<void> {
  const pagePath = params.pagePath.trim().slice(0, 2048);
  if (!pagePath) return;
  const pageLabel = params.pageLabel.trim().slice(0, 255);

  await db
    .insert(userPageNavigations)
    .values({
      userId: params.userId,
      sessionId: params.sessionId,
      pagePath,
      pageLabel,
      visitCount: 1,
    })
    .onConflictDoUpdate({
      target: [userPageNavigations.sessionId, userPageNavigations.pagePath],
      set: {
        visitCount: sql`${userPageNavigations.visitCount} + 1`,
        pageLabel: sql`excluded.page_label`,
        updatedAt: sql`now()`,
      },
    });
}

function displayNameFromUser(row: {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
}): string {
  const full = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();
  if (full) return full;
  const un = String(row.username ?? "").trim();
  if (un) return un;
  return String(row.email ?? "").trim() || "—";
}

type SessionPick = {
  sessionId: string;
  userId: string;
  loginAt: Date;
  logoutAt: Date | null;
};

function pickLatestSession(sessions: SessionPick[]): SessionPick | undefined {
  let chosen: SessionPick | undefined;
  for (const s of sessions) {
    if (!chosen) {
      chosen = s;
      continue;
    }
    const chosenOpen = chosen.logoutAt == null;
    const nextOpen = s.logoutAt == null;
    if (nextOpen && !chosenOpen) {
      chosen = s;
      continue;
    }
    if (nextOpen === chosenOpen && s.loginAt > chosen.loginAt) {
      chosen = s;
    }
  }
  return chosen;
}

/** All platform users with latest (or currently open) session and page counts. */
export async function getUserActivityMetrics(): Promise<UserActivityRow[]> {
  const [userRows, sessionRows] = await Promise.all([
    db
      .select({
        userId: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        username: users.username,
        role: users.role,
        userStatus: users.userStatus,
        companyName: companies.name,
      })
      .from(users)
      .leftJoin(companies, eq(companies.id, users.organizationId)),
    db
      .select({
        sessionId: userPortalSessions.id,
        userId: userPortalSessions.userId,
        loginAt: userPortalSessions.loginAt,
        logoutAt: userPortalSessions.logoutAt,
      })
      .from(userPortalSessions),
  ]);

  const sessionsByUser = new Map<string, SessionPick[]>();
  for (const s of sessionRows) {
    const list = sessionsByUser.get(s.userId) ?? [];
    list.push(s);
    sessionsByUser.set(s.userId, list);
  }

  const chosenByUser = new Map<string, SessionPick>();
  for (const [userId, list] of sessionsByUser) {
    const chosen = pickLatestSession(list);
    if (chosen) chosenByUser.set(userId, chosen);
  }

  const sessionIds = [...chosenByUser.values()].map((s) => s.sessionId);
  const navBySession = new Map<string, UserActivityPageCount[]>();
  if (sessionIds.length > 0) {
    const navRows = await db
      .select({
        sessionId: userPageNavigations.sessionId,
        pagePath: userPageNavigations.pagePath,
        pageLabel: userPageNavigations.pageLabel,
        visitCount: userPageNavigations.visitCount,
      })
      .from(userPageNavigations)
      .where(inArray(userPageNavigations.sessionId, sessionIds))
      .orderBy(desc(userPageNavigations.visitCount));

    for (const n of navRows) {
      const list = navBySession.get(n.sessionId) ?? [];
      list.push({
        pagePath: n.pagePath,
        pageLabel: n.pageLabel || n.pagePath,
        count: Number(n.visitCount) || 0,
      });
      navBySession.set(n.sessionId, list);
    }
  }

  const rows: UserActivityRow[] = userRows.map((u) => {
    const session = chosenByUser.get(u.userId);
    const loginAt = session?.loginAt?.toISOString?.() ?? "";
    const logoutAt = session?.logoutAt?.toISOString?.() ?? null;
    const isActive = Boolean(session && session.logoutAt == null);
    return {
      userId: u.userId,
      sessionId: session?.sessionId ?? null,
      userName: displayNameFromUser(u),
      email: u.email,
      role: String(u.role ?? "").trim() || "unknown",
      userStatus: String(u.userStatus ?? "").trim() || "unknown",
      companyName: u.companyName?.trim() || null,
      loginAt,
      logoutAt: isActive ? null : logoutAt,
      isActive,
      pageNavigations: session
        ? (navBySession.get(session.sessionId) ?? [])
        : [],
    };
  });

  rows.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    if (a.loginAt && b.loginAt) return b.loginAt.localeCompare(a.loginAt);
    if (a.loginAt) return -1;
    if (b.loginAt) return 1;
    return a.userName.localeCompare(b.userName);
  });

  return rows;
}
