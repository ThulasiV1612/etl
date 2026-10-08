import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getValidJwtUser } from "../middleware/jwtUser.js";
import { db } from "../database/db.js";
import { companies, users } from "../schema/schema.js";
import { sanitizeExportedLinesForNotify } from "../services/workspace/exportNotifySanitize.js";
import {
  sendWorkspaceExportAuditNotification,
  type WorkspaceExportAuditKind,
} from "../services/workspace/workspaceExportAudit.service.js";
import { logSocWorkspaceExportNotify } from "../audit/index.js";

async function loadExporterAuditContext(userId: string): Promise<{
  exporterDisplayName: string;
  exporterEmail: string;
  exporterOrgName: string;
} | null> {
  const rows = await db
    .select({
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      orgName: companies.name,
    })
    .from(users)
    .leftJoin(companies, eq(users.organizationId, companies.id))
    .where(eq(users.id, userId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  const display =
    [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || r.email;
  const org = r.orgName?.trim() || "—";
  return {
    exporterDisplayName: display,
    exporterEmail: r.email,
    exporterOrgName: org,
  };
}

function bodyPositiveInt(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

type ExportNotifyLinesKey =
  | "exportedContactLines"
  | "exportedCompanyLines"
  | "exportedMemberLines"
  | "exportedDealLines";

async function handleExportNotify(
  req: Request,
  res: Response,
  kind: WorkspaceExportAuditKind,
  linesKey: ExportNotifyLinesKey,
): Promise<void> {
  const jwtUser = await getValidJwtUser(req);
  if (!jwtUser?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const rowCount = bodyPositiveInt(b.rowCount);
  const rawLines = b[linesKey];
  const exportedSampleLines = sanitizeExportedLinesForNotify(rawLines);

  const ctx = await loadExporterAuditContext(jwtUser.id);
  if (!ctx) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  const result = await sendWorkspaceExportAuditNotification(kind, {
    ...ctx,
    rowCount: rowCount > 0 ? rowCount : exportedSampleLines?.length ?? 0,
    exportedSampleLines,
  });

  if (result.status === "skipped_no_recipient") {
    console.warn(
      `[export-notify:${kind}] skipped: set EMAIL_BCC, CONTACTS_EXPORT_NOTIFY_EMAIL, or SENDER_Update_EMAIL_ID for recipients`,
    );
  }
  if (result.status === "failed") {
    console.error(`[export-notify:${kind}] send failed`, result.error);
  }

  const effectiveRows =
    rowCount > 0 ? rowCount : exportedSampleLines?.length ?? 0;
  logSocWorkspaceExportNotify({
    exportKind: kind,
    actorUserId: jwtUser.id,
    rowCount: effectiveRows,
    notifyStatus: result.status,
  });

  res.status(200).json({
    ok: true,
    notifyStatus: result.status,
  });
}

export async function postContactsExportNotify(
  req: Request,
  res: Response,
): Promise<void> {
  await handleExportNotify(req, res, "contacts", "exportedContactLines");
}

export async function postCompaniesExportNotify(
  req: Request,
  res: Response,
): Promise<void> {
  await handleExportNotify(req, res, "companies", "exportedCompanyLines");
}

export async function postMembersExportNotify(
  req: Request,
  res: Response,
): Promise<void> {
  await handleExportNotify(req, res, "members", "exportedMemberLines");
}

export async function postDealsExportNotify(
  req: Request,
  res: Response,
): Promise<void> {
  await handleExportNotify(req, res, "deals", "exportedDealLines");
}

/** Body: `{ rowCount?, exportedLines?: string[] }` — matches deal export-notify clients. */
export async function postDealInvestorsExportNotify(
  req: Request,
  res: Response,
): Promise<void> {
  const jwtUser = await getValidJwtUser(req);
  if (!jwtUser?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const rowCount = bodyPositiveInt(b.rowCount);
  const exportedSampleLines = sanitizeExportedLinesForNotify(b.exportedLines);

  const ctx = await loadExporterAuditContext(jwtUser.id);
  if (!ctx) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  const result = await sendWorkspaceExportAuditNotification("deal_investors", {
    ...ctx,
    rowCount: rowCount > 0 ? rowCount : exportedSampleLines?.length ?? 0,
    exportedSampleLines,
  });

  if (result.status === "skipped_no_recipient") {
    console.warn(
      `[export-notify:deal_investors] skipped: set EMAIL_BCC, CONTACTS_EXPORT_NOTIFY_EMAIL, or SENDER_Update_EMAIL_ID for recipients`,
    );
  }
  if (result.status === "failed") {
    console.error(`[export-notify:deal_investors] send failed`, result.error);
  }

  const effectiveRows =
    rowCount > 0 ? rowCount : exportedSampleLines?.length ?? 0;
  logSocWorkspaceExportNotify({
    exportKind: "deal_investors",
    actorUserId: jwtUser.id,
    rowCount: effectiveRows,
    notifyStatus: result.status,
  });

  res.status(200).json({
    ok: true,
    notifyStatus: result.status,
  });
}

/** Body: `{ rowCount?, exportedLines?: string[] }` — matches deal members export-notify clients. */
export async function postDealMembersExportNotify(
  req: Request,
  res: Response,
): Promise<void> {
  const jwtUser = await getValidJwtUser(req);
  if (!jwtUser?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const rowCount = bodyPositiveInt(b.rowCount);
  const exportedSampleLines = sanitizeExportedLinesForNotify(b.exportedLines);

  const ctx = await loadExporterAuditContext(jwtUser.id);
  if (!ctx) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  const result = await sendWorkspaceExportAuditNotification("deal_members", {
    ...ctx,
    rowCount: rowCount > 0 ? rowCount : exportedSampleLines?.length ?? 0,
    exportedSampleLines,
  });

  if (result.status === "skipped_no_recipient") {
    console.warn(
      `[export-notify:deal_members] skipped: set EMAIL_BCC, CONTACTS_EXPORT_NOTIFY_EMAIL, or SENDER_Update_EMAIL_ID for recipients`,
    );
  }
  if (result.status === "failed") {
    console.error(`[export-notify:deal_members] send failed`, result.error);
  }

  const effectiveRows =
    rowCount > 0 ? rowCount : exportedSampleLines?.length ?? 0;
  logSocWorkspaceExportNotify({
    exportKind: "deal_members",
    actorUserId: jwtUser.id,
    rowCount: effectiveRows,
    notifyStatus: result.status,
  });

  res.status(200).json({
    ok: true,
    notifyStatus: result.status,
  });
}
