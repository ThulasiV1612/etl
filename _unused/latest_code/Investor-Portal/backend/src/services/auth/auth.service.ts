import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { companies, users } from "../../schema/schema.js";
import { isPlatformAdminRole } from "../../constants/roles.js";
import { enrichUserRecordForDealParticipant } from "../deal/dealParticipantProfile.service.js";
import { mergeLpInvestorFlagsIntoUserPayload } from "../investing/lpInvestorAccess.service.js";
import { listUserCompanyMemberships } from "./userCompanyMembership.service.js";
import { issueAuthTokenPair } from "./token.service.js";
import type { Request } from "express";

export type SigninSuccess = {
  ok: true;
  message: string;
  accessToken: string;
  refreshToken: string;
  accessTokenId: string;
  refreshTokenId: string;
  /** @deprecated Use accessToken */
  token: string;
  userDetails: Record<string, unknown>[];
};

export type SigninFailure = {
  ok: false;
  message: string;
};

export type SigninResult = SigninSuccess | SigninFailure;

/** Generic credential failure — do not reveal whether the email exists. */
export const INVALID_SIGNIN_CREDENTIALS_MESSAGE =
  "Invalid email or password";

/** Email exists and signup is complete, but sign-in credentials failed. */
export const ACCOUNT_EXISTS_RESET_PASSWORD_MESSAGE =
  "Your account already exists. Please reset your password to sign in.";

function isUserSignupCompleted(
  value: string | null | undefined,
): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

/**
 * Sign-in by email only (username lookup disabled).
 */
export async function signInWithPassword(
  rawEmail: string,
  userPassword: string,
  req?: Request,
  portalSessionId?: string,
): Promise<SigninResult> {
  const input = (rawEmail ?? "").toString().trim().toLowerCase();
  if (!input) {
    return { ok: false, message: "Email is required" };
  }
  if (!input.includes("@")) {
    return { ok: false, message: "A valid email address is required" };
  }
  if (userPassword == null || userPassword === "") {
    return { ok: false, message: "Password is required" };
  }

  const emailForLookup = input;

  try {
    const rows = await db
      .select({
        user: users,
      })
      .from(users)
      .where(eq(users.email, emailForLookup))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return { ok: false, message: INVALID_SIGNIN_CREDENTIALS_MESSAGE };
    }
    const user_table = row.user;
    const signupCompleted = isUserSignupCompleted(
      user_table.userSignupCompleted,
    );

    if (!user_table.passwordHash || user_table.passwordHash.trim() === "") {
      if (signupCompleted) {
        return { ok: false, message: ACCOUNT_EXISTS_RESET_PASSWORD_MESSAGE };
      }
      return { ok: false, message: INVALID_SIGNIN_CREDENTIALS_MESSAGE };
    }

    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, emailForLookup))
      .limit(1);
    const usertable = user[0];
    if (!usertable) {
      return { ok: false, message: INVALID_SIGNIN_CREDENTIALS_MESSAGE };
    }

    const passwordMatch = await bcrypt.compare(
      userPassword,
      user_table.passwordHash,
    );
    if (!passwordMatch) {
      // return { ok: false, message: ACCOUNT_EXISTS_RESET_PASSWORD_MESSAGE };
      return { ok: false, message: "Incorrect password. Please try again or reset your password." };
    }

    if (!isUserSignupCompleted(usertable.userSignupCompleted)) {
      return {
        ok: false,
        message:
          "Your account setup is not complete. Finish registration before signing in.",
      };
    }

    const userStatus = String(usertable.userStatus ?? "").trim().toLowerCase();
    if (userStatus === "inactive" || userStatus === "suspended") {
      return {
        ok: false,
        message:
          "Your account is inactive. You cannot sign in. Contact your administrator.",
      };
    }
    if (userStatus !== "active") {
      return {
        ok: false,
        message:
          "Your account is not active. You cannot sign in. Contact your administrator.",
      };
    }

    const orgId = usertable.organizationId;
    const role = String(usertable.role ?? "").trim();
    if (orgId && !isPlatformAdminRole(role)) {
      const [co] = await db
        .select({ status: companies.status })
        .from(companies)
        .where(eq(companies.id, orgId))
        .limit(1);
      const coStatus = String(co?.status ?? "").trim().toLowerCase();
      if (!co || coStatus !== "active") {
        return {
          ok: false,
          message:
            "Your organization is not active. You cannot sign in until it is reactivated. Contact your administrator.",
        };
      }
    }

    const { accessToken, refreshToken, accessTokenId, refreshTokenId } =
      await issueAuthTokenPair({
        userId: user_table.id,
        email: user_table.email,
        userRole: user_table.role,
        portalSessionId,
        req,
      });

    const { passwordHash: _pw, ...userWithoutSecret } = user_table;
    let displayCompanyName = "";
    if (user_table.organizationId) {
      const [coName] = await db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, user_table.organizationId))
        .limit(1);
      if (coName?.name?.trim()) displayCompanyName = coName.name.trim();
    }
    const memberships = await listUserCompanyMemberships(String(user_table.id));
    const fallbackMembership = memberships[0];
    const resolvedOrgId =
      user_table.organizationId ?? fallbackMembership?.companyId ?? null;
    const resolvedCompanyName =
      displayCompanyName || fallbackMembership?.companyName || "";
    const baseDetail = {
      ...userWithoutSecret,
      companyName: resolvedCompanyName,
      organization_name: resolvedCompanyName,
      organization_id: resolvedOrgId,
      memberships,
    };
    const enrichedDetail = await enrichUserRecordForDealParticipant(
      baseDetail as Record<string, unknown>,
      String(user_table.id),
    );
    const userDetails = [
      await mergeLpInvestorFlagsIntoUserPayload(enrichedDetail, {
        email: user_table.email,
        portalRole: user_table.role,
        userId: String(user_table.id),
      }),
    ];

    return {
      ok: true,
      message: "User Login Successful",
      accessToken,
      refreshToken,
      accessTokenId,
      refreshTokenId,
      token: accessToken,
      userDetails,
    };
  } catch (error) {
    console.error("Login error:", error);
    return {
      ok: false,
      message: "An error occurred during login. Please try again.",
    };
  }
}
