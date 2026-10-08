import type { Request, Response } from "express";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  BeneficiaryDuplicateError,
  BeneficiaryInvalidEmailError,
  BeneficiaryInvalidPhoneError,
  InvestorProfileDuplicateError,
  InvestorProfileInUseError,
  createBeneficiaryForUser,
  createInvestorProfileForUser,
  deleteInvestorProfileForUser,
  SavedAddressDuplicateError,
  createSavedAddressForUser,
  getProfileBookForUser,
  setBeneficiaryArchived,
  setInvestorProfileArchived,
  setSavedAddressArchived,
  updateBeneficiaryForUser,
  updateInvestorProfileForUser,
  updateSavedAddressForUser,
} from "../../services/investing/investingProfileBook.service.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WIZ_MAX_BYTES = 256 * 1024;

/** `null` in body → clear column. Absent in body → undefined (use default per handler). */
function bodyProfileWizardStateJson(
  body: Record<string, unknown>,
): { ok: true; json: string | null } | { ok: false; message: string } {
  if (!("profileWizardState" in body)) {
    return { ok: true, json: null };
  }
  const w = body.profileWizardState;
  if (w === null) return { ok: true, json: null };
  let s: string;
  if (typeof w === "string") {
    try {
      JSON.parse(w);
      s = w;
    } catch {
      return { ok: false, message: "profileWizardState must be valid JSON" };
    }
  } else if (typeof w === "object" && w !== null && !Array.isArray(w)) {
    s = JSON.stringify(w);
  } else {
    return { ok: false, message: "Invalid profileWizardState" };
  }
  if (Buffer.byteLength(s, "utf8") > WIZ_MAX_BYTES) {
    return { ok: false, message: "profileWizardState is too large" };
  }
  return { ok: true, json: s };
}

function isUuid(s: string): boolean {
  return typeof s === "string" && UUID_RE.test(s.trim());
}

async function requireUser(req: Request, res: Response): Promise<string | null> {
  const jwtUser = await getValidJwtUser(req);
  if (!jwtUser?.id) {
    res.status(401).json({ message: "Authorization required" });
    return null;
  }
  return jwtUser.id;
}

export async function getMyProfileBook(req: Request, res: Response): Promise<void> {
  const userId = await requireUser(req, res);
  if (!userId) return;
  try {
    const snapshot = await getProfileBookForUser(userId);
    res.status(200).json(snapshot);
  } catch (err) {
    console.error("getMyProfileBook:", err);
    res.status(500).json({ message: "Could not load profile data. Please try again." });
  }
}

export async function postMyProfileBookProfile(req: Request, res: Response): Promise<void> {
  const userId = await requireUser(req, res);
  if (!userId) return;
  const body = req.body as {
    profileName?: unknown;
    profileType?: unknown;
    profileWizardState?: unknown;
    autosave?: unknown;
  };
  const profileName = typeof body.profileName === "string" ? body.profileName : "";
  const profileType = typeof body.profileType === "string" ? body.profileType : "";
  const autosave = body.autosave === true || body.autosave === "true";
  const wiz = bodyProfileWizardStateJson(
    body as unknown as Record<string, unknown>,
  );
  if (!wiz.ok) {
    res.status(400).json({ message: wiz.message });
    return;
  }
  try {
    const row = await createInvestorProfileForUser(userId, {
      profileName,
      profileType,
      profileWizardState: wiz.json,
      autosave,
    });
    if (!row) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    res.status(201).json({ profile: row });
  } catch (err) {
    if (err instanceof InvestorProfileDuplicateError) {
      res.status(409).json({ message: err.message });
      return;
    }
    console.error("postMyProfileBookProfile:", err);
    const msg = err instanceof Error && err.message === "form_snapshot_too_large"
      ? "Profile data is too large."
      : "Could not save profile. Please try again.";
    res.status(500).json({ message: msg });
  }
}

export async function patchMyProfileBookProfile(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = await requireUser(req, res);
  if (!userId) return;
  const id = String(req.params.id ?? "");
  if (!isUuid(id)) {
    res.status(400).json({ message: "Invalid id" });
    return;
  }
  const body = req.body as { archived?: unknown };
  if (typeof body.archived !== "boolean") {
    res.status(400).json({ message: "Field archived (boolean) is required" });
    return;
  }
  try {
    const row = await setInvestorProfileArchived(userId, id, body.archived);
    if (!row) {
      res.status(404).json({ message: "Profile not found" });
      return;
    }
    res.status(200).json({ profile: row });
  } catch (err) {
    console.error("patchMyProfileBookProfile:", err);
    res.status(500).json({ message: "Could not update profile. Please try again." });
  }
}

export async function deleteMyProfileBookProfile(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = await requireUser(req, res);
  if (!userId) return;
  const id = String(req.params.id ?? "");
  if (!isUuid(id)) {
    res.status(400).json({ message: "Invalid id" });
    return;
  }
  try {
    const ok = await deleteInvestorProfileForUser(userId, id);
    if (!ok) {
      res.status(404).json({ message: "Profile not found" });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof InvestorProfileInUseError) {
      res.status(409).json({ message: err.message });
      return;
    }
    console.error("deleteMyProfileBookProfile:", err);
    res.status(500).json({ message: "Could not delete profile. Please try again." });
  }
}

export async function putMyProfileBookProfile(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = await requireUser(req, res);
  if (!userId) return;
  const id = String(req.params.id ?? "");
  if (!isUuid(id)) {
    res.status(400).json({ message: "Invalid id" });
    return;
  }
  const body = req.body as {
    profileName?: unknown;
    profileType?: unknown;
    lastEditReason?: unknown;
    profileWizardState?: unknown;
    autosave?: unknown;
    isDraft?: unknown;
  };
  const profileName = typeof body.profileName === "string" ? body.profileName : "";
  const profileType = typeof body.profileType === "string" ? body.profileType : "";
  const lastEditReason = typeof body.lastEditReason === "string" ? body.lastEditReason : "";
  const autosave = body.autosave === true || body.autosave === "true";
  if (!profileName.trim()) {
    res.status(400).json({ message: "Profile name is required" });
    return;
  }
  if (!autosave && !lastEditReason.trim()) {
    const rawBody = body as unknown as Record<string, unknown>;
    const completingDraft = rawBody.isDraft === false;
    if (!completingDraft) {
      res.status(400).json({ message: "Reason for this change is required" });
      return;
    }
  }
  const rawBody = body as unknown as Record<string, unknown>;
  let updatePayload: Parameters<typeof updateInvestorProfileForUser>[2] = {
    profileName,
    profileType,
    lastEditReason,
    autosave,
  };
  if (Object.prototype.hasOwnProperty.call(rawBody, "isDraft")) {
    updatePayload = {
      ...updatePayload,
      isDraft: rawBody.isDraft === true || rawBody.isDraft === "true" ? true : false,
    };
  }
  if (Object.prototype.hasOwnProperty.call(rawBody, "profileWizardState")) {
    const wiz = bodyProfileWizardStateJson({
      ...rawBody,
      profileWizardState: rawBody.profileWizardState,
    } as Record<string, unknown>);
    if (!wiz.ok) {
      res.status(400).json({ message: wiz.message });
      return;
    }
    updatePayload = { ...updatePayload, profileWizardState: wiz.json };
  }
  try {
    const row = await updateInvestorProfileForUser(userId, id, updatePayload);
    if (!row) {
      res.status(404).json({ message: "Profile not found" });
      return;
    }
    res.status(200).json({ profile: row });
  } catch (err) {
    if (err instanceof InvestorProfileDuplicateError) {
      res.status(409).json({ message: err.message });
      return;
    }
    console.error("putMyProfileBookProfile:", err);
    const msg = err instanceof Error && err.message === "form_snapshot_too_large"
      ? "Profile data is too large."
      : "Could not update profile. Please try again.";
    res.status(500).json({ message: msg });
  }
}

export async function postMyProfileBookBeneficiary(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = await requireUser(req, res);
  if (!userId) return;
  const body = req.body as Record<string, unknown>;
  const input = {
    fullName: typeof body.fullName === "string" ? body.fullName : "",
    relationship: typeof body.relationship === "string" ? body.relationship : "",
    taxId: typeof body.taxId === "string" ? body.taxId : "",
    phone: typeof body.phone === "string" ? body.phone : "",
    email: typeof body.email === "string" ? body.email : "",
    addressQuery: typeof body.addressQuery === "string" ? body.addressQuery : "",
  };
  try {
    const row = await createBeneficiaryForUser(userId, input);
    if (!row) {
      res.status(500).json({ message: "Could not create beneficiary" });
      return;
    }
    res.status(201).json({ beneficiary: row });
  } catch (err) {
    if (
      err instanceof BeneficiaryInvalidPhoneError ||
      err instanceof BeneficiaryInvalidEmailError
    ) {
      res.status(400).json({ message: err.message });
      return;
    }
    if (err instanceof BeneficiaryDuplicateError) {
      res.status(409).json({ message: err.message });
      return;
    }
    console.error("postMyProfileBookBeneficiary:", err);
    res.status(500).json({ message: "Could not save beneficiary. Please try again." });
  }
}

export async function patchMyProfileBookBeneficiary(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = await requireUser(req, res);
  if (!userId) return;
  const id = String(req.params.id ?? "");
  if (!isUuid(id)) {
    res.status(400).json({ message: "Invalid id" });
    return;
  }
  const body = req.body as { archived?: unknown };
  if (typeof body.archived !== "boolean") {
    res.status(400).json({ message: "Field archived (boolean) is required" });
    return;
  }
  try {
    const row = await setBeneficiaryArchived(userId, id, body.archived);
    if (!row) {
      res.status(404).json({ message: "Beneficiary not found" });
      return;
    }
    res.status(200).json({ beneficiary: row });
  } catch (err) {
    console.error("patchMyProfileBookBeneficiary:", err);
    res.status(500).json({ message: "Could not update beneficiary. Please try again." });
  }
}

export async function putMyProfileBookBeneficiary(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = await requireUser(req, res);
  if (!userId) return;
  const id = String(req.params.id ?? "");
  if (!isUuid(id)) {
    res.status(400).json({ message: "Invalid id" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const input = {
    fullName: typeof body.fullName === "string" ? body.fullName : "",
    relationship: typeof body.relationship === "string" ? body.relationship : "",
    taxId: typeof body.taxId === "string" ? body.taxId : "",
    phone: typeof body.phone === "string" ? body.phone : "",
    email: typeof body.email === "string" ? body.email : "",
    addressQuery: typeof body.addressQuery === "string" ? body.addressQuery : "",
  };
  try {
    const row = await updateBeneficiaryForUser(userId, id, input);
    if (!row) {
      res.status(404).json({ message: "Beneficiary not found" });
      return;
    }
    res.status(200).json({ beneficiary: row });
  } catch (err) {
    if (
      err instanceof BeneficiaryInvalidPhoneError ||
      err instanceof BeneficiaryInvalidEmailError
    ) {
      res.status(400).json({ message: err.message });
      return;
    }
    if (err instanceof BeneficiaryDuplicateError) {
      res.status(409).json({ message: err.message });
      return;
    }
    console.error("putMyProfileBookBeneficiary:", err);
    res.status(500).json({ message: "Could not update beneficiary. Please try again." });
  }
}

export async function postMyProfileBookAddress(req: Request, res: Response): Promise<void> {
  const userId = await requireUser(req, res);
  if (!userId) return;
  const body = req.body as Record<string, unknown>;
  const input = {
    fullNameOrCompany:
      typeof body.fullNameOrCompany === "string" ? body.fullNameOrCompany : "",
    country: typeof body.country === "string" ? body.country : "",
    street1: typeof body.street1 === "string" ? body.street1 : "",
    street2: typeof body.street2 === "string" ? body.street2 : "",
    city: typeof body.city === "string" ? body.city : "",
    state: typeof body.state === "string" ? body.state : "",
    zip: typeof body.zip === "string" ? body.zip : "",
    checkMemo: typeof body.checkMemo === "string" ? body.checkMemo : "",
    distributionNote:
      typeof body.distributionNote === "string" ? body.distributionNote : "",
  };
  try {
    const row = await createSavedAddressForUser(userId, input);
    if (!row) {
      res.status(500).json({ message: "Could not create address" });
      return;
    }
    res.status(201).json({ address: row });
  } catch (err) {
    if (err instanceof SavedAddressDuplicateError) {
      res.status(409).json({ message: err.message });
      return;
    }
    console.error("postMyProfileBookAddress:", err);
    res.status(500).json({ message: "Could not save address. Please try again." });
  }
}

export async function patchMyProfileBookAddress(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = await requireUser(req, res);
  if (!userId) return;
  const id = String(req.params.id ?? "");
  if (!isUuid(id)) {
    res.status(400).json({ message: "Invalid id" });
    return;
  }
  const body = req.body as { archived?: unknown };
  if (typeof body.archived !== "boolean") {
    res.status(400).json({ message: "Field archived (boolean) is required" });
    return;
  }
  try {
    const row = await setSavedAddressArchived(userId, id, body.archived);
    if (!row) {
      res.status(404).json({ message: "Address not found" });
      return;
    }
    res.status(200).json({ address: row });
  } catch (err) {
    console.error("patchMyProfileBookAddress:", err);
    res.status(500).json({ message: "Could not update address. Please try again." });
  }
}

export async function putMyProfileBookAddress(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = await requireUser(req, res);
  if (!userId) return;
  const id = String(req.params.id ?? "");
  if (!isUuid(id)) {
    res.status(400).json({ message: "Invalid id" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const input = {
    fullNameOrCompany:
      typeof body.fullNameOrCompany === "string" ? body.fullNameOrCompany : "",
    country: typeof body.country === "string" ? body.country : "",
    street1: typeof body.street1 === "string" ? body.street1 : "",
    street2: typeof body.street2 === "string" ? body.street2 : "",
    city: typeof body.city === "string" ? body.city : "",
    state: typeof body.state === "string" ? body.state : "",
    zip: typeof body.zip === "string" ? body.zip : "",
    checkMemo: typeof body.checkMemo === "string" ? body.checkMemo : "",
    distributionNote:
      typeof body.distributionNote === "string" ? body.distributionNote : "",
  };
  try {
    const row = await updateSavedAddressForUser(userId, id, input);
    if (!row) {
      res.status(404).json({ message: "Address not found" });
      return;
    }
    res.status(200).json({ address: row });
  } catch (err) {
    if (err instanceof SavedAddressDuplicateError) {
      res.status(409).json({ message: err.message });
      return;
    }
    console.error("putMyProfileBookAddress:", err);
    res.status(500).json({ message: "Could not update address. Please try again." });
  }
}
