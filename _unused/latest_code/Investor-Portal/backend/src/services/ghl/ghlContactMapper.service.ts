import type { GhlContactRecord } from "./ghl.service.js";

export type GhlCrmContactJson = {
  id: string;
  ghlId: string;
  source: "ghl";
  readOnly: true;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  note: string;
  tags: string[];
  lists: string[];
  owners: string[];
  status: "active" | "suspended";
  createdByDisplayName: string;
  createdAt?: string;
  dealCount: number;
  ghlSource?: string;
  companyName?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  website?: string;
  timezone?: string;
  assignedTo?: string;
  contactType?: string;
  customFields?: Array<{ label: string; value: string }>;
  updatedAt?: string;
};

function splitGhlName(record: GhlContactRecord): {
  firstName: string;
  lastName: string;
} {
  const firstName = String(record.firstName ?? "").trim();
  const lastName = String(record.lastName ?? "").trim();
  if (firstName || lastName) return { firstName, lastName };

  const full = String(record.name ?? "").trim();
  if (!full) return { firstName: "", lastName: "" };
  const parts = full.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function formatAddress(record: GhlContactRecord): string {
  const parts = [
    record.address1,
    record.city,
    record.state,
    record.postalCode,
    record.country,
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  return parts.join(", ");
}

function mapCustomFields(
  record: GhlContactRecord,
): Array<{ label: string; value: string }> {
  if (!Array.isArray(record.customFields)) return [];
  const out: Array<{ label: string; value: string }> = [];
  for (const field of record.customFields) {
    const label = String(
      field.name ?? field.key ?? field.fieldKey ?? field.id ?? "Field",
    ).trim();
    const raw = field.value;
    const value =
      raw == null || raw === ""
        ? ""
        : typeof raw === "boolean"
          ? raw
            ? "Yes"
            : "No"
          : String(raw).trim();
    if (!label || !value) continue;
    out.push({ label, value });
  }
  return out;
}

export function mapGhlContactToCrmJson(
  record: GhlContactRecord,
): GhlCrmContactJson | null {
  const ghlId = String(record.id ?? "").trim();
  if (!ghlId) return null;

  const email = String(record.email ?? "").trim().toLowerCase();
  const { firstName, lastName } = splitGhlName(record);
  const tags = Array.isArray(record.tags)
    ? record.tags.map((tag) => String(tag ?? "").trim()).filter(Boolean)
    : [];

  return {
    id: `ghl:${ghlId}`,
    ghlId,
    source: "ghl",
    readOnly: true,
    firstName: firstName || email.split("@")[0] || "—",
    lastName,
    email,
    phone: String(record.phone ?? "").trim(),
    note: "",
    tags,
    lists: [],
    owners: ["GoHighLevel"],
    status: "active",
    createdByDisplayName: "GoHighLevel",
    createdAt:
      String(record.dateAdded ?? record.dateUpdated ?? "").trim() || undefined,
    dealCount: 0,
    ghlSource: String(record.source ?? "").trim() || undefined,
    companyName: String(record.companyName ?? "").trim() || undefined,
    address: formatAddress(record) || undefined,
    city: String(record.city ?? "").trim() || undefined,
    state: String(record.state ?? "").trim() || undefined,
    country: String(record.country ?? "").trim() || undefined,
    postalCode: String(record.postalCode ?? "").trim() || undefined,
    website: String(record.website ?? "").trim() || undefined,
    timezone: String(record.timezone ?? "").trim() || undefined,
    assignedTo: String(record.assignedTo ?? "").trim() || undefined,
    contactType: String(record.type ?? "").trim() || undefined,
    customFields: mapCustomFields(record),
    updatedAt:
      String(record.dateUpdated ?? "").trim() ||
      String(record.dateAdded ?? "").trim() ||
      undefined,
  };
}

export function mapGhlContactsToCrmJson(
  records: GhlContactRecord[],
): GhlCrmContactJson[] {
  const out: GhlCrmContactJson[] = [];
  for (const record of records) {
    const mapped = mapGhlContactToCrmJson(record);
    if (mapped) out.push(mapped);
  }
  return out;
}
