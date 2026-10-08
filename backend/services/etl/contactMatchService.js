/**
 * CRM contact exact/possible matching + manual review queue for Investor uploads.
 * Never auto-inserts contacts when the match is uncertain.
 */

const { generateUniqueUuid, isValidUuid } = require('./uuidUtils')
const {
  isPlaceholderEmail,
  toContactStyleEmail,
} = require('./emailPlaceholderUtils')
const {
  sanitizeContactName,
  buildContactFullName,
  splitFullName,
} = require('./contactNameUtils')

const REVIEW_STATUS = {
  PENDING: 'PENDING',
  RESOLVED: 'RESOLVED',
}

const REVIEW_ACTION = {
  EXISTING_CONTACT: 'EXISTING_CONTACT',
  CREATE_NEW_CONTACT: 'CREATE_NEW_CONTACT',
  SKIP_CONTACT: 'SKIP_CONTACT',
}

const NAME_SUFFIX_RE =
  /\b(ira|roth|sep|401k|eqrp|llc|inc|corp|ltd|lp|trust|custodian|fbo|company)\b/gi

let reviewTableReady = false

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length >= 10) return digits.slice(-10)
  return digits.length >= 7 ? digits : ''
}

function normalizeNameKey(value) {
  return sanitizeContactName(value)
    .toLowerCase()
    .replace(NAME_SUFFIX_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameTokens(value) {
  return normalizeNameKey(value)
    .split(/\s+/)
    .filter(Boolean)
    .sort()
}

function tokensKey(tokens) {
  return tokens.join(' ')
}

function buildNameVariants({ firstName = '', lastName = '', fullName = '' }) {
  const first = sanitizeContactName(firstName)
  const last = sanitizeContactName(lastName)
  const full = sanitizeContactName(fullName) || buildContactFullName(first, last)
  const variants = new Set()

  for (const raw of [full, `${first} ${last}`.trim(), first, last]) {
    const key = normalizeNameKey(raw)
    if (key) variants.add(key)
    const toks = nameTokens(raw)
    if (toks.length) variants.add(tokensKey(toks))
  }

  if (first && last) {
    variants.add(normalizeNameKey(`${last} ${first}`))
    variants.add(tokensKey(nameTokens(`${last} ${first}`)))
  }

  return [...variants].filter(Boolean)
}

function contactDisplayName(row) {
  return (
    sanitizeContactName(row.full_name) ||
    buildContactFullName(row.first_name, row.last_name) ||
    String(row.email || '').trim() ||
    String(row.id || '')
  )
}

function serializeContact(row) {
  return {
    id: String(row.id),
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    fullName: contactDisplayName(row),
    email: row.email || '',
    phone: row.phone || '',
    company: '',
    address: '',
    note: row.note || '',
    organizationId: row.organization_id || null,
    isPortalUser: Boolean(row.is_portal_user),
  }
}

async function ensureContactReviewTable(db) {
  if (reviewTableReady) return
  await db.query(`
    CREATE TABLE IF NOT EXISTS etl_contact_review (
      id uuid PRIMARY KEY,
      job_id integer,
      deal_id uuid,
      organization_id uuid,
      user_id uuid,
      investor_key text NOT NULL,
      uploaded_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
      status text NOT NULL DEFAULT 'PENDING',
      action text,
      selected_contact_id uuid,
      decided_by text,
      decided_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await db.query(`
    CREATE INDEX IF NOT EXISTS etl_contact_review_job_status_idx
      ON etl_contact_review (job_id, status)
  `)
  await db.query(`
    CREATE INDEX IF NOT EXISTS etl_contact_review_org_key_idx
      ON etl_contact_review (organization_id, investor_key)
  `)
  reviewTableReady = true
}

function buildInvestorKey({ email, fullName, phone, sourceProfileId, userId }) {
  const phoneKey = normalizePhone(phone)
  const emailNorm = String(toContactStyleEmail(email) || '').trim().toLowerCase()
  if (emailNorm && !isPlaceholderEmail(emailNorm)) return `email:${emailNorm}`
  if (sourceProfileId) return `source:${String(sourceProfileId).trim().toLowerCase()}`
  if (phoneKey) return `phone:${phoneKey}`
  const nameKey = normalizeNameKey(fullName)
  if (nameKey) return `name:${nameKey}`
  if (userId) return `user:${userId}`
  return `anon:${Date.now()}`
}

async function loadOrgContacts(db, organizationId) {
  if (!organizationId || !isValidUuid(organizationId)) return []
  const result = await db.query(
    `SELECT id, first_name, last_name, full_name, email, phone, note,
            organization_id, is_portal_user
     FROM contact
     WHERE organization_id = $1
     ORDER BY created_at DESC
     LIMIT 5000`,
    [organizationId]
  )
  return result.rows
}

/**
 * Exact match only when confident and unique.
 * Compare email + first name + last name (+ phone when present).
 * Redacted email is NEVER an exact key by itself.
 */
async function findExactContactMatch(db, uploaded) {
  const organizationId = uploaded.organizationId
  const email = String(toContactStyleEmail(uploaded.email) || '').trim()
  const phoneKey = normalizePhone(uploaded.phone)
  const isPlaceholder = isPlaceholderEmail(email)
  const first = normalizeNameKey(uploaded.firstName)
  const last = normalizeNameKey(uploaded.lastName)

  function namesMatch(row) {
    if (!first && !last) return false
    const rowFirst = normalizeNameKey(row.first_name)
    const rowLast = normalizeNameKey(row.last_name)
    const rowFull = normalizeNameKey(row.full_name)
    if (first && last) {
      if (rowFirst === first && rowLast === last) return true
      if (rowFirst === last && rowLast === first) return true
      if (rowFull && rowFull === normalizeNameKey(`${uploaded.firstName} ${uploaded.lastName}`))
        return true
    }
    if (first && !last && (rowFirst === first || rowFull === first)) return true
    if (last && !first && (rowLast === last || rowFull === last)) return true
    return false
  }

  if (email && !isPlaceholder) {
    const byEmail = await db.query(
      `SELECT id, first_name, last_name, full_name, email, phone, note,
              organization_id, is_portal_user
       FROM contact
       WHERE organization_id = $1
         AND LOWER(TRIM(email)) = LOWER(TRIM($2))
       ORDER BY created_at DESC`,
      [organizationId, email]
    )
    if (byEmail.rows.length === 1) {
      const only = byEmail.rows[0]
      // If Excel has names and they conflict with the only email hit → review
      if ((first || last) && (only.first_name || only.last_name || only.full_name) && !namesMatch(only)) {
        return {
          status: 'REVIEW_REQUIRED',
          contact: null,
          candidates: scoreCandidates(uploaded, byEmail.rows).slice(0, 10),
          reasons: ['Email matches but first/last name differs'],
        }
      }
      return {
        status: 'MATCHED',
        contact: serializeContact(only),
        reasons: namesMatch(only)
          ? ['Exact email + name match']
          : ['Exact email match'],
        score: 100,
      }
    }
    if (byEmail.rows.length > 1) {
      const named = byEmail.rows.filter((row) => namesMatch(row))
      if (named.length === 1) {
        return {
          status: 'MATCHED',
          contact: serializeContact(named[0]),
          reasons: ['Exact email + first/last name match'],
          score: 100,
        }
      }
      return {
        status: 'REVIEW_REQUIRED',
        contact: null,
        candidates: scoreCandidates(uploaded, byEmail.rows).slice(0, 10),
        reasons: ['Multiple contacts share this email — confirm first/last name'],
      }
    }
  }

  // Redacted / no email: unique first+last (+ phone) within org
  if (first && last) {
    const byName = await db.query(
      `SELECT id, first_name, last_name, full_name, email, phone, note,
              organization_id, is_portal_user
       FROM contact
       WHERE organization_id = $1
         AND LOWER(TRIM(COALESCE(first_name, ''))) = LOWER(TRIM($2))
         AND LOWER(TRIM(COALESCE(last_name, ''))) = LOWER(TRIM($3))
       ORDER BY created_at DESC
       LIMIT 20`,
      [organizationId, uploaded.firstName || '', uploaded.lastName || '']
    )
    let named = byName.rows.filter((row) => namesMatch(row))
    if (phoneKey) {
      const withPhone = named.filter((row) => normalizePhone(row.phone) === phoneKey)
      if (withPhone.length === 1) {
        return {
          status: 'MATCHED',
          contact: serializeContact(withPhone[0]),
          reasons: ['Exact first/last name + phone match'],
          score: 98,
        }
      }
      if (withPhone.length > 1) named = withPhone
    }
    if (named.length === 1) {
      return {
        status: 'MATCHED',
        contact: serializeContact(named[0]),
        reasons: ['Exact first/last name match'],
        score: 92,
      }
    }
    if (named.length > 1) {
      return {
        status: 'REVIEW_REQUIRED',
        contact: null,
        candidates: scoreCandidates(uploaded, named).slice(0, 10),
        reasons: ['Multiple contacts share this first/last name'],
      }
    }
  }

  if (phoneKey) {
    const byPhone = await db.query(
      `SELECT id, first_name, last_name, full_name, email, phone, note,
              organization_id, is_portal_user
       FROM contact
       WHERE organization_id = $1
         AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE '%' || $2
       ORDER BY created_at DESC
       LIMIT 20`,
      [organizationId, phoneKey]
    )
    const exactPhone = byPhone.rows.filter(
      (row) => normalizePhone(row.phone) === phoneKey
    )
    if (exactPhone.length === 1) {
      const only = exactPhone[0]
      if ((first || last) && (only.first_name || only.last_name) && !namesMatch(only)) {
        return {
          status: 'REVIEW_REQUIRED',
          contact: null,
          candidates: scoreCandidates(uploaded, exactPhone).slice(0, 10),
          reasons: ['Phone matches but name differs'],
        }
      }
      return {
        status: 'MATCHED',
        contact: serializeContact(only),
        reasons: ['Exact phone match'],
        score: 98,
      }
    }
    if (exactPhone.length > 1) {
      const named = exactPhone.filter((row) => namesMatch(row))
      if (named.length === 1) {
        return {
          status: 'MATCHED',
          contact: serializeContact(named[0]),
          reasons: ['Exact phone + name match'],
          score: 99,
        }
      }
      return {
        status: 'REVIEW_REQUIRED',
        contact: null,
        candidates: scoreCandidates(uploaded, exactPhone).slice(0, 10),
        reasons: ['Multiple contacts share this phone'],
      }
    }
  }

  return null
}

function scoreOneCandidate(uploaded, row) {
  const reasons = []
  let score = 0

  const upEmail = String(toContactStyleEmail(uploaded.email) || '').trim().toLowerCase()
  const rowEmail = String(row.email || '').trim().toLowerCase()
  const upPhone = normalizePhone(uploaded.phone)
  const rowPhone = normalizePhone(row.phone)
  const upVariants = new Set(
    buildNameVariants({
      firstName: uploaded.firstName,
      lastName: uploaded.lastName,
      fullName: uploaded.fullName,
    })
  )
  const rowVariants = buildNameVariants({
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: row.full_name,
  })
  const upTokens = nameTokens(
    uploaded.fullName || `${uploaded.firstName || ''} ${uploaded.lastName || ''}`
  )
  const rowTokens = nameTokens(
    row.full_name || `${row.first_name || ''} ${row.last_name || ''}`
  )

  if (upEmail && !isPlaceholderEmail(upEmail) && rowEmail === upEmail) {
    score += 95
    reasons.push('Email matches')
  }

  if (upPhone && rowPhone && upPhone === rowPhone) {
    score += 90
    reasons.push('Phone number matches')
  }

  const exactName = rowVariants.some((v) => upVariants.has(v))
  if (exactName) {
    score += 75
    reasons.push('Full name matches (normalized)')
  } else if (upTokens.length && rowTokens.length) {
    const upSet = new Set(upTokens)
    const overlap = rowTokens.filter((t) => upSet.has(t)).length
    const union = new Set([...upTokens, ...rowTokens]).size
    const ratio = union ? overlap / union : 0
    if (ratio >= 0.8 && overlap >= 2) {
      score += 60
      reasons.push('Name is highly similar')
    } else if (ratio >= 0.5 && overlap >= 1) {
      score += 40
      reasons.push('Name partially matches')
    } else if (overlap >= 1) {
      score += 20
      reasons.push('Shares a name token')
    }
  }

  const upFirst = normalizeNameKey(uploaded.firstName)
  const upLast = normalizeNameKey(uploaded.lastName)
  const rowFirst = normalizeNameKey(row.first_name)
  const rowLast = normalizeNameKey(row.last_name)
  if (upFirst && upLast && rowFirst && rowLast) {
    if (
      (upFirst === rowFirst && upLast === rowLast) ||
      (upFirst === rowLast && upLast === rowFirst)
    ) {
      if (!reasons.includes('Full name matches (normalized)')) {
        score += 70
        reasons.push('First and last name match')
      }
    }
  }

  const company = String(uploaded.company || '').trim().toLowerCase()
  const note = String(row.note || '').toLowerCase()
  if (company && note.includes(company)) {
    score += 15
    reasons.push('Company matches note')
  }

  const sourceId = String(uploaded.sourceProfileId || uploaded.investorId || '')
    .trim()
    .toLowerCase()
  if (sourceId && note.includes(sourceId)) {
    score += 25
    reasons.push('Source investor ID found on contact note')
  }

  score = Math.min(99, score)
  return {
    ...serializeContact(row),
    matchScore: score,
    matchPercent: score,
    reasons,
  }
}

function scoreCandidates(uploaded, rows) {
  return rows
    .map((row) => scoreOneCandidate(uploaded, row))
    .filter((c) => c.matchScore >= 35)
    .sort((a, b) => b.matchScore - a.matchScore)
}

async function findPossibleContactMatches(db, uploaded, { limit = 8 } = {}) {
  const contacts = await loadOrgContacts(db, uploaded.organizationId)
  if (!contacts.length) return []

  const upTokens = nameTokens(
    uploaded.fullName || `${uploaded.firstName || ''} ${uploaded.lastName || ''}`
  )
  const upPhone = normalizePhone(uploaded.phone)
  const upEmail = String(toContactStyleEmail(uploaded.email) || '').trim().toLowerCase()

  const pool = contacts.filter((row) => {
    if (upPhone && normalizePhone(row.phone) === upPhone) return true
    if (upEmail && !isPlaceholderEmail(upEmail) && String(row.email || '').toLowerCase() === upEmail)
      return true
    const rowTokens = nameTokens(
      row.full_name || `${row.first_name || ''} ${row.last_name || ''}`
    )
    if (!upTokens.length || !rowTokens.length) return false
    const upSet = new Set(upTokens)
    return rowTokens.some((t) => upSet.has(t))
  })

  const scored = scoreCandidates(uploaded, pool.length ? pool : contacts.slice(0, 200))
  return scored.slice(0, limit)
}

/**
 * Resolve CRM contact for investor upload without auto-inserting.
 */
async function resolveContactForInvestorUpload(db, uploaded) {
  const firstName =
    sanitizeContactName(uploaded.firstName) ||
    splitFullName(uploaded.fullName).first_name
  const lastName =
    sanitizeContactName(uploaded.lastName) ||
    splitFullName(uploaded.fullName).last_name
  const fullName =
    sanitizeContactName(uploaded.fullName) ||
    buildContactFullName(firstName, lastName)

  const normalized = {
    ...uploaded,
    email: toContactStyleEmail(uploaded.email),
    firstName,
    lastName,
    fullName,
    phone: String(uploaded.phone || '').trim(),
  }

  if (uploaded.preferredContactId && isValidUuid(uploaded.preferredContactId)) {
    const byId = await db.query(
      `SELECT id, first_name, last_name, full_name, email, phone, note,
              organization_id, is_portal_user
       FROM contact WHERE id = $1 LIMIT 1`,
      [uploaded.preferredContactId]
    )
    if (byId.rows.length) {
      return {
        status: 'MATCHED',
        contact: serializeContact(byId.rows[0]),
        candidates: [],
        reasons: ['User-selected contact'],
      }
    }
  }

  const exact = await findExactContactMatch(db, normalized)
  if (exact?.status === 'MATCHED') return { ...exact, candidates: [] }
  if (exact?.status === 'REVIEW_REQUIRED') return exact

  const candidates = await findPossibleContactMatches(db, normalized)
  return {
    status: 'REVIEW_REQUIRED',
    contact: null,
    candidates,
    reasons: candidates.length
      ? ['No exact match — possible contacts found']
      : ['No exact or possible CRM contact match'],
  }
}

async function updateMatchedContact(db, {
  contactId,
  organizationId,
  email,
  firstName,
  lastName,
  phone,
}) {
  const fullName = buildContactFullName(firstName, lastName)
  await db.query(
    `UPDATE contact SET
      is_portal_user = true,
      organization_id = COALESCE(organization_id, $2),
      email = CASE
        WHEN $6::boolean THEN email
        WHEN NULLIF(TRIM($3), '') IS NOT NULL THEN $3
        ELSE email
      END,
      first_name = CASE WHEN $4 <> '' THEN $4 ELSE first_name END,
      last_name = CASE WHEN $5 <> '' THEN $5 ELSE last_name END,
      full_name = CASE WHEN $7 <> '' THEN $7 ELSE full_name END,
      phone = CASE WHEN $8 <> '' THEN $8 ELSE phone END,
      last_edit_reason = 'ETL investor exact/selected contact link'
     WHERE id = $1`,
    [
      contactId,
      organizationId || null,
      String(email || '').trim(),
      sanitizeContactName(firstName),
      sanitizeContactName(lastName),
      isPlaceholderEmail(email),
      fullName,
      String(phone || '').trim(),
    ]
  )
  return contactId
}

async function createContactFromUpload(db, uploaded, { createdBy } = {}) {
  // Final lookup before insert (duplicate protection)
  const exact = await findExactContactMatch(db, uploaded)
  if (exact?.status === 'MATCHED' && exact.contact?.id) {
    await updateMatchedContact(db, {
      contactId: exact.contact.id,
      organizationId: uploaded.organizationId,
      email: uploaded.email,
      firstName: uploaded.firstName,
      lastName: uploaded.lastName,
      phone: uploaded.phone,
    })
    return { contactId: exact.contact.id, created: false, reusedExisting: true }
  }

  let creator = createdBy
  if (!creator || !isValidUuid(creator)) {
    const orgUser = await db.query(
      `SELECT id FROM users
       WHERE organization_id = $1
       ORDER BY created_at ASC
       LIMIT 1`,
      [uploaded.organizationId]
    )
    creator = orgUser.rows[0]?.id
  }
  if (!creator || !isValidUuid(creator)) {
    throw new Error('Cannot create contact: no created_by user available')
  }

  const contactId = await generateUniqueUuid({
    existsCheck: async (id) => {
      const result = await db.query('SELECT 1 FROM contact WHERE id = $1 LIMIT 1', [id])
      return result.rows.length > 0
    },
  })

  const firstName =
    sanitizeContactName(uploaded.firstName) ||
    splitFullName(uploaded.fullName).first_name ||
    'Investor'
  const lastName =
    sanitizeContactName(uploaded.lastName) ||
    splitFullName(uploaded.fullName).last_name ||
    ''
  const fullName = buildContactFullName(firstName, lastName, uploaded.fullName)
  const email = toContactStyleEmail(uploaded.email) || 'redacted'

  await db.query(
    `INSERT INTO contact (
      id, organization_id, first_name, last_name, full_name, email, is_portal_user,
      platform_admin_only, phone, note, created_by, last_edit_reason
    ) VALUES ($1,$2,$3,$4,$5,$6,true,false,$7,$8,$9,$10)`,
    [
      contactId,
      uploaded.organizationId || null,
      firstName,
      lastName,
      fullName,
      email,
      String(uploaded.phone || '').trim(),
      String(uploaded.note || uploaded.company || '').trim(),
      creator,
      'ETL investor manual Create New Contact',
    ]
  )

  return { contactId: String(contactId), created: true, reusedExisting: false }
}

async function upsertPendingContactReview(db, {
  jobId,
  dealId,
  organizationId,
  userId,
  uploaded,
  candidates,
}) {
  await ensureContactReviewTable(db)
  const investorKey = buildInvestorKey({
    email: uploaded.email,
    fullName: uploaded.fullName,
    phone: uploaded.phone,
    sourceProfileId: uploaded.sourceProfileId || uploaded.investorId,
    userId,
  })

  const existing = await db.query(
    `SELECT id FROM etl_contact_review
     WHERE status = 'PENDING'
       AND organization_id = $1
       AND investor_key = $2
       AND ($3::integer IS NULL OR job_id = $3)
     ORDER BY created_at DESC
     LIMIT 1`,
    [organizationId, investorKey, jobId || null]
  )

  const payload = {
    ...uploaded,
    investorKey,
  }

  if (existing.rows.length) {
    await db.query(
      `UPDATE etl_contact_review SET
        job_id = COALESCE($2, job_id),
        deal_id = COALESCE($3, deal_id),
        user_id = COALESCE($4, user_id),
        uploaded_payload = $5::jsonb,
        candidates = $6::jsonb,
        updated_at = NOW()
       WHERE id = $1`,
      [
        existing.rows[0].id,
        jobId || null,
        dealId || null,
        userId || null,
        JSON.stringify(payload),
        JSON.stringify(candidates || []),
      ]
    )
    return String(existing.rows[0].id)
  }

  const id = await generateUniqueUuid({
    existsCheck: async (cid) => {
      const result = await db.query(
        'SELECT 1 FROM etl_contact_review WHERE id = $1 LIMIT 1',
        [cid]
      )
      return result.rows.length > 0
    },
  })

  await db.query(
    `INSERT INTO etl_contact_review (
      id, job_id, deal_id, organization_id, user_id, investor_key,
      uploaded_payload, candidates, status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,'PENDING')`,
    [
      id,
      jobId || null,
      dealId || null,
      organizationId,
      userId || null,
      investorKey,
      JSON.stringify(payload),
      JSON.stringify(candidates || []),
    ]
  )

  return String(id)
}

async function listPendingContactReviews(db, { jobId, organizationId } = {}) {
  await ensureContactReviewTable(db)
  const result = await db.query(
    `SELECT id, job_id, deal_id, organization_id, user_id, investor_key,
            uploaded_payload, candidates, status, created_at
     FROM etl_contact_review
     WHERE status = 'PENDING'
       AND ($1::integer IS NULL OR job_id = $1)
       AND ($2::uuid IS NULL OR organization_id = $2)
     ORDER BY created_at ASC`,
    [jobId || null, organizationId || null]
  )

  return result.rows.map((row) => ({
    reviewId: String(row.id),
    jobId: row.job_id,
    dealId: row.deal_id,
    organizationId: row.organization_id,
    userId: row.user_id,
    investorKey: row.investor_key,
    uploadedInvestor: row.uploaded_payload || {},
    possibleContacts: row.candidates || [],
    status: row.status,
    createdAt: row.created_at,
  }))
}

async function getContactReviewById(db, reviewId) {
  await ensureContactReviewTable(db)
  const result = await db.query(
    `SELECT * FROM etl_contact_review WHERE id = $1 LIMIT 1`,
    [reviewId]
  )
  return result.rows[0] || null
}

async function resolveContactReview(db, {
  reviewId,
  action,
  selectedContactId = null,
  decidedBy = '',
}) {
  await ensureContactReviewTable(db)
  const row = await getContactReviewById(db, reviewId)
  if (!row) throw new Error('Contact review not found')
  if (row.status === REVIEW_STATUS.RESOLVED) {
    return {
      reviewId: String(row.id),
      action: row.action,
      contactId: row.selected_contact_id ? String(row.selected_contact_id) : null,
      alreadyResolved: true,
    }
  }

  const uploaded = row.uploaded_payload || {}
  const normalizedAction = String(action || '').trim().toUpperCase()
  let contactId = null

  if (normalizedAction === REVIEW_ACTION.EXISTING_CONTACT) {
    if (!selectedContactId || !isValidUuid(selectedContactId)) {
      throw new Error('selectedContactId is required when using an existing contact')
    }
    const exists = await db.query('SELECT id FROM contact WHERE id = $1 LIMIT 1', [
      selectedContactId,
    ])
    if (!exists.rows.length) throw new Error('Selected contact does not exist')

    await updateMatchedContact(db, {
      contactId: selectedContactId,
      organizationId: row.organization_id || uploaded.organizationId,
      email: uploaded.email,
      firstName: uploaded.firstName,
      lastName: uploaded.lastName,
      phone: uploaded.phone,
    })
    contactId = String(selectedContactId)
  } else if (normalizedAction === REVIEW_ACTION.CREATE_NEW_CONTACT) {
    const created = await createContactFromUpload(
      db,
      {
        ...uploaded,
        organizationId: row.organization_id || uploaded.organizationId,
      },
      { createdBy: row.user_id }
    )
    contactId = created.contactId
  } else if (normalizedAction === REVIEW_ACTION.SKIP_CONTACT) {
    contactId = null
  } else {
    throw new Error(
      `Invalid action. Use ${Object.values(REVIEW_ACTION).join(' | ')}`
    )
  }

  await db.query(
    `UPDATE etl_contact_review SET
      status = 'RESOLVED',
      action = $2,
      selected_contact_id = $3,
      decided_by = $4,
      decided_at = NOW(),
      updated_at = NOW()
     WHERE id = $1`,
    [
      reviewId,
      normalizedAction,
      contactId,
      String(decidedBy || '').trim() || 'etl-ui',
    ]
  )

  let dealMember = null
  if (
    contactId &&
    uploaded.entityType === 'deal_member' &&
    normalizedAction !== REVIEW_ACTION.SKIP_CONTACT
  ) {
    const {
      applyDealMemberAfterContactResolve,
    } = require('./dealMembersEtlService')
    dealMember = await applyDealMemberAfterContactResolve(db, {
      uploaded,
      dealId: row.deal_id,
      contactId,
      addedBy: row.user_id || null,
    })
  }

  return {
    reviewId: String(row.id),
    action: normalizedAction,
    contactId,
    dealMember,
    alreadyResolved: false,
    audit: {
      investorId: uploaded.investorId || uploaded.sourceProfileId || null,
      dealId: row.deal_id,
      uploadedEmail: uploaded.email || null,
      selectedContactId: contactId,
      action: normalizedAction,
      decidedBy: String(decidedBy || '').trim() || 'etl-ui',
      timestamp: new Date().toISOString(),
      entityType: uploaded.entityType || 'investor',
      dealMemberId: dealMember?.entityId || null,
    },
  }
}

module.exports = {
  REVIEW_STATUS,
  REVIEW_ACTION,
  normalizePhone,
  normalizeNameKey,
  buildNameVariants,
  buildInvestorKey,
  findExactContactMatch,
  findPossibleContactMatches,
  resolveContactForInvestorUpload,
  updateMatchedContact,
  createContactFromUpload,
  upsertPendingContactReview,
  listPendingContactReviews,
  getContactReviewById,
  resolveContactReview,
  ensureContactReviewTable,
}
