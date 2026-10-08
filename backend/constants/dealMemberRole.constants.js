/**
 * Deal member role values from Excel → display labels stored in deal_member.deal_member_role.
 *
 * Excel may contain keys like admin_sponsor / lead_sponsor / co-sponsor
 * (or close variants). We always store the canonical label in the DB.
 */

const DEAL_MEMBER_ROLE_LABELS = {
  admin_sponsor: 'admin sponsor',
  lead_sponsor: 'Lead Sponsor',
  co_sponsor: 'Co-sponsor',
}

const DEAL_MEMBER_ROLE_ALIASES = {
  admin_sponsor: 'admin_sponsor',
  'admin sponsor': 'admin_sponsor',
  adminsponsor: 'admin_sponsor',

  lead_sponsor: 'lead_sponsor',
  'lead sponsor': 'lead_sponsor',
  leadsponsor: 'lead_sponsor',

  'co-sponsor': 'co_sponsor',
  co_sponsor: 'co_sponsor',
  'co sponsor': 'co_sponsor',
  cosponsor: 'co_sponsor',
}

function normalizeRoleKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function resolveDealMemberRoleKey(value) {
  const raw = String(value || '').trim()
  if (!raw) return null

  const lower = raw.toLowerCase()
  if (DEAL_MEMBER_ROLE_ALIASES[lower]) return DEAL_MEMBER_ROLE_ALIASES[lower]

  const spaced = normalizeRoleKey(raw)
  if (DEAL_MEMBER_ROLE_ALIASES[spaced]) return DEAL_MEMBER_ROLE_ALIASES[spaced]

  const underscored = spaced.replace(/\s+/g, '_')
  if (DEAL_MEMBER_ROLE_ALIASES[underscored]) return DEAL_MEMBER_ROLE_ALIASES[underscored]

  const dashed = spaced.replace(/\s+/g, '-')
  if (DEAL_MEMBER_ROLE_ALIASES[dashed]) return DEAL_MEMBER_ROLE_ALIASES[dashed]

  return null
}

function mapDealMemberRole(value) {
  const key = resolveDealMemberRoleKey(value)
  if (!key) return String(value || '').trim()
  return DEAL_MEMBER_ROLE_LABELS[key] || String(value || '').trim()
}

module.exports = {
  DEAL_MEMBER_ROLE_LABELS,
  DEAL_MEMBER_ROLE_ALIASES,
  mapDealMemberRole,
  resolveDealMemberRoleKey,
}
