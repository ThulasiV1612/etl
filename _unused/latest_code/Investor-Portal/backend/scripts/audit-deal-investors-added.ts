/**
 * Audit Deal Members “Investors added” totals for one deal (or every deal).
 *
 * Uses the same backend helper as GET /deals/:dealId/members so results match the UI.
 *
 * Usage (from backend/):
 *   npx tsx scripts/audit-deal-investors-added.ts <dealId-or-name>
 *   npx tsx scripts/audit-deal-investors-added.ts "Wildflower Assisted Living"
 *   npx tsx scripts/audit-deal-investors-added.ts --all
 *   npm run audit:investors-added -- Wildflower
 *
 * Exit code 1 when any priced LP commitment is not attributed to a deal member
 * (and is not that member’s own seat). Use --allow-orphans to always exit 0.
 */
import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.join(scriptDir, "..")
dotenv.config({ path: path.join(backendRoot, ".env.local") })
dotenv.config({ path: path.join(backendRoot, ".env") })

const { pool } = await import("../src/database/db.js")
const {
  formatCommittedUsdWhole,
  sumCommittedFromInvestorsAddedByMemberContacts,
} = await import("../src/services/deal/dealInvestment.service.js")

function normalizeContactKey(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
}

function money(n: number): string {
  return formatCommittedUsdWhole(n)
}

function parseArgs(argv: string[]): {
  query: string
  all: boolean
  allowOrphans: boolean
} {
  const flags = new Set(
    argv.filter((a) => a.startsWith("-")).map((a) => a.toLowerCase()),
  )
  const positional = argv.filter((a) => !a.startsWith("-"))
  return {
    query: positional.join(" ").trim(),
    all: flags.has("--all") || flags.has("-a"),
    allowOrphans: flags.has("--allow-orphans"),
  }
}

async function resolveDeals(query: string, all: boolean): Promise<
  { id: string; name: string }[]
> {
  if (all) {
    const res = await pool.query<{ id: string; name: string }>(
      `SELECT d.id::text AS id, coalesce(nullif(trim(d.deal_name), ''), d.id::text) AS name
       FROM add_deal_form d
       WHERE EXISTS (SELECT 1 FROM deal_member dm WHERE dm.deal_id = d.id)
          OR EXISTS (SELECT 1 FROM deal_lp_investor lp WHERE lp.deal_id = d.id)
       ORDER BY lower(coalesce(d.deal_name, '')), d.created_at DESC NULLS LAST`,
    )
    return res.rows
  }

  const q = String(query ?? "").trim()
  if (!q) {
    console.error(
      [
        "Missing deal id or name.",
        "",
        "Usage:",
        '  npx tsx scripts/audit-deal-investors-added.ts <dealId-or-name>',
        '  npx tsx scripts/audit-deal-investors-added.ts --all',
        '  npm run audit:investors-added -- "Wildflower"',
      ].join("\n"),
    )
    process.exit(2)
  }

  const uuidLike =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)

  if (uuidLike) {
    const res = await pool.query<{ id: string; name: string }>(
      `SELECT d.id::text AS id, coalesce(nullif(trim(d.deal_name), ''), d.id::text) AS name
       FROM add_deal_form d
       WHERE d.id = $1::uuid`,
      [q],
    )
    if (res.rows.length === 0) {
      console.error(`No deal found for id: ${q}`)
      process.exit(2)
    }
    return res.rows
  }

  const res = await pool.query<{ id: string; name: string }>(
    `SELECT d.id::text AS id, coalesce(nullif(trim(d.deal_name), ''), d.id::text) AS name
     FROM add_deal_form d
     WHERE lower(d.deal_name) = lower($1)
        OR lower(d.deal_name) LIKE '%' || lower($1) || '%'
     ORDER BY
       CASE WHEN lower(d.deal_name) = lower($1) THEN 0 ELSE 1 END,
       length(d.deal_name),
       d.created_at DESC NULLS LAST
     LIMIT 10`,
    [q],
  )
  if (res.rows.length === 0) {
    console.error(`No deal found matching name: ${q}`)
    process.exit(2)
  }
  if (res.rows.length > 1 && res.rows[0]!.name.toLowerCase() !== q.toLowerCase()) {
    console.log("Multiple deals matched; using the first. Matches:")
    for (const row of res.rows) console.log(`  - ${row.name}  (${row.id})`)
    console.log("")
  }
  return [res.rows[0]!]
}

async function auditDeal(deal: { id: string; name: string }): Promise<{
  orphanAmount: number
}> {
  const membersRes = await pool.query<{
    ck: string
    role: string
    first_name: string
    last_name: string
    email: string
  }>(
    `SELECT
       lower(trim(dm.contact_member_id)) AS ck,
       coalesce(dm.deal_member_role, '') AS role,
       coalesce(c.first_name, '') AS first_name,
       coalesce(c.last_name, '') AS last_name,
       coalesce(c.email, '') AS email
     FROM deal_member dm
     LEFT JOIN contact c ON c.id::text = trim(both from dm.contact_member_id)
     WHERE dm.deal_id = $1::uuid
     ORDER BY lower(dm.deal_member_role), lower(c.last_name), lower(c.first_name)`,
    [deal.id],
  )

  const memberKeys = new Set(
    membersRes.rows.map((r) => r.ck).filter(Boolean),
  )

  const sums = await sumCommittedFromInvestorsAddedByMemberContacts(
    deal.id,
    memberKeys,
  )

  const lpRes = await pool.query<{
    ck: string
    adder: string | null
    amount: string
  }>(
    `WITH inv_totals AS (
       SELECT
         lower(trim(di.contact_id)) AS ck,
         sum(
           coalesce(
             nullif(regexp_replace(coalesce(di.commitment_amount, ''), '[^0-9.-]', '', 'g'), ''),
             '0'
           )::double precision
           + coalesce(
             (
               SELECT sum(
                 coalesce(
                   nullif(regexp_replace(elem #>> '{}', '[^0-9.-]', '', 'g'), ''),
                   '0'
                 )::double precision
               )
               FROM jsonb_array_elements(
                 coalesce(di.extra_contribution_amounts, '[]'::jsonb)
               ) AS elem
             ),
             0
           )
         ) AS inv_sum
       FROM deal_investment di
       WHERE di.deal_id = $1::uuid
         AND trim(coalesce(di.contact_id, '')) <> ''
         AND trim(di.contact_id) <> '__portal_investment_autosave__'
       GROUP BY 1
     )
     SELECT
       lower(trim(lp.contact_member_id)) AS ck,
       lower(lp.added_by::text) AS adder,
       (
         CASE
           WHEN it.ck IS NOT NULL THEN coalesce(it.inv_sum, 0)
           ELSE coalesce(
             nullif(regexp_replace(coalesce(lp.committed_amount, ''), '[^0-9.-]', '', 'g'), ''),
             '0'
           )::double precision
         END
       )::text AS amount
     FROM deal_lp_investor lp
     LEFT JOIN inv_totals it ON it.ck = lower(trim(lp.contact_member_id))
     WHERE lp.deal_id = $1::uuid`,
    [deal.id],
  )

  let lpTotal = 0
  let memberColumnTotal = 0
  for (const row of lpRes.rows) {
    const n = parseFloat(String(row.amount ?? ""))
    if (Number.isFinite(n)) lpTotal += n
  }

  console.log("=".repeat(72))
  console.log(`Deal: ${deal.name}`)
  console.log(`Id:   ${deal.id}`)
  console.log(
    `Members: ${membersRes.rows.length}   LP investor rows: ${lpRes.rows.length}   LP priced total: ${money(lpTotal)}`,
  )
  console.log("-".repeat(72))
  console.log("Deal Members → Investors added (same as UI):")

  if (membersRes.rows.length === 0) {
    console.log("  (no deal_member rows — column cannot attribute sponsors)")
  }

  for (const m of membersRes.rows) {
    const ck = normalizeContactKey(m.ck)
    const amount = ck ? (sums.get(ck) ?? 0) : 0
    memberColumnTotal += amount
    const name = `${m.first_name} ${m.last_name}`.trim() || ck || "—"
    console.log(
      `  ${money(amount).padStart(12)}  |  ${(m.role || "—").padEnd(14)}  |  ${name}  <${m.email || "—"}>`,
    )
  }

  console.log("-".repeat(72))
  console.log(`Sum of Investors added column: ${money(memberColumnTotal)}`)

  const attributedAdders = new Set<string>()
  const seedRes = await pool.query<{ ck: string; uid: string }>(
    `SELECT lower(trim(dm.contact_member_id)) AS ck, lower(u.id::text) AS uid
     FROM deal_member dm
     INNER JOIN users u ON (
       trim(dm.contact_member_id) = u.id::text
       OR EXISTS (
         SELECT 1 FROM contact c
         WHERE c.id::text = trim(both from dm.contact_member_id)
           AND lower(trim(c.email)) = lower(trim(u.email))
       )
     )
     WHERE dm.deal_id = $1::uuid`,
    [deal.id],
  )
  for (const row of seedRes.rows) {
    if (row.uid) attributedAdders.add(row.uid)
  }

  // Name/email fallback seeds + equivalents (mirrors service for orphan detection).
  const { listEquivalentPortalUserIdsForUser } = await import(
    "../src/services/deal/dealMemberScope.service.js"
  )
  for (const m of membersRes.rows) {
    const ck = normalizeContactKey(m.ck)
    let seed = seedRes.rows.find((r) => r.ck === ck)?.uid
    if (!seed && m.email?.includes("@")) {
      const u = await pool.query<{ id: string }>(
        `SELECT lower(id::text) AS id FROM users WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1`,
        [m.email],
      )
      seed = u.rows[0]?.id
    }
    if (!seed && m.first_name && m.last_name) {
      const u = await pool.query<{ id: string }>(
        `SELECT lower(u.id::text) AS id
         FROM users u
         WHERE lower(trim(coalesce(u.first_name, ''))) = lower(trim($1))
           AND lower(trim(coalesce(u.last_name, ''))) = lower(trim($2))
         ORDER BY
           CASE WHEN EXISTS (
             SELECT 1 FROM deal_lp_investor lp
             WHERE lp.deal_id = $3::uuid AND lp.added_by = u.id
           ) THEN 0 ELSE 1 END
         LIMIT 1`,
        [m.first_name, m.last_name, deal.id],
      )
      seed = u.rows[0]?.id
    }
    if (!seed) continue
    attributedAdders.add(seed)
    for (const id of await listEquivalentPortalUserIdsForUser(seed)) {
      attributedAdders.add(String(id).toLowerCase())
    }
  }

  const orphans: { ck: string; adder: string | null; amount: number }[] = []
  let orphanAmount = 0
  for (const row of lpRes.rows) {
    const amount = parseFloat(String(row.amount ?? ""))
    if (!Number.isFinite(amount) || amount === 0) continue
    const ck = normalizeContactKey(row.ck)
    if (memberKeys.has(ck)) continue
    const adder = row.adder ? String(row.adder).toLowerCase() : ""
    if (adder && attributedAdders.has(adder)) continue
    orphans.push({ ck, adder: adder || null, amount })
    orphanAmount += amount
  }

  if (orphans.length === 0) {
    console.log("Orphans: none (all priced LP commitments map to a deal member or own seat)")
  } else {
    console.log(
      `Orphans: ${orphans.length} priced LP row(s) not attributed to any deal member (${money(orphanAmount)})`,
    )
    for (const o of orphans.slice(0, 15)) {
      console.log(
        `  ${money(o.amount).padStart(12)}  contact=${o.ck}  added_by=${o.adder ?? "(null)"}`,
      )
    }
    if (orphans.length > 15)
      console.log(`  … ${orphans.length - 15} more`)
  }
  console.log("")
  return { orphanAmount }
}

const args = parseArgs(process.argv.slice(2))

try {
  const deals = await resolveDeals(args.query, args.all)
  let totalOrphans = 0
  for (const deal of deals) {
    const { orphanAmount } = await auditDeal(deal)
    totalOrphans += orphanAmount
  }

  if (args.all) console.log(`Audited ${deals.length} deal(s).`)

  if (totalOrphans > 0 && !args.allowOrphans) {
    console.error(
      `FAIL: unmatched Investors-added amount ${money(totalOrphans)} (use --allow-orphans to ignore)`,
    )
    process.exitCode = 1
  } else {
    console.log("Done.")
  }
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  await pool.end().catch(() => undefined)
}
