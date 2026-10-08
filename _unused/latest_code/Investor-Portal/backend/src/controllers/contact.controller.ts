import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getValidJwtUser } from "../middleware/jwtUser.js";
import { isPlatformAdminRole } from "../constants/roles.js";
import { db } from "../database/db.js";
import { users } from "../schema/auth.schema/signin.js";
import {
  ContactInvalidPhoneError,
  ContactScopeConflictError,
  countDealInvestmentsByContactIdForViewer,
  getContactForViewer,
  getUserDisplayNameById,
  insertContact,
  isSelfRegisteredInvestorContactRow,
  listContactsForViewer,
  loadContactCreatorUsersById,
  patchContactShowOfferingsForViewer,
  patchContactAccreditationStatusForViewer,
  patchContactKnownSinceForViewer,
  patchContactStatusForViewer,
  resolveContactDisplayFields,
  updateContactFieldsForViewer,
  type ContactOfferingVisibility,
} from "../services/contact/contact.service.js";
import { normalizeContactOfferingVisibility } from "../services/contact/contactOfferingVisibility.service.js";
import {
  deleteContactEmailTemplateForViewer,
  insertContactEmailTemplate,
  listContactEmailTemplatesForViewer,
  updateContactEmailTemplateForViewer,
} from "../services/contact/contactEmailTemplate.service.js";
import {
  getOrganizationIdForUser,
  listOrganizationContactListNames,
  listOrganizationContactTagNames,
} from "../services/contact/organizationContactLabels.service.js";
import type {
  ContactEmailTemplateRow,
  ContactRow,
  EmailTemplateAttachment,
} from "../schema/contact.schema.js";
import {
  logSocContactDirectoryView,
  logSocContactLabelsRead,
  logSocContactWrite,
} from "../audit/index.js";
import {
  requestedOrganizationIdFromRequest,
  resolveActiveOrganizationIdForUser,
  userHasAccessToOrganization,
} from "../services/org/orgResolution.service.js";

const ORG_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Company for CRM label tables: member’s org, or `?organizationId=` for platform admins. */
async function resolveOrganizationIdForContactLabels(
  req: Request,
  userId: string,
): Promise<string | null> {
  const q = req.query.organizationId ?? req.query.organization_id;
  const fromQuery =
    typeof q === "string"
      ? q.trim()
      : Array.isArray(q)
        ? String(q[0] ?? "").trim()
        : "";
  const [row] = await db
    .select({ role: users.role, organizationId: users.organizationId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const role = String(row?.role ?? "").trim();
  const selfOrg = row?.organizationId ? String(row.organizationId).trim() : "";
  if (isPlatformAdminRole(role)) {
    if (fromQuery && ORG_UUID_RE.test(fromQuery)) return fromQuery;
    const requested = requestedOrganizationIdFromRequest(req);
    if (requested && ORG_UUID_RE.test(requested)) return requested;
    return null;
  }
  const requested = requestedOrganizationIdFromRequest(req);
  if (fromQuery && ORG_UUID_RE.test(fromQuery)) {
    if (await userHasAccessToOrganization(userId, fromQuery)) return fromQuery;
    return null;
  }
  const active = await resolveActiveOrganizationIdForUser(userId, requested, {
    organizationId: row?.organizationId ?? null,
    role: row?.role ?? null,
  });
  if (active) return active;
  if (selfOrg) return selfOrg;
  return getOrganizationIdForUser(userId);
}

function paramStr(v: string | string[] | undefined): string {
  if (v == null) return "";
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" ? s.trim() : "";
}

function bodyString(v: unknown): string {
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

function bodyBoolean(v: unknown): boolean {
  return Boolean(v);
}

function bodyStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

function bodyAttachment(v: unknown): EmailTemplateAttachment | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const fileName = bodyString(o.fileName).trim();
  const mimeType = bodyString(o.mimeType).trim();
  const dataBase64 = bodyString(o.dataBase64).trim();
  const sizeRaw = o.size;
  const size = typeof sizeRaw === "number" && Number.isFinite(sizeRaw)
    ? Math.max(0, Math.trunc(sizeRaw))
    : 0;
  if (!fileName || !dataBase64) return null;
  return {
    fileName,
    mimeType: mimeType || "application/octet-stream",
    size,
    dataBase64,
  };
}

function dedupeOwnersPreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of items) {
    const t = x.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function normalizeShowOfferingsVisibility(
  row: ContactRow,
): ContactOfferingVisibility | null {
  return normalizeContactOfferingVisibility(row.showOfferingsVisibility);
}

function formatKnownSince(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1]! : null;
}

function mapContactToJson(row: ContactRow) {
  const showOfferingsVisibility = normalizeShowOfferingsVisibility(row);
  const accreditationStatus =
    row.accreditationStatus != null &&
    String(row.accreditationStatus).trim() !== ""
      ? String(row.accreditationStatus).trim()
      : null;
  const knownSince = formatKnownSince(row.knownSince);
  return {
    id: row.id,
    organizationId: row.organizationId ?? null,
    organization_id: row.organizationId ?? null,
    firstName: row.firstName,
    lastName: row.lastName,
    fullName:
      String(row.fullName ?? "").trim() ||
      [row.firstName, row.lastName]
        .map((s) => String(s ?? "").trim())
        .filter(Boolean)
        .join(" "),
    email: row.email,
    phone: row.phone,
    note: row.note,
    tags: row.tags ?? [],
    lists: row.lists ?? [],
    owners: row.owners ?? [],
    /** Internal — prefer `createdByDisplayName` in UI */
    createdBy: row.createdBy,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    status: row.status ?? "active",
    showOfferingsVisibility,
    show_offerings_visibility: showOfferingsVisibility,
    accreditationStatus,
    accreditation_status: accreditationStatus,
    knownSince,
    known_since: knownSince,
    lastEditReason: row.lastEditReason?.trim() || undefined,
  };
}

async function mapContactEmailTemplateToJsonWithName(
  row: ContactEmailTemplateRow,
) {
  const createdByDisplayName = (await getUserDisplayNameById(row.createdBy)).trim();
  return {
    id: row.id,
    organizationId: row.organizationId ?? null,
    organization_id: row.organizationId ?? null,
    name: row.name,
    subject: row.subject,
    body: row.body,
    attachment: row.attachment ?? null,
    archived: row.archived,
    createdBy: createdByDisplayName || row.createdBy,
    createdByUserId: row.createdBy,
    createdByDisplayName: createdByDisplayName || undefined,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
  };
}

async function mapContactsToJsonWithNames(
  rows: ContactRow[],
  dealCounts?: Map<string, number>,
) {
  const creatorById = await loadContactCreatorUsersById(
    rows.map((row) => row.createdBy),
  );

  const displayNameByCreatorId = new Map<string, string>();
  const creatorIdsNeedingName = [
    ...new Set(
      rows
        .filter(
          (row) =>
            !isSelfRegisteredInvestorContactRow(
              row,
              creatorById.get(row.createdBy) ?? null,
            ),
        )
        .map((row) => row.createdBy),
    ),
  ];
  await Promise.all(
    creatorIdsNeedingName.map(async (creatorId) => {
      const name = (await getUserDisplayNameById(creatorId)).trim();
      displayNameByCreatorId.set(creatorId, name);
    }),
  );

  return rows.map((row) => {
    const base = mapContactToJson(row);
    const { createdBy: _createdBy, ...rest } = base;
    const creator = creatorById.get(row.createdBy) ?? null;
    const display = resolveContactDisplayFields(
      row,
      creator,
      displayNameByCreatorId.get(row.createdBy) ?? "",
    );
    const idKey = String(row.id).trim().toLowerCase();
    const dealCount = dealCounts?.get(idKey) ?? 0;
    return {
      ...rest,
      owners: display.owners,
      createdByDisplayName: display.createdByDisplayName || undefined,
      dealCount,
    };
  });
}

async function mapContactToJsonWithNames(
  row: ContactRow,
  dealCounts?: Map<string, number>,
) {
  const [mapped] = await mapContactsToJsonWithNames([row], dealCounts);
  return mapped;
}

/** GET /contacts/organization-tags — names from `organization_contact_tag`. */
export async function getOrganizationContactTags(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  try {
    const orgId = await resolveOrganizationIdForContactLabels(req, user.id);
    if (!orgId) {
      res.status(403).json({ message: "No organization context for tags." });
      return;
    }
    const tags = await listOrganizationContactTagNames(orgId);
    logSocContactLabelsRead({
      actorUserId: user.id,
      organizationId: orgId,
      kind: "tags",
    });
    res.status(200).json({ tags });
  } catch (err) {
    console.error("getOrganizationContactTags:", err);
    res.status(500).json({ message: "Could not load organization tags" });
  }
}

/** GET /contacts/organization-lists — names from `organization_contact_list`. */
export async function getOrganizationContactLists(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  try {
    const orgId = await resolveOrganizationIdForContactLabels(req, user.id);
    if (!orgId) {
      res.status(403).json({ message: "No organization context for lists." });
      return;
    }
    const lists = await listOrganizationContactListNames(orgId);
    logSocContactLabelsRead({
      actorUserId: user.id,
      organizationId: orgId,
      kind: "lists",
    });
    res.status(200).json({ lists });
  } catch (err) {
    console.error("getOrganizationContactLists:", err);
    res.status(500).json({ message: "Could not load organization lists" });
  }
}

export async function getContacts(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  try {
    const requestedOrg = requestedOrganizationIdFromRequest(req);
    const rows = await listContactsForViewer(
      user.id,
      user.userRole,
      requestedOrg,
    );
    const contactIds = rows.map((r) => String(r.id));
    const dealCounts = await countDealInvestmentsByContactIdForViewer({
      viewerUserId: user.id,
      jwtUserRole: user.userRole,
      contactIds,
      requestedOrganizationId: requestedOrg,
    });
    const contacts = await mapContactsToJsonWithNames(rows, dealCounts);
    logSocContactDirectoryView({
      actorUserId: user.id,
      resultCount: contacts.length,
    });
    res.status(200).json({ contacts });
  } catch (err) {
    console.error("getContacts:", err);
    res.status(500).json({ message: "Could not load contacts" });
  }
}

/** GET /contacts/:contactId */
export async function getContact(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const contactId = paramStr(req.params.contactId);
  if (!contactId) {
    res.status(400).json({ message: "Contact id required" });
    return;
  }
  try {
    const requestedOrg = requestedOrganizationIdFromRequest(req);
    const row = await getContactForViewer(
      user.id,
      contactId,
      user.userRole,
      requestedOrg,
    );
    if (!row) {
      res.status(404).json({ message: "Contact not found or access denied" });
      return;
    }
    const dealCounts = await countDealInvestmentsByContactIdForViewer({
      viewerUserId: user.id,
      jwtUserRole: user.userRole,
      contactIds: [String(row.id)],
      requestedOrganizationId: requestedOrg,
    });
    res.status(200).json({
      contact: await mapContactToJsonWithNames(row, dealCounts),
    });
  } catch (err) {
    console.error("getContact:", err);
    res.status(500).json({ message: "Could not load contact" });
  }
}

export async function postContact(req: Request, res: Response): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const firstName = bodyString(b.first_name || b.firstName).trim();
  const lastName = bodyString(b.last_name || b.lastName).trim();
  const email = bodyString(b.email).trim();
  const phone = bodyString(b.phone).trim();
  const note = bodyString(b.note).trim();
  const tags = bodyStringArray(b.tags);
  const lists = bodyStringArray(b.lists);
  const ownersFromClient = bodyStringArray(b.owners);

  if (!firstName) {
    res.status(400).json({ message: "First name is required" });
    return;
  }
  if (!lastName) {
    res.status(400).json({ message: "Last name is required" });
    return;
  }
  if (!email) {
    res.status(400).json({ message: "Email is required" });
    return;
  }

  try {
    const creatorLabel = (await getUserDisplayNameById(user.id)).trim();
    const fallback =
      user.email?.trim() || creatorLabel || "User";
    const primaryOwner = creatorLabel || fallback;
    const owners = dedupeOwnersPreserveOrder([
      primaryOwner,
      ...ownersFromClient,
    ]);

    const row = await insertContact({
      input: {
        firstName,
        lastName,
        email,
        phone,
        note,
        tags,
        lists,
        owners,
      },
      createdByUserId: user.id,
    });
    const dealCounts = await countDealInvestmentsByContactIdForViewer({
      viewerUserId: user.id,
      jwtUserRole: user.userRole,
      contactIds: [String(row.id)],
    });
    logSocContactWrite({
      operation: "create",
      actorUserId: user.id,
      contactId: String(row.id),
    });
    res.status(201).json({
      message: "Contact created",
      contact: await mapContactToJsonWithNames(row, dealCounts),
    });
  } catch (err) {
    if (err instanceof ContactInvalidPhoneError) {
      res.status(400).json({ message: err.message });
      return;
    }
    if (err instanceof ContactScopeConflictError) {
      res.status(409).json({ message: err.message });
      return;
    }
    console.error("postContact:", err);
    res.status(500).json({ message: "Could not create contact" });
  }
}

export async function patchContact(req: Request, res: Response): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const contactId = paramStr(req.params.contactId);
  if (!contactId) {
    res.status(400).json({ message: "Contact id required" });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const editReason = bodyString(b.edit_reason || b.editReason).trim();
  if (!editReason) {
    res.status(400).json({ message: "Edit reason is required" });
    return;
  }

  const firstName = bodyString(b.first_name || b.firstName).trim();
  const lastName = bodyString(b.last_name || b.lastName).trim();
  const email = bodyString(b.email).trim();
  const phone = bodyString(b.phone).trim();
  const note = bodyString(b.note).trim();
  const tags = bodyStringArray(b.tags);
  const lists = bodyStringArray(b.lists);
  const ownersFromClient = bodyStringArray(b.owners);

  if (!firstName) {
    res.status(400).json({ message: "First name is required" });
    return;
  }
  if (!lastName) {
    res.status(400).json({ message: "Last name is required" });
    return;
  }
  if (!email) {
    res.status(400).json({ message: "Email is required" });
    return;
  }

  try {
    const owners = dedupeOwnersPreserveOrder(ownersFromClient);

    const updated = await updateContactFieldsForViewer(
      user.id,
      contactId,
      {
        firstName,
        lastName,
        email,
        phone,
        note,
        tags,
        lists,
        owners,
        lastEditReason: editReason,
      },
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!updated) {
      res.status(404).json({ message: "Contact not found or access denied" });
      return;
    }
    const dealCounts = await countDealInvestmentsByContactIdForViewer({
      viewerUserId: user.id,
      jwtUserRole: user.userRole,
      contactIds: [String(updated.id)],
    });
    logSocContactWrite({
      operation: "update",
      actorUserId: user.id,
      contactId: String(updated.id),
    });
    res.status(200).json({
      message: "Contact updated",
      contact: await mapContactToJsonWithNames(updated, dealCounts),
    });
  } catch (err) {
    if (err instanceof ContactInvalidPhoneError) {
      res.status(400).json({ message: err.message });
      return;
    }
    if (err instanceof ContactScopeConflictError) {
      res.status(409).json({ message: err.message });
      return;
    }
    console.error("patchContact:", err);
    res.status(500).json({ message: "Could not update contact" });
  }
}

export async function patchContactStatus(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const contactId = paramStr(req.params.contactId);
  if (!contactId) {
    res.status(400).json({ message: "Contact id required" });
    return;
  }
  const b = req.body as Record<string, unknown>;
  const raw = bodyString(b.status).trim().toLowerCase();
  const status = raw === "suspended" ? "suspended" : "active";

  try {
    const updated = await patchContactStatusForViewer(
      user.id,
      contactId,
      status,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!updated) {
      res.status(404).json({ message: "Contact not found or access denied" });
      return;
    }
    const dealCounts = await countDealInvestmentsByContactIdForViewer({
      viewerUserId: user.id,
      jwtUserRole: user.userRole,
      contactIds: [String(updated.id)],
    });
    logSocContactWrite({
      operation: "status_update",
      actorUserId: user.id,
      contactId: String(updated.id),
      status,
    });
    res.status(200).json({
      message: "Contact status updated",
      contact: await mapContactToJsonWithNames(updated, dealCounts),
    });
  } catch (err) {
    console.error("patchContactStatus:", err);
    res.status(500).json({ message: "Could not update contact status" });
  }
}

function parseShowOfferingsVisibility(
  raw: unknown,
): ContactOfferingVisibility | null | undefined {
  if (raw === null) return null;
  if (raw === undefined) return undefined;
  const s = bodyString(raw).trim();
  if (!s) return null;
  return normalizeContactOfferingVisibility(s);
}

function parseKnownSinceInput(raw: unknown): string | null | undefined {
  if (raw === null) return null;
  if (raw === undefined) return undefined;
  const s = bodyString(raw).trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t)) return undefined;
  return s;
}

/** PATCH /contacts/:contactId/show-offerings */
export async function patchContactShowOfferings(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const contactId = paramStr(req.params.contactId);
  if (!contactId) {
    res.status(400).json({ message: "Contact id required" });
    return;
  }
  const b = req.body as Record<string, unknown>;
  const showOfferingsVisibility = parseShowOfferingsVisibility(
    b.showOfferingsVisibility ?? b.show_offerings_visibility,
  );
  if (showOfferingsVisibility === undefined) {
    res.status(400).json({
      message:
        "showOfferingsVisibility must be one of: ALL_OFFERINGS, HIDE_OFFERINGS, 506C_ONLY (or empty/null to clear)",
    });
    return;
  }

  try {
    const updated = await patchContactShowOfferingsForViewer(
      user.id,
      contactId,
      showOfferingsVisibility,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!updated) {
      res.status(404).json({ message: "Contact not found or access denied" });
      return;
    }
    const dealCounts = await countDealInvestmentsByContactIdForViewer({
      viewerUserId: user.id,
      jwtUserRole: user.userRole,
      contactIds: [String(updated.id)],
    });
    logSocContactWrite({
      operation: "update",
      actorUserId: user.id,
      contactId: String(updated.id),
    });
    res.status(200).json({
      message: "Contact offerings visibility updated",
      contact: await mapContactToJsonWithNames(updated, dealCounts),
    });
  } catch (err) {
    console.error("patchContactShowOfferings:", err);
    res.status(500).json({
      message: "Could not update contact offerings visibility",
    });
  }
}

/** PATCH /contacts/:contactId/accreditation-status */
export async function patchContactAccreditationStatus(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const contactId = paramStr(req.params.contactId);
  if (!contactId) {
    res.status(400).json({ message: "Contact id required" });
    return;
  }
  const b = req.body as Record<string, unknown>;
  const raw = b.accreditationStatus ?? b.accreditation_status;
  if (raw === undefined) {
    res.status(400).json({ message: "accreditationStatus is required" });
    return;
  }
  const accreditationStatus =
    raw === null || String(raw).trim() === ""
      ? null
      : String(raw).trim().slice(0, 500);
  try {
    const updated = await patchContactAccreditationStatusForViewer(
      user.id,
      contactId,
      accreditationStatus,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!updated) {
      res.status(404).json({ message: "Contact not found or access denied" });
      return;
    }
    const dealCounts = await countDealInvestmentsByContactIdForViewer({
      viewerUserId: user.id,
      jwtUserRole: user.userRole,
      contactIds: [String(updated.id)],
    });
    logSocContactWrite({
      operation: "update",
      actorUserId: user.id,
      contactId: String(updated.id),
    });
    res.status(200).json({
      message: "Contact accreditation status updated",
      contact: await mapContactToJsonWithNames(updated, dealCounts),
    });
  } catch (err) {
    console.error("patchContactAccreditationStatus:", err);
    res
      .status(500)
      .json({ message: "Could not update accreditation status" });
  }
}

/** PATCH /contacts/:contactId/known-since */
export async function patchContactKnownSince(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const contactId = paramStr(req.params.contactId);
  if (!contactId) {
    res.status(400).json({ message: "Contact id required" });
    return;
  }
  const b = req.body as Record<string, unknown>;
  const knownSince = parseKnownSinceInput(b.knownSince ?? b.known_since);
  if (knownSince === undefined) {
    res.status(400).json({
      message: "knownSince must be YYYY-MM-DD or null/empty to clear",
    });
    return;
  }
  try {
    const updated = await patchContactKnownSinceForViewer(
      user.id,
      contactId,
      knownSince,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!updated) {
      res.status(404).json({ message: "Contact not found or access denied" });
      return;
    }
    const dealCounts = await countDealInvestmentsByContactIdForViewer({
      viewerUserId: user.id,
      jwtUserRole: user.userRole,
      contactIds: [String(updated.id)],
    });
    logSocContactWrite({
      operation: "update",
      actorUserId: user.id,
      contactId: String(updated.id),
    });
    res.status(200).json({
      message: "Contact known since updated",
      contact: await mapContactToJsonWithNames(updated, dealCounts),
    });
  } catch (err) {
    console.error("patchContactKnownSince:", err);
    res.status(500).json({ message: "Could not update known since" });
  }
}

const EMAIL_TEMPLATE_SUBJECT_MAX = 255;
const EMAIL_TEMPLATE_NAME_MAX = 255;
const EMAIL_TEMPLATE_BODY_HTML_MAX = 200_000;
const EMAIL_TEMPLATE_ATTACHMENT_BASE64_MAX = 1_400_000;

/** GET /contacts/email-templates */
export async function getContactEmailTemplates(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  try {
    const requestedOrg = requestedOrganizationIdFromRequest(req);
    const rows = await listContactEmailTemplatesForViewer(
      user.id,
      user.userRole,
      requestedOrg,
    );
    const templates = await Promise.all(
      rows.map((r) => mapContactEmailTemplateToJsonWithName(r)),
    );
    res.status(200).json({
      templates,
    });
  } catch (err) {
    console.error("getContactEmailTemplates:", err);
    res.status(500).json({ message: "Could not load email templates" });
  }
}

/** POST /contacts/email-templates */
export async function postContactEmailTemplate(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const b = req.body as Record<string, unknown>;
  const name = bodyString(b.name).trim().slice(0, EMAIL_TEMPLATE_NAME_MAX);
  const subject = bodyString(b.subject).slice(0, EMAIL_TEMPLATE_SUBJECT_MAX);
  const body = bodyString(b.body).slice(0, EMAIL_TEMPLATE_BODY_HTML_MAX);
  const archived = bodyBoolean(b.archived);
  const attachment = bodyAttachment(b.attachment);

  if (!name) {
    res.status(400).json({ message: "Template name is required" });
    return;
  }
  if (
    attachment &&
    attachment.dataBase64.length > EMAIL_TEMPLATE_ATTACHMENT_BASE64_MAX
  ) {
    res.status(400).json({ message: "Attachment is too large" });
    return;
  }

  try {
    const row = await insertContactEmailTemplate({
      createdByUserId: user.id,
      requestedOrganizationId: requestedOrganizationIdFromRequest(req),
      input: { name, subject, body, attachment, archived },
    });
    res.status(201).json({
      message: "Email template created",
      template: await mapContactEmailTemplateToJsonWithName(row),
    });
  } catch (err) {
    console.error("postContactEmailTemplate:", err);
    res.status(500).json({ message: "Could not create email template" });
  }
}

/** PATCH /contacts/email-templates/:templateId */
export async function patchContactEmailTemplate(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const templateId = paramStr(req.params.templateId);
  if (!templateId) {
    res.status(400).json({ message: "Template id required" });
    return;
  }
  const b = req.body as Record<string, unknown>;
  const name = bodyString(b.name).trim().slice(0, EMAIL_TEMPLATE_NAME_MAX);
  const subject = bodyString(b.subject).slice(0, EMAIL_TEMPLATE_SUBJECT_MAX);
  const body = bodyString(b.body).slice(0, EMAIL_TEMPLATE_BODY_HTML_MAX);
  const archived = bodyBoolean(b.archived);
  const attachment = bodyAttachment(b.attachment);

  if (!name) {
    res.status(400).json({ message: "Template name is required" });
    return;
  }
  if (
    attachment &&
    attachment.dataBase64.length > EMAIL_TEMPLATE_ATTACHMENT_BASE64_MAX
  ) {
    res.status(400).json({ message: "Attachment is too large" });
    return;
  }

  try {
    const updated = await updateContactEmailTemplateForViewer({
      viewerUserId: user.id,
      viewerRole: user.userRole,
      requestedOrganizationId: requestedOrganizationIdFromRequest(req),
      templateId,
      input: { name, subject, body, attachment, archived },
    });
    if (!updated) {
      res
        .status(404)
        .json({ message: "Email template not found or access denied" });
      return;
    }
    res.status(200).json({
      message: "Email template updated",
      template: await mapContactEmailTemplateToJsonWithName(updated),
    });
  } catch (err) {
    console.error("patchContactEmailTemplate:", err);
    res.status(500).json({ message: "Could not update email template" });
  }
}

/** DELETE /contacts/email-templates/:templateId */
export async function deleteContactEmailTemplate(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const templateId = paramStr(req.params.templateId);
  if (!templateId) {
    res.status(400).json({ message: "Template id required" });
    return;
  }
  try {
    const ok = await deleteContactEmailTemplateForViewer({
      viewerUserId: user.id,
      viewerRole: user.userRole,
      requestedOrganizationId: requestedOrganizationIdFromRequest(req),
      templateId,
    });
    if (!ok) {
      res
        .status(404)
        .json({ message: "Email template not found or access denied" });
      return;
    }
    res.status(200).json({ message: "Email template deleted" });
  } catch (err) {
    console.error("deleteContactEmailTemplate:", err);
    res.status(500).json({ message: "Could not delete email template" });
  }
}
