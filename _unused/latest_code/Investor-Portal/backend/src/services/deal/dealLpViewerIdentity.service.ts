import { eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { users } from "../../schema/schema.js";

/** Email used to match LP roster / investment rows for signed-in viewers. */
export async function resolveLpViewerEmailNorm(
  userId: string,
  jwtEmail?: string | null,
): Promise<string> {
  const uid = String(userId ?? "").trim();
  let fromDb = "";
  if (uid) {
    const [row] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, uid))
      .limit(1);
    fromDb = String(row?.email ?? "").trim().toLowerCase();
  }
  if (fromDb.includes("@")) return fromDb;

  const fromJwt = String(jwtEmail ?? "").trim().toLowerCase();
  if (fromJwt.includes("@")) return fromJwt;

  return fromDb || fromJwt;
}

export function viewerOwnsContactKey(
  contactId: string | null | undefined,
  contactKeys: Set<string>,
  viewerContactKey?: string | null,
): boolean {
  const cid = String(contactId ?? "").trim().toLowerCase();
  if (!cid) return false;
  if (contactKeys.has(cid)) return true;
  const viewerKey = String(viewerContactKey ?? "").trim().toLowerCase();
  return Boolean(viewerKey && viewerKey === cid);
}
