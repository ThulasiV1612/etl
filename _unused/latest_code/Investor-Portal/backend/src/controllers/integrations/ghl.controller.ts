import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import { db } from "../../database/db.js";
import { users } from "../../schema/schema.js";
import { isPlatformAdminRole } from "../../constants/roles.js";
import { getGhlPublicConfig } from "../../config/ghl.config.js";
import {
  getGhlContactById,
  listGhlContacts,
  listGhlContactsAcrossLocations,
  verifyGhlAgencyConnection,
  verifyGhlConnection,
} from "../../services/ghl/ghl.service.js";
import {
  mapGhlContactToCrmJson,
  mapGhlContactsToCrmJson,
} from "../../services/ghl/ghlContactMapper.service.js";
import { getContactById } from "../../services/contact/contact.service.js";
import { syncContactRowToGhl } from "../../services/ghl/ghlContactSync.service.js";
import {
  listProvisionedGhlLocationIds,
  provisionGhlLocationForCompany,
  resolveGhlLocationIdForOrganization,
} from "../../services/ghl/ghlLocation.service.js";
import {
  requestedOrganizationIdFromRequest,
  resolveActiveOrganizationIdForUser,
} from "../../services/org/orgResolution.service.js";

function queryStringParam(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) return String(raw[0] ?? "").trim();
  return "";
}

function queryIntParam(raw: unknown, fallback: number, max: number): number {
  const parsed = Number(queryStringParam(raw));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(1, Math.trunc(parsed)), max);
}

async function requirePlatformAdmin(
  req: Request,
  res: Response,
): Promise<{ id: string } | null> {
  const jwtUser = await getValidJwtUser(req);
  if (!jwtUser?.id) {
    res.status(401).json({ message: "Authorization required" });
    return null;
  }

  const [actor] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, jwtUser.id))
    .limit(1);

  const role =
    String(actor?.role ?? "").trim() || String(jwtUser.userRole ?? "").trim();
  if (!isPlatformAdminRole(role)) {
    res.status(403).json({ message: "Not allowed" });
    return null;
  }

  return { id: jwtUser.id };
}

async function viewerRoleForRequest(
  userId: string,
  jwtUserRole?: string,
): Promise<string> {
  const [actor] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return String(actor?.role ?? "").trim() || String(jwtUserRole ?? "").trim();
}

async function resolveGhlLocationForRequest(
  req: Request,
  userId: string,
): Promise<string | null> {
  const requestedOrgId = requestedOrganizationIdFromRequest(req);
  const activeOrgId = await resolveActiveOrganizationIdForUser(
    userId,
    requestedOrgId,
  );
  return resolveGhlLocationIdForOrganization(activeOrgId);
}

/**
 * GET /integrations/ghl/config
 * Public GHL config for the portal (never exposes the private integration key).
 */
export async function getGhlIntegrationConfig(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  res.status(200).json(getGhlPublicConfig());
}

/**
 * GET /integrations/ghl/verify
 * Confirms GHL credentials and location access (platform admin only).
 */
export async function getGhlIntegrationVerify(
  req: Request,
  res: Response,
): Promise<void> {
  const actor = await requirePlatformAdmin(req, res);
  if (!actor) return;

  const publicCfg = getGhlPublicConfig();
  if (!publicCfg.syncEnabled) {
    res.status(503).json({
      ...publicCfg,
      message: "GoHighLevel sync is disabled. Set GHL_SYNC_ENABLED=1.",
    });
    return;
  }

  const locationId = await resolveGhlLocationForRequest(req, actor.id);
  if (!locationId) {
    res.status(503).json({
      ...publicCfg,
      message: publicCfg.perOrgLocationsEnabled
        ? "No GHL sub-account is provisioned for this organization yet."
        : "GoHighLevel location is not configured. Set GHL_LOCATION_ID in backend/.env.local.",
    });
    return;
  }

  try {
    const result = await verifyGhlConnection(locationId);
    const agency = publicCfg.perOrgProvisioningReady
      ? await verifyGhlAgencyConnection().catch(() => null)
      : null;
    res.status(200).json({
      ...publicCfg,
      ...result,
      agencyHealthy: agency?.healthy ?? false,
      agencyCompanyId: agency?.companyId ?? null,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "GoHighLevel connection failed";
    res.status(502).json({ ...publicCfg, message });
  }
}

/**
 * GET /integrations/ghl/contacts
 * Pull contacts from GoHighLevel for the CRM view.
 */
export async function getGhlIntegrationContacts(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const publicCfg = getGhlPublicConfig();
  if (!publicCfg.syncEnabled) {
    res.status(503).json({
      ...publicCfg,
      contacts: [],
      meta: { hasMore: false, startAfterId: null },
      message: "GoHighLevel sync is disabled.",
    });
    return;
  }

  const role = await viewerRoleForRequest(user.id, user.userRole);
  const isPlatformAdmin = isPlatformAdminRole(role);
  const limit = queryIntParam(req.query.limit, 100, 100);
  const startAfterId = queryStringParam(
    req.query.startAfterId ?? req.query.start_after_id,
  );
  const query = queryStringParam(req.query.query ?? req.query.q);

  try {
    if (isPlatformAdmin) {
      const locationIds = await listProvisionedGhlLocationIds();
      if (locationIds.length === 0) {
        res.status(503).json({
          ...publicCfg,
          contacts: [],
          meta: { hasMore: false, startAfterId: null },
          message:
            "GoHighLevel is not fully configured. Set PRIVATE_INTEGRATION_KEY and GHL_LOCATION_ID, or provision org sub-accounts.",
        });
        return;
      }

      const result =
        locationIds.length === 1
          ? await listGhlContacts({
              limit,
              startAfterId: startAfterId || undefined,
              query: query || undefined,
              locationId: locationIds[0],
            })
          : await listGhlContactsAcrossLocations(locationIds, {
              limit,
              query: query || undefined,
            });

      const contacts = mapGhlContactsToCrmJson(result.contacts);
      res.status(200).json({
        configured: true,
        scope: "all",
        locationIds,
        contacts,
        meta: result.meta,
      });
      return;
    }

    const locationId = await resolveGhlLocationForRequest(req, user.id);
    if (!locationId) {
      res.status(503).json({
        ...publicCfg,
        contacts: [],
        meta: { hasMore: false, startAfterId: null },
        message: publicCfg.perOrgLocationsEnabled
          ? "No GHL sub-account is provisioned for this organization yet."
          : "GoHighLevel is not fully configured. Set PRIVATE_INTEGRATION_KEY and GHL_LOCATION_ID.",
      });
      return;
    }

    const result = await listGhlContacts({
      limit,
      startAfterId: startAfterId || undefined,
      query: query || undefined,
      locationId,
    });
    const contacts = mapGhlContactsToCrmJson(result.contacts);
    res.status(200).json({
      configured: true,
      scope: "organization",
      locationId,
      contacts,
      meta: result.meta,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load GoHighLevel contacts";
    res.status(502).json({
      ...publicCfg,
      contacts: [],
      meta: { hasMore: false, startAfterId: null },
      message,
    });
  }
}

/**
 * GET /integrations/ghl/contacts/:ghlContactId
 * Fetch one GoHighLevel contact via the server private integration key (no GHL login).
 */
export async function getGhlIntegrationContactById(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }

  const publicCfg = getGhlPublicConfig();
  if (!publicCfg.syncEnabled) {
    res.status(503).json({
      ...publicCfg,
      message: "GoHighLevel sync is disabled.",
    });
    return;
  }

  const role = await viewerRoleForRequest(user.id, user.userRole);
  const isPlatformAdmin = isPlatformAdminRole(role);
  const locationId = isPlatformAdmin
    ? null
    : await resolveGhlLocationForRequest(req, user.id);

  if (!isPlatformAdmin && !locationId) {
    res.status(503).json({
      ...publicCfg,
      message: "GoHighLevel is not fully configured for this organization.",
    });
    return;
  }

  let ghlContactId = String(req.params.ghlContactId ?? "").trim();
  if (ghlContactId.toLowerCase().startsWith("ghl:")) {
    ghlContactId = ghlContactId.slice(4).trim();
  }
  if (!ghlContactId) {
    res.status(400).json({ message: "GoHighLevel contact id required" });
    return;
  }

  try {
    let record = locationId
      ? await getGhlContactById(ghlContactId, locationId)
      : null;

    if (!record && isPlatformAdmin) {
      const locationIds = await listProvisionedGhlLocationIds();
      for (const locId of locationIds) {
        if (locId === locationId) continue;
        record = await getGhlContactById(ghlContactId, locId);
        if (record) break;
      }
    }

    if (!record) {
      res.status(404).json({ message: "GoHighLevel contact not found" });
      return;
    }
    const contact = mapGhlContactToCrmJson(record);
    if (!contact) {
      res.status(404).json({ message: "GoHighLevel contact not found" });
      return;
    }
    res.status(200).json({ contact });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load GoHighLevel contact";
    res.status(502).json({ message });
  }
}

/**
 * POST /integrations/ghl/sync-contact/:contactId
 * Manually push a SyndicationX CRM contact to GHL (platform admin only).
 */
export async function postGhlSyncContact(
  req: Request,
  res: Response,
): Promise<void> {
  const actor = await requirePlatformAdmin(req, res);
  if (!actor) return;

  const contactId = String(req.params.contactId ?? "").trim();
  if (!contactId) {
    res.status(400).json({ message: "Contact id required" });
    return;
  }

  const publicCfg = getGhlPublicConfig();
  if (!publicCfg.syncEnabled) {
    res.status(503).json({
      ...publicCfg,
      message: "GoHighLevel sync is disabled.",
    });
    return;
  }

  const row = await getContactById(contactId);
  if (!row) {
    res.status(404).json({ message: "Contact not found" });
    return;
  }

  try {
    await syncContactRowToGhl(row);
    res.status(200).json({
      message: "Contact synced to GoHighLevel",
      contactId: row.id,
      email: row.email,
      organizationId: row.organizationId,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "GoHighLevel contact sync failed";
    res.status(502).json({ message });
  }
}

/**
 * POST /integrations/ghl/provision-company/:companyId
 * Create or retry a GHL sub-account for an organization (platform admin only).
 */
export async function postGhlProvisionCompany(
  req: Request,
  res: Response,
): Promise<void> {
  const actor = await requirePlatformAdmin(req, res);
  if (!actor) return;

  const companyId = String(req.params.companyId ?? "").trim();
  if (!companyId) {
    res.status(400).json({ message: "Company id required" });
    return;
  }

  const publicCfg = getGhlPublicConfig();
  if (!publicCfg.perOrgLocationsEnabled) {
    res.status(400).json({
      message:
        "Per-org GHL locations are disabled. Set GHL_PER_ORG_LOCATIONS=1 to enable.",
    });
    return;
  }

  const result = await provisionGhlLocationForCompany(companyId);
  if (!result.ok) {
    res.status(502).json({ message: result.message });
    return;
  }

  res.status(200).json({
    message: "GoHighLevel sub-account provisioned",
    companyId,
    locationId: result.locationId,
  });
}
