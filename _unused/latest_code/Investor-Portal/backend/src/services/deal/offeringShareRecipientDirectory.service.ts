import { and, desc, eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { users } from "../../schema/schema.js";
import { contact } from "../../schema/contact.schema.js";

export type OfferingShareRecipientOption = {
  id: string;
  email: string;
  label: string;
};

function shareRecipientPersonLabel(
  firstName: string,
  lastName: string,
  emailDisplay: string,
): string {
  const name = `${firstName} ${lastName}`.trim();
  if (name && emailDisplay) return `${name} — ${emailDisplay}`;
  return emailDisplay || name || "—";
}

/**
 * Active contacts + company users for an organization (offering preview share-by-email).
 */
export async function loadOfferingShareRecipientDirectory(
  organizationId: string,
): Promise<{
  contacts: OfferingShareRecipientOption[];
  members: OfferingShareRecipientOption[];
}> {
  const orgId = organizationId.trim();
  if (!orgId) return { contacts: [], members: [] };

  const contactRows = await db
    .select({
      id: contact.id,
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
    })
    .from(contact)
    .where(
      and(eq(contact.organizationId, orgId), eq(contact.status, "active"))!,
    )
    .orderBy(desc(contact.createdAt))
    .limit(500);

  const memberRows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(
      and(eq(users.organizationId, orgId), eq(users.userStatus, "active"))!,
    )
    .orderBy(desc(users.createdAt))
    .limit(500);

  const contacts = contactRows
    .filter((r) => String(r.email ?? "").trim().includes("@"))
    .map((r) => {
      const emailDisplay = String(r.email).trim();
      const email = emailDisplay.toLowerCase();
      const fn = String(r.firstName ?? "").trim();
      const ln = String(r.lastName ?? "").trim();
      return {
        id: String(r.id),
        email,
        label: shareRecipientPersonLabel(fn, ln, emailDisplay),
      };
    });

  const members = memberRows
    .filter((r) => String(r.email ?? "").trim().includes("@"))
    .map((r) => {
      const emailDisplay = String(r.email).trim();
      const email = emailDisplay.toLowerCase();
      const fn = String(r.firstName ?? "").trim();
      const ln = String(r.lastName ?? "").trim();
      return {
        id: String(r.id),
        email,
        label: shareRecipientPersonLabel(fn, ln, emailDisplay),
      };
    });

  return { contacts, members };
}
