const { getPool } = require('../dbService')
const columnMappingService = require('./columnMappingService')
const { generateUniqueUuid, createInvitedUsername, isValidUuid } = require('./uuidUtils')
const { buildUserPasswordHash } = require('./userPasswordService')
const { mapDealMemberRole } = require('../../constants/dealMemberRole.constants')
const {
  sanitizeContactName,
  buildContactFullName,
} = require('./contactNameUtils')
const { isPlaceholderEmail } = require('./emailPlaceholderUtils')

const INSERT_HANDLERS = {
  add_deal_form: insertAddDealForm,
  deal_lp_investor: insertDealLpInvestor,
  deal_member: insertDealMember,
  users: insertUser,
  contact: insertContact,
}

const jobUsedIds = new Map()

function getUsedIdsForJob(jobId) {
  if (!jobUsedIds.has(jobId)) {
    jobUsedIds.set(jobId, new Set())
  }
  return jobUsedIds.get(jobId)
}

function clearUsedIdsForJob(jobId) {
  jobUsedIds.delete(jobId)
}

async function dealIdExistsInDatabase(id) {
  const db = await getPool()
  const result = await db.query(
    'SELECT 1 FROM add_deal_form WHERE id = $1 LIMIT 1',
    [id]
  )
  return result.rows.length > 0
}

async function insertAddDealForm(data, options = {}) {
  const db = await getPool()

  if (!data.organization_id) {
    return { success: false, error: 'Organization ID is required' }
  }

  const usedIds = options.jobId ? getUsedIdsForJob(options.jobId) : new Set()
  const recordId = await generateUniqueUuid({
    existsCheck: dealIdExistsInDatabase,
    usedIds,
  })

  const columns = [
    'id', 'organization_id', 'deal_name', 'deal_type', 'deal_stage', 'sec_type', 'close_date',
    'owning_entity_name', 'funds_required_before_gp_sign', 'auto_send_funding_instructions',
    'property_name', 'country', 'address_line_1', 'address_line_2', 'city', 'state', 'zip_code',
    'asset_image_path', 'investor_summary_html', 'gallery_cover_image_url', 'key_highlights_json',
    'deal_announcement_title', 'deal_announcement_message', 'offering_status', 'offering_visibility',
    'show_on_investbase', 'internal_name', 'offering_overview_asset_ids', 'offering_gallery_paths',
    'created_at', 'offering_preview_token', 'offering_investor_preview_json', 'esign_templates_json',
    'investor_questionnaire_json', 'funding_instructions_json', 'offering_overview_class_id',
  ]

  const record = { ...data, id: recordId }

  if (
    record.funds_required_before_gp_sign === null ||
    record.funds_required_before_gp_sign === undefined ||
    record.funds_required_before_gp_sign === false
  ) {
    record.funds_required_before_gp_sign = 0
  }

  if (record.auto_send_funding_instructions === null || record.auto_send_funding_instructions === undefined) {
    record.auto_send_funding_instructions = false
  }

  if (!record.internal_name && record.deal_name) {
    record.internal_name = record.deal_name
  }

  if (!record.offering_overview_asset_ids) {
    record.offering_overview_asset_ids = '[]'
  }

  if (!record.offering_gallery_paths) {
    record.offering_gallery_paths = '[]'
  }

  // Cash Flow uses '-' when close date is unknown; DATE column cannot store that.
  const closeRaw = record.close_date
  if (
    closeRaw === '-' ||
    closeRaw === '—' ||
    closeRaw === '–' ||
    String(closeRaw || '').trim().toLowerCase() === 'n/a'
  ) {
    record.close_date = null
  }

  const values = columns.map((column) => (record[column] !== undefined ? record[column] : null))
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ')

  const result = await db.query(
    `INSERT INTO add_deal_form (${columns.join(', ')})
     VALUES (${placeholders})
     RETURNING id`,
    values
  )

  if (result.rows[0].id !== recordId) {
    return { success: false, error: 'Insert returned unexpected id' }
  }

  return {
    success: true,
    entityId: recordId,
  }
}

async function resolveDealId(dealRef) {
  if (!dealRef) return null

  const db = await getPool()
  const value = String(dealRef).trim()

  if (isValidUuid(value)) {
    const byId = await db.query(
      'SELECT id FROM add_deal_form WHERE id = $1 LIMIT 1',
      [value]
    )
    return byId.rows[0]?.id || null
  }

  const byName = await db.query(
    'SELECT id FROM add_deal_form WHERE deal_name = $1 LIMIT 1',
    [value]
  )
  return byName.rows[0]?.id || null
}

async function investorIdExistsInDatabase(id) {
  const db = await getPool()
  const result = await db.query('SELECT 1 FROM deal_lp_investor WHERE id = $1 LIMIT 1', [id])
  return result.rows.length > 0
}

async function insertDealLpInvestor(data, options = {}) {
  const db = await getPool()

  const selectedDealId = isValidUuid(data.deal_id)
    ? String(data.deal_id).trim()
    : null
  const dealId = selectedDealId || await resolveDealId(data.deal_id)

  if (!dealId) {
    return { success: false, error: 'Deal is required. Select a deal name from the dropdown.' }
  }

  if (selectedDealId) {
    const exists = await db.query(
      'SELECT 1 FROM add_deal_form WHERE id = $1 LIMIT 1',
      [dealId]
    )
    if (!exists.rows.length) {
      return { success: false, error: `Selected deal does not exist: ${dealId}` }
    }
  }

  const usedIds = options.jobId ? getUsedIdsForJob(options.jobId) : new Set()
  const recordId = await generateUniqueUuid({
    existsCheck: investorIdExistsInDatabase,
    usedIds,
  })

  const result = await db.query(
    `INSERT INTO deal_lp_investor (
      id, deal_id, contact_member_id, email, committed_amount, investor_class, role,
      profile_id, send_invitation_mail, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, CURRENT_TIMESTAMP), COALESCE($11, CURRENT_TIMESTAMP))
    RETURNING id`,
    [
      recordId,
      dealId,
      data.contact_member_id || '',
      data.email ||
        `${String(data.investor_name || data.contact_member_id || 'investor').replace(/\s+/g, '.').toLowerCase()}@import.local`,
      data.committed_amount != null ? String(data.committed_amount) : '',
      data.investor_class || 'Class A',
      data.role || 'LP',
      data.profile_id || '',
      data.send_invitation_mail || 'no',
      data.created_at || null,
      data.updated_at || null,
    ]
  )

  return { success: true, entityId: result.rows[0].id, dealId }
}

async function resolveContactIdByEmail(email) {
  const value = String(email || '').trim()
  if (!value) return null

  const db = await getPool()

  if (isValidUuid(value)) {
    const byId = await db.query(
      'SELECT id FROM contact WHERE id = $1 LIMIT 1',
      [value]
    )
    if (byId.rows.length) return String(byId.rows[0].id)
  }

  const byEmail = await db.query(
    `SELECT id
     FROM contact
     WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))
     ORDER BY created_at DESC
     LIMIT 1`,
    [value]
  )

  return byEmail.rows[0] ? String(byEmail.rows[0].id) : null
}

async function memberIdExistsInDatabase(id) {
  const db = await getPool()
  const result = await db.query('SELECT 1 FROM deal_member WHERE id = $1 LIMIT 1', [id])
  return result.rows.length > 0
}

async function insertDealMember(data, options = {}) {
  const db = await getPool()

  // Prefer the Deal Name dropdown UUID; fall back to name/id resolution if needed.
  const selectedDealId = isValidUuid(data.deal_id)
    ? String(data.deal_id).trim()
    : null
  const dealId = selectedDealId || await resolveDealId(data.deal_id)

  if (!dealId) {
    return { success: false, error: 'Deal is required. Select a deal name from the dropdown.' }
  }

  if (selectedDealId) {
    const exists = await db.query(
      'SELECT 1 FROM add_deal_form WHERE id = $1 LIMIT 1',
      [dealId]
    )
    if (!exists.rows.length) {
      return { success: false, error: `Selected deal does not exist: ${dealId}` }
    }
  }

  const emailOrRef = data.email || data.contact_member_id
  const contactMemberId = await resolveContactIdByEmail(emailOrRef)

  if (!contactMemberId) {
    return {
      success: false,
      error: `No contact found for email: ${emailOrRef || '(empty)'}. Upload the contact first.`,
    }
  }

  const usedIds = options.jobId ? getUsedIdsForJob(options.jobId) : new Set()
  const recordId = await generateUniqueUuid({
    existsCheck: memberIdExistsInDatabase,
    usedIds,
  })

  const result = await db.query(
    `INSERT INTO deal_member (
      id, deal_id, contact_member_id, deal_member_role, send_invitation_mail,
      deal_member_name, deal_member_sponsor_name, deal_member_sponsor_type,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, CURRENT_TIMESTAMP), COALESCE($10, CURRENT_TIMESTAMP))
    RETURNING id`,
    [
      recordId,
      dealId,
      contactMemberId,
      mapDealMemberRole(data.deal_member_role) || 'Member',
      data.send_invitation_mail || 'no',
      data.deal_member_name || data.member_name || data.full_name || null,
      data.deal_member_sponsor_name || data.sponsor_name || null,
      data.deal_member_sponsor_type || data.sponsor_type || null,
      data.created_at || null,
      data.updated_at || null,
    ]
  )

  return { success: true, entityId: result.rows[0].id, dealId, contactMemberId }
}

async function userIdExistsInDatabase(id) {
  const db = await getPool()
  const result = await db.query('SELECT 1 FROM users WHERE id = $1 LIMIT 1', [id])
  return result.rows.length > 0
}

async function insertUser(data, options = {}) {
  const db = await getPool()

  if (!data.organization_id) {
    return { success: false, error: 'Organization ID is required' }
  }

  const orgResult = await db.query(
    'SELECT 1 FROM companies WHERE id = $1 LIMIT 1',
    [data.organization_id]
  )
  if (!orgResult.rows.length) {
    return { success: false, error: `Organization does not exist: ${data.organization_id}` }
  }

  const usedIds = options.jobId ? getUsedIdsForJob(options.jobId) : new Set()
  const recordId = await generateUniqueUuid({
    existsCheck: userIdExistsInDatabase,
    usedIds,
  })

  const username = data.username || createInvitedUsername()
  const { passwordHash } = await buildUserPasswordHash({
    firstName: data.first_name,
    phone: data.phone,
  })

  if (!username) {
    return { success: false, error: 'Username is required' }
  }

  const result = await db.query(
    `INSERT INTO users (
      id, email, username, password_hash, role, user_status, user_signup_completed,
      organization_id, first_name, last_name, phone, created_at, updated_at, invite_expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, CURRENT_TIMESTAMP), COALESCE($13, CURRENT_TIMESTAMP), $14)
    RETURNING id`,
    [
      recordId,
      data.email,
      username,
      passwordHash,
      data.role || 'platform_user',
      data.user_status || 'active',
      data.user_signup_completed
        ? String(data.user_signup_completed).toLowerCase()
        : 'true',
      data.organization_id,
      data.first_name || '',
      data.last_name || '',
      data.phone || '',
      data.created_at || null,
      data.updated_at || null,
      data.invite_expires_at || null,
    ]
  )

  return { success: true, entityId: result.rows[0].id }
}

function toJsonbValue(value, fallback = []) {
  if (value === undefined || value === null || value === '') return JSON.stringify(fallback)
  if (typeof value === 'object') return JSON.stringify(value)

  const trimmed = String(value).trim()
  if (!trimmed) return JSON.stringify(fallback)

  try {
    const parsed = JSON.parse(trimmed)
    return JSON.stringify(parsed)
  } catch {
    const parts = trimmed.split(',').map((part) => part.trim()).filter(Boolean)
    return JSON.stringify(parts.length ? parts : fallback)
  }
}

async function resolveContactCreatedBy({ organizationId, createdBy }) {
  const db = await getPool()

  if (isValidUuid(createdBy)) {
    const byId = await db.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [createdBy])
    if (byId.rows.length) return byId.rows[0].id
  }

  const envUserId = String(process.env.DEFAULT_CREATED_BY_USER_ID || '').trim()
  if (isValidUuid(envUserId)) {
    const byEnv = await db.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [envUserId])
    if (byEnv.rows.length) return byEnv.rows[0].id
  }

  if (organizationId) {
    const byOrg = await db.query(
      `SELECT id FROM users
       WHERE organization_id = $1
       ORDER BY created_at ASC
       LIMIT 1`,
      [organizationId]
    )
    if (byOrg.rows.length) return byOrg.rows[0].id
  }

  const anyUser = await db.query(
    'SELECT id FROM users ORDER BY created_at ASC LIMIT 1'
  )
  return anyUser.rows[0]?.id || null
}

async function contactIdExistsInDatabase(id) {
  const db = await getPool()
  const result = await db.query('SELECT 1 FROM contact WHERE id = $1 LIMIT 1', [id])
  return result.rows.length > 0
}

let contactExtraColumnsReady = false

async function ensureContactExtraColumns(db) {
  if (contactExtraColumnsReady) return
  await db.query(`
    ALTER TABLE contact
      ADD COLUMN IF NOT EXISTS show_offerings_visibility varchar(32)
        NOT NULL DEFAULT 'ALL_OFFERINGS',
      ADD COLUMN IF NOT EXISTS accreditation_status varchar(64),
      ADD COLUMN IF NOT EXISTS known_since date
  `)
  contactExtraColumnsReady = true
}

async function insertContact(data, options = {}) {
  const db = await getPool()
  await ensureContactExtraColumns(db)

  if (!data.organization_id) {
    return { success: false, error: 'Organization ID is required' }
  }

  const orgResult = await db.query(
    'SELECT 1 FROM companies WHERE id = $1 LIMIT 1',
    [data.organization_id]
  )
  if (!orgResult.rows.length) {
    return { success: false, error: `Organization does not exist: ${data.organization_id}` }
  }

  const email = String(data.email || '').trim()
  if (!email) {
    return { success: false, error: 'Email is required to insert or update a contact' }
  }

  const createdBy = await resolveContactCreatedBy({
    organizationId: data.organization_id,
    createdBy: data.created_by,
  })

  if (!createdBy) {
    return {
      success: false,
      error: 'created_by user is required. Upload a company member first or set DEFAULT_CREATED_BY_USER_ID.',
    }
  }

  const firstName = sanitizeContactName(data.first_name)
  const lastName = sanitizeContactName(data.last_name)
  const fullName = buildContactFullName(firstName, lastName, data.full_name)
  const visibility =
    String(data.show_offerings_visibility || 'ALL_OFFERINGS').trim() || 'ALL_OFFERINGS'
  const accreditationStatus = data.accreditation_status
    ? String(data.accreditation_status).trim()
    : null
  const knownSince = data.known_since || null
  const phone = String(data.phone || '').trim()
  const note = String(data.note || '')
  const status = data.status || 'active'
  const hasExcelTags =
    data.tags != null && String(data.tags).trim() !== '' && String(data.tags).trim() !== '[]'
  const hasExcelLists =
    data.lists != null && String(data.lists).trim() !== '' && String(data.lists).trim() !== '[]'
  const hasExcelOwners =
    data.owners != null && String(data.owners).trim() !== '' && String(data.owners).trim() !== '[]'

  // Real emails: match by email+org. Placeholders like "redacted": also match name
  // so many redacted people stay distinct rows.
  const existing = isPlaceholderEmail(email) && (firstName || lastName)
    ? await db.query(
      `SELECT id, first_name, last_name, full_name, phone, note, status,
              show_offerings_visibility,
              accreditation_status, known_since, organization_id,
              tags, lists, owners
       FROM contact
       WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))
         AND organization_id = $2
         AND LOWER(TRIM(COALESCE(first_name, ''))) = LOWER(TRIM($3))
         AND LOWER(TRIM(COALESCE(last_name, ''))) = LOWER(TRIM($4))
       ORDER BY created_at DESC
       LIMIT 1`,
      [email, data.organization_id, firstName || '', lastName || '']
    )
    : await db.query(
      `SELECT id, first_name, last_name, full_name, phone, note, status,
              show_offerings_visibility,
              accreditation_status, known_since, organization_id,
              tags, lists, owners
       FROM contact
       WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))
         AND organization_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [email, data.organization_id]
    )

  if (existing.rows.length) {
    const row = existing.rows[0]
    // Excel wins when it has a value; otherwise keep the existing DB value.
    const nextFirst = firstName || sanitizeContactName(row.first_name) || ''
    const nextLast = lastName || sanitizeContactName(row.last_name) || ''
    const nextFull = buildContactFullName(nextFirst, nextLast, row.full_name || fullName)
    const nextPhone = phone || row.phone || ''
    const nextNote = note !== '' ? note : (row.note || '')
    const nextStatus = status || row.status || 'active'
    const nextVisibility = visibility || row.show_offerings_visibility || 'ALL_OFFERINGS'
    const nextAccreditation =
      accreditationStatus != null && accreditationStatus !== ''
        ? accreditationStatus
        : row.accreditation_status
    const nextKnownSince = knownSince || row.known_since

    await db.query(
      `UPDATE contact SET
        first_name = $2,
        last_name = $3,
        full_name = $4,
        phone = $5,
        note = $6,
        status = $7,
        show_offerings_visibility = $8,
        accreditation_status = $9,
        known_since = $10,
        tags = CASE WHEN $11::boolean THEN $12::jsonb ELSE tags END,
        lists = CASE WHEN $13::boolean THEN $14::jsonb ELSE lists END,
        owners = CASE WHEN $15::boolean THEN $16::jsonb ELSE owners END,
        last_edit_reason = COALESCE(NULLIF($17, ''), last_edit_reason),
        organization_id = $18
       WHERE id = $1`,
      [
        row.id,
        nextFirst,
        nextLast,
        nextFull,
        nextPhone,
        nextNote,
        nextStatus,
        nextVisibility,
        nextAccreditation,
        nextKnownSince,
        hasExcelTags,
        toJsonbValue(data.tags),
        hasExcelLists,
        toJsonbValue(data.lists),
        hasExcelOwners,
        toJsonbValue(data.owners),
        data.last_edit_reason || 'ETL contact upsert by email',
        data.organization_id,
      ]
    )

    return {
      success: true,
      entityId: String(row.id),
      updated: true,
      message: `Updated existing contact by email ${email}`,
    }
  }

  // Email not found for this org → insert a new contact row.
  const usedIds = options.jobId ? getUsedIdsForJob(options.jobId) : new Set()
  const recordId = await generateUniqueUuid({
    existsCheck: contactIdExistsInDatabase,
    usedIds,
  })

  const result = await db.query(
    `INSERT INTO contact (
      id, organization_id, first_name, last_name, full_name, email, is_portal_user, platform_admin_only,
      phone, note, tags, lists, owners, status,
      show_offerings_visibility, accreditation_status, known_since,
      last_edit_reason, created_by, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14,
      $15, $16, $17,
      $18, $19,
      COALESCE($20, CURRENT_TIMESTAMP)
    )
    RETURNING id`,
    [
      recordId,
      data.organization_id,
      firstName,
      lastName,
      fullName,
      email,
      Boolean(data.is_portal_user),
      Boolean(data.platform_admin_only),
      phone,
      note,
      toJsonbValue(data.tags),
      toJsonbValue(data.lists),
      toJsonbValue(data.owners),
      status,
      visibility,
      accreditationStatus,
      knownSince,
      data.last_edit_reason || null,
      createdBy,
      data.created_at || null,
    ]
  )

  return {
    success: true,
    entityId: result.rows[0].id,
    inserted: true,
    message: `Inserted new contact ${email}`,
  }
}

async function insertRecord({ uploadType, data, jobId }) {
  const uploadConfig = columnMappingService.getUploadConfig(uploadType)
  if (!uploadConfig) {
    return { success: false, error: `No upload configuration for ${uploadType}` }
  }

  const handler = INSERT_HANDLERS[uploadConfig.targetTable]
  if (!handler) {
    return { success: false, error: `No insert handler for table ${uploadConfig.targetTable}` }
  }

  try {
    return await handler(data, { jobId })
  } catch (error) {
    if (error.code === '23505') {
      return { success: false, error: 'Duplicate record — existing rows were left unchanged' }
    }
    return { success: false, error: error.message }
  }
}

async function validateRelationship({ uploadType, data, rowNumber }) {
  if (uploadType !== 'INVESTOR_UPLOAD' && uploadType !== 'MEMBERS_UPLOAD') return []

  const dealId = await resolveDealId(data.deal_id)
  if (!dealId) {
    return [{
      rowNumber,
      columnName: 'Deal ID',
      errorType: 'RELATIONSHIP',
      errorMessage: `Deal ID does not exist: ${data.deal_id}`,
    }]
  }

  return []
}

module.exports = {
  insertRecord,
  insertAddDealForm,
  insertDealLpInvestor,
  insertDealMember,
  insertUser,
  insertContact,
  validateRelationship,
  resolveDealId,
  resolveContactIdByEmail,
  clearUsedIdsForJob,
  dealIdExistsInDatabase,
}
