/**
 * Diagnose whether the configured GHL Private Integration token is agency-scoped.
 * Read-only: creates nothing. Run from the backend folder: node scripts/ghl-probe.mjs
 */
import { readFileSync } from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const env = {}
for (const line of readFileSync(path.join(backendRoot, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
  if (m) env[m[1]] = m[2].trim()
}

const token =
  env.GHL_AGENCY_PRIVATE_INTEGRATION_KEY || env.PRIVATE_INTEGRATION_KEY || ""
const locationId = env.GHL_LOCATION_ID || ""
const base = env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com"
const version = env.GHL_API_VERSION || "2021-07-28"

if (!token) {
  console.log("No token found in .env.local")
  process.exit(1)
}
console.log(`token: ${token.slice(0, 8)}…  (len ${token.length})`)
console.log(`locationId: ${locationId || "<none>"}\n`)

async function probe(label, path, init = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: version,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  })
  let body
  try {
    body = await res.json()
  } catch {
    body = null
  }
  console.log(`${label}\n  status: ${res.status} ${res.statusText}`)
  if (!res.ok) {
    console.log(`  message: ${body?.message ?? body?.error ?? "<none>"}`)
  }
  return { res, body }
}

// 1. Read one location — works for location-scoped AND agency tokens.
const one = await probe(
  `[1] GET /locations/${locationId}  (locations.readonly)`,
  `/locations/${encodeURIComponent(locationId)}`,
)
const companyId = one.body?.location?.companyId ?? null
console.log(`  companyId: ${companyId ?? "<not returned>"}\n`)

// 2. Agency-only endpoint — a location-scoped token cannot list the agency's locations.
if (companyId) {
  const search = await probe(
    "[2] GET /locations/search  (AGENCY scope test)",
    `/locations/search?companyId=${encodeURIComponent(companyId)}&limit=5`,
  )
  const n = search.body?.locations?.length
  if (search.res.ok) console.log(`  locations visible: ${n ?? "?"}`)
  console.log("")

  console.log(
    search.res.ok
      ? "=> Token CAN read agency locations. If POST /locations/ still 403, the\n   integration is missing the locations.write scope specifically."
      : "=> Token CANNOT read agency locations. It is location-scoped (or lacks\n   agency locations.readonly). Create the Private Integration at AGENCY\n   level with locations.write + locations.readonly.",
  )
} else {
  console.log(
    "=> Could not resolve companyId, so agency scope could not be tested.",
  )
}
