import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getValidJwtUser } from "../middleware/jwtUser.js";
import { db } from "../database/db.js";
import { users } from "../schema/schema.js";
import {
  isCompanyAdminRole,
  isPlatformAdminRole,
} from "../constants/roles.js";
import { countAssignedDealsByUserIdsForViewer } from "../services/deal/assigningDealUser.service.js";
import {
  listMemberAdminAuditLogsForTarget,
  listUsersForAdmin,
  MEMBER_AUDIT_ACTION_EDIT,
  MEMBER_AUDIT_ACTION_SUSPEND,
  updateMemberUser,
} from "../services/user/userAdmin.service.js";
import { getUserContactsExportAuditFields } from "../services/contact/contact.service.js";
import { sanitizeExportedLinesForNotify } from "../services/workspace/exportNotifySanitize.js";
import { sendWorkspaceExportAuditNotification } from "../services/workspace/workspaceExportAudit.service.js";
import {
  logSocMembershipAdminChange,
  logSocMembershipAuditTrailAccess,
  logSocMembershipExportNotify,
  logSocMembershipListView,
} from "../audit/index.js";
import {
  organizationIdFromRequestHeader,
  resolveActiveOrganizationIdForUser,
  userHasAccessToOrganization,
} from "../services/org/orgResolution.service.js";
import emailConfig, {
  getEmailBccFromEnv,
  smtpEnvelopeForSendMail,
} from "../functions/emailconfig.js";

function bodyString(v: unknown): string {
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

function normalizeAddressList(v: string | string[] | undefined): string[] {
  if (!v) return [];
  if (Array.isArray(v)) {
    return [...new Set(v.map((x) => String(x).trim()).filter((x) => x.includes("@")))];
  }
  return [...new Set(String(v).split(",").map((x) => x.trim()).filter((x) => x.includes("@")))];
}

function normalizeAddressListUnknown(v: unknown): string[] {
  if (Array.isArray(v)) {
    return [
      ...new Set(
        v
          .map((x) => String(x).trim())
          .filter((x) => x.includes("@")),
      ),
    ];
  }
  if (typeof v === "string") {
    return [
      ...new Set(
        v
          .split(/[;,]/)
          .map((x) => x.trim())
          .filter((x) => x.includes("@")),
      ),
    ];
  }
  return [];
}

function decodeHtmlEntities(input: string): string {
  if (!input) return "";
  const named: Record<string, string> = {
    nbsp: " ",
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
  };
  return input
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (full, entityRaw: string) => {
      const entity = String(entityRaw).toLowerCase();
      if (entity.startsWith("#x")) {
        const code = Number.parseInt(entity.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : full;
      }
      if (entity.startsWith("#")) {
        const code = Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : full;
      }
      return named[entity] ?? full;
    })
    .replace(/\u00a0/g, " ");
}

/** `organizationId` or `organization_id` — platform admin only (customer company drill-in). */
function organizationIdFromQuery(req: Request): string | undefined {
  const raw = req.query.organizationId ?? req.query.organization_id;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  return t || undefined;
}

const ORG_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** DB `users.role` is authoritative; JWT `userRole` fills gaps (legacy rows). */
function actorRoleForMemberAdmin(
  actor: { role: string | null },
  jwtUser: { userRole?: string },
): string {
  return (
    String(actor.role ?? "").trim() || String(jwtUser.userRole ?? "").trim()
  );
}

export async function getUsers(req: Request, res: Response): Promise<void> {
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

  const role = actorRoleForMemberAdmin(actor, jwtUser);
  if (!isPlatformAdminRole(role) && !isCompanyAdminRole(role)) {
    res.status(403).json({ message: "Not allowed to list members" });
    return;
  }

  const fromQuery = organizationIdFromQuery(req);
  const orgFromQuery =
    fromQuery && ORG_UUID_RE.test(fromQuery.trim())
      ? fromQuery.trim()
      : undefined;
  const orgFromActor =
    actor.organizationId != null &&
    ORG_UUID_RE.test(String(actor.organizationId).trim())
      ? String(actor.organizationId).trim()
      : undefined;
  let filterOrganizationId = isPlatformAdminRole(role)
    ? orgFromQuery ?? orgFromActor
    : undefined;

  if (isCompanyAdminRole(role) && orgFromQuery && ORG_UUID_RE.test(orgFromQuery)) {
    const allowed = await userHasAccessToOrganization(jwtUser.id, orgFromQuery);
    if (allowed) filterOrganizationId = orgFromQuery;
  }
  if (isCompanyAdminRole(role) && !filterOrganizationId) {
    const active = await resolveActiveOrganizationIdForUser(
      jwtUser.id,
      orgFromQuery ?? organizationIdFromRequestHeader(req),
      {
        organizationId: actor.organizationId ?? null,
        role: actor.role,
      },
    );
    if (active) filterOrganizationId = active;
  }

  const rows = await listUsersForAdmin(
    role,
    actor.organizationId ?? null,
    filterOrganizationId
      ? { filterOrganizationId, actorUserId: jwtUser.id }
      : { actorUserId: jwtUser.id },
  );
  if (rows === null) {
    res.status(403).json({ message: "Not allowed to list members" });
    return;
  }

  const restrictToOrganizationId: string | null =
    isCompanyAdminRole(role) && filterOrganizationId && ORG_UUID_RE.test(filterOrganizationId)
      ? filterOrganizationId
      : isCompanyAdminRole(role) && orgFromActor
        ? orgFromActor
        : filterOrganizationId && ORG_UUID_RE.test(filterOrganizationId)
          ? filterOrganizationId
          : null;

  const useGlobalCounts =
    isPlatformAdminRole(role) && restrictToOrganizationId == null;

  const userIds = [
    ...new Set(
      rows
        .map((r) => String(r.id ?? "").trim().toLowerCase())
        .filter((id) => ORG_UUID_RE.test(id)),
    ),
  ];
  const dealCounts = await countAssignedDealsByUserIdsForViewer({
    userIds,
    restrictToOrganizationId: useGlobalCounts ? null : restrictToOrganizationId,
  });

  const enriched = rows.map((r) => {
    const id = String(r.id ?? "").trim().toLowerCase();
    const c = dealCounts.get(id) ?? 0;
    return {
      ...r,
      assignedDealCount: c,
      assigned_deal_count: c,
    };
  });

  const scopeLog =
    restrictToOrganizationId ??
    (typeof filterOrganizationId === "string" &&
    ORG_UUID_RE.test(filterOrganizationId)
      ? filterOrganizationId
      : null);

  logSocMembershipListView({
    actorUserId: jwtUser.id,
    resultCount: enriched.length,
    organizationScopeId: scopeLog ?? undefined,
  });

  res.status(200).json({ users: enriched });
}

/** Frontend send-mail composer defaults (auth required). */
export async function getMailDefaults(req: Request, res: Response): Promise<void> {
  const jwtUser = await getValidJwtUser(req);
  if (!jwtUser?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const bcc = normalizeAddressList(getEmailBccFromEnv());
  res.status(200).json({ bcc });
}

/** Sends email from app without opening local mail client. */
export async function postSendMail(req: Request, res: Response): Promise<void> {
  const jwtUser = await getValidJwtUser(req);
  if (!jwtUser?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const b = req.body as Record<string, unknown>;
  // console.log("body",b)
  const to = normalizeAddressListUnknown(b.to);
  const cc = normalizeAddressListUnknown(b.cc);
  const subject = decodeHtmlEntities(bodyString(b.subject))
    .replace(/\s+/g, " ")
    .trim();
  const bodyHtml = bodyString(b.bodyHtml);
  const bodyText = decodeHtmlEntities(bodyString(b.bodyText))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const [actor] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, jwtUser.id))
    .limit(1);
  const actorEmail = bodyString(actor?.email).trim();
  const jwtEmail = bodyString(jwtUser.email).trim();
  const senderEmail =
    actorEmail.includes("@")
      ? actorEmail
      : jwtEmail.includes("@")
        ? jwtEmail
      : "";

  if (to.length === 0) {
    res.status(400).json({ message: "At least one valid recipient is required" });
    return;
  }
  if (!subject) {
    res.status(400).json({ message: "Email subject is required" });
    return;
  }
  if (!senderEmail) {
    res.status(400).json({ message: "Sender user email is required" });
    return;
  }

  const configuredSenderAddress = bodyString(process.env.SENDER_EMAIL_ID).trim();

  if (!configuredSenderAddress || !configuredSenderAddress.includes("@")) {
    res.status(500).json({ message: "Sender email is not configured on server" });
    return;
  }
  const envBcc = normalizeAddressList(getEmailBccFromEnv());
  const bcc = [
    ...new Set(
      [...envBcc, senderEmail].filter((x) => !!x),
    ),
  ];
  const fromAddress = senderEmail;
  console.log("fromAddress",fromAddress)

  try {
    const transporter = emailConfig();
    await transporter.sendMail({
      from: fromAddress,
      to,
      ...(cc.length > 0 ? { cc } : {}),
      ...(bcc.length > 0 ? { bcc } : {}),
      ...(senderEmail ? { replyTo: senderEmail } : {}),
      subject,
      html: bodyHtml || "<p></p>",
      text: bodyText || "",
      envelope: smtpEnvelopeForSendMail({
        fromAddress: configuredSenderAddress,
        to,
        ...(cc.length > 0 ? { cc } : {}),
        ...(bcc.length > 0 ? { bcc } : {}),
      }),
    });
    res.status(200).json({ sent: true });
  } catch (err) {
    console.error("postSendMail:", err);
    res.status(500).json({ message: "Could not send email" });
  }
}

type PatchUserBody = {
  role?: unknown;
  userStatus?: unknown;
  /** Same as `companies.id`; platform admins only (move member between orgs). */
  organizationId?: unknown;
  companyId?: unknown;
  reason?: unknown;
  action?: unknown;
};

const REASON_MAX_LEN = 4000;

export async function patchUser(req: Request, res: Response): Promise<void> {
  const jwtUser = await getValidJwtUser(req);
  if (!jwtUser?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const userId = req.params.userId;
  if (typeof userId !== "string" || !userId.trim()) {
    res.status(400).json({ message: "User id required" });
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

  const body = req.body as PatchUserBody;
  const patch: {
    role?: string;
    userStatus?: string;
    organizationId?: string;
  } = {};
  if (typeof body.role === "string") patch.role = body.role;
  if (typeof body.userStatus === "string") patch.userStatus = body.userStatus;
  const orgRaw =
    typeof body.organizationId === "string"
      ? body.organizationId.trim()
      : typeof body.companyId === "string"
        ? body.companyId.trim()
        : "";
  if (orgRaw) patch.organizationId = orgRaw;

  const reasonRaw =
    typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reasonRaw) {
    res.status(400).json({ message: "Reason is required" });
    return;
  }
  if (reasonRaw.length > REASON_MAX_LEN) {
    res.status(400).json({ message: "Reason is too long" });
    return;
  }

  const actionRaw = body.action;
  if (
    actionRaw !== MEMBER_AUDIT_ACTION_EDIT &&
    actionRaw !== MEMBER_AUDIT_ACTION_SUSPEND
  ) {
    res.status(400).json({
      message: `action must be "${MEMBER_AUDIT_ACTION_EDIT}" or "${MEMBER_AUDIT_ACTION_SUSPEND}"`,
    });
    return;
  }

  const result = await updateMemberUser(
    userId.trim(),
    patch,
    jwtUser.id,
    String(actor.role ?? "").trim(),
    { reason: reasonRaw, action: actionRaw },
  );

  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }

  logSocMembershipAdminChange({
    actorUserId: jwtUser.id,
    targetUserId: userId.trim(),
    auditAction: actionRaw,
  });

  res.status(200).json({
    message: "Member updated",
    user: result.user,
  });
}

export async function getMemberAuditLogs(req: Request, res: Response): Promise<void> {
  const jwtUser = await getValidJwtUser(req);
  if (!jwtUser?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const targetUserId = req.params.userId;
  if (typeof targetUserId !== "string" || !targetUserId.trim()) {
    res.status(400).json({ message: "User id required" });
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

  const result = await listMemberAdminAuditLogsForTarget(
    targetUserId.trim(),
    jwtUser.id,
    actorRoleForMemberAdmin(actor, jwtUser),
    actor.organizationId ?? null,
  );

  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }

  logSocMembershipAuditTrailAccess({
    actorUserId: jwtUser.id,
    targetUserId: targetUserId.trim(),
  });

  res.status(200).json({ logs: result.logs });
}

/** After members CSV export from the UI, same audit inbox as contacts export. */
export async function postMembersExportNotify(
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

  const role = actorRoleForMemberAdmin(actor, jwtUser);
  if (!isPlatformAdminRole(role) && !isCompanyAdminRole(role)) {
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
    b.exportedMemberLines ?? b.exportedLines,
  );

  try {
    const audit = await getUserContactsExportAuditFields(jwtUser.id);
    const exporterEmail =
      audit.email || bodyString(jwtUser.email).trim();
    const exporterLabel =
      audit.displayName.trim() || exporterEmail || jwtUser.id;

    const result = await sendWorkspaceExportAuditNotification("members", {
      exporterDisplayName: exporterLabel,
      exporterEmail,
      exporterOrgName: audit.orgName || "—",
      rowCount,
      exportedSampleLines: exportedLines,
    });

    const notified = result.status === "sent";
    logSocMembershipExportNotify({
      actorUserId: jwtUser.id,
      rowCount,
      notified,
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
    console.error("postMembersExportNotify:", err);
    res.status(200).json({
      notified: false,
      message: "Export notification email could not be sent.",
    });
  }
}
