export const INACTIVE_PORTAL_USER_ROSTER_MESSAGE =
  "Inactive company users cannot be added to deal members or investors.";

export const ARCHIVED_CONTACT_ROSTER_MESSAGE =
  "Archived contacts cannot be added to deal members or investors.";

export function isInactivePortalUserStatus(status: unknown): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return s === "inactive" || s === "suspended";
}

export function isArchivedContactStatus(status: unknown): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return s === "suspended" || s === "archived";
}

export class DealRosterEligibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DealRosterEligibilityError";
  }
}

/** @deprecated Use DealRosterEligibilityError */
export class InactivePortalUserRosterError extends DealRosterEligibilityError {
  constructor(message = INACTIVE_PORTAL_USER_ROSTER_MESSAGE) {
    super(message);
    this.name = "InactivePortalUserRosterError";
  }
}

export function isDealRosterEligibilityError(
  err: unknown,
): err is DealRosterEligibilityError {
  return (
    err instanceof DealRosterEligibilityError ||
    err instanceof InactivePortalUserRosterError
  );
}

export function isInactivePortalUserRosterError(
  err: unknown,
): err is InactivePortalUserRosterError {
  return isDealRosterEligibilityError(err);
}

/**
 * @deprecated Roster eligibility is no longer enforced — kept for existing call sites.
 */
export async function assertEligibleForNewDealRosterAdd(
  _contactMemberId: string,
): Promise<void> {
  return;
}

/** @deprecated Use assertEligibleForNewDealRosterAdd */
export async function assertPortalUserActiveForNewDealRosterAdd(
  contactMemberId: string,
): Promise<void> {
  await assertEligibleForNewDealRosterAdd(contactMemberId);
}
