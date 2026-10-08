/**
 * GoHighLevel (GHL) credentials — loaded from environment variables.
 *
 * Set in `backend/.env` or `backend/.env.local`:
 *   PRIVATE_INTEGRATION_KEY — location-scoped PIT from GHL → Settings → Private Integrations
 *   GHL_LOCATION_ID         — default sub-account id (Settings → Business Profile)
 *
 * Per-org sub-accounts (Agency Pro API — POST /locations/):
 *   GHL_PER_ORG_LOCATIONS=1
 *   GHL_AGENCY_PRIVATE_INTEGRATION_KEY — agency-scoped PIT (locations.write)
 *   GHL_COMPANY_ID                     — optional; auto-resolved from GHL_LOCATION_ID if omitted
 *   GHL_SNAPSHOT_ID                    — optional snapshot to apply to new sub-accounts
 */

export type GhlConfig = {
  baseUrl: string;
  apiVersion: string;
  privateIntegrationKey: string;
  locationId: string;
};

export type GhlAgencyConfig = {
  baseUrl: string;
  apiVersion: string;
  privateIntegrationKey: string;
  companyId: string;
  snapshotId: string | null;
};

const DEFAULT_BASE_URL = "https://services.leadconnectorhq.com";
const DEFAULT_API_VERSION = "2021-07-28";
const DEFAULT_GHL_APP_BASE_URL = "https://app.gohighlevel.com";

function readGhlAppBaseUrl(): string {
  return (
    process.env.GHL_APP_BASE_URL?.trim().replace(/\/$/, "") ||
    DEFAULT_GHL_APP_BASE_URL
  );
}

function readPrivateIntegrationKey(): string {
  return (
    process.env.PRIVATE_INTEGRATION_KEY?.trim() ||
    process.env.GHL_PRIVATE_INTEGRATION_KEY?.trim() ||
    ""
  );
}

function readAgencyPrivateIntegrationKey(): string {
  return (
    process.env.GHL_AGENCY_PRIVATE_INTEGRATION_KEY?.trim() ||
    process.env.GHL_AGENCY_PIT?.trim() ||
    ""
  );
}

function readLocationId(): string {
  return (
    process.env.GHL_LOCATION_ID?.trim() ||
    process.env.GHL_SUB_ACCOUNT_ID?.trim() ||
    ""
  );
}

function readAgencyCompanyId(): string {
  return (
    process.env.GHL_COMPANY_ID?.trim() ||
    process.env.GHL_AGENCY_COMPANY_ID?.trim() ||
    ""
  );
}

/** Exported for resolving agency company id from a known location. */
export function readDefaultGhlLocationId(): string {
  return readLocationId();
}

function readSnapshotId(): string | null {
  const id = process.env.GHL_SNAPSHOT_ID?.trim();
  return id || null;
}

function readApiBaseUrl(): string {
  return (
    process.env.GHL_API_BASE_URL?.trim().replace(/\/$/, "") || DEFAULT_BASE_URL
  );
}

function readApiVersion(): string {
  return process.env.GHL_API_VERSION?.trim() || DEFAULT_API_VERSION;
}

export function isGhlSyncEnabled(): boolean {
  const flag = process.env.GHL_SYNC_ENABLED?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  return true;
}

/** When true, each organization gets its own GHL sub-account on create. */
export function isGhlPerOrgLocationsEnabled(): boolean {
  const flag = process.env.GHL_PER_ORG_LOCATIONS?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "on" || flag === "yes";
}

export function getGhlConfig(locationIdOverride?: string | null): GhlConfig | null {
  const privateIntegrationKey =
    readAgencyPrivateIntegrationKey() || readPrivateIntegrationKey();
  const locationId = locationIdOverride?.trim() || readLocationId();
  if (!privateIntegrationKey || !locationId || !isGhlSyncEnabled()) return null;

  return {
    baseUrl: readApiBaseUrl(),
    apiVersion: readApiVersion(),
    privateIntegrationKey,
    locationId,
  };
}

export function getGhlAgencyConfig(): GhlAgencyConfig | null {
  const privateIntegrationKey =
    readAgencyPrivateIntegrationKey() || readPrivateIntegrationKey();
  const companyId = readAgencyCompanyId();
  if (!privateIntegrationKey || !companyId || !isGhlSyncEnabled()) return null;

  return {
    baseUrl: readApiBaseUrl(),
    apiVersion: readApiVersion(),
    privateIntegrationKey,
    companyId,
    snapshotId: readSnapshotId(),
  };
}

/** True when sub-account provisioning can run (company id may be resolved from GHL_LOCATION_ID). */
export function hasGhlAgencyProvisioningCredentials(): boolean {
  const privateIntegrationKey =
    readAgencyPrivateIntegrationKey() || readPrivateIntegrationKey();
  const canResolveCompanyId =
    Boolean(readAgencyCompanyId()) || Boolean(readLocationId());
  return Boolean(
    privateIntegrationKey && canResolveCompanyId && isGhlSyncEnabled(),
  );
}

export function getGhlAgencyConfigPartial(): Omit<GhlAgencyConfig, "companyId"> | null {
  const privateIntegrationKey =
    readAgencyPrivateIntegrationKey() || readPrivateIntegrationKey();
  if (!privateIntegrationKey || !isGhlSyncEnabled()) return null;

  return {
    baseUrl: readApiBaseUrl(),
    apiVersion: readApiVersion(),
    privateIntegrationKey,
    snapshotId: readSnapshotId(),
  };
}

export function requireGhlConfig(locationIdOverride?: string | null): GhlConfig {
  const cfg = getGhlConfig(locationIdOverride);
  if (!cfg) {
    const key = readAgencyPrivateIntegrationKey() || readPrivateIntegrationKey();
    const locationId = locationIdOverride?.trim() || readLocationId();
    if (!key) {
      throw new Error(
        "GoHighLevel is not configured. Set PRIVATE_INTEGRATION_KEY or GHL_AGENCY_PRIVATE_INTEGRATION_KEY in backend/.env.local.",
      );
    }
    if (!locationId) {
      throw new Error(
        "GoHighLevel location is not configured. Set GHL_LOCATION_ID or provision a per-org location.",
      );
    }
    throw new Error("GoHighLevel sync is disabled. Set GHL_SYNC_ENABLED=1 to enable.");
  }
  return cfg;
}

export function requireGhlAgencyConfig(): GhlAgencyConfig {
  const cfg = getGhlAgencyConfig();
  if (!cfg) {
    const key = readAgencyPrivateIntegrationKey() || readPrivateIntegrationKey();
    const companyId = readAgencyCompanyId();
    if (!key) {
      throw new Error(
        "GoHighLevel agency token is not configured. Set GHL_AGENCY_PRIVATE_INTEGRATION_KEY in backend/.env.local.",
      );
    }
    if (!companyId) {
      throw new Error(
        "GoHighLevel agency company id is not configured. Set GHL_COMPANY_ID in backend/.env.local.",
      );
    }
    throw new Error("GoHighLevel sync is disabled. Set GHL_SYNC_ENABLED=1 to enable.");
  }
  return cfg;
}

/** Safe for API responses — never exposes the private integration key. */
export function getGhlPublicConfig(): {
  configured: boolean;
  syncEnabled: boolean;
  perOrgLocationsEnabled: boolean;
  perOrgProvisioningReady: boolean;
  hasPrivateIntegrationKey: boolean;
  hasAgencyPrivateIntegrationKey: boolean;
  hasLocationId: boolean;
  hasAgencyCompanyId: boolean;
  baseUrl: string | null;
  locationId: string | null;
  appBaseUrl: string;
  provider: "gohighlevel";
} {
  const hasPrivateIntegrationKey = Boolean(readPrivateIntegrationKey());
  const hasAgencyPrivateIntegrationKey = Boolean(readAgencyPrivateIntegrationKey());
  const locationId = readLocationId() || null;
  const hasAgencyCompanyId = Boolean(readAgencyCompanyId());
  const perOrgLocationsEnabled = isGhlPerOrgLocationsEnabled();
  const perOrgProvisioningReady =
    perOrgLocationsEnabled && hasGhlAgencyProvisioningCredentials();
  const cfg = getGhlConfig();
  const appBaseUrl = readGhlAppBaseUrl();

  return {
    configured: Boolean(cfg),
    syncEnabled: isGhlSyncEnabled(),
    perOrgLocationsEnabled,
    perOrgProvisioningReady,
    hasPrivateIntegrationKey,
    hasAgencyPrivateIntegrationKey,
    hasLocationId: Boolean(locationId),
    hasAgencyCompanyId,
    baseUrl:
      cfg?.baseUrl ??
      (hasPrivateIntegrationKey || hasAgencyPrivateIntegrationKey
        ? DEFAULT_BASE_URL
        : null),
    locationId,
    appBaseUrl,
    provider: "gohighlevel",
  };
}
