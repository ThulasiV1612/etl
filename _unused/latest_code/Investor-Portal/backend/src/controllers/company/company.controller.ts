import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import {
  COMPANY_AUDIT_ACTION_EDIT,
  COMPANY_AUDIT_ACTION_SUSPEND,
  createCompany,
  ensureCompanyRowForOrganizationId,
  listCompanies,
  updateCompany,
  type CompanyAuditAction,
} from "../../services/company/company.service.js";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import { isPlatformAdminRole } from "../../constants/roles.js";
import { db } from "../../database/db.js";
import { companies, users } from "../../schema/schema.js";
import { getUserContactsExportAuditFields } from "../../services/contact/contact.service.js";
import { sanitizeExportedLinesForNotify } from "../../services/workspace/exportNotifySanitize.js";
import { sendWorkspaceExportAuditNotification } from "../../services/workspace/workspaceExportAudit.service.js";

function bodyString(v: unknown): string {
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

function jsonForCmdLog(value: unknown): string {
  return JSON.stringify(
    value,
    (_k, v) => (v instanceof Date ? v.toISOString() : v),
    2,
  );
}

/**
 * Set `LOG_COMPANIES_RESPONSE=1` when starting the API to print the full
 * `GET /companies` JSON in the terminal (counts, ids, names) for debugging
 * mismatches vs. the Members tab (`GET /users?organizationId=...`).
 */
function actorRoleFromRow(
  actor: { role: string | null },
  jwt: { userRole?: string },
): string {
  return String(actor.role ?? "").trim() || String(jwt.userRole ?? "").trim();
}

export async function getCompanies(req: Request, res: Response): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  try {
    const [actor] = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (actor) {
      const role = actorRoleFromRow(actor, user);
      if (isPlatformAdminRole(role) && actor.organizationId) {
        const [co] = await db
          .select({ name: companies.name })
          .from(companies)
          .where(eq(companies.id, actor.organizationId))
          .limit(1);
        await ensureCompanyRowForOrganizationId(
          actor.organizationId,
          String(co?.name ?? ""),
        );
      }
    }
    const rows = await listCompanies();
    const logCompanies =
      process.env.LOG_COMPANIES_RESPONSE === "1" ||
      process.env.LOG_COMPANIES_RESPONSE === "true";
    if (logCompanies) {
      console.log(
        "[GET /companies] response body:",
        jsonForCmdLog({ companies: rows }),
      );
    }
    res.status(200).json({ companies: rows });
  } catch (err) {
    console.error("getCompanies:", err);
    res.status(500).json({ message: "Could not load companies" });
  }
}

type CreateCompanyBody = {
  name?: unknown;
};

export async function postCompany(req: Request, res: Response): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const [actor] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!actor) {
    res.status(401).json({ message: "User not found" });
    return;
  }
  const role =
    String(actor.role ?? "").trim() || String(user.userRole ?? "").trim();
  if (!isPlatformAdminRole(role)) {
    res.status(403).json({
      message: "Only platform administrators can create companies",
    });
    return;
  }

  const body = req.body as CreateCompanyBody;
  const name = typeof body.name === "string" ? body.name : "";

  const result = await createCompany(name);
  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }

  res.status(201).json({
    message: "Company created",
    company: result.company,
    ghlProvisioning: result.ghlProvisioning,
  });
}

type PatchCompanyBody = {
  name?: unknown;
  status?: unknown;
  reason?: unknown;
  action?: unknown;
};

export async function patchCompany(req: Request, res: Response): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const [actor] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!actor) {
    res.status(401).json({ message: "User not found" });
    return;
  }
  const role =
    String(actor.role ?? "").trim() || String(user.userRole ?? "").trim();
  if (!isPlatformAdminRole(role)) {
    res.status(403).json({
      message: "Only platform administrators can update companies",
    });
    return;
  }

  const companyId = req.params.companyId;
  if (typeof companyId !== "string" || !companyId.trim()) {
    res.status(400).json({ message: "Company id required" });
    return;
  }

  const body = req.body as PatchCompanyBody;
  const patch: { name?: string; status?: string } = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.status === "string") patch.status = body.status;

  if (patch.name === undefined && patch.status === undefined) {
    res.status(400).json({ message: "No changes" });
    return;
  }

  const reason =
    typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    res.status(400).json({ message: "A reason is required for this change" });
    return;
  }

  const actionRaw =
    typeof body.action === "string" ? body.action.trim() : "";
  if (
    actionRaw !== COMPANY_AUDIT_ACTION_EDIT &&
    actionRaw !== COMPANY_AUDIT_ACTION_SUSPEND
  ) {
    res.status(400).json({
      message: `action must be "${COMPANY_AUDIT_ACTION_EDIT}" or "${COMPANY_AUDIT_ACTION_SUSPEND}"`,
    });
    return;
  }

  const result = await updateCompany(companyId.trim(), patch, {
    actorUserId: user.id,
    reason,
    action: actionRaw as CompanyAuditAction,
  });
  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }

  res.status(200).json({
    message: "Company updated",
    company: result.company,
  });
}

/** After companies (customers) CSV export from the UI; same audit inbox as contacts. */
export async function postCompaniesExportNotify(
  req: Request,
  res: Response,
): Promise<void> {
  const jwtUser = await getValidJwtUser(req);
  if (!jwtUser?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const [actor] = await db
    .select()
    .from(users)
    .where(eq(users.id, jwtUser.id))
    .limit(1);
  if (!actor) {
    res.status(401).json({ message: "User not found" });
    return;
  }

  const role = String(actor.role ?? "").trim();
  if (!isPlatformAdminRole(role)) {
    res.status(403).json({ message: "Not allowed" });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const rowCountRaw = b.rowCount;
  const rowCount =
    typeof rowCountRaw === "number" && Number.isFinite(rowCountRaw)
      ? Math.max(0, Math.floor(rowCountRaw))
      : typeof rowCountRaw === "string" && /^\d+$/.test(rowCountRaw.trim())
        ? Math.max(0, parseInt(rowCountRaw.trim(), 10))
        : null;

  if (rowCount === null || rowCount < 1) {
    res.status(400).json({ message: "rowCount must be a positive integer" });
    return;
  }

  const exportedLines = sanitizeExportedLinesForNotify(
    b.exportedCompanyLines ?? b.exportedLines,
  );

  try {
    const audit = await getUserContactsExportAuditFields(jwtUser.id);
    const exporterEmail =
      audit.email || bodyString(jwtUser.email).trim();
    const exporterLabel =
      audit.displayName.trim() || exporterEmail || jwtUser.id;

    const result = await sendWorkspaceExportAuditNotification("companies", {
      exporterDisplayName: exporterLabel,
      exporterEmail,
      exporterOrgName: audit.orgName || "—",
      rowCount,
      exportedSampleLines: exportedLines,
    });

    if (result.status === "sent") {
      res.status(200).json({ notified: true });
      return;
    }
    if (result.status === "skipped_no_recipient") {
      res.status(200).json({
        notified: false,
        message:
          "SENDER_Update_EMAIL_ID (or CONTACTS_EXPORT_NOTIFY_EMAIL) is not set; no notification was sent.",
      });
      return;
    }
    res.status(200).json({
      notified: false,
      message: "Export notification email could not be sent. Check email configuration.",
    });
  } catch (err) {
    console.error("postCompaniesExportNotify:", err);
    res.status(200).json({
      notified: false,
      message: "Export notification email could not be sent.",
    });
  }
}
