import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { isPlatformAdminRole } from "../../constants/roles.js";
import { db } from "../../database/db.js";
import { users } from "../../schema/auth.schema/signin.js";
import {
  contactEmailTemplate,
  type ContactEmailTemplateInsert,
  type ContactEmailTemplateRow,
  type EmailTemplateAttachment,
} from "../../schema/contact.schema.js";
import { resolveActiveOrganizationIdForUser } from "../org/orgResolution.service.js";

export type CreateContactEmailTemplateInput = {
  name: string;
  subject: string;
  body: string;
  attachment: EmailTemplateAttachment | null;
  archived: boolean;
};

export type UpdateContactEmailTemplateInput = {
  name: string;
  subject: string;
  body: string;
  attachment: EmailTemplateAttachment | null;
  archived: boolean;
};

type ViewerScopeContext = {
  roleForScope: string;
  organizationId: string | null;
};

async function getViewerScopeContext(
  viewerUserId: string,
  jwtRoleFallback: string | null | undefined,
  requestedOrganizationId?: string | null,
): Promise<ViewerScopeContext> {
  const [row] = await db
    .select({
      role: users.role,
      organizationId: users.organizationId,
    })
    .from(users)
    .where(eq(users.id, viewerUserId))
    .limit(1);
  const roleForScope = String(row?.role ?? "").trim() || String(jwtRoleFallback ?? "").trim();
  const preloaded = row
    ? {
        role: row.role,
        organizationId: row.organizationId,
      }
    : null;
  const organizationId = await resolveActiveOrganizationIdForUser(
    viewerUserId,
    requestedOrganizationId,
    preloaded,
  );
  return { roleForScope, organizationId };
}

async function userIdsInOrganization(organizationId: string): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.organizationId, organizationId));
  return rows.map((r) => r.id);
}

function buildOrgScopeWhere(orgId: string, viewerUserId: string) {
  return or(
    eq(contactEmailTemplate.organizationId, orgId),
    eq(contactEmailTemplate.createdBy, viewerUserId),
  )!;
}

export async function listContactEmailTemplatesForViewer(
  viewerUserId: string,
  viewerRole?: string | null,
  requestedOrganizationId?: string | null,
): Promise<ContactEmailTemplateRow[]> {
  const ctx = await getViewerScopeContext(
    viewerUserId,
    viewerRole,
    requestedOrganizationId,
  );
  if (isPlatformAdminRole(ctx.roleForScope)) {
    return db
      .select()
      .from(contactEmailTemplate)
      .orderBy(desc(contactEmailTemplate.createdAt));
  }

  if (!ctx.organizationId) {
    return db
      .select()
      .from(contactEmailTemplate)
      .where(eq(contactEmailTemplate.createdBy, viewerUserId))
      .orderBy(desc(contactEmailTemplate.createdAt));
  }

  const orgIds = await userIdsInOrganization(ctx.organizationId);
  const legacyOrgScope =
    orgIds.length > 0
      ? and(
          isNull(contactEmailTemplate.organizationId),
          inArray(contactEmailTemplate.createdBy, orgIds),
        )
      : null;
  const scope = legacyOrgScope
    ? or(buildOrgScopeWhere(ctx.organizationId, viewerUserId), legacyOrgScope)!
    : buildOrgScopeWhere(ctx.organizationId, viewerUserId);

  return db
    .select()
    .from(contactEmailTemplate)
    .where(scope)
    .orderBy(desc(contactEmailTemplate.createdAt));
}

async function getContactEmailTemplateById(
  templateId: string,
): Promise<ContactEmailTemplateRow | undefined> {
  const [row] = await db
    .select()
    .from(contactEmailTemplate)
    .where(eq(contactEmailTemplate.id, templateId))
    .limit(1);
  return row;
}

async function viewerCanAccessTemplate(
  viewerUserId: string,
  viewerRole: string | null | undefined,
  row: ContactEmailTemplateRow,
  requestedOrganizationId?: string | null,
): Promise<boolean> {
  const ctx = await getViewerScopeContext(
    viewerUserId,
    viewerRole,
    requestedOrganizationId,
  );
  if (isPlatformAdminRole(ctx.roleForScope)) return true;
  if (row.createdBy === viewerUserId) return true;
  if (!ctx.organizationId) return false;
  if (row.organizationId && row.organizationId === ctx.organizationId) return true;

  const ids = await userIdsInOrganization(ctx.organizationId);
  if (ids.length === 0) return false;
  return !row.organizationId && ids.includes(row.createdBy);
}

export async function insertContactEmailTemplate(params: {
  createdByUserId: string;
  requestedOrganizationId?: string | null;
  input: CreateContactEmailTemplateInput;
}): Promise<ContactEmailTemplateRow> {
  const organizationId = await resolveActiveOrganizationIdForUser(
    params.createdByUserId,
    params.requestedOrganizationId,
  );
  const row: ContactEmailTemplateInsert = {
    organizationId: organizationId ?? null,
    name: params.input.name,
    subject: params.input.subject,
    body: params.input.body,
    attachment: params.input.attachment,
    archived: params.input.archived,
    createdBy: params.createdByUserId,
  };

  const [inserted] = await db.insert(contactEmailTemplate).values(row).returning();
  if (!inserted) throw new Error("INSERT_CONTACT_EMAIL_TEMPLATE_FAILED");
  return inserted;
}

export async function updateContactEmailTemplateForViewer(params: {
  viewerUserId: string;
  viewerRole?: string | null;
  requestedOrganizationId?: string | null;
  templateId: string;
  input: UpdateContactEmailTemplateInput;
}): Promise<ContactEmailTemplateRow | null> {
  const existing = await getContactEmailTemplateById(params.templateId);
  if (!existing) return null;
  const canAccess = await viewerCanAccessTemplate(
    params.viewerUserId,
    params.viewerRole,
    existing,
    params.requestedOrganizationId,
  );
  if (!canAccess) return null;

  const [updated] = await db
    .update(contactEmailTemplate)
    .set({
      name: params.input.name,
      subject: params.input.subject,
      body: params.input.body,
      attachment: params.input.attachment,
      archived: params.input.archived,
      updatedAt: new Date(),
    })
    .where(eq(contactEmailTemplate.id, params.templateId))
    .returning();

  return updated ?? null;
}

export async function deleteContactEmailTemplateForViewer(params: {
  viewerUserId: string;
  viewerRole?: string | null;
  requestedOrganizationId?: string | null;
  templateId: string;
}): Promise<boolean> {
  const existing = await getContactEmailTemplateById(params.templateId);
  if (!existing) return false;
  const canAccess = await viewerCanAccessTemplate(
    params.viewerUserId,
    params.viewerRole,
    existing,
    params.requestedOrganizationId,
  );
  if (!canAccess) return false;

  const result = await db
    .delete(contactEmailTemplate)
    .where(eq(contactEmailTemplate.id, params.templateId))
    .returning({ id: contactEmailTemplate.id });
  return result.length > 0;
}
