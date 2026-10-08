import type { Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../../database/db.js";
import { users } from "../../schema/schema.js";
import { findContactByEmailForSignupPrefill } from "../../services/contact/contact.service.js";
import { findSignupPrefillForDealAndEmail } from "../../services/deal/signupPrefillDeal.service.js";
import {
  registerUser,
  type SignupBody,
} from "../../services/auth/signup.service.js";

function normalizedPrefillUserName(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  if (v.toLowerCase().startsWith("invited_")) return "";
  return v;
}

/**
 * Public: prefill first/last/phone for signup.
 * Priority by invited email:
 * 1) users table (always, regardless of signup completion)
 * 2) contacts table
 * 3) optional deal-scoped roster fallback (when `dealId` is provided)
 */
export async function getSignupPrefill(req: Request, res: Response): Promise<void> {
  const raw = req.query.email;
  const email = typeof raw === "string" ? raw.trim() : "";
  const emailNorm = email.toLowerCase();
  const rawDeal = req.query.dealId;
  const dealId = typeof rawDeal === "string" ? rawDeal.trim() : "";
  if (!email || !email.includes("@")) {
    res.status(400).json({ message: "A valid email is required.", found: false });
    return;
  }
  try {
    /** Direct user lookup by email (completed and pending users). */
    const [matchedUser] = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        userName: users.username,
      })
      .from(users)
      .where(sql`lower(${users.email}) = ${emailNorm}`)
      .limit(1);
    let mergedFirstName = String(matchedUser?.firstName ?? "").trim();
    let mergedLastName = String(matchedUser?.lastName ?? "").trim();
    let mergedPhone = String(matchedUser?.phone ?? "").trim();
    let mergedUserName = normalizedPrefillUserName(matchedUser?.userName);

    /** If users row is missing profile fields, fill from contacts by email. */
    if (!mergedFirstName || !mergedLastName || !mergedPhone) {
      const fromContact = await findContactByEmailForSignupPrefill(emailNorm);
      if (fromContact) {
        if (!mergedFirstName) mergedFirstName = fromContact.firstName;
        if (!mergedLastName) mergedLastName = fromContact.lastName;
        if (!mergedPhone) mergedPhone = fromContact.phone;
      }
    }

    /** Backward-compatible fallback for deal-scoped roster/member rows. */
    if (dealId && (!mergedFirstName || !mergedLastName || !mergedPhone)) {
      const fromDeal = await findSignupPrefillForDealAndEmail(emailNorm, dealId);
      if (fromDeal) {
        if (!mergedFirstName) mergedFirstName = fromDeal.firstName;
        if (!mergedLastName) mergedLastName = fromDeal.lastName;
        if (!mergedPhone) mergedPhone = fromDeal.phone;
        if (!mergedUserName) mergedUserName = normalizedPrefillUserName(fromDeal.userName);
      }
    }

    if (mergedFirstName || mergedLastName || mergedPhone || mergedUserName) {
      res.status(200).json({
        found: true,
        firstName: mergedFirstName,
        lastName: mergedLastName,
        phone: mergedPhone,
        userName: mergedUserName || undefined,
      });
      return;
    }
    res.status(200).json({ found: false });
  } catch (err) {
    console.error("getSignupPrefill:", err);
    res.status(500).json({ message: "Could not load prefill.", found: false });
  }
}

export async function postSignup(req: Request, res: Response): Promise<void> {
  const token =
    typeof req.params.token === "string" ? req.params.token : undefined;
  const result = await registerUser(token, req.body as SignupBody);

  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }

  res.status(201).json({
    message: result.message,
    emailSent: result.emailSent,
  });
}
