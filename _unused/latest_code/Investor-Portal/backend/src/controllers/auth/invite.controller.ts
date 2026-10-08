import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { companies, users } from "../../schema/schema.js";
import { createInviteForEmail } from "../../services/auth/invite.service.js";
import {
  sendInviteCompanyMembershipEmail,
  sendInviteSignupEmail,
} from "../../services/auth/inviteEmail.service.js";
import { upsertPendingInvitedUser } from "../../services/auth/invitePendingUser.service.js";
import {
  canInviteUsersRole,
  COMPANY_ADMIN,
  COMPANY_USER,
  isInviteAssignableRole,
  isCompanyAdminRole,
  isPlatformAdminRole,
  PLATFORM_USER,
} from "../../constants/roles.js";
import { getValidJwtUser } from "../../middleware/jwtUser.js";

type InviteBody = {
  email?: unknown;
  companyId?: unknown;
  invitedRole?: unknown;
};

function roleLabelForInvite(invitedRole: string | null): string {
  return invitedRole === COMPANY_ADMIN ? "Company Admin" : "Company Member";
}

export async function postInviteUser(req: Request, res: Response): Promise<void> {
  const jwtUser = await getValidJwtUser(req);
  if (!jwtUser?.id || jwtUser.userRole == null || jwtUser.userRole === "") {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  if (!canInviteUsersRole(jwtUser.userRole)) {
    res.status(403).json({
      message: "You are not allowed to invite users",
    });
    return;
  }

  const body = req.body as InviteBody;
  const email = typeof body.email === "string" ? body.email : "";
  const emailNorm = email.trim().toLowerCase();
  if (!emailNorm || !emailNorm.includes("@")) {
    res.status(400).json({ message: "A valid email address is required" });
    return;
  }

  let companyContext: { companyId: string | null; companyName: string | null };

  if (isPlatformAdminRole(jwtUser.userRole)) {
    const companyIdRaw =
      typeof body.companyId === "string" ? body.companyId.trim() : "";
    if (!companyIdRaw) {
      res.status(400).json({ message: "Company is required" });
      return;
    }
    try {
      const [row] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyIdRaw))
        .limit(1);
      if (!row) {
        res.status(400).json({ message: "Invalid company" });
        return;
      }
      companyContext = { companyId: row.id, companyName: row.name };
    } catch (err) {
      console.error("postInviteUser company lookup:", err);
      res.status(500).json({ message: "Could not resolve company" });
      return;
    }
  } else {
    try {
      const [inviter] = await db
        .select({
          organizationId: users.organizationId,
          orgName: companies.name,
        })
        .from(users)
        .leftJoin(companies, eq(users.organizationId, companies.id))
        .where(eq(users.id, jwtUser.id))
        .limit(1);
      const name = (inviter?.orgName ?? "").toString().trim();
      const orgId = inviter?.organizationId
        ? String(inviter.organizationId).trim()
        : null;
      companyContext = {
        companyId: orgId || null,
        companyName: name || null,
      };
    } catch (err) {
      console.error("postInviteUser inviter lookup:", err);
      res.status(500).json({ message: "Could not load your profile" });
      return;
    }
  }

  let invitedRoleForJwt: string | null = null;
  if (isPlatformAdminRole(jwtUser.userRole)) {
    const raw =
      typeof body.invitedRole === "string" ? body.invitedRole.trim() : "";
    invitedRoleForJwt =
      raw && isInviteAssignableRole(raw) ? raw : PLATFORM_USER;
  } else if (isCompanyAdminRole(jwtUser.userRole)) {
    const raw =
      typeof body.invitedRole === "string" ? body.invitedRole.trim() : "";
    invitedRoleForJwt =
      raw === COMPANY_ADMIN || raw === COMPANY_USER ? raw : COMPANY_USER;
  }

  const result = createInviteForEmail(email, companyContext, invitedRoleForJwt);
  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }

  const roleForPending = invitedRoleForJwt ?? PLATFORM_USER;
  const pending = await upsertPendingInvitedUser(
    emailNorm,
    companyContext,
    roleForPending,
    result.inviteExpiresAt,
  );
  if (!pending.ok) {
    res.status(pending.status).json({ message: pending.message });
    return;
  }

  const companyLabel = companyContext.companyName?.trim() || "the company";
  const roleLabel = roleLabelForInvite(invitedRoleForJwt);

  if (pending.action === "existing_user_membership_added") {
    const emailResult = await sendInviteCompanyMembershipEmail(
      emailNorm,
      companyLabel,
      roleLabel,
      {
        needsSignup: pending.needsSignup,
        signupUrl: pending.needsSignup ? result.signupUrl : null,
      },
    );
    if (!emailResult.ok) {
      console.error(
        "postInviteUser: could not send company membership email to",
        emailNorm,
        emailResult.error,
      );
    }

    const message = emailResult.ok
      ? pending.needsSignup
        ? `${emailNorm} was invited to ${companyLabel}. They already have a pending account elsewhere; an email was sent with registration instructions for this organization.`
        : `${emailNorm} already has an account and was added to ${companyLabel} as ${roleLabel}. A notification email was sent.`
      : `${emailNorm} was added to ${companyLabel}, but the notification email could not be sent. Check email configuration.`;

    res.status(201).json({
      message,
      emailSent: emailResult.ok,
      existingUser: true,
      signupUrl: pending.needsSignup ? result.signupUrl : null,
      expiresIn: pending.needsSignup ? result.expiresIn : null,
    });
    return;
  }

  const emailResult = await sendInviteSignupEmail(
    emailNorm,
    result.signupUrl,
    result.expiresIn,
  );
  if (!emailResult.ok) {
    console.error(
      "postInviteUser: could not send invite email to",
      emailNorm,
      emailResult.error,
    );
  }

  const message = emailResult.ok
    ? `Invitation email sent to ${emailNorm}. They appear on the members list with account status Invited until they complete signup.`
    : "Invitation recorded and signup link created, but the email could not be sent. Configure SENDER_EMAIL_ID / SENDER_EMAIL_PASSWORD and EMAIL_SERVICE_TYPE, or share the link below manually.";

  res.status(201).json({
    message,
    signupUrl: result.signupUrl,
    expiresIn: result.expiresIn,
    emailSent: emailResult.ok,
  });
}
