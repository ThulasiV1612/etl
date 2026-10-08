import { and, desc, eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { parseUsPhoneToE164 } from "../../utils/usPhone.js";
import {
  dealInvestment,
  dealLpInvestor,
  investorDistributionPayouts,
  userBeneficiaries,
  userInvestorProfiles,
  userSavedAddresses,
  users,
} from "../../schema/schema.js";
import {
  distributionBankDbValues,
  distributionBankForApi,
  distributionBankFromFormSnapshot,
  mergeDistributionBankIntoWizardState,
  type InvestorProfileDistributionBankApi,
} from "./investorProfileDistributionBank.js";

function displayNameFromUser(row: {
  firstName: string;
  lastName: string;
  email: string;
}): string {
  const f = String(row.firstName ?? "").trim();
  const l = String(row.lastName ?? "").trim();
  const n = [f, l].filter(Boolean).join(" ");
  if (n) return n;
  return String(row.email ?? "").trim() || "—";
}

const MAX_FORM_SNAPSHOT_BYTES = 256 * 1024;
const ERR_FORM_SNAPSHOT_TOO_LARGE = "form_snapshot_too_large";

export class BeneficiaryInvalidPhoneError extends Error {
  constructor() {
    super("Enter a valid 10-digit U.S. phone number, or leave phone blank.");
    this.name = "BeneficiaryInvalidPhoneError";
  }
}

export class BeneficiaryInvalidEmailError extends Error {
  constructor() {
    super("Enter a valid email address.");
    this.name = "BeneficiaryInvalidEmailError";
  }
}

export class BeneficiaryDuplicateError extends Error {
  constructor() {
    super("A beneficiary with this name and address already exists.");
    this.name = "BeneficiaryDuplicateError";
  }
}

export class SavedAddressDuplicateError extends Error {
  constructor() {
    super("This address has already been saved.");
    this.name = "SavedAddressDuplicateError";
  }
}

export class InvestorProfileDuplicateError extends Error {
  constructor() {
    super("A profile with this name and type already exists.");
    this.name = "InvestorProfileDuplicateError";
  }
}

export class InvestorProfileInUseError extends Error {
  constructor() {
    super(
      "This profile is used on investments or payouts. Archive it instead of deleting.",
    );
    this.name = "InvestorProfileInUseError";
  }
}

function profileLabelKey(profileName: string, profileType: string): {
  name: string;
  type: string;
} {
  return {
    name: (profileName ?? "").trim().toLowerCase() || "—",
    type: (profileType ?? "").trim().toLowerCase() || "—",
  };
}

function beneficiaryLabelKey(fullName: string, addressQuery: string): {
  name: string;
  address: string;
} {
  const norm = (s: string) =>
    String(s ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  return {
    name: norm(fullName),
    address: norm(addressQuery),
  };
}

function savedAddressLocationKey(input: {
  country: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
}): string {
  const norm = (s: string) =>
    String(s ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  const zipNorm = (z: string) => norm(z).replace(/\D/g, "").slice(0, 9);
  return [
    norm(input.country),
    norm(input.street1),
    norm(input.street2),
    norm(input.city),
    norm(input.state),
    zipNorm(input.zip),
  ].join("|");
}

async function activeSavedAddressDuplicateExists(
  userId: string,
  input: {
    country: string;
    street1: string;
    street2: string;
    city: string;
    state: string;
    zip: string;
  },
  excludeAddressId?: string,
): Promise<boolean> {
  const target = savedAddressLocationKey(input);
  const rows = await db
    .select({
      id: userSavedAddresses.id,
      country: userSavedAddresses.country,
      street1: userSavedAddresses.street1,
      street2: userSavedAddresses.street2,
      city: userSavedAddresses.city,
      state: userSavedAddresses.state,
      zip: userSavedAddresses.zip,
      archived: userSavedAddresses.archived,
    })
    .from(userSavedAddresses)
    .where(eq(userSavedAddresses.userId, userId));

  return rows.some((r) => {
    if (r.archived) return false;
    if (excludeAddressId && r.id === excludeAddressId) return false;
    return savedAddressLocationKey(r) === target;
  });
}

async function activeBeneficiaryDuplicateExists(
  userId: string,
  fullName: string,
  addressQuery: string,
  excludeBeneficiaryId?: string,
): Promise<boolean> {
  const target = beneficiaryLabelKey(fullName, addressQuery);
  const rows = await db
    .select({
      id: userBeneficiaries.id,
      fullName: userBeneficiaries.fullName,
      addressQuery: userBeneficiaries.addressQuery,
      archived: userBeneficiaries.archived,
    })
    .from(userBeneficiaries)
    .where(eq(userBeneficiaries.userId, userId));

  return rows.some((r) => {
    if (r.archived) return false;
    if (excludeBeneficiaryId && r.id === excludeBeneficiaryId) return false;
    const key = beneficiaryLabelKey(r.fullName, r.addressQuery);
    return key.name === target.name && key.address === target.address;
  });
}

async function activeProfileDuplicateExists(
  userId: string,
  profileName: string,
  profileType: string,
  excludeProfileId?: string,
): Promise<boolean> {
  const target = profileLabelKey(profileName, profileType);
  const rows = await db
    .select({
      id: userInvestorProfiles.id,
      profileName: userInvestorProfiles.profileName,
      profileType: userInvestorProfiles.profileType,
      archived: userInvestorProfiles.archived,
    })
    .from(userInvestorProfiles)
    .where(eq(userInvestorProfiles.userId, userId));

  return rows.some((r) => {
    if (r.archived) return false;
    if (excludeProfileId && r.id === excludeProfileId) return false;
    const key = profileLabelKey(r.profileName, r.profileType);
    return key.name === target.name && key.type === target.type;
  });
}

function normalizeBeneficiaryPhoneForWrite(raw: string): string {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  const e164 = parseUsPhoneToE164(t);
  if (!e164) throw new BeneficiaryInvalidPhoneError();
  return e164;
}

function normalizeBeneficiaryEmailForWrite(raw: string): string {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(t)) {
    throw new BeneficiaryInvalidEmailError();
  }
  return t;
}

/**
 * Controllers pass JSON from the body as a UTF-8 string; this turns it into a jsonb-ready object.
 */
function formSnapshotFromRequestJson(s: string | null): Record<string, unknown> | null {
  if (s == null) return null;
  const t = s.trim();
  if (!t) return null;
  if (Buffer.byteLength(t, "utf8") > MAX_FORM_SNAPSHOT_BYTES) {
    throw new Error(ERR_FORM_SNAPSHOT_TOO_LARGE);
  }
  const o = JSON.parse(t) as unknown;
  if (o == null || typeof o !== "object" || Array.isArray(o)) {
    return null;
  }
  if (Buffer.byteLength(JSON.stringify(o), "utf8") > MAX_FORM_SNAPSHOT_BYTES) {
    throw new Error(ERR_FORM_SNAPSHOT_TOO_LARGE);
  }
  return o as Record<string, unknown>;
}

export type ProfileBookSnapshot = {
  profiles: Array<{
    id: string;
    profileName: string;
    profileType: string;
    addedBy: string;
    investmentsCount: number;
    dateCreated: string;
    archived: boolean;
    isDraft: boolean;
    lastEditReason: string | null;
    /** Add-profile wizard; maps to DB `form_snapshot` (jsonb). */
    profileWizardState: unknown | null;
    /** Distribution / bank columns (also merged into `profileWizardState` on read). */
    distributionBank: InvestorProfileDistributionBankApi;
  }>;
  beneficiaries: Array<{
    id: string;
    fullName: string;
    relationship: string;
    taxId: string;
    phone: string;
    email: string;
    addressQuery: string;
    archived: boolean;
  }>;
  addresses: Array<{
    id: string;
    fullNameOrCompany: string;
    country: string;
    street1: string;
    street2: string;
    city: string;
    state: string;
    zip: string;
    checkMemo: string;
    distributionNote: string;
    archived: boolean;
  }>;
};

export async function getProfileBookForUser(
  userId: string,
): Promise<ProfileBookSnapshot> {
  const [pRows, bRows, aRows] = await Promise.all([
    db
      .select()
      .from(userInvestorProfiles)
      .where(eq(userInvestorProfiles.userId, userId))
      .orderBy(desc(userInvestorProfiles.createdAt)),
    db
      .select()
      .from(userBeneficiaries)
      .where(eq(userBeneficiaries.userId, userId))
      .orderBy(desc(userBeneficiaries.createdAt)),
    db
      .select()
      .from(userSavedAddresses)
      .where(eq(userSavedAddresses.userId, userId))
      .orderBy(desc(userSavedAddresses.createdAt)),
  ]);

  return {
    profiles: pRows.map(mapProfileRow),
    beneficiaries: bRows.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      relationship: r.relationship,
      taxId: r.taxId,
      phone: r.phone,
      email: r.email,
      addressQuery: r.addressQuery,
      archived: r.archived,
    })),
    addresses: aRows.map((r) => ({
      id: r.id,
      fullNameOrCompany: r.fullNameOrCompany,
      country: r.country,
      street1: r.street1,
      street2: r.street2,
      city: r.city,
      state: r.state,
      zip: r.zip,
      checkMemo: r.checkMemo,
      distributionNote: r.distributionNote,
      archived: r.archived,
    })),
  };
}

export async function createInvestorProfileForUser(
  userId: string,
  input: {
    profileName: string;
    profileType: string;
    profileWizardState: string | null;
    isDraft?: boolean;
    /** When true, skip duplicate name+type check (in-progress wizard autosave). */
    autosave?: boolean;
  },
): Promise<ProfileBookSnapshot["profiles"][0] | null> {
  const [u] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) return null;

  const profileName = (input.profileName ?? "").trim() || "—";
  const profileType = (input.profileType ?? "").trim() || "—";
  const autosave = Boolean(input.autosave);
  const isDraft = autosave || Boolean(input.isDraft);
  if (
    !autosave &&
    (await activeProfileDuplicateExists(userId, profileName, profileType))
  ) {
    throw new InvestorProfileDuplicateError();
  }

  const addedBy = displayNameFromUser(u);
  const formSnapshot = formSnapshotFromRequestJson(input.profileWizardState);
  const distributionBank = distributionBankFromFormSnapshot(formSnapshot);
  const [row] = await db
    .insert(userInvestorProfiles)
    .values({
      userId,
      profileName,
      profileType,
      addedBy,
      isDraft,
      formSnapshot,
      ...distributionBankDbValues(distributionBank),
    })
    .returning();

  if (!row) return null;
  return mapProfileRow(row);
}

export async function setInvestorProfileArchived(
  userId: string,
  profileId: string,
  archived: boolean,
): Promise<ProfileBookSnapshot["profiles"][0] | null> {
  const [row] = await db
    .update(userInvestorProfiles)
    .set({ archived })
    .where(
      and(eq(userInvestorProfiles.id, profileId), eq(userInvestorProfiles.userId, userId)),
    )
    .returning();
  if (!row) return null;
  return mapProfileRow(row);
}

export async function deleteInvestorProfileForUser(
  userId: string,
  profileId: string,
): Promise<boolean> {
  const [owned] = await db
    .select({ id: userInvestorProfiles.id })
    .from(userInvestorProfiles)
    .where(
      and(eq(userInvestorProfiles.id, profileId), eq(userInvestorProfiles.userId, userId)),
    )
    .limit(1);
  if (!owned) return false;

  const [payout] = await db
    .select({ id: investorDistributionPayouts.id })
    .from(investorDistributionPayouts)
    .where(eq(investorDistributionPayouts.userInvestorProfileId, profileId))
    .limit(1);
  if (payout) throw new InvestorProfileInUseError();

  const [investment] = await db
    .select({ id: dealInvestment.id })
    .from(dealInvestment)
    .where(eq(dealInvestment.userInvestorProfileId, profileId))
    .limit(1);
  if (investment) throw new InvestorProfileInUseError();

  const [lp] = await db
    .select({ id: dealLpInvestor.id })
    .from(dealLpInvestor)
    .where(eq(dealLpInvestor.userInvestorProfileId, profileId))
    .limit(1);
  if (lp) throw new InvestorProfileInUseError();

  const deleted = await db
    .delete(userInvestorProfiles)
    .where(
      and(eq(userInvestorProfiles.id, profileId), eq(userInvestorProfiles.userId, userId)),
    )
    .returning({ id: userInvestorProfiles.id });
  return deleted.length > 0;
}

export async function createBeneficiaryForUser(
  userId: string,
  input: {
    fullName: string;
    relationship: string;
    taxId: string;
    phone: string;
    email: string;
    addressQuery: string;
  },
): Promise<ProfileBookSnapshot["beneficiaries"][0] | null> {
  const fullName = (input.fullName ?? "").trim();
  const addressQuery = (input.addressQuery ?? "").trim();
  if (await activeBeneficiaryDuplicateExists(userId, fullName, addressQuery)) {
    throw new BeneficiaryDuplicateError();
  }
  const phoneStored = normalizeBeneficiaryPhoneForWrite(input.phone);
  const emailStored = normalizeBeneficiaryEmailForWrite(input.email);
  const [row] = await db
    .insert(userBeneficiaries)
    .values({
      userId,
      fullName,
      relationship: input.relationship ?? "",
      taxId: input.taxId ?? "",
      phone: phoneStored,
      email: emailStored,
      addressQuery,
    })
    .returning();
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.fullName,
    relationship: row.relationship,
    taxId: row.taxId,
    phone: row.phone,
    email: row.email,
    addressQuery: row.addressQuery,
    archived: row.archived,
  };
}

export async function setBeneficiaryArchived(
  userId: string,
  beneficiaryId: string,
  archived: boolean,
): Promise<ProfileBookSnapshot["beneficiaries"][0] | null> {
  const [row] = await db
    .update(userBeneficiaries)
    .set({ archived })
    .where(
      and(eq(userBeneficiaries.id, beneficiaryId), eq(userBeneficiaries.userId, userId)),
    )
    .returning();
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.fullName,
    relationship: row.relationship,
    taxId: row.taxId,
    phone: row.phone,
    email: row.email,
    addressQuery: row.addressQuery,
    archived: row.archived,
  };
}

export async function createSavedAddressForUser(
  userId: string,
  input: {
    fullNameOrCompany: string;
    country: string;
    street1: string;
    street2: string;
    city: string;
    state: string;
    zip: string;
    checkMemo: string;
    distributionNote: string;
  },
): Promise<ProfileBookSnapshot["addresses"][0] | null> {
  const location = {
    country: (input.country ?? "").trim(),
    street1: (input.street1 ?? "").trim(),
    street2: (input.street2 ?? "").trim(),
    city: (input.city ?? "").trim(),
    state: (input.state ?? "").trim(),
    zip: (input.zip ?? "").trim(),
  };
  if (await activeSavedAddressDuplicateExists(userId, location)) {
    throw new SavedAddressDuplicateError();
  }
  const [row] = await db
    .insert(userSavedAddresses)
    .values({
      userId,
      fullNameOrCompany: (input.fullNameOrCompany ?? "").trim(),
      ...location,
      checkMemo: (input.checkMemo ?? "").trim(),
      distributionNote: (input.distributionNote ?? "").trim(),
    })
    .returning();
  if (!row) return null;
  return {
    id: row.id,
    fullNameOrCompany: row.fullNameOrCompany,
    country: row.country,
    street1: row.street1,
    street2: row.street2,
    city: row.city,
    state: row.state,
    zip: row.zip,
    checkMemo: row.checkMemo,
    distributionNote: row.distributionNote,
    archived: row.archived,
  };
}

export async function setSavedAddressArchived(
  userId: string,
  addressId: string,
  archived: boolean,
): Promise<ProfileBookSnapshot["addresses"][0] | null> {
  const [row] = await db
    .update(userSavedAddresses)
    .set({ archived })
    .where(
      and(eq(userSavedAddresses.id, addressId), eq(userSavedAddresses.userId, userId)),
    )
    .returning();
  if (!row) return null;
  return {
    id: row.id,
    fullNameOrCompany: row.fullNameOrCompany,
    country: row.country,
    street1: row.street1,
    street2: row.street2,
    city: row.city,
    state: row.state,
    zip: row.zip,
    checkMemo: row.checkMemo,
    distributionNote: row.distributionNote,
    archived: row.archived,
  };
}

function mapProfileRow(
  row: (typeof userInvestorProfiles.$inferSelect),
): ProfileBookSnapshot["profiles"][0] {
  return {
    id: row.id,
    profileName: row.profileName,
    profileType: row.profileType,
    addedBy: row.addedBy,
    investmentsCount: row.investmentsCount,
    dateCreated: row.createdAt.toISOString(),
    archived: row.archived,
    isDraft: row.isDraft,
    lastEditReason: row.lastEditReason != null && String(row.lastEditReason).trim()
      ? String(row.lastEditReason).trim()
      : null,
    profileWizardState: mergeDistributionBankIntoWizardState(row.formSnapshot, row),
    distributionBank: distributionBankForApi(row),
  };
}

function mapBenRow(row: (typeof userBeneficiaries.$inferSelect)): ProfileBookSnapshot["beneficiaries"][0] {
  return {
    id: row.id,
    fullName: row.fullName,
    relationship: row.relationship,
    taxId: row.taxId,
    phone: row.phone,
    email: row.email,
    addressQuery: row.addressQuery,
    archived: row.archived,
  };
}

function mapAddrRow(
  row: (typeof userSavedAddresses.$inferSelect),
): ProfileBookSnapshot["addresses"][0] {
  return {
    id: row.id,
    fullNameOrCompany: row.fullNameOrCompany,
    country: row.country,
    street1: row.street1,
    street2: row.street2,
    city: row.city,
    state: row.state,
    zip: row.zip,
    checkMemo: row.checkMemo,
    distributionNote: row.distributionNote,
    archived: row.archived,
  };
}

export async function updateInvestorProfileForUser(
  userId: string,
  profileId: string,
  input: {
    profileName: string;
    profileType: string;
    lastEditReason?: string;
    /** Omit to leave `form_snapshot` unchanged. */
    profileWizardState?: string | null;
    /** Debounced wizard autosave — no audit reason required. */
    autosave?: boolean;
    /** Explicit `false` clears draft on final Save from the add wizard. */
    isDraft?: boolean;
  },
): Promise<ProfileBookSnapshot["profiles"][0] | null> {
  const profileName = (input.profileName ?? "").trim() || "—";
  const profileType = (input.profileType ?? "").trim() || "—";
  const autosave = Boolean(input.autosave);

  const [existing] = await db
    .select({ isDraft: userInvestorProfiles.isDraft })
    .from(userInvestorProfiles)
    .where(
      and(eq(userInvestorProfiles.id, profileId), eq(userInvestorProfiles.userId, userId)),
    )
    .limit(1);
  if (!existing) return null;

  if (
    !autosave &&
    (await activeProfileDuplicateExists(userId, profileName, profileType, profileId))
  ) {
    throw new InvestorProfileDuplicateError();
  }

  const reason = (input.lastEditReason ?? "").trim();
  const hasWizard = Object.prototype.hasOwnProperty.call(input, "profileWizardState");
  const formSnapshot = hasWizard
    ? formSnapshotFromRequestJson(
        input.profileWizardState == null ? null : String(input.profileWizardState),
      )
    : null;
  const distributionBank = hasWizard
    ? distributionBankFromFormSnapshot(formSnapshot)
    : null;

  let nextIsDraft = existing.isDraft;
  if (autosave) {
    nextIsDraft = true;
  } else if (input.isDraft === false) {
    nextIsDraft = false;
  } else if (input.isDraft === true) {
    nextIsDraft = true;
  }

  const [row] = await db
    .update(userInvestorProfiles)
    .set(
      hasWizard
        ? {
            profileName,
            profileType,
            isDraft: nextIsDraft,
            lastEditReason: reason || null,
            formSnapshot,
            ...distributionBankDbValues(distributionBank!),
          }
        : {
            profileName,
            profileType,
            isDraft: nextIsDraft,
            lastEditReason: reason || null,
          },
    )
    .where(
      and(eq(userInvestorProfiles.id, profileId), eq(userInvestorProfiles.userId, userId)),
    )
    .returning();
  if (!row) return null;
  return mapProfileRow(row);
}

export async function updateBeneficiaryForUser(
  userId: string,
  beneficiaryId: string,
  input: {
    fullName: string;
    relationship: string;
    taxId: string;
    phone: string;
    email: string;
    addressQuery: string;
  },
): Promise<ProfileBookSnapshot["beneficiaries"][0] | null> {
  const fullName = (input.fullName ?? "").trim();
  const addressQuery = (input.addressQuery ?? "").trim();
  if (
    await activeBeneficiaryDuplicateExists(
      userId,
      fullName,
      addressQuery,
      beneficiaryId,
    )
  ) {
    throw new BeneficiaryDuplicateError();
  }
  const phoneStored = normalizeBeneficiaryPhoneForWrite(input.phone);
  const emailStored = normalizeBeneficiaryEmailForWrite(input.email);
  const [row] = await db
    .update(userBeneficiaries)
    .set({
      fullName,
      relationship: input.relationship ?? "",
      taxId: input.taxId ?? "",
      phone: phoneStored,
      email: emailStored,
      addressQuery,
    })
    .where(
      and(eq(userBeneficiaries.id, beneficiaryId), eq(userBeneficiaries.userId, userId)),
    )
    .returning();
  if (!row) return null;
  return mapBenRow(row);
}

export async function updateSavedAddressForUser(
  userId: string,
  addressId: string,
  input: {
    fullNameOrCompany: string;
    country: string;
    street1: string;
    street2: string;
    city: string;
    state: string;
    zip: string;
    checkMemo: string;
    distributionNote: string;
  },
): Promise<ProfileBookSnapshot["addresses"][0] | null> {
  const location = {
    country: (input.country ?? "").trim(),
    street1: (input.street1 ?? "").trim(),
    street2: (input.street2 ?? "").trim(),
    city: (input.city ?? "").trim(),
    state: (input.state ?? "").trim(),
    zip: (input.zip ?? "").trim(),
  };
  if (await activeSavedAddressDuplicateExists(userId, location, addressId)) {
    throw new SavedAddressDuplicateError();
  }
  const [row] = await db
    .update(userSavedAddresses)
    .set({
      fullNameOrCompany: (input.fullNameOrCompany ?? "").trim(),
      ...location,
      checkMemo: (input.checkMemo ?? "").trim(),
      distributionNote: (input.distributionNote ?? "").trim(),
    })
    .where(
      and(eq(userSavedAddresses.id, addressId), eq(userSavedAddresses.userId, userId)),
    )
    .returning();
  if (!row) return null;
  return mapAddrRow(row);
}
