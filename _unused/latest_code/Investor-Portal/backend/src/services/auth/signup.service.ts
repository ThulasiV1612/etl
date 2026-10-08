import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../../database/db.js";
import { users } from "../../schema/schema.js";
import { getJwtSecret } from "../../config/auth.js";
import {
  COMPANY_ADMIN,
  COMPANY_USER,
  DEAL_PARTICIPANT,
  INVESTOR,
  isInviteAssignableRole,
  PLATFORM_USER,
} from "../../constants/roles.js";
import { ensureCompanyByName } from "../company/company.service.js";
import { reconcileAssigningDealUsersForDeal } from "../deal/assigningDealUser.service.js";
import {
  ensureSelfRegisteredInvestorContact,
  markContactsAsPortalUserByEmailNorm,
} from "../contact/contact.service.js";
import {
  recordPlatformSelfServeSignupNotification,
  type PlatformSelfServeSignupKind,
} from "../platform/platformSignupNotification.service.js";
import { getAddDealFormById } from "../deal/dealForm.service.js";
import { sendSignupSuccessEmail } from "./signupSuccessEmail.service.js";
import {
  canonicalUsPhoneKey10,
  parseUsPhoneToE164,
} from "../../utils/usPhone.js";
import {
  isCompanyMembershipRole,
  upsertUserCompanyMembership,
} from "./userCompanyMembership.service.js";
import { queueGhlSignupSync } from "../ghl/ghlContactSync.service.js";

const BCRYPT_ROUNDS = 10;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 16;
/** Matches `users.username` varchar length; shown in UI as "Account name". */
const ACCOUNT_NAME_MIN = 1;
const ACCOUNT_NAME_MAX = 100;

export type SignupBody = {
  email?: unknown;
  companyName?: unknown;
  userName?: unknown;
  phone?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  newPassword?: unknown;
  confirmPassword?: unknown;
};

export type SignupResult =
  | { ok: true; message: string; emailSent: boolean }
  | { ok: false; status: number; message: string };

type InvitePayload = {
  email?: string;
  exp?: number;
  companyName?: string;
  companyId?: string;
  invitedRole?: string;
  typ?: string;
  dealId?: string;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** When signup omits username, derive a unique value for the NOT NULL DB column. */
function deriveSignupUsername(emailNorm: string): string {
  const local =
    emailNorm
      .split("@")[0]
      ?.replace(/[^a-zA-Z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "") ?? "";
  const base = (local || "user").slice(0, 80);
  return `${base}_${randomBytes(4).toString("hex")}`;
}

function resolveSignupUsername(
  body: SignupBody,
  emailNorm: string,
): SignupResult | { userName: string; userProvided: boolean } {
  const userNameRaw = str(body.userName);
  if (!userNameRaw) {
    return { userName: deriveSignupUsername(emailNorm), userProvided: false };
  }
  if (userNameRaw.length < ACCOUNT_NAME_MIN || userNameRaw.length > ACCOUNT_NAME_MAX) {
    return {
      ok: false,
      status: 400,
      message: `Account name must be between ${ACCOUNT_NAME_MIN} and ${ACCOUNT_NAME_MAX} characters`,
    };
  }
  if (userNameRaw.toLowerCase().startsWith("invited_")) {
    return {
      ok: false,
      status: 400,
      message: "Account name is not available",
    };
  }
  return { userName: userNameRaw, userProvided: true };
}

/** Same phone may not be shared by two members (including pending) in one organization. */
async function assertPhoneUniqueInOrganization(params: {
  organizationId: string | undefined;
  /** Last 10 NANP digits (matches legacy 10-digit rows and E.164 +1… rows). */
  phoneCanonical10: string;
  excludeUserId?: string;
}): Promise<SignupResult | null> {
  const { organizationId, phoneCanonical10, excludeUserId } = params;
  if (!organizationId || !phoneCanonical10) return null;

  const parts = [
    eq(users.organizationId, organizationId),
    sql`right(regexp_replace(coalesce(${users.phone}, ''), '[^0-9]', '', 'g'), 10) = ${phoneCanonical10}`,
  ];
  if (excludeUserId) parts.push(ne(users.id, excludeUserId));

  const [hit] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(...parts))
    .limit(1);

  if (hit) {
    return {
      ok: false,
      status: 409,
      message:
        "This phone number is already used by another member in this organization. Use a different number.",
    };
  }
  return null;
}

export async function registerUser(
  inviteToken: string | undefined,
  body: SignupBody,
): Promise<SignupResult> {
  // const userName = str(body.userName);
  let companyName = str(body.companyName);
  const phoneRaw = str(body.phone);
  const firstName = str(body.firstName);
  const lastName = str(body.lastName);
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmPassword =
    typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  if (!phoneRaw || !firstName || !lastName) {
    return {
      ok: false,
      status: 400,
      message: "Phone, first name, and last name are required",
    };
  }

  const phone = parseUsPhoneToE164(phoneRaw);
  if (!phone) {
    return {
      ok: false,
      status: 400,
      message:
        "Enter a valid 10-digit U.S. phone number (area code and exchange cannot start with 0 or 1).",
    };
  }
  const phoneCanonical10 = canonicalUsPhoneKey10(phone);
  if (!phoneCanonical10) {
    return {
      ok: false,
      status: 400,
      message: "Enter a valid U.S. phone number.",
    };
  }

  if (!newPassword || !confirmPassword) {
    return {
      ok: false,
      status: 400,
      message: "Password and confirm password are required",
    };
  }

  if (newPassword !== confirmPassword) {
    return {
      ok: false,
      status: 400,
      message: "Passwords do not match",
    };
  }

  if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
    return {
      ok: false,
      status: 400,
      message: `Password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters`,
    };
  }

  let email: string;
  let organizationIdFromInvite: string | undefined;
  let invitedRoleFromToken: string | undefined;
  let isDealMemberInvite = false;
  let dealInviteDealId: string | undefined;
  if (inviteToken && inviteToken.trim() !== "") {
    try {
      const payload = jwt.verify(inviteToken.trim(), getJwtSecret()) as InvitePayload;
      const fromToken = (payload.email ?? "").toString().trim().toLowerCase();
      if (!fromToken) {
        return {
          ok: false,
          status: 401,
          message: "Invalid invite: email missing from token",
        };
      }
      email = fromToken;

      if (String(payload.typ ?? "") === "deal_member_invite") {
        isDealMemberInvite = true;
        const dealId = str(payload.dealId);
        if (!dealId) {
          return {
            ok: false,
            status: 401,
            message: "Invalid invite: deal missing from token",
          };
        }
        const deal = await getAddDealFormById(dealId);
        if (!deal) {
          return {
            ok: false,
            status: 400,
            message: "Invalid invite: deal not found",
          };
        }
        const tokenCompanyId =
          typeof payload.companyId === "string" ? payload.companyId.trim() : "";
        const dealOrg = deal.organizationId?.trim() ?? "";
        if (!dealOrg || dealOrg !== tokenCompanyId) {
          return {
            ok: false,
            status: 401,
            message: "Invite link is invalid or has expired",
          };
        }
        const fromInviteCompany = str(payload.companyName);
        if (fromInviteCompany) {
          companyName = fromInviteCompany;
        }
        organizationIdFromInvite = dealOrg;
        dealInviteDealId = dealId;
      } else {
        const fromInviteCompany = str(payload.companyName);
        if (fromInviteCompany) {
          companyName = fromInviteCompany;
        }
        const cid = typeof payload.companyId === "string" ? payload.companyId.trim() : "";
        if (cid) organizationIdFromInvite = cid;
        const ir =
          typeof payload.invitedRole === "string" ? payload.invitedRole.trim() : "";
        if (ir && isInviteAssignableRole(ir)) {
          invitedRoleFromToken = ir;
        }
      }
    } catch {
      return {
        ok: false,
        status: 401,
        message: "Invite link is invalid or has expired",
      };
    }
  } else {
    email = str(body.email).toLowerCase();
    if (!email || !email.includes("@")) {
      return {
        ok: false,
        status: 400,
        message: "A valid email is required when signing up without an invite link",
      };
    }
  }

  const emailNorm = email.toLowerCase();
  const usernameResolved = resolveSignupUsername(body, emailNorm);
  if ("ok" in usernameResolved) {
    return usernameResolved;
  }
  const { userName, userProvided } = usernameResolved;

  try {
    const [existingByEmail] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${emailNorm}`)
      .limit(1);

    if (existingByEmail) {
      const completed =
        String(existingByEmail.userSignupCompleted ?? "").trim().toLowerCase() ===
        "true";
      if (completed) {
        return {
          ok: false,
          status: 409,
          message: "An account with this email already exists",
        };
      }
      if (!inviteToken?.trim()) {
        return {
          ok: false,
          status: 409,
          message:
            "This email has a pending invitation. Use the link in your invitation email to complete signup.",
        };
      }
    }

    const pendingId = existingByEmail?.id;
    if (userProvided) {
      const userNameLower = userName.toLowerCase();
      const [existingUsername] = await db
        .select({ id: users.id })
        .from(users)
        .where(
          pendingId
            ? and(
                sql`lower(${users.username}) = ${userNameLower}`,
                ne(users.id, pendingId),
              )
            : sql`lower(${users.username}) = ${userNameLower}`,
        )
        .limit(1);

      if (existingUsername) {
        return {
          ok: false,
          status: 409,
          message: "This account name is already taken",
        };
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    let organizationId: string | undefined = organizationIdFromInvite;
    let roleForUser: string = PLATFORM_USER;
    const applyInviteRole =
      Boolean(inviteToken?.trim()) &&
      invitedRoleFromToken != null &&
      !isDealMemberInvite;

    if (isDealMemberInvite) {
      roleForUser = DEAL_PARTICIPANT;
    } else if (!organizationId && companyName) {
      const companyResult = await ensureCompanyByName(companyName);
      if (!companyResult.ok) {
        return {
          ok: false,
          status: companyResult.status,
          message: companyResult.message,
        };
      }
      organizationId = companyResult.company.id;
      if (applyInviteRole) {
        roleForUser = invitedRoleFromToken!;
      } else if (!inviteToken?.trim()) {
        // Self-serve signup (user enters company name on the form): always company admin.
        roleForUser = COMPANY_ADMIN;
      } else if (companyResult.created) {
        roleForUser = COMPANY_ADMIN;
      } else {
        roleForUser = COMPANY_USER;
      }
    } else if (applyInviteRole) {
      roleForUser = invitedRoleFromToken!;
    } else if (
      !inviteToken?.trim() &&
      !organizationId &&
      !companyName
    ) {
      // Self-serve signup with no company: investor-only portal (not syndicating workspace).
      roleForUser = INVESTOR;
    }

    const phoneDup = await assertPhoneUniqueInOrganization({
      organizationId,
      phoneCanonical10,
      excludeUserId: pendingId,
    });
    if (phoneDup) return phoneDup;

    let createdUserId: string | undefined;
    let membershipCompanyId: string | undefined = organizationId;

    if (pendingId && existingByEmail) {
      const orgToSet =
        organizationId ?? existingByEmail.organizationId ?? undefined;
      membershipCompanyId = orgToSet;
      await db
        .update(users)
        .set({
          username: userName,
          passwordHash,
          firstName,
          lastName,
          phone,
          role: roleForUser,
          userStatus: "active",
          userSignupCompleted: "true",
          inviteExpiresAt: null,
          updatedAt: new Date(),
          ...(orgToSet ? { organizationId: orgToSet } : {}),
        })
        .where(eq(users.id, pendingId));
      createdUserId = pendingId;
    } else {
      const [inserted] = await db
        .insert(users)
        .values({
          email: emailNorm,
          username: userName,
          passwordHash,
          firstName,
          lastName,
          phone,
          role: roleForUser,
          userStatus: "active",
          userSignupCompleted: "true",
          ...(organizationId ? { organizationId } : {}),
        })
        .returning({ id: users.id });
      createdUserId = inserted?.id;
    }

    if (
      createdUserId &&
      membershipCompanyId &&
      isCompanyMembershipRole(roleForUser)
    ) {
      await upsertUserCompanyMembership(
        createdUserId,
        membershipCompanyId,
        roleForUser,
      );
    }

    const isSelfServeSignup = !inviteToken?.trim() && !isDealMemberInvite;
    let selfRegisteredContactId: string | null = null;

    if (createdUserId && roleForUser === INVESTOR && !organizationId) {
      try {
        selfRegisteredContactId = await ensureSelfRegisteredInvestorContact({
          userId: createdUserId,
          emailNorm,
          firstName,
          lastName,
          phone,
        });
      } catch (e) {
        console.error("ensureSelfRegisteredInvestorContact after signup:", e);
      }
    }

    try {
      await markContactsAsPortalUserByEmailNorm(emailNorm);
    } catch (e) {
      console.error("markContactsAsPortalUserByEmailNorm after signup:", e);
    }

    if (createdUserId && isSelfServeSignup) {
      try {
        const signupKind: PlatformSelfServeSignupKind =
          roleForUser === INVESTOR && !organizationId ? "investor" : "company";
        await recordPlatformSelfServeSignupNotification({
          userId: createdUserId,
          email: emailNorm,
          firstName,
          lastName,
          role: roleForUser,
          signupKind,
          companyName: companyName || null,
          organizationId: organizationId ?? null,
          contactId: selfRegisteredContactId,
        });
      } catch (e) {
        console.error("recordPlatformSelfServeSignupNotification after signup:", e);
      }
    }

    if (createdUserId) {
      queueGhlSignupSync({
        email: emailNorm,
        firstName,
        lastName,
        phone,
        role: roleForUser,
        companyName: companyName || null,
        organizationId: organizationId ?? null,
        signupKind:
          roleForUser === INVESTOR && !organizationId ? "investor" : "company",
      });
    }

    const uidForReconcile = pendingId ?? createdUserId;
    if (dealInviteDealId && uidForReconcile) {
      try {
        await reconcileAssigningDealUsersForDeal(dealInviteDealId, uidForReconcile);
      } catch (e) {
        console.error("reconcileAssigningDealUsersForDeal after deal-invite signup:", e);
      }
    }

    let emailSent = false;
    try {
      const mailResult = await sendSignupSuccessEmail({
        toEmail: emailNorm,
        firstName,
        lastName,
      });
      emailSent = mailResult.ok;
      if (!mailResult.ok) {
        console.error("Signup success email could not be sent:", mailResult.error);
      }
    } catch (e) {
      console.error("Signup success email:", e);
    }

    return {
      ok: true,
      message: "Account created successfully",
      emailSent,
    };
  } catch (err: unknown) {
    const pg =
      err && typeof err === "object" && "code" in err
        ? (err as { code?: string; message?: string; detail?: string })
        : {};
    const code = pg.code ?? "";
    if (code === "23505") {
      return {
        ok: false,
        status: 409,
        message:
          "This email is already registered. Use a different email.",
      };
    }
    if (code === "42703") {
      console.error("Signup error: missing DB column — run server once to migrate:", err);
      return {
        ok: false,
        status: 503,
        message:
          "Database needs a quick update. Restart the backend server and try again.",
      };
    }
    console.error("Signup error:", err);
    return {
      ok: false,
      status: 500,
      message: "Could not create account. Please try again.",
    };
  }
}
