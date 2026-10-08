import type { Request, Response } from "express";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import { getDealEsignDropboxSignPublicConfig } from "../../services/deal/dealEsignDropboxSign.service.js";
import type { DealMemoryUploadFile } from "../../services/deal/dealForm.service.js";
import type { EsignTemplateSignerRole } from "../../schema/esign.schema.js";
import {
  createReusableTemplateUpload,
  listReusableTemplatesForViewer,
  saveReusableTemplateAfterEditor,
} from "../../services/esign/reusableTemplate.service.js";
import { startReusableTemplateEmbeddedDraft } from "../../services/esign/reusableTemplateDropbox.service.js";
import { requestedOrganizationIdFromRequest } from "../../services/org/orgResolution.service.js";

function bodyString(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    if (v.length === 0) return "";
    return bodyString(v[v.length - 1]);
  }
  if (v != null) return String(v);
  return "";
}

function parseSignerRoles(raw: unknown): EsignTemplateSignerRole[] {
  if (!Array.isArray(raw)) return [];
  const out: EsignTemplateSignerRole[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    if (!name) continue;
    const orderRaw = o.order;
    const order =
      typeof orderRaw === "number"
        ? orderRaw
        : Number.parseInt(String(orderRaw ?? i), 10);
    out.push({ name, order: Number.isFinite(order) ? order : i });
  }
  return out;
}

function rowToJson(row: {
  id: string;
  name: string;
  dropboxSignTemplateId: string | null;
  dropboxSignStatus: string;
  roles: EsignTemplateSignerRole[] | null;
  relativePath: string | null;
  originalName: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  archived: boolean;
}) {
  return {
    id: row.id,
    name: row.name,
    template_id: row.dropboxSignTemplateId ?? undefined,
    dropboxSignTemplateId: row.dropboxSignTemplateId ?? undefined,
    dropboxSignStatus: row.dropboxSignStatus,
    roles: row.roles ?? [],
    relativePath: row.relativePath ?? undefined,
    originalName: row.originalName ?? undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archived: row.archived,
  };
}

/**
 * GET /templates/dropbox-sign-config
 */
export async function getTemplatesDropboxSignConfig(
  _req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(_req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  res.status(200).json(getDealEsignDropboxSignPublicConfig());
}

/**
 * GET /templates
 */
export async function getReusableTemplates(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  try {
    const rows = await listReusableTemplatesForViewer(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    res.status(200).json({
      templates: rows.map(rowToJson),
    });
  } catch (err) {
    console.error("getReusableTemplates:", err);
    res.status(500).json({ message: "Could not load templates" });
  }
}

/**
 * POST /templates/upload
 * multipart field `file`; body `name` (optional).
 */
export async function postReusableTemplateUpload(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const name = bodyString(b.name).trim();

  const file = (req as Request & { file?: DealMemoryUploadFile }).file;
  if (!file) {
    res.status(400).json({ message: "No file uploaded." });
    return;
  }

  try {
    const row = await createReusableTemplateUpload({
      userId: user.id,
      userRole: user.userRole,
      requestedOrganizationId: requestedOrganizationIdFromRequest(req),
      name,
      file,
    });
    res.status(200).json({
      message: "Document uploaded",
      template: rowToJson(row),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not upload template";
    console.error("postReusableTemplateUpload:", err);
    res.status(400).json({ message });
  }
}

/**
 * POST /templates/:templateId/embedded-draft
 */
export async function postReusableTemplateEmbeddedDraft(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const templateId =
    typeof req.params.templateId === "string"
      ? req.params.templateId
      : req.params.templateId?.[0];
  if (!templateId) {
    res.status(400).json({ message: "Missing template id" });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const title = bodyString(b.title).trim() || undefined;

  try {
    const result = await startReusableTemplateEmbeddedDraft({
      portalTemplateId: templateId,
      viewerUserId: user.id,
      viewerRole: user.userRole,
      requestedOrganizationId: requestedOrganizationIdFromRequest(req),
      title,
    });
    res.status(200).json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not start template editor";
    console.error("postReusableTemplateEmbeddedDraft:", err);
    const status = message.includes("not configured") ? 503 : 400;
    res.status(status).json({ message });
  }
}

/**
 * POST /templates/save
 * Persists Dropbox Sign template_id and metadata after embedded editor save.
 */
export async function postReusableTemplateSave(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const portalTemplateId = bodyString(
    b.portalTemplateId ?? b.portal_template_id ?? b.id,
  ).trim();
  const dropboxTemplateId = bodyString(
    b.template_id ?? b.templateId ?? b.dropboxSignTemplateId,
  ).trim();
  const name = bodyString(b.name).trim();
  const roles = parseSignerRoles(b.roles);

  if (!portalTemplateId) {
    res.status(400).json({ message: "portalTemplateId (or id) is required" });
    return;
  }
  if (!dropboxTemplateId) {
    res.status(400).json({ message: "template_id is required" });
    return;
  }

  try {
    const row = await saveReusableTemplateAfterEditor({
      portalTemplateId,
      dropboxSignTemplateId: dropboxTemplateId,
      name,
      roles,
      viewerUserId: user.id,
      viewerRole: user.userRole,
      requestedOrganizationId: requestedOrganizationIdFromRequest(req),
    });
    res.status(200).json({
      message: "Template saved",
      template: rowToJson(row),
      createdBy: user.id,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not save template";
    console.error("postReusableTemplateSave:", err);
    const status = message.includes("not found") ? 404 : 400;
    res.status(status).json({ message });
  }
}
