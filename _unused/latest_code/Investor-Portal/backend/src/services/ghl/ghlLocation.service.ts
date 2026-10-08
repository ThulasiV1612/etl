import { and, eq, isNotNull } from "drizzle-orm";
import {
  getGhlAgencyConfig,
  getGhlConfig,
  hasGhlAgencyProvisioningCredentials,
  isGhlPerOrgLocationsEnabled,
} from "../../config/ghl.config.js";
import { db } from "../../database/db.js";
import { companies, type CompanyRow } from "../../schema/schema.js";
import { createGhlLocation } from "./ghl.service.js";

export const GHL_LOCATION_STATUS_PENDING = "pending";
export const GHL_LOCATION_STATUS_ACTIVE = "active";
export const GHL_LOCATION_STATUS_FAILED = "failed";
export const GHL_LOCATION_STATUS_SKIPPED = "skipped";

function logGhlLocationWarning(context: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.warn(`[ghl-location] ${context}:`, message);
}

/** All active GHL sub-account ids (for platform-admin CRM aggregate view). */
export async function listProvisionedGhlLocationIds(): Promise<string[]> {
  const rows = await db
    .select({ ghlLocationId: companies.ghlLocationId })
    .from(companies)
    .where(
      and(
        isNotNull(companies.ghlLocationId),
        eq(companies.ghlLocationStatus, GHL_LOCATION_STATUS_ACTIVE),
      ),
    );

  const ids = rows
    .map((row) => row.ghlLocationId?.trim())
    .filter((id): id is string => Boolean(id));

  const globalId = getGhlConfig()?.locationId?.trim();
  if (globalId && !ids.includes(globalId)) {
    ids.unshift(globalId);
  }

  return [...new Set(ids)];
}

/** Resolve the GHL location id for an organization, with global fallback. */
export async function resolveGhlLocationIdForOrganization(
  organizationId: string | null | undefined,
): Promise<string | null> {
  const oid = String(organizationId ?? "").trim();
  if (!oid) {
    return getGhlConfig()?.locationId ?? null;
  }

  const [company] = await db
    .select({
      ghlLocationId: companies.ghlLocationId,
      ghlLocationStatus: companies.ghlLocationStatus,
    })
    .from(companies)
    .where(eq(companies.id, oid))
    .limit(1);

  if (company?.ghlLocationId?.trim()) {
    return company.ghlLocationId.trim();
  }

  if (isGhlPerOrgLocationsEnabled()) {
    return null;
  }

  return getGhlConfig()?.locationId ?? null;
}

export function shouldProvisionGhlLocationForCompany(
  company: Pick<CompanyRow, "ghlLocationId" | "ghlLocationStatus">,
): boolean {
  if (!isGhlPerOrgLocationsEnabled()) return false;
  if (!hasGhlAgencyProvisioningCredentials()) return false;
  if (company.ghlLocationId?.trim()) return false;
  const status = String(company.ghlLocationStatus ?? "").trim().toLowerCase();
  return status === GHL_LOCATION_STATUS_PENDING || status === GHL_LOCATION_STATUS_FAILED;
}

async function markCompanyGhlLocationSkipped(companyId: string): Promise<void> {
  await db
    .update(companies)
    .set({
      ghlLocationStatus: GHL_LOCATION_STATUS_SKIPPED,
      ghlLocationError: null,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId));
}

async function markCompanyGhlLocationFailed(
  companyId: string,
  error: string,
): Promise<void> {
  await db
    .update(companies)
    .set({
      ghlLocationStatus: GHL_LOCATION_STATUS_FAILED,
      ghlLocationError: error.slice(0, 2000),
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId));
}

async function markCompanyGhlLocationActive(
  companyId: string,
  locationId: string,
): Promise<void> {
  const now = new Date();
  await db
    .update(companies)
    .set({
      ghlLocationId: locationId,
      ghlLocationStatus: GHL_LOCATION_STATUS_ACTIVE,
      ghlLocationError: null,
      ghlLocationProvisionedAt: now,
      updatedAt: now,
    })
    .where(eq(companies.id, companyId));
}

/** Create a GHL sub-account for a company and persist the location id. */
export async function provisionGhlLocationForCompany(
  companyId: string,
): Promise<{ ok: true; locationId: string } | { ok: false; message: string }> {
  const id = String(companyId ?? "").trim();
  if (!id) {
    return { ok: false, message: "Company id is required" };
  }

  if (!isGhlPerOrgLocationsEnabled()) {
    await markCompanyGhlLocationSkipped(id);
    return { ok: false, message: "Per-org GHL locations are disabled" };
  }

  if (!hasGhlAgencyProvisioningCredentials()) {
    await markCompanyGhlLocationSkipped(id);
    return {
      ok: false,
      message:
        "GoHighLevel agency credentials are not configured. Set GHL_PER_ORG_LOCATIONS=1, PRIVATE_INTEGRATION_KEY, and GHL_LOCATION_ID (agency company id is resolved from the location).",
    };
  }

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1);

  if (!company) {
    return { ok: false, message: "Company not found" };
  }

  if (company.ghlLocationId?.trim()) {
    return { ok: true, locationId: company.ghlLocationId.trim() };
  }

  if (!shouldProvisionGhlLocationForCompany(company)) {
    return {
      ok: false,
      message: `Company GHL location status is ${company.ghlLocationStatus}`,
    };
  }

  try {
    const created = await createGhlLocation({ name: company.name });
    await markCompanyGhlLocationActive(id, created.locationId);
    return { ok: true, locationId: created.locationId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markCompanyGhlLocationFailed(id, message);
    return { ok: false, message };
  }
}

/** Fire-and-forget GHL sub-account provisioning after company create. */
export function queueGhlLocationProvision(companyId: string): void {
  void provisionGhlLocationForCompany(companyId).then((result) => {
    if (!result.ok) {
      logGhlLocationWarning(
        `provision skipped/failed for company ${companyId}`,
        result.message,
      );
    }
  }).catch((err) =>
    logGhlLocationWarning(`provision failed for company ${companyId}`, err),
  );
}
