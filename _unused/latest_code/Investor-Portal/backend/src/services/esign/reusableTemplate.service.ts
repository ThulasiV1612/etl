import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { isPlatformAdminRole } from "../../constants/roles.js";
import { getUploadsPhysicalRoot } from "../../config/uploadPaths.js";
import { db } from "../../database/db.js";
import { users } from "../../schema/auth.schema/signin.js";
import {
  esignReusableTemplate,
  type EsignReusableTemplateRow,
  type EsignTemplateSignerRole,
} from "../../schema/esign.schema.js";
import { resolveActiveOrganizationIdForUser } from "../org/orgResolution.service.js";
import {
  buildStoredAssetName,
  type DealMemoryUploadFile,
} from "../deal/dealForm.service.js";
import { isPdfUploadFile } from "../deal/esignPdfMerge.service.js";

const UPLOAD_SUBDIR = "esign-templates";

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
  const roleForScope =
    String(row?.role ?? "").trim() || String(jwtRoleFallback ?? "").trim();
  const preloaded = row
    ? { role: row.role, organizationId: row.organizationId }
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
    eq(esignReusableTemplate.organizationId, orgId),
    eq(esignReusableTemplate.createdBy, viewerUserId),
  )!;
}

export async function listReusableTemplatesForViewer(
  viewerUserId: string,
  viewerRole?: string | null,
  requestedOrganizationId?: string | null,
): Promise<EsignReusableTemplateRow[]> {
  const ctx = await getViewerScopeContext(
    viewerUserId,
    viewerRole,
    requestedOrganizationId,
  );
  if (isPlatformAdminRole(ctx.roleForScope)) {
    return db
      .select()
      .from(esignReusableTemplate)
      .orderBy(desc(esignReusableTemplate.createdAt));
  }

  if (!ctx.organizationId) {
    return db
      .select()
      .from(esignReusableTemplate)
      .where(eq(esignReusableTemplate.createdBy, viewerUserId))
      .orderBy(desc(esignReusableTemplate.createdAt));
  }

  const orgIds = await userIdsInOrganization(ctx.organizationId);
  const legacyOrgScope =
    orgIds.length > 0
      ? and(
          isNull(esignReusableTemplate.organizationId),
          inArray(esignReusableTemplate.createdBy, orgIds),
        )
      : undefined;

  return db
    .select()
    .from(esignReusableTemplate)
    .where(
      legacyOrgScope
        ? or(buildOrgScopeWhere(ctx.organizationId, viewerUserId), legacyOrgScope)
        : buildOrgScopeWhere(ctx.organizationId, viewerUserId),
    )
    .orderBy(desc(esignReusableTemplate.createdAt));
}

export async function getReusableTemplateForViewer(
  templateId: string,
  viewerUserId: string,
  viewerRole?: string | null,
  requestedOrganizationId?: string | null,
): Promise<EsignReusableTemplateRow | null> {
  const rows = await listReusableTemplatesForViewer(
    viewerUserId,
    viewerRole,
    requestedOrganizationId,
  );
  return rows.find((r) => r.id === templateId) ?? null;
}

export async function createReusableTemplateUpload(params: {
  userId: string;
  userRole?: string | null;
  requestedOrganizationId?: string | null;
  name: string;
  file: DealMemoryUploadFile;
}): Promise<EsignReusableTemplateRow> {
  const ctx = await getViewerScopeContext(
    params.userId,
    params.userRole,
    params.requestedOrganizationId,
  );
  if (!isPdfUploadFile(params.file)) {
    throw new Error(
      "Only PDF documents can be used with Dropbox Sign. Convert Word files to PDF before uploading.",
    );
  }

  const orgFolder = ctx.organizationId ?? "personal";
  const uploadRoot = path.join(
    getUploadsPhysicalRoot(),
    UPLOAD_SUBDIR,
    orgFolder,
  );
  await mkdir(uploadRoot, { recursive: true });

  const storedName = buildStoredAssetName(
    params.file.originalname,
    Date.now(),
    randomUUID(),
  );
  const abs = path.join(uploadRoot, storedName);
  await writeFile(abs, params.file.buffer);

  const relativePath = `${UPLOAD_SUBDIR}/${orgFolder}/${storedName}`;
  const name =
    params.name.trim() ||
    params.file.originalname.replace(/\.[^.]+$/i, "").trim() ||
    "Untitled template";

  const [row] = await db
    .insert(esignReusableTemplate)
    .values({
      organizationId: ctx.organizationId,
      name,
      relativePath,
      originalName: params.file.originalname.trim() || storedName,
      dropboxSignStatus: "none",
      roles: [],
      createdBy: params.userId,
    })
    .returning();

  if (!row) throw new Error("Could not create template record");
  return row;
}

export async function saveReusableTemplateAfterEditor(params: {
  portalTemplateId: string;
  dropboxSignTemplateId: string;
  name: string;
  roles: EsignTemplateSignerRole[];
  viewerUserId: string;
  viewerRole?: string | null;
  requestedOrganizationId?: string | null;
}): Promise<EsignReusableTemplateRow> {
  const existing = await getReusableTemplateForViewer(
    params.portalTemplateId,
    params.viewerUserId,
    params.viewerRole,
    params.requestedOrganizationId,
  );
  if (!existing) {
    throw new Error("Template not found");
  }

  const templateId = params.dropboxSignTemplateId.trim();
  if (!templateId) {
    throw new Error("template_id is required");
  }

  const name = params.name.trim() || existing.name;
  const roles =
    params.roles.length > 0 ? params.roles : (existing.roles ?? []);

  const [row] = await db
    .update(esignReusableTemplate)
    .set({
      name,
      dropboxSignTemplateId: templateId,
      dropboxSignStatus: "ready",
      roles,
      updatedAt: new Date(),
    })
    .where(eq(esignReusableTemplate.id, params.portalTemplateId))
    .returning();

  if (!row) throw new Error("Could not save template");
  return row;
}

export function resolveReusableTemplateAbsolutePath(
  relativePath: string,
): string {
  const rel = relativePath.replace(/^\/+/, "").replace(/^uploads\//i, "");
  return path.join(getUploadsPhysicalRoot(), rel);
}

export async function updateReusableTemplateDraftState(
  portalTemplateId: string,
  patch: {
    dropboxSignTemplateId: string;
    dropboxSignStatus: "draft";
  },
): Promise<void> {
  await db
    .update(esignReusableTemplate)
    .set({
      dropboxSignTemplateId: patch.dropboxSignTemplateId,
      dropboxSignStatus: patch.dropboxSignStatus,
      updatedAt: new Date(),
    })
    .where(eq(esignReusableTemplate.id, portalTemplateId));
}
