const xlsx = require('xlsx')
const {
  PROFILE_SHEET_ALIASES,
  ADDRESS_COLUMNS,
  BENEFICIARY_COLUMNS,
  PROFILE_COLUMNS,
} = require('../../constants/investorProfile.constants')
const {
  isBlank,
  cleanRawValue,
  parseYesNo,
  getCellFromRow,
  findSheetName,
  readSheetRows,
  listFilledExcelColumns,
} = require('./excelRowUtils')
const { normalizeZipValue } = require('./validationService')
const { getPool } = require('../dbService')
const { generateUniqueUuid, isValidUuid } = require('./uuidUtils')
const { logAudit } = require('../logger')
const {
  resolveUserEmailKey,
  isPlaceholderEmail,
} = require('./inviteUserEtlService')

function normalizeDistributionMethod(value) {
  const raw = cleanRawValue(value).toLowerCase()
  if (!raw) return ''
  if (raw.includes('ach') || raw === 'wire ach') return 'ach'
  if (raw.includes('check') || raw.includes('cheque')) return 'check'
  return raw
}

function normalizeAccountType(value) {
  const raw = cleanRawValue(value).toLowerCase()
  if (!raw) return ''
  if (raw.includes('saving')) return 'savings'
  if (raw.includes('check')) return 'checking'
  return raw
}

function formatUserDisplayName(row) {
  if (!row) return ''
  const first = cleanRawValue(row.first_name)
  const last = cleanRawValue(row.last_name)
  const full = [first, last].filter(Boolean).join(' ').trim()
  if (full) return full
  return cleanRawValue(row.username) || cleanRawValue(row.email) || ''
}

function looksLikeCompanyOrSystemLabel(value) {
  const raw = cleanRawValue(value)
  if (!raw) return true
  const lower = raw.toLowerCase()
  if (lower === 'etl' || lower === 'system' || lower === 'admin') return true
  // Company-style labels (e.g. "Massive Capital") — not a person first/last name
  if (
    /\b(capital|partners|llc|inc|corp|ltd|lp|company|management|investments|fund)\b/i.test(
      raw
    )
  ) {
    return true
  }
  return false
}

/**
 * user_investor_profiles.added_by is a display string (not a FK).
 * Prefer real person first+last name (LP sponsor, then profile owner).
 * Skip company mailbox names like "Massive Capital" (investors@massive.capital).
 */
async function resolveProfileAddedByDisplay(db, { userId, dealId, excelAddedBy }) {
  const fromExcel = cleanRawValue(excelAddedBy)

  if (dealId && isValidUuid(dealId) && userId && isValidUuid(String(userId))) {
    const sponsor = await db.query(
      `SELECT u.first_name, u.last_name, u.username, u.email
       FROM deal_lp_investor lp
       JOIN users u ON u.id = lp.added_by
       WHERE lp.deal_id = $1
         AND TRIM(lp.contact_member_id) = $2
         AND lp.added_by IS NOT NULL
       ORDER BY lp.created_at DESC
       LIMIT 1`,
      [dealId, String(userId)]
    )
    const sponsorName = formatUserDisplayName(sponsor.rows[0])
    // e.g. investors@massive.capital stored as first=Massive last=Capital
    if (sponsorName && !looksLikeCompanyOrSystemLabel(sponsorName)) return sponsorName
  }

  if (userId && isValidUuid(String(userId))) {
    const owner = await db.query(
      `SELECT first_name, last_name, username, email
       FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    )
    const ownerName = formatUserDisplayName(owner.rows[0])
    if (ownerName && !looksLikeCompanyOrSystemLabel(ownerName)) return ownerName
    if (ownerName) return ownerName
  }

  if (fromExcel && !looksLikeCompanyOrSystemLabel(fromExcel)) return fromExcel

  return ''
}

function readProfileWorkbook(filePath) {
  const workbook = xlsx.readFile(filePath)
  const addressesSheet = findSheetName(workbook, PROFILE_SHEET_ALIASES.addresses)
  const beneficiariesSheet = findSheetName(workbook, PROFILE_SHEET_ALIASES.beneficiaries)
  const profilesSheet = findSheetName(workbook, PROFILE_SHEET_ALIASES.profiles)

  if (!addressesSheet) {
    throw new Error('Excel must include an "Addresses" sheet')
  }
  if (!profilesSheet) {
    throw new Error('Excel must include a "Profiles" sheet')
  }

  return {
    addresses: readSheetRows(xlsx, workbook, addressesSheet),
    beneficiaries: readSheetRows(xlsx, workbook, beneficiariesSheet),
    profiles: readSheetRows(xlsx, workbook, profilesSheet),
  }
}

async function ensureProfileEtlColumns(db) {
  await db.query(`
    ALTER TABLE user_investor_profiles
    ADD COLUMN IF NOT EXISTS source_profile_id TEXT
  `)
  await db.query(`
    ALTER TABLE user_saved_addresses
    ADD COLUMN IF NOT EXISTS client_address_key TEXT
  `)
  await db.query(`
    ALTER TABLE user_beneficiaries
    ADD COLUMN IF NOT EXISTS client_beneficiary_key TEXT
  `)
}

function splitPersonName(fullName) {
  const raw = cleanRawValue(fullName)
  if (!raw) return { firstName: '', lastName: '', displayName: '' }
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length < 2) {
    return { firstName: raw, lastName: '', displayName: raw }
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
    displayName: raw,
  }
}

function uniqueCleanKeys(values) {
  const out = []
  for (const value of values || []) {
    const key = cleanRawValue(value)
    if (key && !out.some((x) => x.toLowerCase() === key.toLowerCase())) out.push(key)
  }
  return out
}

/** Cash Flow Unique profile id shape (e.g. 47ZZMRKOPZ) — not email|name composites. */
function isCashFlowProfileId(value) {
  const raw = cleanRawValue(value)
  if (!raw || raw.includes('|') || raw.includes('@') || /\s/.test(raw)) return false
  return /^[A-Za-z0-9_-]{6,32}$/.test(raw)
}

function cashFlowIdFromRedactedUserEmail(email) {
  const raw = String(email || '').trim().toLowerCase()
  const match = raw.match(/^redacted__([a-z0-9][a-z0-9_-]{4,30})$/i)
  if (!match) return ''
  const slug = match[1]
  // Prefer profile-id style slugs (no underscores from names like john_doe)
  if (slug.includes('_') && /[a-z]{3,}/.test(slug.split('_')[0])) return ''
  return slug.toUpperCase()
}

function looksLikeCompositeSourceProfileId(value) {
  const raw = cleanRawValue(value)
  if (!raw) return true
  if (raw.includes('|')) return true
  if (raw.toLowerCase().startsWith('redacted|')) return true
  return !isCashFlowProfileId(raw)
}

function personNameCandidates({
  uniqueKey = '',
  alternateKeys = [],
  displayName = '',
  firstName = '',
  lastName = '',
} = {}) {
  const joined = [cleanRawValue(firstName), cleanRawValue(lastName)]
    .filter(Boolean)
    .join(' ')
    .trim()
  return uniqueCleanKeys([
    displayName,
    joined,
    uniqueKey,
    ...(alternateKeys || []),
  ]).filter((name) => {
    // Prefer human-readable names over Cash Flow ids like 814GEPARGV
    if (!/\s/.test(name) && /^[A-Za-z0-9]{6,14}$/.test(name)) return false
    return /[A-Za-z]/.test(name)
  })
}

/**
 * Profiles do NOT create users. Upload Deal Investors first so the person
 * exists in `users`; then Profiles fetch that same users.id for user_id.
 *
 * Matching order for placeholder emails (redacted):
 * 1) email + uniqueKey / alternateKeys → users.email = redacted__{slug}
 * 2) deal_lp_investor.investor_name on this deal → contact_member_id
 * 3) users.first_name + last_name (prefer rows linked to this deal)
 */
async function resolveExistingProfileUser(db, {
  email,
  userId,
  uniqueKey = '',
  alternateKeys = [],
  displayName = '',
  firstName = '',
  lastName = '',
  dealId = '',
}) {
  if (userId && isValidUuid(userId)) {
    const byId = await db.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [userId])
    if (byId.rows.length) return String(byId.rows[0].id)
    throw new Error(`user_id ${userId} not found in users — upload Deal Investors first`)
  }

  const emailValue = cleanRawValue(email)
  if (!emailValue) {
    throw new Error('user_email is required to resolve the profile owner')
  }

  const primaryKey = cleanRawValue(uniqueKey) || emailValue
  const keysToTry = uniqueCleanKeys([
    primaryKey,
    ...(alternateKeys || []),
    displayName,
    [cleanRawValue(firstName), cleanRawValue(lastName)].filter(Boolean).join(' '),
  ])

  for (const key of keysToTry) {
    const { lookupEmail } = resolveUserEmailKey(emailValue, key)
    const byLookup = await db.query(
      `SELECT id FROM users WHERE LOWER(TRIM(email)) = $1 LIMIT 1`,
      [lookupEmail]
    )
    if (byLookup.rows.length) return String(byLookup.rows[0].id)
  }

  // Real emails: also try exact email if uniqueKey slug differed
  if (!isPlaceholderEmail(emailValue)) {
    const byEmail = await db.query(
      `SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1`,
      [emailValue]
    )
    if (byEmail.rows.length) return String(byEmail.rows[0].id)
  }

  if (isPlaceholderEmail(emailValue)) {
    const names = personNameCandidates({
      uniqueKey: primaryKey,
      alternateKeys,
      displayName,
      firstName,
      lastName,
    })

    // Prefer Deal Investors rows that already stored Cash Flow Unique profile id /
    // profile book name when Deal's Investor was uploaded first.
    if (dealId && isValidUuid(dealId)) {
      const lpKeys = uniqueCleanKeys([
        ...keysToTry,
        displayName,
        primaryKey,
        ...names,
      ])
      for (const key of lpKeys) {
        if (!key) continue
        const byLp = await db.query(
          `SELECT contact_member_id AS uid
           FROM deal_lp_investor
           WHERE deal_id = $1
             AND NULLIF(TRIM(contact_member_id), '') IS NOT NULL
             AND (
               LOWER(TRIM(COALESCE(source_profile_id, ''))) = LOWER(TRIM($2))
               OR LOWER(TRIM(COALESCE(profile_display_name, ''))) = LOWER(TRIM($2))
               OR LOWER(TRIM(COALESCE(investor_name, ''))) = LOWER(TRIM($2))
             )
           LIMIT 3`,
          [dealId, key]
        )
        const ids = [
          ...new Set(
            byLp.rows
              .map((r) => String(r.uid || '').trim())
              .filter((id) => isValidUuid(id))
          ),
        ]
        if (ids.length === 1) {
          const exists = await db.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [
            ids[0],
          ])
          if (exists.rows.length) return ids[0]
        }
      }
    }

    // Deal Investors / Investments display name → contact_member_id (users.id)
    if (dealId && isValidUuid(dealId) && names.length) {
      for (const name of names) {
        const byLp = await db.query(
          `SELECT contact_member_id AS uid
           FROM deal_lp_investor
           WHERE deal_id = $1
             AND NULLIF(TRIM(contact_member_id), '') IS NOT NULL
             AND LOWER(TRIM(COALESCE(investor_name, ''))) = LOWER(TRIM($2))
           UNION
           SELECT contact_id AS uid
           FROM deal_investment
           WHERE deal_id = $1
             AND NULLIF(TRIM(contact_id), '') IS NOT NULL
             AND (
               LOWER(TRIM(COALESCE(contact_display_name, ''))) = LOWER(TRIM($2))
             )
           LIMIT 3`,
          [dealId, name]
        )
        const ids = [
          ...new Set(
            byLp.rows
              .map((r) => String(r.uid || '').trim())
              .filter((id) => isValidUuid(id))
          ),
        ]
        if (ids.length === 1) {
          const exists = await db.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [
            ids[0],
          ])
          if (exists.rows.length) return ids[0]
        }
      }
    }

    // users.first_name / last_name — prefer people already on this deal
    for (const name of names) {
      const parts = name.split(/\s+/).filter(Boolean)
      const first = cleanRawValue(firstName) || (parts.length >= 2 ? parts[0] : '')
      const last =
        cleanRawValue(lastName) ||
        (parts.length >= 2 ? parts.slice(1).join(' ') : '')

      // Prefer users linked to this deal (contact_member_id or investor_name)
      if (dealId && isValidUuid(dealId)) {
        const onDeal = await db.query(
          `SELECT u.id
           FROM users u
           WHERE (
             LOWER(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')))
               = LOWER(TRIM($2))
             OR (
               $3 <> '' AND $4 <> ''
               AND LOWER(TRIM(COALESCE(u.first_name, ''))) = LOWER(TRIM($3))
               AND LOWER(TRIM(COALESCE(u.last_name, ''))) = LOWER(TRIM($4))
             )
           )
           AND EXISTS (
             SELECT 1
             FROM deal_lp_investor lp
             WHERE lp.deal_id = $1
               AND (
                 TRIM(lp.contact_member_id) = u.id::text
                 OR LOWER(TRIM(COALESCE(lp.investor_name, ''))) = LOWER(TRIM($2))
               )
           )
           LIMIT 2`,
          [dealId, name, first, last]
        )
        if (onDeal.rows.length === 1) return String(onDeal.rows[0].id)
      }

      const byName = await db.query(
        `SELECT id
         FROM users
         WHERE LOWER(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')))
             = LOWER(TRIM($1))
           OR (
             $2 <> '' AND $3 <> ''
             AND LOWER(TRIM(COALESCE(first_name, ''))) = LOWER(TRIM($2))
             AND LOWER(TRIM(COALESCE(last_name, ''))) = LOWER(TRIM($3))
           )
         LIMIT 2`,
        [name, first, last]
      )
      if (byName.rows.length === 1) return String(byName.rows[0].id)
    }

    // Same deal + unique last name (handles spouse/individual name vs investor_name mismatch,
    // e.g. Profiles "Kyle Adkins" vs Deal Investor "Raquel Adkins").
    if (dealId && isValidUuid(dealId)) {
      for (const name of names) {
        const parts = name.split(/\s+/).filter(Boolean)
        const last =
          cleanRawValue(lastName) ||
          (parts.length >= 2 ? parts.slice(1).join(' ') : parts[0] || '')
        if (!last || last.length < 2) continue

        const byLast = await db.query(
          `SELECT DISTINCT TRIM(x.uid) AS uid
           FROM (
             SELECT lp.contact_member_id AS uid, lp.investor_name AS label
             FROM deal_lp_investor lp
             WHERE lp.deal_id = $1
               AND NULLIF(TRIM(lp.contact_member_id), '') IS NOT NULL
               AND (
                 LOWER(TRIM(COALESCE(lp.investor_name, ''))) LIKE ('% ' || LOWER(TRIM($2)))
                 OR LOWER(TRIM(COALESCE(lp.investor_name, ''))) = LOWER(TRIM($2))
               )
             UNION
             SELECT i.contact_id AS uid, i.contact_display_name AS label
             FROM deal_investment i
             WHERE i.deal_id = $1
               AND NULLIF(TRIM(i.contact_id), '') IS NOT NULL
               AND (
                 LOWER(TRIM(COALESCE(i.contact_display_name, ''))) LIKE ('% ' || LOWER(TRIM($2)))
                 OR LOWER(TRIM(COALESCE(i.contact_display_name, ''))) = LOWER(TRIM($2))
               )
             UNION
             SELECT u.id::text AS uid,
                    TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS label
             FROM users u
             INNER JOIN deal_lp_investor lp
               ON TRIM(lp.contact_member_id) = u.id::text AND lp.deal_id = $1
             WHERE LOWER(TRIM(COALESCE(u.last_name, ''))) = LOWER(TRIM($2))
           ) x
           WHERE NULLIF(TRIM(x.uid), '') IS NOT NULL
           LIMIT 3`,
          [dealId, last]
        )
        const ids = [
          ...new Set(
            byLast.rows
              .map((r) => String(r.uid || '').trim())
              .filter((id) => isValidUuid(id))
          ),
        ]
        if (ids.length === 1) {
          const exists = await db.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [
            ids[0],
          ])
          if (exists.rows.length) return ids[0]
        }
      }
    }

    // Match names already stored on profile form_snapshot for investors on this deal
    if (dealId && isValidUuid(dealId) && names.length) {
      for (const name of names) {
        const bySnapshot = await db.query(
          `SELECT DISTINCT p.user_id::text AS uid
           FROM user_investor_profiles p
           WHERE p.user_id IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM deal_lp_investor lp
               WHERE lp.deal_id = $1 AND TRIM(lp.contact_member_id) = p.user_id::text
             )
             AND (
               LOWER(TRIM(COALESCE(p.form_snapshot->>'fullName', ''))) = LOWER(TRIM($2))
               OR LOWER(TRIM(COALESCE(p.form_snapshot->>'firstName', '') || ' ' || COALESCE(p.form_snapshot->>'lastName', '')))
                 = LOWER(TRIM($2))
               OR EXISTS (
                 SELECT 1
                 FROM jsonb_array_elements_text(COALESCE(p.form_snapshot->'nameKeys', '[]'::jsonb)) AS nk(value)
                 WHERE LOWER(TRIM(nk.value)) = LOWER(TRIM($2))
               )
             )
           LIMIT 3`,
          [dealId, name]
        )
        const ids = [
          ...new Set(
            bySnapshot.rows
              .map((r) => String(r.uid || '').trim())
              .filter((id) => isValidUuid(id))
          ),
        ]
        if (ids.length === 1) return ids[0]
      }
    }
  }

  let hint = ''
  if (dealId && isValidUuid(dealId)) {
    const last =
      cleanRawValue(lastName) ||
      cleanRawValue(displayName).split(/\s+/).slice(-1)[0] ||
      cleanRawValue(primaryKey).split(/\s+/).slice(-1)[0] ||
      ''
    if (last) {
      const near = await db.query(
        `SELECT name FROM (
           SELECT TRIM(investor_name) AS name
           FROM deal_lp_investor
           WHERE deal_id = $1
             AND LOWER(COALESCE(investor_name, '')) LIKE ('%' || LOWER($2) || '%')
           UNION
           SELECT TRIM(contact_display_name) AS name
           FROM deal_investment
           WHERE deal_id = $1
             AND LOWER(COALESCE(contact_display_name, '')) LIKE ('%' || LOWER($2) || '%')
         ) t
         WHERE NULLIF(name, '') IS NOT NULL
         LIMIT 5`,
        [dealId, last]
      )
      const namesNear = near.rows.map((r) => r.name).filter(Boolean)
      if (namesNear.length) {
        hint = ` Close name(s) on this deal: ${namesNear.join(', ')}.`
      }
    }
  }

  throw new Error(
    `No users row for ${emailValue}` +
      (primaryKey && primaryKey !== emailValue ? ` (key=${primaryKey})` : '') +
      '. Upload Deal’s Investor first so this investor is created in users, then re-upload Profiles.' +
      ' Prefer source_profile_id / address_key from Cash Flow Unique profile id.' +
      hint
  )
}

/** address_key / beneficiary_key like "{sourceProfileId}_tax" → source profile id */
function sourceProfileIdFromClientKey(value) {
  const raw = cleanRawValue(value)
  if (!raw) return ''
  const stripped = raw.replace(/_(tax|mail|mailing|check|bene|beneficiary)$/i, '')
  return stripped !== raw ? stripped : raw
}

function deriveAddressKey(row) {
  const explicit = cleanRawValue(getCellFromRow(row, ADDRESS_COLUMNS.address_key))
  if (explicit) return explicit

  const email = cleanRawValue(getCellFromRow(row, ADDRESS_COLUMNS.user_email))
  const role = cleanRawValue(getCellFromRow(row, ADDRESS_COLUMNS.address_role)) || 'address'
  const street = cleanRawValue(getCellFromRow(row, ADDRESS_COLUMNS.street1))
  const raw = cleanRawValue(getCellFromRow(row, ADDRESS_COLUMNS.source_raw_address))
  return [email, role, street || raw].filter(Boolean).join('|')
}

function deriveBeneficiaryKey(row) {
  const explicit = cleanRawValue(getCellFromRow(row, BENEFICIARY_COLUMNS.beneficiary_key))
  if (explicit) return explicit

  const fullName = cleanRawValue(getCellFromRow(row, BENEFICIARY_COLUMNS.full_name))
  if (!fullName || fullName === '-') return ''

  const email = cleanRawValue(getCellFromRow(row, BENEFICIARY_COLUMNS.user_email))
  return [email, fullName].filter(Boolean).join('|')
}

function deriveSourceProfileId(row) {
  const explicit = cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.source_profile_id))
  if (explicit) return explicit

  const email =
    cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.user_email)) ||
    cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.email1))
  const profileName = cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.profile_name))
  return [email, profileName].filter(Boolean).join('|')
}

async function upsertAddress(db, { userId, row, addressKeyById, addressRoleByEmail }) {
  const addressKey = deriveAddressKey(row)
  if (!addressKey) return null

  const payload = {
    full_name_or_company: cleanRawValue(
      getCellFromRow(row, ADDRESS_COLUMNS.full_name_or_company)
    ),
    country: cleanRawValue(getCellFromRow(row, ADDRESS_COLUMNS.country)) || 'US',
    street1: cleanRawValue(getCellFromRow(row, ADDRESS_COLUMNS.street1)),
    street2: cleanRawValue(getCellFromRow(row, ADDRESS_COLUMNS.street2)),
    city: cleanRawValue(getCellFromRow(row, ADDRESS_COLUMNS.city)),
    state: cleanRawValue(getCellFromRow(row, ADDRESS_COLUMNS.state)),
    zip: normalizeZipValue(getCellFromRow(row, ADDRESS_COLUMNS.zip)),
    check_memo: cleanRawValue(getCellFromRow(row, ADDRESS_COLUMNS.check_memo)),
    distribution_note: cleanRawValue(
      getCellFromRow(row, ADDRESS_COLUMNS.distribution_note)
    ),
    archived: parseYesNo(getCellFromRow(row, ADDRESS_COLUMNS.archived), false),
  }

  const existing = await db.query(
    `SELECT id FROM user_saved_addresses
     WHERE user_id = $1 AND client_address_key = $2
     LIMIT 1`,
    [userId, addressKey]
  )

  let addressId
  if (existing.rows.length) {
    addressId = existing.rows[0].id
    await db.query(
      `UPDATE user_saved_addresses SET
        full_name_or_company = $2, country = $3, street1 = $4, street2 = $5,
        city = $6, state = $7, zip = $8, check_memo = $9, distribution_note = $10,
        archived = $11
       WHERE id = $1`,
      [
        addressId,
        payload.full_name_or_company,
        payload.country,
        payload.street1,
        payload.street2,
        payload.city,
        payload.state,
        payload.zip,
        payload.check_memo,
        payload.distribution_note,
        payload.archived,
      ]
    )
  } else {
    const inserted = await db.query(
      `INSERT INTO user_saved_addresses (
        user_id, full_name_or_company, country, street1, street2, city, state, zip,
        check_memo, distribution_note, archived, client_address_key
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id`,
      [
        userId,
        payload.full_name_or_company,
        payload.country,
        payload.street1,
        payload.street2,
        payload.city,
        payload.state,
        payload.zip,
        payload.check_memo,
        payload.distribution_note,
        payload.archived,
        addressKey,
      ]
    )
    addressId = inserted.rows[0].id
  }

  addressKeyById.set(addressKey, addressId)

  const email = cleanRawValue(getCellFromRow(row, ADDRESS_COLUMNS.user_email)).toLowerCase()
  const role = cleanRawValue(getCellFromRow(row, ADDRESS_COLUMNS.address_role)).toLowerCase()
  if (email && role && addressRoleByEmail) {
    addressRoleByEmail.set(`${email}|${role}`, addressId)
    // Also index under derived key so profile tax_address_key can match if filled later
    addressKeyById.set(`${email}|${role}`, addressId)
  }

  return addressId
}

async function upsertBeneficiary(db, { userId, row, beneficiaryKeyById }) {
  const beneficiaryKey = deriveBeneficiaryKey(row)
  if (!beneficiaryKey) return null

  const payload = {
    full_name: cleanRawValue(getCellFromRow(row, BENEFICIARY_COLUMNS.full_name)),
    relationship:
      cleanRawValue(getCellFromRow(row, BENEFICIARY_COLUMNS.relationship)) ||
      'beneficial_owner',
    tax_id: cleanRawValue(getCellFromRow(row, BENEFICIARY_COLUMNS.tax_id)),
    phone: cleanRawValue(getCellFromRow(row, BENEFICIARY_COLUMNS.phone)),
    email: cleanRawValue(getCellFromRow(row, BENEFICIARY_COLUMNS.email)),
    address_query: cleanRawValue(getCellFromRow(row, BENEFICIARY_COLUMNS.address_query)),
    archived: parseYesNo(getCellFromRow(row, BENEFICIARY_COLUMNS.archived), false),
  }

  const existing = await db.query(
    `SELECT id FROM user_beneficiaries
     WHERE user_id = $1 AND client_beneficiary_key = $2
     LIMIT 1`,
    [userId, beneficiaryKey]
  )

  let beneficiaryId
  if (existing.rows.length) {
    beneficiaryId = existing.rows[0].id
    await db.query(
      `UPDATE user_beneficiaries SET
        full_name = $2, relationship = $3, tax_id = $4, phone = $5,
        email = $6, address_query = $7, archived = $8
       WHERE id = $1`,
      [
        beneficiaryId,
        payload.full_name,
        payload.relationship,
        payload.tax_id,
        payload.phone,
        payload.email,
        payload.address_query,
        payload.archived,
      ]
    )
  } else {
    const inserted = await db.query(
      `INSERT INTO user_beneficiaries (
        user_id, full_name, relationship, tax_id, phone, email, address_query,
        archived, client_beneficiary_key
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id`,
      [
        userId,
        payload.full_name,
        payload.relationship,
        payload.tax_id,
        payload.phone,
        payload.email,
        payload.address_query,
        payload.archived,
        beneficiaryKey,
      ]
    )
    beneficiaryId = inserted.rows[0].id
  }

  beneficiaryKeyById.set(beneficiaryKey, beneficiaryId)
  return beneficiaryId
}

function resolveProfilePersonNames(row) {
  let firstName = cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.first_name))
  let middleName = cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.middle_name))
  let lastName = cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.last_name))
  if (!firstName && !lastName) {
    const fromProfile = splitPersonName(
      getCellFromRow(row, PROFILE_COLUMNS.profile_name)
    )
    firstName = fromProfile.firstName
    lastName = fromProfile.lastName
  }
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim()
  return { firstName, middleName, lastName, fullName }
}

function buildFormSnapshot(row, {
  taxAddressId,
  mailingAddressId,
  checkMailingAddressId,
  beneficiaryPickId,
  sourceProfileId,
  dealId,
}) {
  const person = resolveProfilePersonNames(row)
  const spouseFirst = cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.spouse_first_name))
  const spouseLast = cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.spouse_last_name))
  const profileName = cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.profile_name))
  const nameKeys = uniqueCleanKeys([
    person.fullName,
    [person.firstName, person.lastName].filter(Boolean).join(' '),
    profileName,
    [spouseFirst, spouseLast].filter(Boolean).join(' '),
  ])

  return {
    sourceProfileId,
    dealId: dealId || null,
    profileType: cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.profile_type)),
    firstName: person.firstName,
    middleName: person.middleName,
    lastName: person.lastName,
    fullName: person.fullName,
    nameKeys,
    email1: cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.email1)),
    phone2: cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.phone)),
    ssn: cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.ssn)),
    firstName2: spouseFirst,
    lastName2: spouseLast,
    email2: cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.spouse_email)),
    spouseSsn: cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.spouse_ssn)),
    entityLegalName: cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.entity_legal_name)),
    entitySubType: cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.entity_sub_type)),
    entityEin: cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.entity_ein)),
    federalTaxClassification: cleanRawValue(
      getCellFromRow(row, PROFILE_COLUMNS.federal_tax_classification)
    ),
    llcTaxClassification: cleanRawValue(
      getCellFromRow(row, PROFILE_COLUMNS.llc_tax_classification)
    ),
    entityDisregarded: parseYesNo(
      getCellFromRow(row, PROFILE_COLUMNS.entity_disregarded),
      false
    ),
    entityMemberCount: cleanRawValue(
      getCellFromRow(row, PROFILE_COLUMNS.entity_member_count)
    ),
    iraAccountNumber: cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.ira_account_number)),
    individualIraNumber: cleanRawValue(
      getCellFromRow(row, PROFILE_COLUMNS.individual_ira_number)
    ),
    custodianIra: parseYesNo(getCellFromRow(row, PROFILE_COLUMNS.custodian_ira), false),
    legalIraName: cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.legal_ira_name)),
    iraCompany: cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.ira_company)),
    taxAddressId: taxAddressId || null,
    mailingAddressId: mailingAddressId || null,
    checkMailingAddressId: checkMailingAddressId || null,
    beneficiaryPickId: beneficiaryPickId || null,
    birthDate: cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.birth_date)),
    accreditationStatus: cleanRawValue(
      getCellFromRow(row, PROFILE_COLUMNS.accreditation_status)
    ),
    accreditation: buildAccreditationSnapshot(
      getCellFromRow(row, PROFILE_COLUMNS.accreditation_status)
    ),
  }
}

function buildAccreditationSnapshot(rawStatus) {
  const status = cleanRawValue(rawStatus)
  if (!status) return null
  const lower = status.toLowerCase()
  const isNotAccredited =
    lower.includes('not accredited') ||
    lower === 'non-accredited' ||
    lower === 'nonaccredited' ||
    lower === 'no'
  const isAccredited =
    !isNotAccredited &&
    (lower.includes('accredited') || lower === 'yes' || lower === 'true')
  return {
    status,
    isAccredited: isAccredited ? true : isNotAccredited ? false : null,
    categories: isNotAccredited
      ? ['I. Not accredited']
      : [],
  }
}

async function upsertInvestorProfile(db, {
  userId,
  row,
  addressKeyById,
  addressRoleByEmail,
  beneficiaryKeyById,
  dealId,
}) {
  let sourceProfileId = deriveSourceProfileId(row)
  const profileName =
    cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.profile_name)) || sourceProfileId

  // Recover Cash Flow Unique profile id when Excel lacked the column (old fills used
  // "redacted|Name"). Prefer deal_lp_investor.source_profile_id, then users.email slug.
  if (looksLikeCompositeSourceProfileId(sourceProfileId) || !sourceProfileId) {
    if (dealId && isValidUuid(dealId)) {
      const fromLp = await db.query(
        `SELECT source_profile_id
         FROM deal_lp_investor
         WHERE deal_id = $1
           AND TRIM(contact_member_id) = $2
           AND (
             LOWER(TRIM(COALESCE(source_profile_id, ''))) <> ''
             AND (
               LOWER(TRIM(COALESCE(profile_display_name, ''))) = LOWER(TRIM($3))
               OR LOWER(TRIM(COALESCE(investor_name, ''))) = LOWER(TRIM($3))
               OR LOWER(TRIM(COALESCE(source_profile_id, ''))) = LOWER(TRIM($4))
             )
           )
         ORDER BY
           CASE
             WHEN LOWER(TRIM(COALESCE(profile_display_name, ''))) = LOWER(TRIM($3)) THEN 0
             ELSE 1
           END
         LIMIT 1`,
        [dealId, String(userId), profileName, sourceProfileId]
      )
      const lpPid = cleanRawValue(fromLp.rows[0]?.source_profile_id)
      if (isCashFlowProfileId(lpPid)) sourceProfileId = lpPid
    }

    if (looksLikeCompositeSourceProfileId(sourceProfileId) || !sourceProfileId) {
      const userRow = await db.query(
        `SELECT email FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      )
      const fromEmail = cashFlowIdFromRedactedUserEmail(userRow.rows[0]?.email)
      if (fromEmail) sourceProfileId = fromEmail
    }
  }

  if (!sourceProfileId) {
    throw new Error('source_profile_id is required (or provide user_email + profile_name)')
  }

  const profileType = cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.profile_type))
  const distributionMethod = normalizeDistributionMethod(
    getCellFromRow(row, PROFILE_COLUMNS.distribution_method)
  )

  const addedByDisplay = await resolveProfileAddedByDisplay(db, {
    userId,
    dealId,
    excelAddedBy: getCellFromRow(row, PROFILE_COLUMNS.added_by),
  })

  const ownerEmail = (
    cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.user_email)) ||
    cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.email1))
  ).toLowerCase()

  const taxKey = cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.tax_address_key))
  const mailingMode = cleanRawValue(
    getCellFromRow(row, PROFILE_COLUMNS.mailing_address_mode)
  ).toLowerCase()
  const mailingKey = cleanRawValue(
    getCellFromRow(row, PROFILE_COLUMNS.mailing_address_key)
  )
  const checkKey = cleanRawValue(
    getCellFromRow(row, PROFILE_COLUMNS.check_mailing_address_key)
  )
  const beneficiaryKey = cleanRawValue(
    getCellFromRow(row, PROFILE_COLUMNS.beneficiary_key)
  )

  const taxAddressId =
    (taxKey ? addressKeyById.get(taxKey) : null) ||
    (ownerEmail ? addressRoleByEmail.get(`${ownerEmail}|tax`) : null) ||
    null
  let mailingAddressId =
    (mailingKey ? addressKeyById.get(mailingKey) : null) ||
    (ownerEmail ? addressRoleByEmail.get(`${ownerEmail}|mailing`) : null) ||
    null
  if (mailingMode === 'same_as_tax') mailingAddressId = taxAddressId
  const checkMailingAddressId =
    (checkKey ? addressKeyById.get(checkKey) : null) ||
    (ownerEmail ? addressRoleByEmail.get(`${ownerEmail}|check_mailing`) : null) ||
    null
  const beneficiaryPickId = beneficiaryKey
    ? beneficiaryKeyById.get(beneficiaryKey) || null
    : null

  const formSnapshot = buildFormSnapshot(row, {
    taxAddressId,
    mailingAddressId,
    checkMailingAddressId,
    beneficiaryPickId,
    sourceProfileId,
    dealId,
  })

  // Prefer Cash Flow Unique profile id. Also reclaim older bad keys like
  // "redacted|Profile Name" / "email|Profile Name" created before source_profile_id
  // was exported on the Profiles sheet.
  const existing = await db.query(
    `SELECT id FROM user_investor_profiles
     WHERE source_profile_id = $1
        OR form_snapshot->>'sourceProfileId' = $1
        OR (user_id = $2 AND LOWER(TRIM(COALESCE(profile_name, ''))) = LOWER(TRIM($3)))
        OR (
          LOWER(TRIM(COALESCE(profile_name, ''))) = LOWER(TRIM($3))
          AND (
            LOWER(TRIM(COALESCE(source_profile_id, ''))) = LOWER('redacted|' || TRIM($3))
            OR LOWER(TRIM(COALESCE(source_profile_id, ''))) LIKE ('%|' || LOWER(TRIM($3)))
          )
        )
     ORDER BY
       CASE
         WHEN source_profile_id = $1 THEN 0
         WHEN form_snapshot->>'sourceProfileId' = $1 THEN 1
         WHEN user_id = $2 THEN 2
         ELSE 3
       END
     LIMIT 1`,
    [sourceProfileId, userId, profileName]
  )

  const values = [
    userId,
    profileName,
    profileType,
    addedByDisplay,
    parseYesNo(getCellFromRow(row, PROFILE_COLUMNS.is_draft), false),
    JSON.stringify(formSnapshot),
    distributionMethod,
    cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.ach_routing_number)),
    cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.ach_account_number)),
    cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.ach_bank_address)),
    cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.ach_bank_name)),
    normalizeAccountType(getCellFromRow(row, PROFILE_COLUMNS.ach_bank_account_type)),
    cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.bank_account_query)),
    cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.check_payee_name)) || profileName,
    checkMailingAddressId,
    sourceProfileId,
  ]

  if (existing.rows.length) {
    const result = await db.query(
      `UPDATE user_investor_profiles SET
        user_id = $1,
        profile_name = $2,
        profile_type = $3,
        added_by = $4,
        is_draft = $5,
        form_snapshot = $6::jsonb,
        distribution_method = $7,
        ach_routing_number = $8,
        ach_account_number = $9,
        ach_bank_address = $10,
        ach_bank_name = $11,
        ach_bank_account_type = $12,
        bank_account_query = $13,
        check_payee_name = $14,
        check_mailing_address_id = $15,
        source_profile_id = $16
       WHERE id = $17
       RETURNING id`,
      [...values, existing.rows[0].id]
    )
    await syncContactAccreditationFromProfile(db, {
      userId,
      email: ownerEmail,
      organizationId: null,
      accreditationStatus: formSnapshot.accreditationStatus,
    })
    await syncUserNamesFromProfile(db, {
      userId,
      firstName: formSnapshot.firstName,
      lastName: formSnapshot.lastName,
      fullName: formSnapshot.fullName,
    })
    return { entityId: result.rows[0].id, inserted: false, sourceProfileId }
  }

  const result = await db.query(
    `INSERT INTO user_investor_profiles (
      user_id, profile_name, profile_type, added_by, is_draft, form_snapshot,
      distribution_method, ach_routing_number, ach_account_number, ach_bank_address,
      ach_bank_name, ach_bank_account_type, bank_account_query, check_payee_name,
      check_mailing_address_id, source_profile_id
    ) VALUES (
      $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
    )
    RETURNING id`,
    values
  )

  await syncContactAccreditationFromProfile(db, {
    userId,
    email: ownerEmail,
    organizationId: null,
    accreditationStatus: formSnapshot.accreditationStatus,
  })
  await syncUserNamesFromProfile(db, {
    userId,
    firstName: formSnapshot.firstName,
    lastName: formSnapshot.lastName,
    fullName: formSnapshot.fullName,
  })
  return { entityId: result.rows[0].id, inserted: true, sourceProfileId }
}

async function syncUserNamesFromProfile(db, {
  userId,
  firstName = '',
  lastName = '',
  fullName = '',
}) {
  if (!userId || !isValidUuid(userId)) return
  const first = cleanRawValue(firstName)
  const last = cleanRawValue(lastName)
  const full = cleanRawValue(fullName) || [first, last].filter(Boolean).join(' ')
  if (!first && !last && !full) return

  // Keep person names on users for remapping Profiles ↔ Deal Investors.
  await db.query(
    `UPDATE users SET
       first_name = CASE
         WHEN $2 <> '' THEN $2
         WHEN COALESCE(TRIM(first_name), '') = '' AND $4 <> '' THEN split_part($4, ' ', 1)
         ELSE first_name
       END,
       last_name = CASE
         WHEN $3 <> '' THEN $3
         WHEN COALESCE(TRIM(last_name), '') = '' AND $4 <> ''
           AND POSITION(' ' IN TRIM($4)) > 0
           THEN TRIM(SUBSTRING(TRIM($4) FROM POSITION(' ' IN TRIM($4)) + 1))
         ELSE last_name
       END
     WHERE id = $1`,
    [userId, first, last, full]
  )

  if (full) {
    await db.query(
      `UPDATE deal_lp_investor
       SET investor_name = $2
       WHERE TRIM(contact_member_id) = $1
         AND (investor_name IS NULL OR TRIM(investor_name) = '')`,
      [userId, full]
    )
  }
}

async function syncContactAccreditationFromProfile(db, {
  userId,
  email,
  accreditationStatus,
}) {
  const status = cleanRawValue(accreditationStatus)
  if (!status) return

  await db.query(`
    ALTER TABLE contact
    ADD COLUMN IF NOT EXISTS accreditation_status varchar(64)
  `)

  // Prefer contact linked via deal_lp / users email match for this org-agnostic ETL pass
  if (email && !isPlaceholderEmail(email)) {
    await db.query(
      `UPDATE contact
       SET accreditation_status = $1
       WHERE LOWER(TRIM(email)) = LOWER(TRIM($2))
         AND (
           accreditation_status IS NULL
           OR TRIM(accreditation_status) = ''
           OR LOWER(TRIM(accreditation_status)) <> LOWER(TRIM($1))
         )`,
      [status, email]
    )
  }

  if (userId && isValidUuid(userId)) {
    await db.query(
      `UPDATE contact c
       SET accreditation_status = $1
       FROM users u
       WHERE u.id = $2
         AND (
           LOWER(TRIM(COALESCE(c.email, ''))) = LOWER(TRIM(COALESCE(u.email, '')))
           OR (
             POSITION('__' IN LOWER(TRIM(COALESCE(u.email, '')))) > 0
             AND LOWER(TRIM(COALESCE(c.email, ''))) =
               SPLIT_PART(LOWER(TRIM(u.email)), '__', 1)
           )
         )
         AND (
           c.accreditation_status IS NULL
           OR TRIM(c.accreditation_status) = ''
           OR LOWER(TRIM(c.accreditation_status)) <> LOWER(TRIM($1))
         )`,
      [status, userId]
    )
  }
}

/**
 * Investor Profiles ETL — Addresses → Beneficiaries → Profiles.
 * Does not write deal_lp_investor or deal_investment.
 */
async function runInvestorProfilesEtl({ filePath, organizationId, dealId, onRowResult }) {
  if (!dealId) {
    throw new Error('Deal is required. Select a deal name from the dropdown.')
  }
  if (!isValidUuid(dealId)) {
    throw new Error('Deal ID must be a valid UUID from the Deal Name dropdown')
  }

  const db = await getPool()
  await ensureProfileEtlColumns(db)

  const dealExists = await db.query(
    'SELECT id FROM add_deal_form WHERE id = $1 LIMIT 1',
    [dealId]
  )
  if (!dealExists.rows.length) {
    throw new Error(`Selected deal does not exist: ${dealId}`)
  }

  const workbook = readProfileWorkbook(filePath)
  if (!workbook.profiles.rowCount) {
    throw new Error('No profile data rows found (yellow hint rows are skipped)')
  }

  logAudit(
    `Investor Profiles ETL | addresses=${workbook.addresses.rowCount} beneficiaries=${workbook.beneficiaries.rowCount} profiles=${workbook.profiles.rowCount}`
  )

  const addressKeyById = new Map()
  const addressRoleByEmail = new Map()
  const beneficiaryKeyById = new Map()
  const userCache = new Map()

  async function userForRow(row, emailKeys, userIdKeys, nameHints = {}) {
    let email = cleanRawValue(getCellFromRow(row, emailKeys))
    if (!email && nameHints.fallbackEmailKeys) {
      email = cleanRawValue(getCellFromRow(row, nameHints.fallbackEmailKeys))
    }
    if (!email) {
      throw new Error('user_email is required to resolve the profile owner')
    }

    const uniqueKey =
      nameHints.uniqueKey ||
      [nameHints.firstName, nameHints.lastName].filter(Boolean).join(' ') ||
      email
    const alternateKeys = uniqueCleanKeys([
      ...(nameHints.alternateKeys || []),
      nameHints.displayName,
      [nameHints.firstName, nameHints.lastName].filter(Boolean).join(' '),
    ])

    // Cache by email + uniqueKey so multiple "redacted" rows stay distinct people
    const cacheKey = [
      email.toLowerCase(),
      String(uniqueKey).toLowerCase(),
      alternateKeys.join('~').toLowerCase(),
    ].join('|')
    if (userCache.has(cacheKey)) return userCache.get(cacheKey)

    const userId = await resolveExistingProfileUser(db, {
      email,
      userId: cleanRawValue(getCellFromRow(row, userIdKeys)),
      uniqueKey,
      alternateKeys,
      displayName: nameHints.displayName || '',
      firstName: nameHints.firstName || '',
      lastName: nameHints.lastName || '',
      dealId,
    })

    userCache.set(cacheKey, userId)
    return userId
  }

  let successCount = 0
  let failedCount = 0
  const errors = []

  // 1) Addresses
  for (let index = 0; index < workbook.addresses.rows.length; index++) {
    const rowNumber = index + 2
    const row = workbook.addresses.rows[index]
    try {
      const addressPerson = splitPersonName(
        getCellFromRow(row, ADDRESS_COLUMNS.full_name_or_company)
      )
      const userId = await userForRow(
        row,
        ADDRESS_COLUMNS.user_email,
        ADDRESS_COLUMNS.user_id,
        {
          displayName: addressPerson.displayName,
          firstName: addressPerson.firstName,
          lastName: addressPerson.lastName,
          uniqueKey:
            cleanRawValue(getCellFromRow(row, ADDRESS_COLUMNS.source_profile_id)) ||
            sourceProfileIdFromClientKey(
              getCellFromRow(row, ADDRESS_COLUMNS.address_key)
            ) ||
            addressPerson.displayName,
          alternateKeys: [
            cleanRawValue(getCellFromRow(row, ADDRESS_COLUMNS.source_profile_id)),
            sourceProfileIdFromClientKey(
              getCellFromRow(row, ADDRESS_COLUMNS.address_key)
            ),
            addressPerson.displayName,
          ],
        }
      )
      const addressId = await upsertAddress(db, {
        userId,
        row,
        addressKeyById,
        addressRoleByEmail,
      })
      if (!addressId) {
        throw new Error('Could not derive address_key for this address row')
      }
      successCount++
      if (onRowResult) {
        await onRowResult({
          rowNumber,
          success: true,
          entityId: addressId,
          columnName: listFilledExcelColumns(row, ADDRESS_COLUMNS).join(', ') || 'user_saved_addresses',
          message: `Address ${deriveAddressKey(row)}`,
        })
      }
    } catch (error) {
      failedCount++
      const errorMessage = error.message || 'Address load failed'
      errors.push({ rowNumber, columnName: 'user_saved_addresses', errorType: 'LOAD', errorMessage })
      if (onRowResult) await onRowResult({ rowNumber, success: false, errorMessage })
    }
  }

  // 2) Beneficiaries (optional)
  for (let index = 0; index < workbook.beneficiaries.rows.length; index++) {
    const rowNumber = 1000 + index + 2
    const row = workbook.beneficiaries.rows[index]
    try {
      const benePerson = splitPersonName(
        getCellFromRow(row, BENEFICIARY_COLUMNS.full_name)
      )
      const userId = await userForRow(
        row,
        BENEFICIARY_COLUMNS.user_email,
        BENEFICIARY_COLUMNS.user_id,
        {
          displayName: benePerson.displayName,
          firstName: benePerson.firstName,
          lastName: benePerson.lastName,
          uniqueKey:
            cleanRawValue(getCellFromRow(row, BENEFICIARY_COLUMNS.source_profile_id)) ||
            sourceProfileIdFromClientKey(
              getCellFromRow(row, BENEFICIARY_COLUMNS.beneficiary_key)
            ) ||
            benePerson.displayName,
          alternateKeys: [
            cleanRawValue(getCellFromRow(row, BENEFICIARY_COLUMNS.source_profile_id)),
            sourceProfileIdFromClientKey(
              getCellFromRow(row, BENEFICIARY_COLUMNS.beneficiary_key)
            ),
            benePerson.displayName,
          ],
        }
      )
      const beneficiaryId = await upsertBeneficiary(db, {
        userId,
        row,
        beneficiaryKeyById,
      })
      if (!beneficiaryId) {
        // Placeholder rows with full_name "-" are skipped intentionally
        successCount++
        if (onRowResult) {
          await onRowResult({
            rowNumber,
            success: true,
            message: 'Beneficiary skipped (no beneficiary_key / name)',
          })
        }
        continue
      }
      successCount++
      if (onRowResult) {
        await onRowResult({
          rowNumber,
          success: true,
          entityId: beneficiaryId,
          columnName: listFilledExcelColumns(row, BENEFICIARY_COLUMNS).join(', ') || 'user_beneficiaries',
          message: `Beneficiary ${deriveBeneficiaryKey(row)}`,
        })
      }
    } catch (error) {
      failedCount++
      const errorMessage = error.message || 'Beneficiary load failed'
      errors.push({ rowNumber, columnName: 'user_beneficiaries', errorType: 'LOAD', errorMessage })
      if (onRowResult) await onRowResult({ rowNumber, success: false, errorMessage })
    }
  }

  // 3) Profiles
  for (let index = 0; index < workbook.profiles.rows.length; index++) {
    const rowNumber = 2000 + index + 2
    const row = workbook.profiles.rows[index]
    try {
      const userId = await userForRow(
        row,
        PROFILE_COLUMNS.user_email,
        PROFILE_COLUMNS.user_id,
        {
          firstName: cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.first_name)),
          lastName: cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.last_name)),
          displayName:
            [
              cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.first_name)),
              cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.last_name)),
            ]
              .filter(Boolean)
              .join(' ') ||
            cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.profile_name)),
          phone: cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.phone)),
          fallbackEmailKeys: PROFILE_COLUMNS.email1,
          uniqueKey:
            cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.source_profile_id)) ||
            deriveSourceProfileId(row) ||
            cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.profile_name)),
          alternateKeys: [
            cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.source_profile_id)),
            [
              cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.first_name)),
              cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.last_name)),
            ]
              .filter(Boolean)
              .join(' '),
            cleanRawValue(getCellFromRow(row, PROFILE_COLUMNS.profile_name)),
          ],
        }
      )
      const result = await upsertInvestorProfile(db, {
        userId,
        row,
        addressKeyById,
        addressRoleByEmail,
        beneficiaryKeyById,
        dealId,
      })
      successCount++
      if (onRowResult) {
        await onRowResult({
          rowNumber,
          success: true,
          entityId: result.entityId,
          columnName: listFilledExcelColumns(row, PROFILE_COLUMNS).join(', ') || 'user_investor_profiles',
          message: result.inserted
            ? `Inserted profile ${result.sourceProfileId}`
            : `Updated profile ${result.sourceProfileId}`,
        })
      }
    } catch (error) {
      failedCount++
      const errorMessage = error.message || 'Profile load failed'
      errors.push({
        rowNumber,
        columnName: 'user_investor_profiles',
        errorType: 'LOAD',
        errorMessage,
      })
      if (onRowResult) await onRowResult({ rowNumber, success: false, errorMessage })
    }
  }

  return {
    sheets: {
      addresses: workbook.addresses.sheetName,
      beneficiaries: workbook.beneficiaries.sheetName,
      profiles: workbook.profiles.sheetName,
    },
    totalRecords:
      workbook.addresses.rowCount +
      workbook.beneficiaries.rowCount +
      workbook.profiles.rowCount,
    successCount,
    failedCount,
    errors,
  }
}

module.exports = {
  readProfileWorkbook,
  resolveExistingProfileUser,
  runInvestorProfilesEtl,
  ensureProfileEtlColumns,
}
