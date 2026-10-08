import {
  getGhlAgencyConfig,
  getGhlAgencyConfigPartial,
  readDefaultGhlLocationId,
  requireGhlConfig,
  type GhlAgencyConfig,
  type GhlConfig,
} from "../../config/ghl.config.js";

type GhlErrorBody = {
  message?: string;
  error?: string;
  statusCode?: number;
};

export type GhlContactUpsertInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  source?: string;
  tags?: string[];
  /** Target GHL sub-account; defaults to env GHL_LOCATION_ID. */
  locationId?: string | null;
};

export type GhlContactRecord = {
  id?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  source?: string;
  dateAdded?: string;
  dateUpdated?: string;
  companyName?: string;
  address1?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  website?: string;
  timezone?: string;
  assignedTo?: string;
  type?: string;
  dnd?: boolean;
  customFields?: Array<{
    id?: string;
    key?: string;
    fieldKey?: string;
    name?: string;
    value?: string | number | boolean | null;
  }>;
};

export type GhlListContactsParams = {
  limit?: number;
  startAfterId?: string;
  query?: string;
  locationId?: string | null;
};

export type GhlListContactsResult = {
  contacts: GhlContactRecord[];
  meta: {
    total?: number;
    startAfterId?: string | null;
    hasMore: boolean;
  };
};

export type GhlCreateLocationInput = {
  name: string;
  snapshotId?: string | null;
};

export type GhlCreateLocationResult = {
  locationId: string;
  locationName: string | null;
};

type GhlListContactsResponse = {
  contacts?: GhlContactRecord[];
  meta?: {
    total?: number;
    startAfterId?: string;
    nextPageUrl?: string;
  };
};

type GhlUpsertContactResponse = {
  contact?: GhlContactRecord;
  new?: boolean;
};

type GhlCreateLocationResponse = {
  location?: { id?: string; name?: string };
  id?: string;
  name?: string;
};

function buildUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/$/, "")}${normalizedPath}`;
}

function buildGhlHeaders(
  cfg: Pick<GhlConfig, "privateIntegrationKey" | "apiVersion">,
  options?: { locationId?: string | null; extra?: HeadersInit },
): Headers {
  const headers = new Headers(options?.extra);
  headers.set("Authorization", `Bearer ${cfg.privateIntegrationKey}`);
  headers.set("Version", cfg.apiVersion);
  headers.set("Accept", "application/json");
  const locationId = options?.locationId?.trim();
  if (locationId) headers.set("locationId", locationId);
  return headers;
}

async function parseGhlError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as GhlErrorBody;
    const msg = body.message?.trim() || body.error?.trim();
    if (res.status === 401) {
      return (
        msg ||
        "GoHighLevel private integration key is invalid. Regenerate the token in GHL → Settings → Private Integrations."
      );
    }
    if (res.status === 404) {
      return msg || "GoHighLevel resource not found. Check the location id.";
    }
    if (
      msg &&
      /not authorized for this scope|insufficient scope|forbidden/i.test(msg)
    ) {
      return (
        `${msg} Creating sub-accounts requires an agency-scoped Private Integration token with locations.write (GHL_AGENCY_PRIVATE_INTEGRATION_KEY). A location-scoped PRIVATE_INTEGRATION_KEY cannot call POST /locations/.`
      );
    }
    if (msg) return msg;
  } catch {
    /* ignore */
  }
  return `GoHighLevel API error (${res.status})`;
}

async function ghlFetch<T = unknown>(
  cfg: Pick<GhlConfig, "baseUrl" | "apiVersion" | "privateIntegrationKey">,
  path: string,
  options: RequestInit = {},
  headerOptions?: { locationId?: string | null },
): Promise<T> {
  const url = buildUrl(cfg.baseUrl, path);
  const headers = buildGhlHeaders(cfg, {
    locationId: headerOptions?.locationId,
    extra: options.headers,
  });
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `GoHighLevel API is not reachable at ${cfg.baseUrl}. ${message}`,
      { cause: err },
    );
  }

  if (!response.ok) {
    throw new Error(await parseGhlError(response));
  }

  if (response.status === 204) return null as T;
  return (await response.json()) as T;
}

export async function ghlRequest<T = unknown>(
  path: string,
  options: RequestInit = {},
  locationId?: string | null,
): Promise<T> {
  const cfg = requireGhlConfig(locationId);
  return ghlFetch<T>(cfg, path, options, { locationId: cfg.locationId });
}

async function ghlAgencyRequest<T = unknown>(
  cfg: GhlAgencyConfig,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  return ghlFetch<T>(cfg, path, options);
}

/**
 * GHL uses two ids:
 * - location id (`GHL_LOCATION_ID`) = one sub-account
 * - company id (`GHL_COMPANY_ID`) = parent agency — required to create new sub-accounts
 *
 * When `GHL_COMPANY_ID` is omitted, read it from GET /locations/:GHL_LOCATION_ID.
 */
export async function resolveGhlAgencyCompanyId(): Promise<string> {
  const existing = getGhlAgencyConfig()?.companyId?.trim();
  if (existing) return existing;

  const locationId = readDefaultGhlLocationId();
  if (!locationId) {
    throw new Error(
      "GoHighLevel agency company id is not configured. Set GHL_COMPANY_ID or GHL_LOCATION_ID in backend/.env.local.",
    );
  }

  const data = await ghlFetch<{ location?: { companyId?: string } }>(
    requireGhlConfig(locationId),
    `/locations/${encodeURIComponent(locationId)}`,
    { method: "GET" },
    { locationId },
  );
  const companyId = data?.location?.companyId?.trim();
  if (!companyId) {
    throw new Error(
      `GoHighLevel did not return companyId for location ${locationId}. Set GHL_COMPANY_ID explicitly.`,
    );
  }
  return companyId;
}

async function requireGhlAgencyConfigResolved(): Promise<GhlAgencyConfig> {
  const direct = getGhlAgencyConfig();
  if (direct) return direct;

  const partial = getGhlAgencyConfigPartial();
  if (!partial) {
    throw new Error(
      "GoHighLevel agency token is not configured. Set GHL_AGENCY_PRIVATE_INTEGRATION_KEY or PRIVATE_INTEGRATION_KEY in backend/.env.local.",
    );
  }

  const companyId = await resolveGhlAgencyCompanyId();
  return { ...partial, companyId };
}

/** Create a new GHL sub-account under the agency (Agency Pro API). */
export async function createGhlLocation(
  input: GhlCreateLocationInput,
): Promise<GhlCreateLocationResult> {
  const cfg = await requireGhlAgencyConfigResolved();
  const name = String(input.name ?? "").trim();
  if (!name) {
    throw new Error("GoHighLevel location name is required");
  }

  const body: Record<string, unknown> = {
    name,
    companyId: cfg.companyId,
    settings: {
      allowDuplicateContact: false,
      allowDuplicateOpportunity: false,
      allowFacebookNameMerge: false,
      disableContactTimezone: false,
    },
  };

  const snapshotId = input.snapshotId?.trim() || cfg.snapshotId;
  if (snapshotId) body.snapshotId = snapshotId;

  const data = await ghlAgencyRequest<GhlCreateLocationResponse>(cfg, "/locations/", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const locationId =
    data?.location?.id?.trim() || data?.id?.trim() || "";
  if (!locationId) {
    throw new Error("GoHighLevel did not return a location id");
  }

  return {
    locationId,
    locationName: data?.location?.name?.trim() || data?.name?.trim() || name,
  };
}

/** Upsert a contact in a GHL sub-account. */
export async function upsertGhlContact(
  input: GhlContactUpsertInput,
): Promise<{ contactId: string | null; created: boolean }> {
  const locationId = input.locationId?.trim() || null;
  const cfg = requireGhlConfig(locationId);
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!email) {
    throw new Error("GoHighLevel contact email is required");
  }

  const tags = [
    ...new Set(
      (input.tags ?? [])
        .map((tag) => String(tag ?? "").trim())
        .filter(Boolean),
    ),
  ];

  const body: Record<string, unknown> = {
    locationId: cfg.locationId,
    firstName: String(input.firstName ?? "").trim() || email.split("@")[0],
    lastName: String(input.lastName ?? "").trim(),
    email,
    source: String(input.source ?? "SyndicationX").trim() || "SyndicationX",
  };

  const phone = String(input.phone ?? "").trim();
  if (phone) body.phone = phone;
  if (tags.length) body.tags = tags;

  const data = await ghlFetch<GhlUpsertContactResponse>(
    cfg,
    "/contacts/upsert",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    { locationId: cfg.locationId },
  );

  return {
    contactId: data?.contact?.id?.trim() || null,
    created: Boolean(data?.new),
  };
}

/** List contacts from a GHL sub-account. */
export async function listGhlContacts(
  params: GhlListContactsParams = {},
): Promise<GhlListContactsResult> {
  const locationId = params.locationId?.trim() || null;
  const cfg = requireGhlConfig(locationId);
  const limit = Math.min(Math.max(1, Math.trunc(params.limit ?? 100)), 100);
  const searchParams = new URLSearchParams({
    locationId: cfg.locationId,
    limit: String(limit),
  });
  const startAfterId = params.startAfterId?.trim();
  if (startAfterId) searchParams.set("startAfterId", startAfterId);
  const query = params.query?.trim();
  if (query) searchParams.set("query", query);

  const data = await ghlFetch<GhlListContactsResponse>(
    cfg,
    `/contacts/?${searchParams.toString()}`,
    { method: "GET" },
    { locationId: cfg.locationId },
  );

  const contacts = Array.isArray(data?.contacts) ? data.contacts : [];
  const nextStartAfterId = data?.meta?.startAfterId?.trim() || null;

  return {
    contacts,
    meta: {
      total: data?.meta?.total,
      startAfterId: nextStartAfterId,
      hasMore: contacts.length >= limit,
    },
  };
}

const MAX_GHL_PAGES_PER_LOCATION = 20;

/** Platform admin: merge contacts from every provisioned GHL sub-account. */
export async function listGhlContactsAcrossLocations(
  locationIds: string[],
  params: GhlListContactsParams = {},
): Promise<GhlListContactsResult> {
  const uniqueLocationIds = [
    ...new Set(locationIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (uniqueLocationIds.length === 0) {
    return {
      contacts: [],
      meta: { hasMore: false, startAfterId: null, total: 0 },
    };
  }

  const seen = new Set<string>();
  const contacts: GhlContactRecord[] = [];
  const query = params.query?.trim();

  for (const locationId of uniqueLocationIds) {
    let startAfterId = params.startAfterId?.trim();
    for (let page = 0; page < MAX_GHL_PAGES_PER_LOCATION; page += 1) {
      const batch = await listGhlContacts({
        locationId,
        limit: params.limit,
        startAfterId: startAfterId || undefined,
        query: query || undefined,
      });

      for (const record of batch.contacts) {
        const id = record.id?.trim();
        if (id) {
          if (seen.has(id)) continue;
          seen.add(id);
        }
        contacts.push(record);
      }

      if (!batch.meta.hasMore || !batch.meta.startAfterId) break;
      startAfterId = batch.meta.startAfterId ?? undefined;
    }
  }

  return {
    contacts,
    meta: {
      total: contacts.length,
      startAfterId: null,
      hasMore: false,
    },
  };
}

/** Fetch a single contact from GoHighLevel. */
export async function getGhlContactById(
  contactId: string,
  locationId?: string | null,
): Promise<GhlContactRecord | null> {
  const id = String(contactId ?? "").trim();
  if (!id) return null;

  const cfg = requireGhlConfig(locationId);
  const data = await ghlFetch<{ contact?: GhlContactRecord }>(
    cfg,
    `/contacts/${encodeURIComponent(id)}`,
    { method: "GET" },
    { locationId: cfg.locationId },
  );
  return data?.contact ?? null;
}

/** Validate credentials by loading a sub-account. */
export async function verifyGhlConnection(
  locationId?: string | null,
): Promise<{
  healthy: boolean;
  locationName: string | null;
  locationId: string;
}> {
  const cfg = requireGhlConfig(locationId);
  const data = await ghlFetch<{ location?: { name?: string } }>(
    cfg,
    `/locations/${encodeURIComponent(cfg.locationId)}`,
    { method: "GET" },
    { locationId: cfg.locationId },
  );
  const locationName = data?.location?.name?.trim() || null;
  return { healthy: true, locationName, locationId: cfg.locationId };
}

/** Check agency credentials without creating a location. */
export async function verifyGhlAgencyConnection(): Promise<{
  healthy: boolean;
  companyId: string;
}> {
  const cfg = getGhlAgencyConfig();
  if (!cfg) {
    throw new Error("GoHighLevel agency configuration is incomplete");
  }
  return { healthy: true, companyId: cfg.companyId };
}
