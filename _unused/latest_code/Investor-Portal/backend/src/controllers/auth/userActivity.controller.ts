import type { Request, Response } from "express";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  endOpenPortalSessionsForUser,
  endUserPortalSession,
  ensureUserPortalSession,
  recordUserPageNavigation,
} from "../../services/platform/userActivity.service.js";

type SessionBody = {
  activitySessionId?: unknown;
};

type PageViewBody = {
  activitySessionId?: unknown;
  pagePath?: unknown;
  pageLabel?: unknown;
};

function parseSessionId(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/** POST /auth/activity/session — ensure an open session (after refresh). */
export async function postEnsureActivitySession(
  req: Request,
  res: Response,
): Promise<void> {
  const jwtUser = await getValidJwtUser(req);
  if (!jwtUser?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const body = req.body as SessionBody;
  const sessionId = parseSessionId(body.activitySessionId);

  try {
    const activitySessionId = await ensureUserPortalSession(
      jwtUser.id,
      sessionId,
    );
    res.status(200).json({ activitySessionId });
  } catch (err) {
    console.error("postEnsureActivitySession:", err);
    res.status(500).json({ message: "Could not start activity session" });
  }
}

/** POST /auth/activity/logout — record logout time before client clears token. */
export async function postActivityLogout(
  req: Request,
  res: Response,
): Promise<void> {
  const jwtUser = await getValidJwtUser(req);
  if (!jwtUser?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const body = req.body as SessionBody;
  const sessionId = parseSessionId(body.activitySessionId);

  try {
    if (sessionId) {
      await endUserPortalSession(sessionId, jwtUser.id);
    } else {
      await endOpenPortalSessionsForUser(jwtUser.id);
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("postActivityLogout:", err);
    res.status(500).json({ message: "Could not record logout" });
  }
}

/** POST /auth/activity/page-view — increment navigation count for current session. */
export async function postActivityPageView(
  req: Request,
  res: Response,
): Promise<void> {
  const jwtUser = await getValidJwtUser(req);
  if (!jwtUser?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const body = req.body as PageViewBody;
  let sessionId = parseSessionId(body.activitySessionId);
  const pagePath =
    typeof body.pagePath === "string" ? body.pagePath.trim() : "";
  const pageLabel =
    typeof body.pageLabel === "string" ? body.pageLabel.trim() : "";

  if (!pagePath) {
    res.status(400).json({ message: "pagePath is required" });
    return;
  }

  try {
    sessionId = await ensureUserPortalSession(jwtUser.id, sessionId);
    await recordUserPageNavigation({
      userId: jwtUser.id,
      sessionId,
      pagePath,
      pageLabel: pageLabel || pagePath,
    });
    res.status(200).json({ ok: true, activitySessionId: sessionId });
  } catch (err) {
    console.error("postActivityPageView:", err);
    res.status(500).json({ message: "Could not record page view" });
  }
}
