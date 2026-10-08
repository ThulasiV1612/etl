/**
 * Deal Members ETL — match Excel emails to CRM contact, queue confirmation,
 * then insert deal_member after the user confirms in the CRM popup.
 */
const xlsx = require('xlsx')
const { getPool } = require('../dbService')
const { isValidUuid, generateUniqueUuid } = require('./uuidUtils')
const { logAudit } = require('../logger')
const { cleanRawValue, getCellFromRow } = require('./excelRowUtils')
const { toContactStyleEmail, isPlaceholderEmail } = require('./emailPlaceholderUtils')
const { mapDealMemberRole } = require('../../constants/dealMemberRole.constants')
const { resolveDealOrganizationId, ensureSignedUpDealMemberUser } = require('./inviteUserEtlService')
const {
  findExactContactMatch,
  findPossibleContactMatches,
  upsertPendingContactReview,
  listPendingContactReviews,
} = require('./contactMatchService')
const { splitFullName, sanitizeContactName, buildContactFullName } = require('./contactNameUtils')

const MEMBER_COLUMNS = {
  email: ['Email', 'Member Email', 'email', 'E-mail'],
  role: ['Deal Member Role', 'Role', 'Member Role', 'deal_member_role'],
  firstName: ['First Name', 'First name', 'first_name'],
  lastName: ['Last Name', 'Last name', 'last_name'],
  fullName: ['Member Name', 'Full Name', 'Name', 'full_name', 'deal_member_name'],
  phone: ['Phone', 'phone', 'Mobile'],
  sendInvitation: ['Send Invitation', 'send_invitation_mail', 'Send Invitation Mail'],
  dealMemberName: [
    'Deal Member Name',
    'deal_member_name',
    'Member Name',
    'Full Name',
    'Name',
  ],
  dealMemberSponsorName: [
    'Deal Member Sponsor Name',
    'deal_member_sponsor_name',
    'Sponsor Name',
    'sponsor_name',
  ],
  dealMemberSponsorType: [
    'Deal Member Sponsor Type',
    'deal_member_sponsor_type',
    'Sponsor Type',
    'sponsor_type',
  ],
}

function readMembersRows(filePath) {
  const workbook = xlsx.readFile(filePath)
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('Excel file contains no sheets')

  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: '',
    raw: false,
    blankrows: false,
  })

  return rows
    .map((row, index) => ({ rowNumber: index + 2, row }))
    .filter(({ row }) =>
      Object.values(row || {}).some((value) => String(value || '').trim() !== '')
    )
}

async function memberIdExists(db, id) {
  const result = await db.query('SELECT 1 FROM deal_member WHERE id = $1 LIMIT 1', [id])
  return result.rows.length > 0
}

async function insertDealMemberRow(db, {
  dealId,
  contactMemberId,
  dealMemberRole,
  sendInvitationMail = 'no',
  addedBy = null,
  dealMemberName = null,
  dealMemberSponsorName = null,
  dealMemberSponsorType = null,
}) {
  const role = mapDealMemberRole(dealMemberRole) || 'Member'
  const invite =
    String(sendInvitationMail || 'no').toLowerCase() === 'yes' ? 'yes' : 'no'
  const memberName = cleanRawValue(dealMemberName) || null
  const sponsorName = cleanRawValue(dealMemberSponsorName) || null
  const sponsorType = cleanRawValue(dealMemberSponsorType) || null

  const existing = await db.query(
    `SELECT id FROM deal_member
     WHERE deal_id = $1 AND contact_member_id = $2
     LIMIT 1`,
    [dealId, contactMemberId]
  )
  if (existing.rows.length) {
    await db.query(
      `UPDATE deal_member SET
        deal_member_role = $2,
        send_invitation_mail = CASE
          WHEN lower(trim(coalesce($3, 'no'))) = 'yes' THEN 'yes'
          WHEN lower(trim(coalesce(send_invitation_mail, ''))) = 'yes' THEN 'yes'
          ELSE 'no'
        END,
        deal_member_name = COALESCE(NULLIF(TRIM($4), ''), deal_member_name),
        deal_member_sponsor_name = COALESCE(NULLIF(TRIM($5), ''), deal_member_sponsor_name),
        deal_member_sponsor_type = COALESCE(NULLIF(TRIM($6), ''), deal_member_sponsor_type),
        updated_at = NOW()
       WHERE id = $1`,
      [
        existing.rows[0].id,
        role,
        invite,
        memberName,
        sponsorName,
        sponsorType,
      ]
    )
    return { entityId: String(existing.rows[0].id), created: false }
  }

  const recordId = await generateUniqueUuid({
    existsCheck: (id) => memberIdExists(db, id),
  })

  const result = await db.query(
    `INSERT INTO deal_member (
      id, deal_id, added_by, contact_member_id, deal_member_role,
      send_invitation_mail, deal_member_name, deal_member_sponsor_name,
      deal_member_sponsor_type, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
    RETURNING id`,
    [
      recordId,
      dealId,
      addedBy || null,
      contactMemberId,
      role,
      invite,
      memberName,
      sponsorName,
      sponsorType,
    ]
  )

  return { entityId: String(result.rows[0].id), created: true }
}

/**
 * After CRM review resolve — create/update signed-up users row from contact info,
 * then insert/update deal_member with contact_member_id = users.id.
 */
async function applyDealMemberAfterContactResolve(db, {
  uploaded,
  dealId,
  contactId,
  addedBy = null,
}) {
  if (!uploaded || uploaded.entityType !== 'deal_member') return null
  if (!contactId || !isValidUuid(contactId)) return null

  const targetDealId = dealId || uploaded.dealId
  if (!targetDealId || !isValidUuid(targetDealId)) {
    throw new Error('Deal ID is required to add deal member')
  }

  const organizationId =
    uploaded.organizationId ||
    (await resolveDealOrganizationId(db, targetDealId))

  const userResult = await ensureSignedUpDealMemberUser(db, {
    contactId: String(contactId),
    organizationId,
    dealMemberRole: uploaded.dealMemberRole || uploaded.role || 'Member',
    email: uploaded.email || '',
    firstName: uploaded.firstName || '',
    lastName: uploaded.lastName || '',
    phone: uploaded.phone || '',
  })

  const memberResult = await insertDealMemberRow(db, {
    dealId: targetDealId,
    contactMemberId: String(userResult.userId),
    dealMemberRole: uploaded.dealMemberRole || uploaded.role || 'Member',
    sendInvitationMail: uploaded.sendInvitationMail || 'no',
    addedBy,
    dealMemberName:
      uploaded.dealMemberName ||
      uploaded.fullName ||
      buildContactFullName(uploaded.firstName, uploaded.lastName) ||
      null,
    dealMemberSponsorName: uploaded.dealMemberSponsorName || null,
    dealMemberSponsorType: uploaded.dealMemberSponsorType || null,
  })

  return {
    ...memberResult,
    userId: userResult.userId,
    userCreated: userResult.created,
    userRole: userResult.role,
  }
}

async function runDealMembersEtl({
  filePath,
  dealId,
  organizationId = null,
  jobId = null,
  onRowResult = null,
}) {
  if (!dealId || !isValidUuid(dealId)) {
    throw new Error('Deal ID is required for Deal Members upload')
  }

  const db = await getPool()
  const deal = await db.query(
    `SELECT id, deal_name, organization_id FROM add_deal_form WHERE id = $1 LIMIT 1`,
    [dealId]
  )
  if (!deal.rows.length) throw new Error(`Deal not found: ${dealId}`)

  const orgId =
    organizationId ||
    deal.rows[0].organization_id ||
    (await resolveDealOrganizationId(db, dealId))
  if (!orgId) {
    throw new Error('Deal has no organization — cannot match contacts')
  }

  const dealName = cleanRawValue(deal.rows[0].deal_name) || ''
  const rows = readMembersRows(filePath)
  const contactReviews = []
  const seenReviewKeys = new Set()
  let successCount = 0
  let failedCount = 0

  for (const { rowNumber, row } of rows) {
    try {
      const email = toContactStyleEmail(getCellFromRow(row, MEMBER_COLUMNS.email))
      const roleRaw = cleanRawValue(getCellFromRow(row, MEMBER_COLUMNS.role))
      const firstName = sanitizeContactName(
        getCellFromRow(row, MEMBER_COLUMNS.firstName)
      )
      const lastName = sanitizeContactName(
        getCellFromRow(row, MEMBER_COLUMNS.lastName)
      )
      const fullNameRaw = sanitizeContactName(
        getCellFromRow(row, MEMBER_COLUMNS.fullName)
      )
      const phone = cleanRawValue(getCellFromRow(row, MEMBER_COLUMNS.phone))
      const sendInvitationMail = cleanRawValue(
        getCellFromRow(row, MEMBER_COLUMNS.sendInvitation)
      ) || 'no'
      const dealMemberNameRaw = sanitizeContactName(
        getCellFromRow(row, MEMBER_COLUMNS.dealMemberName)
      )
      const dealMemberSponsorName = cleanRawValue(
        getCellFromRow(row, MEMBER_COLUMNS.dealMemberSponsorName)
      )
      const dealMemberSponsorType = cleanRawValue(
        getCellFromRow(row, MEMBER_COLUMNS.dealMemberSponsorType)
      )

      if (!email || isPlaceholderEmail(email) || !email.includes('@')) {
        failedCount++
        const errorMessage = `Row ${rowNumber}: Email is required to match a contact`
        if (onRowResult) await onRowResult({ rowNumber, success: false, errorMessage })
        continue
      }

      if (!roleRaw) {
        failedCount++
        const errorMessage = `Row ${rowNumber}: Deal Member Role is required`
        if (onRowResult) await onRowResult({ rowNumber, success: false, errorMessage })
        continue
      }

      const split = splitFullName(fullNameRaw || dealMemberNameRaw)
      const fullName =
        fullNameRaw ||
        dealMemberNameRaw ||
        buildContactFullName(firstName || split.first_name, lastName || split.last_name) ||
        email
      const uploaded = {
        entityType: 'deal_member',
        email,
        firstName: firstName || split.first_name || '',
        lastName: lastName || split.last_name || '',
        fullName,
        phone,
        organizationId: orgId,
        dealId,
        dealName,
        dealMemberRole: mapDealMemberRole(roleRaw) || roleRaw,
        sendInvitationMail:
          String(sendInvitationMail).toLowerCase() === 'yes' ? 'yes' : 'no',
        dealMemberName: dealMemberNameRaw || fullName || null,
        dealMemberSponsorName: dealMemberSponsorName || null,
        dealMemberSponsorType: dealMemberSponsorType || null,
      }

      const exact = await findExactContactMatch(db, uploaded)
      let candidates = []
      let reasons = exact.reasons || []

      if (exact.status === 'MATCHED' && exact.contact) {
        candidates = [
          {
            ...exact.contact,
            matchScore: 100,
            matchPercent: 100,
            reasons: exact.reasons || ['Exact email match'],
          },
        ]
      } else if (exact.status === 'REVIEW_REQUIRED') {
        candidates = exact.candidates || []
        reasons = exact.reasons || reasons
      } else {
        candidates = await findPossibleContactMatches(db, uploaded, { limit: 8 })
        if (!candidates.length) {
          reasons = ['No contact found for this email — create new or skip']
        } else {
          reasons = ['Email not exact — confirm the correct contact']
        }
      }

      const reviewId = await upsertPendingContactReview(db, {
        jobId,
        dealId,
        organizationId: orgId,
        userId: null,
        uploaded,
        candidates,
      })

      if (!seenReviewKeys.has(reviewId)) {
        seenReviewKeys.add(reviewId)
        contactReviews.push({
          reviewId,
          jobId,
          dealId,
          organizationId: orgId,
          userId: null,
          uploadedInvestor: uploaded,
          possibleContacts: candidates,
          status: 'PENDING',
          reasons,
        })
      }

      successCount++
      if (onRowResult) {
        await onRowResult({
          rowNumber,
          success: true,
          entityId: reviewId,
          message:
            candidates.length === 1
              ? `Matched contact ${candidates[0].email || candidates[0].id} — confirm to add as deal member`
              : `Queued CRM confirmation for ${email}`,
        })
      }
    } catch (error) {
      failedCount++
      const errorMessage = `Row ${rowNumber}: ${error.message}`
      if (onRowResult) await onRowResult({ rowNumber, success: false, errorMessage })
    }
  }

  // Prefer DB pending list (deduped) when jobId present
  let reviews = contactReviews
  if (jobId) {
    const pending = await listPendingContactReviews(db, { jobId, organizationId: orgId })
    if (pending.length) {
      reviews = pending.filter(
        (item) => item.uploadedInvestor?.entityType === 'deal_member'
      )
      if (!reviews.length) reviews = pending
    }
  }

  logAudit(
    `Deal members ETL | deal=${dealId} rows=${rows.length} ` +
      `queued=${successCount} failed=${failedCount} reviews=${reviews.length}`
  )

  return {
    successCount,
    failedCount,
    totalRecords: rows.length,
    contactReviews: reviews,
    contactReviewCount: reviews.length,
  }
}

module.exports = {
  runDealMembersEtl,
  applyDealMemberAfterContactResolve,
  insertDealMemberRow,
  readMembersRows,
  MEMBER_COLUMNS,
}
