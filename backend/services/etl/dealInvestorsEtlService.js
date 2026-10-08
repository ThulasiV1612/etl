const xlsx = require('xlsx')
const {
  DEAL_INVESTOR_SHEET_ALIASES,
  ADD_INVESTOR_COLUMNS,
  INVESTMENT_COLUMNS,
  PROFILE_TYPE_MAP_COLUMNS,
  PROFILE_ID_MAP,
} = require('../../constants/dealInvestor.constants')
const {
  cleanRawValue,
  stripMoney,
  parseYesNo,
  getCellFromRow,
  findSheetName,
  readSheetRows,
  listFilledExcelColumns,
} = require('./excelRowUtils')
const { getPool } = require('../dbService')
const { isValidUuid } = require('./uuidUtils')
const { logAudit } = require('../logger')
const {
  ROLE_INVESTOR,
  upsertPendingInvitedUser,
  resolveOrInviteSponsorUser,
  resolveDealOrganizationId,
  reconcileAssigningDealUsersForDeal,
} = require('./inviteUserEtlService')
const { toContactStyleEmail } = require('./emailPlaceholderUtils')
const { splitFullName } = require('./contactNameUtils')
const { upsertPendingContactReview } = require('./contactMatchService')

function buildProfileIdMapper(workbookProfileMap) {
  const map = { ...PROFILE_ID_MAP, ...(workbookProfileMap || {}) }

  return function mapProfileId(value) {
    const raw = cleanRawValue(value).toLowerCase()
    if (!raw) return ''
    if (map[raw]) return map[raw]
    if (raw.includes('joint')) return 'joint_tenancy'
    if (raw.includes('ira') || raw.includes('401')) return 'custodian_ira_401k'
    if (
      raw.includes('entity') ||
      raw.includes('llc') ||
      raw.includes('corp') ||
      raw.includes('trust')
    ) {
      return 'llc_corp_trust_etc'
    }
    if (raw.includes('individual')) return 'individual'
    return cleanRawValue(value)
  }
}

function mapFundingMethod(value) {
  const raw = cleanRawValue(value).toLowerCase()
  if (!raw) return ''
  if (raw.includes('wire')) return 'wire_transfer'
  if (raw.includes('ach')) return 'ach'
  if (raw.includes('check') || raw.includes('cheque')) return 'check'
  return raw.replace(/\s+/g, '_')
}

function isFundApproved({ fundApprovedCell, status }) {
  if (parseYesNo(fundApprovedCell, false)) return true
  const statusText = cleanRawValue(status).toLowerCase()
  return statusText.includes('funds fully received') || statusText.includes('funded')
}

function splitName(displayName) {
  const { first_name, last_name } = splitFullName(displayName)
  return { firstName: first_name, lastName: last_name }
}

function readProfileTypeMap(xlsxLib, workbook) {
  const sheetName = findSheetName(workbook, DEAL_INVESTOR_SHEET_ALIASES.profileTypeMap)
  if (!sheetName) return {}

  const { rows } = readSheetRows(xlsxLib, workbook, sheetName)
  const map = {}
  for (const row of rows) {
    const from = cleanRawValue(
      getCellFromRow(row, PROFILE_TYPE_MAP_COLUMNS.cashFlowType)
    ).toLowerCase()
    const to = cleanRawValue(getCellFromRow(row, PROFILE_TYPE_MAP_COLUMNS.ourProfileId))
    if (!from || !to) continue
    if (from.startsWith('cash flow')) continue
    if (to.includes('deal_lp_investor') || to.includes('deal_investment')) continue
    map[from] = to
  }
  return map
}

function readDealInvestorWorkbook(filePath) {
  const workbook = xlsx.readFile(filePath)
  const addSheet = findSheetName(workbook, DEAL_INVESTOR_SHEET_ALIASES.addInvestors)
  const investmentsSheet = findSheetName(workbook, DEAL_INVESTOR_SHEET_ALIASES.investments)

  if (!addSheet) {
    const found = workbook.SheetNames.join(', ') || '(none)'
    throw new Error(
      `Excel must include an "Add Investors" sheet (found: ${found}). ` +
        'Use Horizon/Add_Investor_Mapping_FILLED.xlsx under Upload Deal\'s Investor.'
    )
  }

  return {
    addInvestors: readSheetRows(xlsx, workbook, addSheet),
    investments: readSheetRows(xlsx, workbook, investmentsSheet),
    profileIdMap: readProfileTypeMap(xlsx, workbook),
  }
}

/**
 * Prefer users.id for contact_member_id (Investor-Portal-main pattern).
 * Upserts investor as pending invited user — Add Investor API does NOT create users.
 * Blank / redacted emails → Contacts-style "redacted" (users.email may be redacted__{name}).
 * CRM contacts: exact match only; otherwise REVIEW_REQUIRED (no auto INSERT).
 */
async function resolveInvestorUserId(db, {
  email,
  displayName,
  organizationId,
  explicitId,
  phone = '',
  firstName = '',
  lastName = '',
  sourceProfileId = '',
  dealId = null,
  dealName = '',
  jobId = null,
  company = '',
  address = '',
}) {
  if (explicitId && isValidUuid(explicitId)) {
    const asUser = await db.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [explicitId])
    if (asUser.rows.length) return { userId: String(asUser.rows[0].id), contactReview: null }
  }

  const emailValue = toContactStyleEmail(email)
  const split = splitName(displayName)
  const first =
    cleanRawValue(firstName) || split.firstName || ''
  const last =
    cleanRawValue(lastName) || split.lastName || ''
  const fullName =
    cleanRawValue(displayName) ||
    [first, last].filter(Boolean).join(' ').trim()
  const phoneValue = String(phone || '').trim()
  // Redacted emails: keep people distinct via profile id / name / phone
  const uniqueKey =
    cleanRawValue(sourceProfileId) ||
    [fullName, first, last, phoneValue].filter(Boolean).join(' ').trim() ||
    emailValue
  const result = await upsertPendingInvitedUser(db, {
    email: emailValue,
    organizationId,
    role: ROLE_INVESTOR,
    firstName: first,
    lastName: last,
    phone: phoneValue,
    uniqueKey,
    contactPolicy: 'review',
    contactExtras: {
      fullName,
      phone: phoneValue,
      company,
      address,
      sourceProfileId,
      investorId: sourceProfileId,
      dealId,
      dealName,
    },
  })

  let contactReview = null
  if (result.contactStatus === 'REVIEW_REQUIRED') {
    const reviewId = await upsertPendingContactReview(db, {
      jobId,
      dealId,
      organizationId,
      userId: result.userId,
      uploaded: {
        email: emailValue,
        firstName: first,
        lastName: last,
        fullName,
        phone: phoneValue,
        company,
        address,
        sourceProfileId,
        investorId: sourceProfileId,
        organizationId,
        dealId,
        dealName,
        userId: result.userId,
      },
      candidates: result.contactCandidates || [],
    })
    contactReview = {
      reviewId,
      status: 'REVIEW_REQUIRED',
      userId: result.userId,
      uploadedInvestor: {
        email: emailValue,
        firstName: first,
        lastName: last,
        fullName,
        phone: phoneValue,
        company,
        address,
        investorId: sourceProfileId,
        sourceProfileId,
        dealId,
        dealName,
      },
      possibleContacts: result.contactCandidates || [],
      reasons: result.contactReasons || [],
    }
  }

  return { userId: result.userId, contactReview }
}

/**
 * Extract emails from selected_sponsors cell.
 * Supports: email@x.com | Name <email@x.com> | comma/semicolon/pipe lists.
 */
function extractSponsorEmails(raw) {
  const text = cleanRawValue(raw)
  if (!text) return []

  const emails = []
  const angleMatches = text.matchAll(/<([^>]+@[^>]+)>/g)
  for (const match of angleMatches) {
    const email = String(match[1] || '').trim().toLowerCase()
    if (email.includes('@')) emails.push(email)
  }

  const tokens = text.split(/[,;/|]+/).map((part) => part.trim()).filter(Boolean)
  for (const token of tokens) {
    const stripped = token.replace(/^.*</, '').replace(/>.*$/, '').trim()
    const candidate = (stripped.includes('@') ? stripped : token).trim().toLowerCase()
    // Ignore bare names; emails only for added_by
    if (candidate.includes('@') && !candidate.includes(' ')) {
      emails.push(candidate)
    } else {
      const embedded = token.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
      if (embedded) emails.push(embedded[0].toLowerCase())
    }
  }

  return [...new Set(emails)]
}

/**
 * Look up users.id for a sponsor email (any portal role).
 * Prefers exact users.email; then deal_member → user/contact email on this deal.
 */
async function resolveUserIdBySponsorEmail(db, {
  email,
  organizationId,
  dealId,
}) {
  const emailNorm = String(email || '').trim().toLowerCase()
  if (!emailNorm || !emailNorm.includes('@')) return null

  const byUser = await db.query(
    `SELECT id FROM users
     WHERE LOWER(TRIM(email)) = $1
     ORDER BY
       CASE
         WHEN role IN ('company_admin', 'company_user', 'company_member', 'platform_admin') THEN 0
         WHEN role = 'deal_participant' THEN 1
         ELSE 2
       END,
       created_at ASC
     LIMIT 1`,
    [emailNorm]
  )
  if (byUser.rows.length) return String(byUser.rows[0].id)

  if (dealId && isValidUuid(dealId)) {
    const byDealMember = await db.query(
      `SELECT COALESCE(
         u_direct.id,
         u_from_contact.id
       ) AS user_id
       FROM deal_member dm
       LEFT JOIN users u_direct
         ON TRIM(dm.contact_member_id) = u_direct.id::text
       LEFT JOIN contact c
         ON TRIM(dm.contact_member_id) = c.id::text
       LEFT JOIN users u_from_contact
         ON LOWER(TRIM(u_from_contact.email)) = LOWER(TRIM(c.email))
       WHERE dm.deal_id = $1
         AND (
           LOWER(TRIM(COALESCE(u_direct.email, ''))) = $2
           OR LOWER(TRIM(COALESCE(c.email, ''))) = $2
           OR LOWER(TRIM(COALESCE(u_from_contact.email, ''))) = $2
         )
       LIMIT 1`,
      [dealId, emailNorm]
    )
    if (byDealMember.rows[0]?.user_id) {
      return String(byDealMember.rows[0].user_id)
    }
  }

  if (organizationId && isValidUuid(organizationId)) {
    const byContactUser = await db.query(
      `SELECT u.id
       FROM contact c
       JOIN users u ON LOWER(TRIM(u.email)) = LOWER(TRIM(c.email))
       WHERE c.organization_id = $1
         AND LOWER(TRIM(c.email)) = $2
       LIMIT 1`,
      [organizationId, emailNorm]
    )
    if (byContactUser.rows.length) return String(byContactUser.rows[0].id)
  }

  return null
}

/**
 * selected_sponsors emails → users.id for deal_lp_investor.added_by (REQUIRED).
 * Uses the sponsor email's existing users.id (company member or deal_participant).
 * Does not invent a different adder when emails were provided.
 */
async function resolveRequiredAddedBy(db, {
  selectedSponsors,
  organizationId,
  dealId,
}) {
  const emails = extractSponsorEmails(selectedSponsors)
  const tried = []

  for (const email of emails) {
    tried.push(email)
    const userId = await resolveUserIdBySponsorEmail(db, {
      email,
      organizationId,
      dealId,
    })
    if (userId) return userId
  }

  // Emails were present but none mapped to a user — fail clearly (do not silently use platform admin)
  if (emails.length) {
    throw new Error(
      `selected_sponsors email(s) not found in users: ${emails.join(', ')}. ` +
        'Upload Deal Members / Company Members first so those sponsor emails exist in users, ' +
        'then re-upload investors.'
    )
  }

  // No emails in the cell — try name tokens via legacy resolver, then deal fallbacks
  const raw = cleanRawValue(selectedSponsors)
  const tokens = raw
    ? raw.split(/[,;/|]+/).map((part) => part.trim()).filter(Boolean)
    : []

  for (const token of tokens) {
    const userId = await resolveOrInviteSponsorUser(db, {
      token,
      organizationId,
      dealId,
    })
    if (userId) return userId
  }

  const assigned = await db.query(
    `SELECT user_id FROM assigning_deal_user
     WHERE deal_id = $1
     ORDER BY user_id
     LIMIT 1`,
    [dealId]
  )
  if (assigned.rows.length) return String(assigned.rows[0].user_id)

  const member = await db.query(
    `SELECT
       COALESCE(dm.added_by, u.id) AS adder_id
     FROM deal_member dm
     LEFT JOIN users u ON TRIM(dm.contact_member_id) = u.id::text
     WHERE dm.deal_id = $1
       AND (
         dm.added_by IS NOT NULL
         OR u.id IS NOT NULL
       )
     ORDER BY dm.created_at
     LIMIT 1`,
    [dealId]
  )
  if (member.rows[0]?.adder_id) return String(member.rows[0].adder_id)

  const orgUser = await db.query(
    `SELECT id FROM users
     WHERE organization_id = $1
       AND role IN ('company_admin', 'company_user', 'company_member', 'platform_admin')
     ORDER BY created_at ASC
     LIMIT 1`,
    [organizationId]
  )
  if (orgUser.rows.length) return String(orgUser.rows[0].id)

  throw new Error(
    'added_by is required for Deal Investors UI visibility. ' +
      'Fill selected_sponsors with a sponsor email that already exists in users ' +
      '(company member or deal_participant from Deal Members upload).' +
      (tried.length ? ` Tried: ${tried.join(', ')}` : '')
  )
}

async function resolveUserInvestorProfileId(db, {
  explicitId,
  sourceProfileId,
  email,
  displayName,
  profileDisplayName = '',
  userId,
}) {
  if (explicitId && isValidUuid(explicitId)) {
    const byId = await db.query(
      'SELECT id FROM user_investor_profiles WHERE id = $1 LIMIT 1',
      [explicitId]
    )
    if (byId.rows.length) return byId.rows[0].id
  }

  const candidates = []
  const sourceId = cleanRawValue(sourceProfileId)
  if (sourceId) candidates.push(sourceId)

  const emailValue = cleanRawValue(email)
  const nameValue = cleanRawValue(profileDisplayName) || cleanRawValue(displayName)
  if (emailValue && nameValue) candidates.push(`${emailValue}|${nameValue}`)
  if (nameValue) candidates.push(`redacted|${nameValue}`)
  if (emailValue) candidates.push(emailValue)

  for (const candidate of candidates) {
    const bySource = await db.query(
      `SELECT id FROM user_investor_profiles
       WHERE source_profile_id = $1
          OR form_snapshot->>'sourceProfileId' = $1
       LIMIT 1`,
      [candidate]
    )
    if (bySource.rows.length) return bySource.rows[0].id
  }

  if (userId && nameValue) {
    const byUserAndName = await db.query(
      `SELECT id FROM user_investor_profiles
       WHERE user_id = $1 AND LOWER(TRIM(profile_name)) = LOWER(TRIM($2))
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, nameValue]
    )
    if (byUserAndName.rows.length) return byUserAndName.rows[0].id
  }

  // Prefer the profile whose source_profile_id matches Cash Flow id on this user
  if (userId && sourceId) {
    const byUserSource = await db.query(
      `SELECT id FROM user_investor_profiles
       WHERE user_id = $1
         AND (
           LOWER(TRIM(COALESCE(source_profile_id, ''))) = LOWER(TRIM($2))
           OR LOWER(TRIM(COALESCE(form_snapshot->>'sourceProfileId', ''))) = LOWER(TRIM($2))
         )
       LIMIT 1`,
      [userId, sourceId]
    )
    if (byUserSource.rows.length) return byUserSource.rows[0].id
  }

  if (userId) {
    const byUser = await db.query(
      `SELECT id FROM user_investor_profiles
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    )
    if (byUser.rows.length) return byUser.rows[0].id
  }

  return null
}

async function assertInvestorClass(db, { dealId, className }) {
  const name = cleanRawValue(className)
  if (!name) {
    throw new Error('investor_class_name is required and must match deal_investor_class.name')
  }

  const result = await db.query(
    `SELECT name FROM deal_investor_class
     WHERE deal_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))
     LIMIT 1`,
    [dealId, name]
  )
  if (!result.rows.length) {
    throw new Error(
      `Class "${name}" not found for this deal. Upload Horizon/Class_Mapping_FILLED.xlsx first.`
    )
  }
  return result.rows[0].name
}

async function ensureLpInvestorPercentColumns(db) {
  await db.query(`
    ALTER TABLE deal_lp_investor
    ADD COLUMN IF NOT EXISTS percent_of_class_ownership TEXT DEFAULT '' NOT NULL
  `)
  await db.query(`
    ALTER TABLE deal_lp_investor
    ADD COLUMN IF NOT EXISTS percent_of_class_distributions TEXT DEFAULT '' NOT NULL
  `)
  await db.query(`
    ALTER TABLE deal_lp_investor
    ADD COLUMN IF NOT EXISTS entity_ownership_percent TEXT DEFAULT '' NOT NULL
  `)
  await db.query(`
    ALTER TABLE deal_lp_investor
    ADD COLUMN IF NOT EXISTS distribution_allocation_percent TEXT DEFAULT '' NOT NULL
  `)
  // Cash Flow Unique profile id + book profile name — used by Profiles ETL to match
  // redacted users (same person can have LLC + IRA + individual profile ids).
  await db.query(`
    ALTER TABLE deal_lp_investor
    ADD COLUMN IF NOT EXISTS source_profile_id TEXT DEFAULT '' NOT NULL
  `)
  await db.query(`
    ALTER TABLE deal_lp_investor
    ADD COLUMN IF NOT EXISTS profile_display_name TEXT DEFAULT '' NOT NULL
  `)
  // Same person may sit in multiple classes, and the same class may have
  // multiple Cash Flow Unique profile ids (e.g. ROTH IRA + traditional IRA).
  await db.query(`
    ALTER TABLE deal_lp_investor
    DROP CONSTRAINT IF EXISTS deal_lp_investor_deal_id_contact_member_id_uidx
  `)
  await db.query(`
    ALTER TABLE deal_lp_investor
    DROP CONSTRAINT IF EXISTS deal_lp_investor_deal_contact_class_uidx
  `)
  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'deal_lp_investor_deal_contact_class_profile_uidx'
      ) THEN
        ALTER TABLE deal_lp_investor
        ADD CONSTRAINT deal_lp_investor_deal_contact_class_profile_uidx
        UNIQUE (deal_id, contact_member_id, investor_class, source_profile_id);
      END IF;
    END $$;
  `)
}

function normalizePercentText(value) {
  const raw = cleanRawValue(value)
  if (!raw || raw === '-' || raw === '—') return ''
  const cleaned = raw.replace(/%/g, '').replace(/,/g, '').trim()
  if (!cleaned) return ''
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return cleaned
  // Cash Flow may store 0.305 or 30.5 — treat (0,1] as fraction
  const pct = n > 0 && n <= 1 ? n * 100 : n
  const rounded = Math.round(pct * 1e6) / 1e6
  return String(rounded)
}

async function upsertDealLpInvestor(db, {
  dealId,
  contactMemberId,
  email,
  investorName = '',
  profileDisplayName = '',
  sourceProfileId = '',
  investorClass,
  profileId,
  userInvestorProfileId,
  role,
  sendInvitationMail,
  addedBy,
  percentOfClassOwnership = '',
  percentOfClassDistributions = '',
  entityOwnershipPercent = '',
  distributionAllocationPercent = '',
}) {
  if (!addedBy || !isValidUuid(addedBy)) {
    throw new Error('added_by (sponsor users.id) is required — null hides LPs for company viewers')
  }

  const ownershipPct = normalizePercentText(percentOfClassOwnership)
  const distributionsPct = normalizePercentText(percentOfClassDistributions)
  const entityOwnershipPct = normalizePercentText(entityOwnershipPercent)
  const distributionAllocationPct = normalizePercentText(distributionAllocationPercent)
  const nameValue = cleanRawValue(investorName)
  const profileNameValue = cleanRawValue(profileDisplayName)
  const sourceProfileValue = cleanRawValue(sourceProfileId)

  // 1) Exact seat: deal + contact + class + Cash Flow Unique profile id
  let existing = await db.query(
    `SELECT id FROM deal_lp_investor
     WHERE deal_id = $1
       AND contact_member_id = $2
       AND LOWER(TRIM(COALESCE(investor_class, ''))) = LOWER(TRIM(COALESCE($3, '')))
       AND LOWER(TRIM(COALESCE(source_profile_id, ''))) = LOWER(TRIM(COALESCE($4, '')))
     LIMIT 1`,
    [dealId, contactMemberId, investorClass || '', sourceProfileValue]
  )

  // 2) Legacy blank-source seat for same contact+class — reclaim instead of inserting a twin
  if (!existing.rows.length && sourceProfileValue) {
    existing = await db.query(
      `SELECT id FROM deal_lp_investor
       WHERE deal_id = $1
         AND contact_member_id = $2
         AND LOWER(TRIM(COALESCE(investor_class, ''))) = LOWER(TRIM(COALESCE($3, '')))
         AND COALESCE(TRIM(source_profile_id), '') = ''
       ORDER BY updated_at ASC NULLS FIRST, created_at ASC NULLS FIRST
       LIMIT 1`,
      [dealId, contactMemberId, investorClass || '']
    )
  }

  if (existing.rows.length) {
    const result = await db.query(
      `UPDATE deal_lp_investor SET
        email = $3,
        role = $4,
        profile_id = $5,
        user_investor_profile_id = $6,
        investor_class = $7,
        send_invitation_mail = $8,
        added_by = COALESCE(added_by, $9),
        investor_name = CASE WHEN $14 <> '' THEN $14 ELSE investor_name END,
        percent_of_class_ownership = CASE
          WHEN $10 <> '' THEN $10 ELSE percent_of_class_ownership END,
        percent_of_class_distributions = CASE
          WHEN $11 <> '' THEN $11 ELSE percent_of_class_distributions END,
        entity_ownership_percent = CASE
          WHEN $12 <> '' THEN $12 ELSE entity_ownership_percent END,
        distribution_allocation_percent = CASE
          WHEN $13 <> '' THEN $13 ELSE distribution_allocation_percent END,
        source_profile_id = CASE WHEN $15 <> '' THEN $15 ELSE source_profile_id END,
        profile_display_name = CASE WHEN $16 <> '' THEN $16 ELSE profile_display_name END,
        updated_at = NOW()
       WHERE id = $1 AND deal_id = $2
       RETURNING id`,
      [
        existing.rows[0].id,
        dealId,
        email || '',
        role || 'LP Investor',
        profileId || '',
        userInvestorProfileId,
        investorClass,
        sendInvitationMail || 'no',
        addedBy,
        ownershipPct,
        distributionsPct,
        entityOwnershipPct,
        distributionAllocationPct,
        nameValue,
        sourceProfileValue,
        profileNameValue,
      ]
    )
    return { entityId: result.rows[0].id, inserted: false }
  }

  const result = await db.query(
    `INSERT INTO deal_lp_investor (
      deal_id, added_by, contact_member_id, email, role, profile_id,
      user_investor_profile_id, investor_class, send_invitation_mail, committed_amount,
      investor_name,
      percent_of_class_ownership, percent_of_class_distributions,
      entity_ownership_percent, distribution_allocation_percent,
      source_profile_id, profile_display_name
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'',$10,$11,$12,$13,$14,$15,$16)
    RETURNING id`,
    [
      dealId,
      addedBy,
      contactMemberId,
      email || '',
      role || 'LP Investor',
      profileId || '',
      userInvestorProfileId,
      investorClass,
      sendInvitationMail || 'no',
      nameValue,
      ownershipPct,
      distributionsPct,
      entityOwnershipPct,
      distributionAllocationPct,
      sourceProfileValue,
      profileNameValue,
    ]
  )

  return { entityId: result.rows[0].id, inserted: true }
}

async function insertDealInvestment(db, {
  dealId,
  contactId,
  contactDisplayName,
  investorClass,
  profileId,
  userInvestorProfileId,
  commitmentAmount,
  fundApproved,
  fundingMethod,
  status,
  docSignedDate,
  sourceInvestmentId,
  accreditationStatus = '',
}) {
  const questionnaireJson = buildAccreditationQuestionnaireJson(accreditationStatus)
  const sourceId = cleanRawValue(sourceInvestmentId)

  // Prefer exact Cash Flow Unique investment id. Do NOT soft-match by
  // amount+class+profile_type alone — same person can have two IRAs
  // (ROTH + traditional) with the same amount and class.
  let existing = { rows: [] }
  if (sourceId) {
    existing = await db.query(
      `SELECT id, investor_questionnaire_answers_json FROM deal_investment
       WHERE deal_id = $1
         AND contact_id = $2
         AND investor_role = 'lp_investors'
         AND esign_status_json = $3
       LIMIT 1`,
      [dealId, contactId, JSON.stringify({ sourceInvestmentId: sourceId })]
    )
  } else {
    existing = await db.query(
      `SELECT id, investor_questionnaire_answers_json FROM deal_investment
       WHERE deal_id = $1
         AND contact_id = $2
         AND investor_role = 'lp_investors'
         AND commitment_amount = $3
         AND investor_class = $4
         AND profile_id = $5
         AND (
           ($6::text IS NOT NULL AND user_investor_profile_id::text = $6)
           OR ($6::text IS NULL AND user_investor_profile_id IS NULL)
         )
       LIMIT 1`,
      [
        dealId,
        contactId,
        commitmentAmount,
        investorClass,
        profileId,
        userInvestorProfileId || null,
      ]
    )
  }

  if (existing.rows.length) {
    const mergedQuestionnaire = mergeQuestionnaireAnswersJson(
      existing.rows[0].investor_questionnaire_answers_json,
      questionnaireJson
    )
    const result = await db.query(
      `UPDATE deal_investment SET
        contact_display_name = $2,
        profile_id = $3,
        user_investor_profile_id = $4,
        investor_class = $5,
        commitment_amount = $6,
        fund_approved = $7,
        funding_method = $8,
        status = $9,
        doc_signed_date = $10,
        esign_status_json = $11,
        investor_questionnaire_answers_json = COALESCE($12, investor_questionnaire_answers_json)
       WHERE id = $1
       RETURNING id`,
      [
        existing.rows[0].id,
        contactDisplayName || '',
        profileId || '',
        userInvestorProfileId,
        investorClass,
        commitmentAmount,
        fundApproved,
        fundingMethod,
        status || '',
        docSignedDate || null,
        sourceId ? JSON.stringify({ sourceInvestmentId: sourceId }) : null,
        mergedQuestionnaire,
      ]
    )
    return { entityId: result.rows[0].id, inserted: false }
  }

  const result = await db.query(
    `INSERT INTO deal_investment (
      deal_id, contact_id, contact_display_name, profile_id, user_investor_profile_id,
      investor_role, investor_class, commitment_amount, fund_approved, funding_method,
      status, doc_signed_date, esign_status_json, investor_questionnaire_answers_json
    ) VALUES (
      $1,$2,$3,$4,$5,'lp_investors',$6,$7,$8,$9,$10,$11,$12,$13
    )
    RETURNING id`,
    [
      dealId,
      contactId,
      contactDisplayName || '',
      profileId || '',
      userInvestorProfileId,
      investorClass,
      commitmentAmount,
      fundApproved,
      fundingMethod,
      status || '',
      docSignedDate || null,
      sourceId ? JSON.stringify({ sourceInvestmentId: sourceId }) : null,
      questionnaireJson,
    ]
  )

  return { entityId: result.rows[0].id, inserted: true }
}

function buildAccreditationQuestionnaireJson(rawStatus) {
  const status = cleanRawValue(rawStatus)
  if (!status) return null
  const lower = status.toLowerCase()
  const isNotAccredited =
    lower.includes('not accredited') ||
    lower === 'non-accredited' ||
    lower === 'nonaccredited' ||
    lower === 'no'
  const answers = {
    etl_accreditation_status: status,
    accreditation_status: status,
  }
  if (isNotAccredited) {
    answers.accreditation_categories = JSON.stringify(['I. Not accredited'])
  }
  return JSON.stringify(answers)
}

function mergeQuestionnaireAnswersJson(existingRaw, incomingRaw) {
  if (!incomingRaw) return existingRaw || null
  if (!existingRaw) return incomingRaw
  try {
    const existing =
      typeof existingRaw === 'string' ? JSON.parse(existingRaw || '{}') : existingRaw || {}
    const incoming =
      typeof incomingRaw === 'string' ? JSON.parse(incomingRaw || '{}') : incomingRaw || {}
    if (!existing || typeof existing !== 'object') return incomingRaw
    if (!incoming || typeof incoming !== 'object') return existingRaw
    return JSON.stringify({ ...existing, ...incoming })
  } catch {
    return incomingRaw
  }
}

async function syncCommittedAmounts(db, dealId) {
  // Attribute committed amounts per LP seat (contact + class + Cash Flow profile).
  await db.query(
    `UPDATE deal_lp_investor lp
     SET committed_amount = COALESCE(sums.total::text, lp.committed_amount, '0'),
         updated_at = NOW()
     FROM (
       SELECT i.contact_id,
              i.investor_class,
              COALESCE(NULLIF(TRIM(p.source_profile_id), ''), '') AS source_profile_id,
              SUM(
                NULLIF(regexp_replace(i.commitment_amount, '[^0-9.\\-]', '', 'g'), '')::numeric
              ) AS total
       FROM deal_investment i
       LEFT JOIN user_investor_profiles p ON p.id = i.user_investor_profile_id
       WHERE i.deal_id = $1 AND i.investor_role = 'lp_investors'
       GROUP BY i.contact_id, i.investor_class, COALESCE(NULLIF(TRIM(p.source_profile_id), ''), '')
     ) sums
     WHERE lp.deal_id = $1
       AND lp.contact_member_id = sums.contact_id
       AND LOWER(TRIM(COALESCE(lp.investor_class, '')))
         = LOWER(TRIM(COALESCE(sums.investor_class, '')))
       AND LOWER(TRIM(COALESCE(lp.source_profile_id, '')))
         = LOWER(TRIM(COALESCE(sums.source_profile_id, '')))`,
    [dealId]
  )
}

/**
 * Deal Investors ETL (etl-add-investor-mapping.mdc + etl-cashflow-investor-upload.mdc)
 * Users are created via invite pattern BEFORE roster — Add Investor API does NOT create users.
 */
async function runDealInvestorsEtl({ filePath, dealId, organizationId, jobId = null, onRowResult }) {
  if (!dealId) {
    throw new Error('Deal is required. Select a deal name from the dropdown.')
  }
  if (!isValidUuid(dealId)) {
    throw new Error('Deal ID must be a valid UUID from the Deal Name dropdown')
  }

  const db = await getPool()
  await ensureLpInvestorPercentColumns(db)
  const dealExists = await db.query(
    'SELECT id, organization_id FROM add_deal_form WHERE id = $1 LIMIT 1',
    [dealId]
  )
  if (!dealExists.rows.length) {
    throw new Error(`Selected deal does not exist: ${dealId}`)
  }

  const orgId =
    (organizationId && isValidUuid(organizationId) ? organizationId : null) ||
    dealExists.rows[0].organization_id ||
    (await resolveDealOrganizationId(db, dealId)) ||
    process.env.DEFAULT_ORGANIZATION_ID ||
    null

  if (!orgId || !isValidUuid(orgId)) {
    throw new Error(
      'Organization ID is required to upsert investor/sponsor users (deal has no organization_id).'
    )
  }

  const workbook = readDealInvestorWorkbook(filePath)
  if (!workbook.addInvestors.rowCount) {
    throw new Error('No Add Investors data rows found (yellow hint rows are skipped)')
  }

  const mapProfileId = buildProfileIdMapper(workbook.profileIdMap)

  logAudit(
    `Deal Investors ETL | roster=${workbook.addInvestors.rowCount} investments=${workbook.investments.rowCount} dealId=${dealId}`
  )

  let successCount = 0
  let failedCount = 0
  const errors = []
  const contactReviews = []
  const seenReviewKeys = new Set()
  let lastAddedBy = null

  const dealMeta = await db.query(
    'SELECT deal_name FROM add_deal_form WHERE id = $1 LIMIT 1',
    [dealId]
  )
  const dealName = cleanRawValue(dealMeta.rows[0]?.deal_name) || ''

  async function resolveUserWithReview(row, columns) {
    const email = toContactStyleEmail(getCellFromRow(row, columns.contact_email))
    const profileDisplayName = cleanRawValue(
      getCellFromRow(row, columns.contact_display_name)
    )
    const firstName = cleanRawValue(getCellFromRow(row, columns.first_name || []))
    const lastName = cleanRawValue(getCellFromRow(row, columns.last_name || []))
    const phone = cleanRawValue(getCellFromRow(row, columns.contact_phone || []))
    const excelInvestorName = cleanRawValue(getCellFromRow(row, columns.investor_name || []))
    // Contact review / name match must use investor_name (first+last), not
    // contact_display_name / profile name — CRM contacts store person full_name.
    const investorName =
      excelInvestorName ||
      [firstName, lastName].filter(Boolean).join(' ').trim() ||
      profileDisplayName
    const sourceProfileId =
      cleanRawValue(getCellFromRow(row, columns.source_profile_key || [])) ||
      cleanRawValue(getCellFromRow(row, columns.source_profile_id))

    const resolved = await resolveInvestorUserId(db, {
      email,
      displayName: investorName,
      firstName: firstName || (investorName ? splitName(investorName).firstName : ''),
      lastName: lastName || (investorName ? splitName(investorName).lastName : ''),
      phone,
      organizationId: orgId,
      explicitId: cleanRawValue(getCellFromRow(row, columns.contact_id)),
      sourceProfileId,
      dealId,
      dealName,
      jobId,
    })

    if (resolved.contactReview?.reviewId) {
      const key = resolved.contactReview.reviewId
      if (!seenReviewKeys.has(key)) {
        seenReviewKeys.add(key)
        contactReviews.push(resolved.contactReview)
      }
    }

    return {
      ...resolved,
      email,
      displayName: investorName,
      profileDisplayName: profileDisplayName || investorName,
      firstName,
      lastName,
      phone,
      investorName,
      sourceProfileId,
    }
  }

  // 1) Add Investors → upsert users → deal_lp_investor (roster only)
  for (let index = 0; index < workbook.addInvestors.rows.length; index++) {
    const rowNumber = index + 2
    const row = workbook.addInvestors.rows[index]

    try {
      const {
        userId: contactMemberId,
        email,
        displayName,
        profileDisplayName,
        investorName,
        sourceProfileId,
      } = await resolveUserWithReview(row, ADD_INVESTOR_COLUMNS)

      const className = await assertInvestorClass(db, {
        dealId,
        className: getCellFromRow(row, ADD_INVESTOR_COLUMNS.investor_class_name),
      })

      const userInvestorProfileId = await resolveUserInvestorProfileId(db, {
        explicitId: cleanRawValue(
          getCellFromRow(row, ADD_INVESTOR_COLUMNS.user_investor_profile_id)
        ),
        sourceProfileId,
        email,
        displayName,
        profileDisplayName,
        userId: contactMemberId,
      })

      const addedBy = await resolveRequiredAddedBy(db, {
        selectedSponsors: getCellFromRow(row, ADD_INVESTOR_COLUMNS.selected_sponsors),
        organizationId: orgId,
        dealId,
      })
      lastAddedBy = addedBy

      const profileId = mapProfileId(getCellFromRow(row, ADD_INVESTOR_COLUMNS.profile_id))
      if (!profileId) {
        throw new Error(
          'profile_id is required (individual | joint_tenancy | custodian_ira_401k | llc_corp_trust_etc)'
        )
      }

      const result = await upsertDealLpInvestor(db, {
        dealId,
        contactMemberId,
        email,
        investorName,
        profileDisplayName,
        sourceProfileId,
        investorClass: className,
        profileId,
        userInvestorProfileId,
        role: cleanRawValue(getCellFromRow(row, ADD_INVESTOR_COLUMNS.role)) || 'LP Investor',
        sendInvitationMail: 'no',
        addedBy,
        percentOfClassOwnership: getCellFromRow(
          row,
          ADD_INVESTOR_COLUMNS.percent_of_class_ownership
        ),
        percentOfClassDistributions: getCellFromRow(
          row,
          ADD_INVESTOR_COLUMNS.percent_of_class_distributions
        ),
        entityOwnershipPercent: getCellFromRow(
          row,
          ADD_INVESTOR_COLUMNS.entity_ownership_percent
        ),
        distributionAllocationPercent: getCellFromRow(
          row,
          ADD_INVESTOR_COLUMNS.distribution_allocation_percent
        ),
      })

      successCount++
      if (onRowResult) {
        await onRowResult({
          rowNumber,
          success: true,
          entityId: result.entityId,
          columnName: listFilledExcelColumns(row, ADD_INVESTOR_COLUMNS).join(', ') || 'deal_lp_investor',
          message: result.inserted
            ? `Inserted LP investor user=${contactMemberId} added_by=${addedBy}`
            : `Updated LP investor user=${contactMemberId}`,
        })
      }
    } catch (error) {
      failedCount++
      const errorMessage = error.message || 'Add Investor load failed'
      errors.push({
        rowNumber,
        columnName: 'deal_lp_investor',
        errorType: 'LOAD',
        errorMessage,
      })
      if (onRowResult) await onRowResult({ rowNumber, success: false, errorMessage })
    }
  }

  // 2) Investments → always ensure deal_lp_investor (even if not invested);
  //    deal_investment only when an Invested amount is present (including $0).
  for (let index = 0; index < workbook.investments.rows.length; index++) {
    const rowNumber = 3000 + index + 2
    const row = workbook.investments.rows[index]

    try {
      const {
        userId: contactId,
        email,
        displayName,
        profileDisplayName,
        investorName,
        sourceProfileId,
      } = await resolveUserWithReview(row, INVESTMENT_COLUMNS)

      const className = await assertInvestorClass(db, {
        dealId,
        className: getCellFromRow(row, INVESTMENT_COLUMNS.investor_class_name),
      })

      const userInvestorProfileId = await resolveUserInvestorProfileId(db, {
        explicitId: cleanRawValue(
          getCellFromRow(row, INVESTMENT_COLUMNS.user_investor_profile_id)
        ),
        sourceProfileId,
        email,
        displayName,
        profileDisplayName,
        userId: contactId,
      })

      const profileId =
        mapProfileId(getCellFromRow(row, INVESTMENT_COLUMNS.profile_id)) || 'individual'

      // Roster first — non-invested people must still appear on deal_lp_investor
      const addedBy = await resolveRequiredAddedBy(db, {
        selectedSponsors:
          getCellFromRow(row, INVESTMENT_COLUMNS.selected_sponsors) || null,
        organizationId: orgId,
        dealId,
      })
      lastAddedBy = addedBy

      const lpResult = await upsertDealLpInvestor(db, {
        dealId,
        contactMemberId: contactId,
        email,
        investorName,
        profileDisplayName,
        sourceProfileId,
        investorClass: className,
        profileId,
        userInvestorProfileId,
        role: 'LP Investor',
        sendInvitationMail: 'no',
        addedBy,
      })

      const rawCommitment = getCellFromRow(row, INVESTMENT_COLUMNS.commitment_amount)
      const hasCommitmentCell =
        rawCommitment !== undefined &&
        rawCommitment !== null &&
        String(rawCommitment).trim() !== ''
      const commitmentAmount = hasCommitmentCell ? stripMoney(rawCommitment) || '0' : ''

      let investmentEntityId = lpResult.entityId
      let investmentMessage = lpResult.inserted
        ? `Inserted LP roster (not invested yet) user=${contactId}`
        : `Updated LP roster (not invested yet) user=${contactId}`

      if (hasCommitmentCell) {
        let accreditationStatus = cleanRawValue(
          getCellFromRow(row, INVESTMENT_COLUMNS.accreditation_status)
        )
        if (!accreditationStatus && userInvestorProfileId) {
          const fromProfile = await db.query(
            `SELECT form_snapshot->>'accreditationStatus' AS status
             FROM user_investor_profiles
             WHERE id = $1
             LIMIT 1`,
            [userInvestorProfileId]
          )
          accreditationStatus = cleanRawValue(fromProfile.rows[0]?.status)
        }

        const result = await insertDealInvestment(db, {
          dealId,
          contactId,
          contactDisplayName: profileDisplayName || displayName,
          investorClass: className,
          profileId,
          userInvestorProfileId,
          commitmentAmount,
          fundApproved: isFundApproved({
            fundApprovedCell: getCellFromRow(row, INVESTMENT_COLUMNS.fund_approved),
            status: getCellFromRow(row, INVESTMENT_COLUMNS.status),
          }),
          fundingMethod: mapFundingMethod(
            getCellFromRow(row, INVESTMENT_COLUMNS.funding_method)
          ),
          status: cleanRawValue(getCellFromRow(row, INVESTMENT_COLUMNS.status)),
          docSignedDate: cleanRawValue(
            getCellFromRow(row, INVESTMENT_COLUMNS.doc_signed_date)
          ),
          sourceInvestmentId: cleanRawValue(
            getCellFromRow(row, INVESTMENT_COLUMNS.source_investment_id)
          ),
          accreditationStatus,
        })
        investmentEntityId = result.entityId
        investmentMessage = result.inserted
          ? `Inserted LP investment ${commitmentAmount}`
          : `Updated LP investment ${commitmentAmount}`
      }

      successCount++
      if (onRowResult) {
        await onRowResult({
          rowNumber,
          success: true,
          entityId: investmentEntityId,
          columnName:
            listFilledExcelColumns(row, INVESTMENT_COLUMNS).join(', ') ||
            'deal_lp_investor',
          message: investmentMessage,
        })
      }
    } catch (error) {
      failedCount++
      const errorMessage = error.message || 'Investment load failed'
      errors.push({
        rowNumber,
        columnName: 'deal_investment',
        errorType: 'LOAD',
        errorMessage,
      })
      if (onRowResult) await onRowResult({ rowNumber, success: false, errorMessage })
    }
  }

  // 3) Sync committed_amount
  await syncCommittedAmounts(db, dealId)

  // 4) Reconcile assigning_deal_user
  await reconcileAssigningDealUsersForDeal(db, {
    dealId,
    actorUserId: lastAddedBy,
  })

  return {
    sheets: {
      addInvestors: workbook.addInvestors.sheetName,
      investments: workbook.investments.sheetName,
    },
    totalRecords: workbook.addInvestors.rowCount + workbook.investments.rowCount,
    successCount,
    failedCount,
    errors,
    contactReviews,
    contactReviewCount: contactReviews.length,
  }
}

module.exports = {
  readDealInvestorWorkbook,
  runDealInvestorsEtl,
  mapProfileId: buildProfileIdMapper(),
  mapFundingMethod,
}

