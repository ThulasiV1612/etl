const { randomBytes } = require('crypto')
const bcrypt = require('bcrypt')
const { createInvitedUsername, generateUniqueUuid, isValidUuid } = require('./uuidUtils')
const { BCRYPT_ROUNDS, buildUserPasswordHash } = require('./userPasswordService')
const {
  isPlaceholderEmail,
  isUsableEmailValue,
} = require('./emailPlaceholderUtils')
const {
  resolveContactForInvestorUpload,
  updateMatchedContact,
} = require('./contactMatchService')
const { sanitizeContactName, splitFullName } = require('./contactNameUtils')

const ROLE_INVESTOR = 'investor'
const ROLE_COMPANY_USER = 'company_user'
const ROLE_COMPANY_ADMIN = 'company_admin'
/** Portal role for deal roster members — deal-specific title lives on deal_member.deal_member_role */
const ROLE_DEAL_PARTICIPANT = 'deal_participant'

const COMPANY_MEMBERSHIP_ROLES = new Set([ROLE_COMPANY_ADMIN, ROLE_COMPANY_USER])

function normalizePersonName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function isLpInvestorDealRole(value) {
  const t = normalizePersonName(value).replace(/_/g, ' ')
  if (!t) return false
  return (
    t === 'lp investor' ||
    t === 'lp investors' ||
    t === 'investor' ||
    t.includes('lp investor')
  )
}

/**
 * Portal users.role from deal context:
 * - LP / investor on the deal → investor
 * - Deal Members sponsor roles → company_admin (admin sponsor) or company_user
 */
function resolvePortalUserRoleFromDealContext({ dealMemberRole, isLpInvestor }) {
  if (isLpInvestor || isLpInvestorDealRole(dealMemberRole)) return ROLE_INVESTOR

  const t = normalizePersonName(dealMemberRole)
  if (t === 'admin sponsor' || t.includes('admin sponsor')) return ROLE_COMPANY_ADMIN
  if (t.includes('sponsor')) return ROLE_COMPANY_USER

  // Unknown deal_member_role — treat as company-side member, not investor
  return ROLE_COMPANY_USER
}

/**
 * users.email must be unique. Real emails and single placeholders stay as-is.
 * Multiple "redacted" people: keep display "redacted" on contact/LP; users.email
 * becomes redacted__{uniqueKey} only when uniqueKey is provided.
 */
function resolveUserEmailKey(email, uniqueKey = '') {
  const displayEmail = String(email || '').trim()
  const emailNorm = displayEmail.toLowerCase()
  if (!emailNorm) {
    throw new Error('Email is required to upsert invited user')
  }
  if (!isUsableEmailValue(emailNorm)) {
    throw new Error(`Email value is empty or invalid: "${displayEmail}"`)
  }

  if (isPlaceholderEmail(emailNorm) && uniqueKey) {
    const slug = String(uniqueKey)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 80)
    // Still preserve the original token as the prefix (redacted__…)
    if (slug && slug !== emailNorm) {
      return {
        displayEmail,
        lookupEmail: `${emailNorm}__${slug}`,
      }
    }
  }

  // Store exactly as provided (e.g. "redacted")
  return { displayEmail, lookupEmail: emailNorm }
}

/**
 * Mirror Investor-Portal-main `upsertPendingInvitedUser`:
 * pending signup OK, invited_* username, random bcrypt password until signup.
 * Accepts real emails and placeholders like "redacted" (stored as-is).
 */
async function upsertPendingInvitedUser(db, {
  email,
  organizationId,
  role = ROLE_INVESTOR,
  firstName = '',
  lastName = '',
  phone = '',
  inviteExpiresAt = null,
  uniqueKey = '',
  /** 'auto' = legacy insert-if-missing (sponsors); 'review' = never auto-insert CRM contact */
  contactPolicy = 'auto',
  preferredContactId = null,
  contactExtras = {},
}) {
  const { displayEmail, lookupEmail } = resolveUserEmailKey(email, uniqueKey)
  if (!organizationId || !isValidUuid(organizationId)) {
    throw new Error(`Organization ID is required to invite ${displayEmail}`)
  }

  const existing = await db.query(
    `SELECT id, organization_id, user_signup_completed, role, first_name, last_name, phone
     FROM users
     WHERE LOWER(TRIM(email)) = $1
     LIMIT 1`,
    [lookupEmail]
  )

  let userId
  let created = false
  let needsSignup = true
  let userRow = null

  if (existing.rows.length) {
    userRow = existing.rows[0]
    userId = String(userRow.id)
    created = false
    needsSignup = String(userRow.user_signup_completed || '').toLowerCase() !== 'true'

    if (COMPANY_MEMBERSHIP_ROLES.has(role)) {
      await upsertUserCompanyMembership(db, {
        userId,
        companyId: organizationId,
        role,
      })
    }

    if (firstName || lastName || phone) {
      await db.query(
        `UPDATE users SET
          first_name = CASE WHEN $2 <> '' THEN $2 ELSE first_name END,
          last_name = CASE WHEN $3 <> '' THEN $3 ELSE last_name END,
          phone = CASE WHEN $4 <> '' THEN $4 ELSE phone END,
          updated_at = NOW()
         WHERE id = $1`,
        [userId, firstName || '', lastName || '', phone || '']
      )
    }
  } else {
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_ROUNDS)
    const newId = await generateUniqueUuid({
      existsCheck: async (id) => {
        const result = await db.query('SELECT 1 FROM users WHERE id = $1 LIMIT 1', [id])
        return result.rows.length > 0
      },
    })

    const inviteRole = role || ROLE_INVESTOR
    await db.query(
      `INSERT INTO users (
        id, email, username, password_hash, role, user_status, user_signup_completed,
        organization_id, first_name, last_name, phone, invite_expires_at
      ) VALUES ($1,$2,$3,$4,$5,'active','false',$6,$7,$8,$9,$10)`,
      [
        newId,
        lookupEmail,
        createInvitedUsername(),
        passwordHash,
        inviteRole,
        organizationId,
        firstName || '',
        lastName || '',
        phone || '',
        inviteExpiresAt,
      ]
    )

    if (COMPANY_MEMBERSHIP_ROLES.has(inviteRole)) {
      await upsertUserCompanyMembership(db, {
        userId: newId,
        companyId: organizationId,
        role: inviteRole,
      })
    }

    userId = String(newId)
    created = true
    needsSignup = true
  }

  const contactResult = await ensurePortalContact(db, {
    email: displayEmail,
    lookupEmail,
    organizationId,
    userId,
    firstName: firstName || userRow?.first_name || '',
    lastName: lastName || userRow?.last_name || '',
    phone: phone || userRow?.phone || '',
    createIfMissing: contactPolicy !== 'review',
    preferredContactId,
    contactExtras,
  })

  return {
    userId,
    created,
    needsSignup,
    email: displayEmail,
    contactId: contactResult?.contactId || null,
    contactStatus: contactResult?.status || null,
    contactCandidates: contactResult?.candidates || [],
    contactReasons: contactResult?.reasons || [],
  }
}

async function upsertUserCompanyMembership(db, { userId, companyId, role }) {
  if (!userId || !companyId) return
  const membershipRole = COMPANY_MEMBERSHIP_ROLES.has(role) ? role : ROLE_COMPANY_USER
  try {
    await db.query(
      `INSERT INTO user_company_membership (user_id, company_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, company_id)
       DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`,
      [userId, companyId, membershipRole]
    )
  } catch (error) {
    // Table may be missing in older DBs — invite still succeeds via users.organization_id
    if (error.code === '42P01') return
    throw error
  }
}

/**
 * Link / create portal CRM contact for a user.
 *
 * Investor uploads should pass createIfMissing=false so uncertain matches
 * return REVIEW_REQUIRED instead of INSERT.
 * Deal-member sponsor auto-provision may keep createIfMissing=true (legacy).
 */
async function ensurePortalContact(db, {
  email,
  lookupEmail,
  organizationId,
  userId,
  firstName = '',
  lastName = '',
  phone = '',
  createIfMissing = true,
  preferredContactId = null,
  contactExtras = {},
}) {
  const displayEmail = String(email || '').trim()
  const emailKey = String(lookupEmail || displayEmail || '').trim().toLowerCase()
  if (!displayEmail || !isUsableEmailValue(displayEmail)) {
    return { status: 'SKIPPED', contactId: null, candidates: [], reasons: ['No usable email'] }
  }

  const nameFromParts = {
    firstName: sanitizeContactName(firstName),
    lastName: sanitizeContactName(lastName),
  }
  if (!nameFromParts.firstName && !nameFromParts.lastName && contactExtras.fullName) {
    const split = splitFullName(contactExtras.fullName)
    nameFromParts.firstName = split.first_name
    nameFromParts.lastName = split.last_name
  }

  const uploaded = {
    email: displayEmail,
    firstName: nameFromParts.firstName,
    lastName: nameFromParts.lastName,
    fullName:
      contactExtras.fullName ||
      [nameFromParts.firstName, nameFromParts.lastName].filter(Boolean).join(' '),
    phone: String(phone || contactExtras.phone || '').trim(),
    company: contactExtras.company || '',
    address: contactExtras.address || '',
    sourceProfileId: contactExtras.sourceProfileId || '',
    investorId: contactExtras.investorId || contactExtras.sourceProfileId || '',
    organizationId,
    preferredContactId,
    dealId: contactExtras.dealId || null,
    dealName: contactExtras.dealName || '',
  }

  // Review / investor policy: exact match or REVIEW_REQUIRED — never auto-insert
  if (!createIfMissing) {
    const resolved = await resolveContactForInvestorUpload(db, uploaded)
    if (resolved.status === 'MATCHED' && resolved.contact?.id) {
      await updateMatchedContact(db, {
        contactId: resolved.contact.id,
        organizationId,
        email: displayEmail,
        firstName: uploaded.firstName,
        lastName: uploaded.lastName,
        phone: uploaded.phone,
      })
      return {
        status: 'MATCHED',
        contactId: resolved.contact.id,
        candidates: [],
        reasons: resolved.reasons || ['Exact match'],
      }
    }
    return {
      status: 'REVIEW_REQUIRED',
      contactId: null,
      candidates: resolved.candidates || [],
      reasons: resolved.reasons || ['Manual CRM contact review required'],
      uploaded,
    }
  }

  // Legacy auto path (sponsors / other callers): preferred id → exact-ish lookup → insert
  if (preferredContactId && isValidUuid(preferredContactId)) {
    const byPreferred = await db.query(
      'SELECT id FROM contact WHERE id = $1 LIMIT 1',
      [preferredContactId]
    )
    if (byPreferred.rows.length) {
      await updateMatchedContact(db, {
        contactId: preferredContactId,
        organizationId,
        email: displayEmail,
        firstName: uploaded.firstName,
        lastName: uploaded.lastName,
        phone: uploaded.phone,
      })
      return {
        status: 'MATCHED',
        contactId: String(preferredContactId),
        candidates: [],
        reasons: ['Preferred contact'],
      }
    }
  }

  const existing = isPlaceholderEmail(displayEmail) && (uploaded.firstName || uploaded.lastName)
    ? await db.query(
      `SELECT id FROM contact
       WHERE LOWER(TRIM(email)) = $1
         AND LOWER(TRIM(first_name)) = LOWER(TRIM($2))
         AND LOWER(TRIM(last_name)) = LOWER(TRIM($3))
       ORDER BY created_at DESC
       LIMIT 1`,
      [displayEmail.toLowerCase(), uploaded.firstName || '', uploaded.lastName || '']
    )
    : await db.query(
      `SELECT id FROM contact
       WHERE LOWER(TRIM(email)) = $1
          OR LOWER(TRIM(email)) = $2
       ORDER BY CASE WHEN LOWER(TRIM(email)) = $1 THEN 0 ELSE 1 END, created_at DESC
       LIMIT 1`,
      [displayEmail.toLowerCase(), emailKey]
    )

  if (existing.rows.length) {
    await updateMatchedContact(db, {
      contactId: existing.rows[0].id,
      organizationId,
      email: displayEmail,
      firstName: uploaded.firstName,
      lastName: uploaded.lastName,
      phone: uploaded.phone,
    })
    return {
      status: 'MATCHED',
      contactId: String(existing.rows[0].id),
      candidates: [],
      reasons: ['Existing contact updated'],
    }
  }

  let createdBy = userId
  if (!createdBy || !isValidUuid(createdBy)) {
    const envUserId = String(process.env.DEFAULT_CREATED_BY_USER_ID || '').trim()
    if (isValidUuid(envUserId)) createdBy = envUserId
    else {
      const orgUser = await db.query(
        `SELECT id FROM users
         WHERE organization_id = $1
         ORDER BY created_at ASC
         LIMIT 1`,
        [organizationId]
      )
      createdBy = orgUser.rows[0]?.id
    }
  }

  if (!createdBy || !isValidUuid(createdBy)) {
    throw new Error(
      `Cannot create contact for ${displayEmail}: no created_by user available`
    )
  }

  const contactId = await generateUniqueUuid({
    existsCheck: async (id) => {
      const result = await db.query('SELECT 1 FROM contact WHERE id = $1 LIMIT 1', [id])
      return result.rows.length > 0
    },
  })

  const nameParts = String(
    uploaded.firstName || (displayEmail.includes('@') ? displayEmail.split('@')[0] : displayEmail)
  ).trim()
  await db.query(
    `INSERT INTO contact (
      id, organization_id, first_name, last_name, full_name, email, is_portal_user,
      platform_admin_only, phone, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,true,false,$7,$8)`,
    [
      contactId,
      organizationId || null,
      nameParts || 'Investor',
      uploaded.lastName || '',
      [nameParts, uploaded.lastName].filter(Boolean).join(' '),
      displayEmail,
      uploaded.phone || '',
      createdBy,
    ]
  )

  return {
    status: 'CREATED',
    contactId: String(contactId),
    candidates: [],
    reasons: ['Created new contact (auto policy)'],
  }
}

/**
 * Resolve sponsor token (email / full name / username / uuid) → users.id.
 * Creates company_user pending invite when token is an email and missing.
 *
 * If not in users: look up Contacts + Deal Members by full name for this deal.
 * When both match, create a users row with the default password pattern and
 * return that users.id for deal_lp_investor.added_by.
 */
async function resolveOrInviteSponsorUser(db, {
  token,
  organizationId,
  dealId = null,
}) {
  const raw = String(token || '').trim()
  if (!raw) return null

  if (isValidUuid(raw)) {
    const byId = await db.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [raw])
    if (byId.rows.length) return String(byId.rows[0].id)
  }

  if (raw.includes('@')) {
    const result = await upsertPendingInvitedUser(db, {
      email: raw,
      organizationId,
      role: ROLE_COMPANY_USER,
    })
    return result.userId
  }

  const byName = await db.query(
    `SELECT id FROM users
     WHERE LOWER(TRIM(CONCAT(first_name, ' ', last_name))) = LOWER(TRIM($1))
        OR LOWER(TRIM(username)) = LOWER(TRIM($1))
        OR LOWER(TRIM(email)) = LOWER(TRIM($1))
        OR LOWER(TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')))) = LOWER(TRIM($1))
     LIMIT 1`,
    [raw]
  )
  if (byName.rows.length) {
    const userId = String(byName.rows[0].id)
    await upsertUserCompanyMembership(db, {
      userId,
      companyId: organizationId,
      role: ROLE_COMPANY_USER,
    })
    return userId
  }

  // Not in users → Contacts AND Deal Members by full name, then create user.
  if (organizationId && dealId) {
    const provisioned = await provisionSponsorUserFromContactAndDealMember(db, {
      fullName: raw,
      organizationId,
      dealId,
    })
    if (provisioned?.userId) return provisioned.userId
  }

  return null
}

/**
 * Find sponsor by full name only when BOTH are true:
 * 1) Contact in org matches full_name or first_name + last_name
 * 2) Same person is on Deal Members for the deal
 *    (contact_member_id = contact id, or linked user/contact email)
 */
async function findSponsorPersonByFullName(db, { fullName, organizationId, dealId }) {
  const name = normalizePersonName(fullName)
  if (!name || !organizationId || !dealId || !isValidUuid(dealId)) return null

  const contacts = await db.query(
    `SELECT id, email, first_name, last_name, full_name, phone, organization_id
     FROM contact
     WHERE organization_id = $1
       AND (
         LOWER(TRIM(REGEXP_REPLACE(COALESCE(full_name, ''), '\\s+', ' ', 'g'))) = $2
         OR LOWER(TRIM(REGEXP_REPLACE(
              CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')),
              '\\s+', ' ', 'g'
            ))) = $2
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [organizationId, name]
  )
  if (!contacts.rows.length) return null

  const contact = contacts.rows[0]
  const email = String(contact.email || '').trim()

  // Same person must also be a Deal Member on this deal
  const member = await db.query(
    `SELECT dm.id, dm.contact_member_id, dm.deal_member_role
     FROM deal_member dm
     WHERE dm.deal_id = $1
       AND (
         TRIM(dm.contact_member_id::text) = $2
         OR (
           $3 <> ''
           AND (
             TRIM(dm.contact_member_id::text) IN (
               SELECT u.id::text FROM users u
               WHERE LOWER(TRIM(u.email)) = LOWER(TRIM($3))
             )
             OR TRIM(dm.contact_member_id::text) IN (
               SELECT c2.id::text FROM contact c2
               WHERE LOWER(TRIM(c2.email)) = LOWER(TRIM($3))
                 AND c2.organization_id = $4
             )
           )
         )
       )
     LIMIT 1`,
    [dealId, String(contact.id), email, organizationId]
  )
  if (!member.rows.length) return null

  // Also treat LP Investors roster as investor (even if deal_member_role is sponsor-like)
  const lp = await db.query(
    `SELECT 1
     FROM deal_lp_investor lp
     WHERE lp.deal_id = $1
       AND (
         TRIM(lp.contact_member_id::text) = $2
         OR (
           $3 <> ''
           AND LOWER(TRIM(lp.email)) = LOWER(TRIM($3))
         )
       )
     LIMIT 1`,
    [dealId, String(contact.id), email]
  )

  return {
    source: 'contact_and_deal_member',
    contact,
    dealMember: member.rows[0],
    isLpInvestor: lp.rows.length > 0,
  }
}

/**
 * Create user when full name matches Contacts AND Deal Members but is missing from users.
 * Role: investor if LP/investor; otherwise from deal_member_role (sponsor → company_user/admin).
 * Default password: firstName + last 2 phone digits.
 */
async function provisionSponsorUserFromContactAndDealMember(db, {
  fullName,
  organizationId,
  dealId,
}) {
  const matched = await findSponsorPersonByFullName(db, {
    fullName,
    organizationId,
    dealId,
  })
  if (!matched?.contact || !matched?.dealMember) return null

  const contact = matched.contact
  const email = String(contact.email || '').trim()
  if (!email || !isUsableEmailValue(email)) {
    throw new Error(
      `Selected sponsor "${fullName}" found in Contacts and Deal Members ` +
        'but has no usable email to create a user'
    )
  }

  const portalRole = resolvePortalUserRoleFromDealContext({
    dealMemberRole: matched.dealMember.deal_member_role,
    isLpInvestor: matched.isLpInvestor,
  })

  // Already a user by email? reuse (do not overwrite their role)
  const existingUser = await db.query(
    `SELECT id, role FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1`,
    [email]
  )
  if (existingUser.rows.length) {
    const userId = String(existingUser.rows[0].id)
    if (COMPANY_MEMBERSHIP_ROLES.has(portalRole)) {
      await upsertUserCompanyMembership(db, {
        userId,
        companyId: organizationId,
        role: portalRole,
      })
    }
    return {
      userId,
      created: false,
      fromContact: true,
      source: matched.source,
      role: existingUser.rows[0].role || portalRole,
    }
  }

  const firstName = String(contact.first_name || '').trim()
  const lastName = String(contact.last_name || '').trim()
  const phone = String(contact.phone || '').trim()
  const { passwordHash } = await buildUserPasswordHash({ firstName, phone })

  const newId = await generateUniqueUuid({
    existsCheck: async (id) => {
      const result = await db.query('SELECT 1 FROM users WHERE id = $1 LIMIT 1', [id])
      return result.rows.length > 0
    },
  })

  await db.query(
    `INSERT INTO users (
      id, email, username, password_hash, role, user_status, user_signup_completed,
      organization_id, first_name, last_name, phone
    ) VALUES ($1,$2,$3,$4,$5,'active','true',$6,$7,$8,$9)`,
    [
      newId,
      email.toLowerCase(),
      createInvitedUsername(),
      passwordHash,
      portalRole,
      organizationId,
      firstName,
      lastName,
      phone,
    ]
  )

  if (COMPANY_MEMBERSHIP_ROLES.has(portalRole)) {
    await upsertUserCompanyMembership(db, {
      userId: newId,
      companyId: organizationId,
      role: portalRole,
    })
  }

  if (contact.id && isValidUuid(String(contact.id))) {
    await db.query(
      `UPDATE contact SET
        is_portal_user = true,
        first_name = CASE WHEN $2 <> '' THEN $2 ELSE first_name END,
        last_name = CASE WHEN $3 <> '' THEN $3 ELSE last_name END,
        phone = CASE WHEN $4 <> '' THEN $4 ELSE phone END,
        organization_id = COALESCE(organization_id, $5)
       WHERE id = $1`,
      [contact.id, firstName, lastName, phone, organizationId]
    )
  } else {
    await ensurePortalContact(db, {
      email,
      lookupEmail: email.toLowerCase(),
      organizationId,
      userId: newId,
      firstName,
      lastName,
      phone,
    })
  }

  // Point deal_member at the new users.id when it still held a contact id
  if (
    matched.dealMember?.id &&
    matched.dealMember.contact_member_id &&
    contact.id &&
    String(matched.dealMember.contact_member_id) === String(contact.id)
  ) {
    await db.query(
      `UPDATE deal_member
       SET contact_member_id = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [matched.dealMember.id, newId]
    )
  }

  return {
    userId: String(newId),
    created: true,
    fromContact: true,
    source: matched.source,
    role: portalRole,
  }
}

/**
 * Deal Members ETL: contact info is already known → ensure a signed-up users row
 * with portal role deal_participant (deal title stays on deal_member.deal_member_role).
 * Password = firstName + last 2 phone digits (same as company member upload).
 */
async function ensureSignedUpDealMemberUser(db, {
  contactId,
  organizationId,
  dealMemberRole = '',
  email = '',
  firstName = '',
  lastName = '',
  phone = '',
}) {
  if (!organizationId || !isValidUuid(organizationId)) {
    throw new Error('Organization ID is required to create deal member user')
  }

  // dealMemberRole is stored only on deal_member — not used for users.role
  void dealMemberRole

  let contact = null
  if (contactId && isValidUuid(String(contactId))) {
    const result = await db.query(
      `SELECT id, email, first_name, last_name, phone, organization_id, full_name
       FROM contact WHERE id = $1 LIMIT 1`,
      [contactId]
    )
    contact = result.rows[0] || null
  }

  const resolvedEmail = String(email || contact?.email || '').trim()
  if (!resolvedEmail || !isUsableEmailValue(resolvedEmail)) {
    throw new Error(
      `Cannot create user for deal member — no usable email` +
        (contactId ? ` (contact ${contactId})` : '')
    )
  }

  const resolvedFirst =
    sanitizeContactName(firstName) ||
    sanitizeContactName(contact?.first_name) ||
    splitFullName(contact?.full_name || '').first_name ||
    ''
  const resolvedLast =
    sanitizeContactName(lastName) ||
    sanitizeContactName(contact?.last_name) ||
    splitFullName(contact?.full_name || '').last_name ||
    ''
  const resolvedPhone = String(phone || contact?.phone || '').trim()
  const portalRole = ROLE_DEAL_PARTICIPANT

  const existingUser = await db.query(
    `SELECT id, role, user_signup_completed, organization_id
     FROM users
     WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))
     LIMIT 1`,
    [resolvedEmail]
  )

  if (existingUser.rows.length) {
    const userId = String(existingUser.rows[0].id)
    const existingRole = String(existingUser.rows[0].role || '').trim().toLowerCase()
    // Never demote platform_admin / company staff; otherwise keep/set deal_participant
    const shouldKeepStaffRole =
      existingRole === 'platform_admin' ||
      existingRole === ROLE_COMPANY_ADMIN ||
      existingRole === ROLE_COMPANY_USER ||
      existingRole === 'company_member' ||
      existingRole === 'company member'
    const nextRole = shouldKeepStaffRole
      ? existingUser.rows[0].role
      : portalRole

    await db.query(
      `UPDATE users SET
        role = $6,
        user_signup_completed = 'true',
        user_status = COALESCE(NULLIF(TRIM(user_status), ''), 'active'),
        organization_id = COALESCE(organization_id, $2),
        first_name = CASE WHEN $3 <> '' THEN $3 ELSE first_name END,
        last_name = CASE WHEN $4 <> '' THEN $4 ELSE last_name END,
        phone = CASE WHEN $5 <> '' THEN $5 ELSE phone END,
        updated_at = NOW()
       WHERE id = $1`,
      [userId, organizationId, resolvedFirst, resolvedLast, resolvedPhone, nextRole]
    )

    if (contact?.id) {
      await db.query(
        `UPDATE contact SET
          is_portal_user = true,
          organization_id = COALESCE(organization_id, $2)
         WHERE id = $1`,
        [contact.id, organizationId]
      )
    }

    return {
      userId,
      created: false,
      role: nextRole,
      email: resolvedEmail,
    }
  }

  const { passwordHash } = await buildUserPasswordHash({
    firstName: resolvedFirst,
    phone: resolvedPhone,
  })
  const newId = await generateUniqueUuid({
    existsCheck: async (id) => {
      const result = await db.query('SELECT 1 FROM users WHERE id = $1 LIMIT 1', [id])
      return result.rows.length > 0
    },
  })

  await db.query(
    `INSERT INTO users (
      id, email, username, password_hash, role, user_status, user_signup_completed,
      organization_id, first_name, last_name, phone
    ) VALUES ($1,$2,$3,$4,$5,'active','true',$6,$7,$8,$9)`,
    [
      newId,
      resolvedEmail.toLowerCase(),
      createInvitedUsername(),
      passwordHash,
      portalRole,
      organizationId,
      resolvedFirst,
      resolvedLast,
      resolvedPhone,
    ]
  )

  if (contact?.id && isValidUuid(String(contact.id))) {
    await db.query(
      `UPDATE contact SET
        is_portal_user = true,
        first_name = CASE WHEN $2 <> '' THEN $2 ELSE first_name END,
        last_name = CASE WHEN $3 <> '' THEN $3 ELSE last_name END,
        phone = CASE WHEN $4 <> '' THEN $4 ELSE phone END,
        organization_id = COALESCE(organization_id, $5)
       WHERE id = $1`,
      [contact.id, resolvedFirst, resolvedLast, resolvedPhone, organizationId]
    )
  } else {
    await ensurePortalContact(db, {
      email: resolvedEmail,
      lookupEmail: resolvedEmail.toLowerCase(),
      organizationId,
      userId: newId,
      firstName: resolvedFirst,
      lastName: resolvedLast,
      phone: resolvedPhone,
    })
  }

  return {
    userId: String(newId),
    created: true,
    role: portalRole,
    email: resolvedEmail,
  }
}

async function resolveDealOrganizationId(db, dealId) {
  const result = await db.query(
    `SELECT organization_id FROM add_deal_form WHERE id = $1 LIMIT 1`,
    [dealId]
  )
  return result.rows[0]?.organization_id || null
}

/**
 * Mirror Investor-Portal-main reconcileAssigningDealUsersForDeal.
 * Prefers portal users.id on roster/investment keys.
 */
async function reconcileAssigningDealUsersForDeal(db, { dealId, actorUserId }) {
  const did = String(dealId || '').trim()
  if (!did || !isValidUuid(did)) return

  const [invRows, memberRows, lpRows] = await Promise.all([
    db.query(
      `SELECT DISTINCT TRIM(contact_id) AS contact_id
       FROM deal_investment WHERE deal_id = $1 AND TRIM(contact_id) <> ''`,
      [did]
    ),
    db.query(
      `SELECT DISTINCT TRIM(contact_member_id) AS contact_member_id
       FROM deal_member WHERE deal_id = $1 AND TRIM(contact_member_id) <> ''`,
      [did]
    ),
    db.query(
      `SELECT DISTINCT TRIM(contact_member_id) AS contact_member_id
       FROM deal_lp_investor WHERE deal_id = $1 AND TRIM(contact_member_id) <> ''`,
      [did]
    ),
  ])

  const candidates = new Set()
  for (const row of invRows.rows) {
    if (isValidUuid(row.contact_id)) candidates.add(String(row.contact_id).toLowerCase())
  }
  for (const row of memberRows.rows) {
    if (isValidUuid(row.contact_member_id)) {
      candidates.add(String(row.contact_member_id).toLowerCase())
    }
  }
  for (const row of lpRows.rows) {
    if (isValidUuid(row.contact_member_id)) {
      candidates.add(String(row.contact_member_id).toLowerCase())
    }
  }

  const portalUserIds = new Set()
  const candidateList = [...candidates]
  if (candidateList.length) {
    const direct = await db.query(
      `SELECT id FROM users WHERE LOWER(id::text) = ANY($1::text[])`,
      [candidateList]
    )
    for (const row of direct.rows) portalUserIds.add(String(row.id))

    const unresolved = candidateList.filter((id) => !portalUserIds.has(id))
    if (unresolved.length) {
      const contacts = await db.query(
        `SELECT id, email FROM contact WHERE LOWER(id::text) = ANY($1::text[])`,
        [unresolved]
      )
      for (const contactRow of contacts.rows) {
        const emailNorm = String(contactRow.email || '').trim().toLowerCase()
        if (!emailNorm) continue
        const user = await db.query(
          `SELECT id FROM users WHERE LOWER(TRIM(email)) = $1 LIMIT 1`,
          [emailNorm]
        )
        if (user.rows[0]) portalUserIds.add(String(user.rows[0].id))
      }
    }
  }

  // Also include added_by sponsors so company viewers stay on the deal
  const sponsors = await db.query(
    `SELECT DISTINCT added_by FROM deal_lp_investor
     WHERE deal_id = $1 AND added_by IS NOT NULL`,
    [did]
  )
  for (const row of sponsors.rows) {
    if (row.added_by) portalUserIds.add(String(row.added_by))
  }

  const ids = [...portalUserIds]
  if (!ids.length) {
    await db.query('DELETE FROM assigning_deal_user WHERE deal_id = $1', [did])
    return
  }

  await db.query(
    `DELETE FROM assigning_deal_user
     WHERE deal_id = $1 AND NOT (user_id = ANY($2::uuid[]))`,
    [did, ids]
  )

  const actor = isValidUuid(actorUserId) ? actorUserId : ids[0]
  for (const userId of ids) {
    await db.query(
      `INSERT INTO assigning_deal_user (deal_id, user_id, user_added_deal)
       VALUES ($1, $2, $3)
       ON CONFLICT (deal_id, user_id) DO NOTHING`,
      [did, userId, actor]
    )
  }
}

module.exports = {
  ROLE_INVESTOR,
  ROLE_COMPANY_USER,
  ROLE_COMPANY_ADMIN,
  ROLE_DEAL_PARTICIPANT,
  isPlaceholderEmail,
  isUsableEmailValue,
  resolveUserEmailKey,
  upsertPendingInvitedUser,
  upsertUserCompanyMembership,
  ensurePortalContact,
  resolveOrInviteSponsorUser,
  findSponsorPersonByFullName,
  provisionSponsorUserFromContactAndDealMember,
  ensureSignedUpDealMemberUser,
  resolvePortalUserRoleFromDealContext,
  resolveDealOrganizationId,
  reconcileAssigningDealUsersForDeal,
}

